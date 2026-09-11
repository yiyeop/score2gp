// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

/**
 * `setTabOnly`가 지금 값과 같은 값으로 불리면 `api.updateSettings()`/
 * `api.render()`를 다시 실행하면 안 된다(파일별 설정 복원이 파일을 열
 * 때마다 이 함수를 무조건 호출하는데, 매번 전체 재레이아웃이 걸리는 회귀였다).
 *
 * `useAlphaTab`은 마운트 시 실제 `@coderline/alphatab.AlphaTabApi`를 만들어
 * 캔버스 렌더링까지 들어가므로(폰트 로드, 오디오 컨텍스트 등) jsdom에서 그대로
 * 돌릴 수 없다. 이 훅의 다른 로직(로드, 트랙, 편집 연동 등)까지 전부 커버하려면
 * alphaTab API 표면 전체를 흉내 내야 해서 배보다 배꼽이 큰 반면, 여기서 고치는
 * 지점(`setTabOnly`의 no-op 가드)은 `AlphaTabApi`를 생성자·이벤트 등록·
 * `updateSettings`/`render` 호출만 가능한 최소 스텁으로 대체해도 정확히 검증할
 * 수 있다. 그래서 `@coderline/alphatab`을 이 최소 스텁으로 모킹하고, 실제 훅을
 * 컨테이너 엘리먼트에 마운트해 `setTabOnly`가 스텁의 `updateSettings`/`render`를
 * 언제 부르고 언제 안 부르는지를 확인하는 선에서 테스트 경계를 잡았다.
 */

// vi.mock 팩토리는 호이스팅되어 파일 맨 위에서 실행되므로, 팩토리가 참조하는
// 값은 반드시 vi.hoisted로 감싸야 한다 (그렇지 않으면 TDZ 에러가 난다).
const { fakeInstances, FakeAlphaTabApi } = vi.hoisted(() => {
  class FakeEvent<T = unknown> {
    on(_handler: (arg: T) => void) {}
    off(_handler: (arg: T) => void) {}
  }

  const fakeInstances: InstanceType<typeof FakeAlphaTabApi>[] = [];

  class FakeAlphaTabApi {
    settings = {
      display: { staveProfile: 0 },
      importer: { encoding: "utf-8" },
    };
    score: unknown = null;
    tracks: unknown[] = [];
    boundsLookup: unknown = null;
    player: unknown = null;
    scoreLoaded = new FakeEvent();
    midiLoaded = new FakeEvent();
    playerReady = new FakeEvent();
    playerStateChanged = new FakeEvent();
    playerPositionChanged = new FakeEvent();
    error = new FakeEvent();
    noteMouseDown = new FakeEvent();
    beatMouseDown = new FakeEvent();
    renderFinished = new FakeEvent();
    updateSettings = vi.fn();
    render = vi.fn();
    destroy = vi.fn();
    load = vi.fn();
    tex = vi.fn();
    changeTrackVolume = vi.fn();
    resetChannelStates = vi.fn();

    constructor(_el: unknown, _options: unknown) {
      fakeInstances.push(this);
    }
  }

  return { fakeInstances, FakeAlphaTabApi };
});

// AlphaTabApi(캔버스 렌더링·폰트 로드 등 실제 엔진)만 스텁으로 바꾸고, 나머지
// (enum들, model 네임스페이스 등 src/lib/techniques.ts 같은 다른 모듈이 실제로
// 쓰는 값들)는 진짜 모듈 그대로 둔다.
vi.mock(import("@coderline/alphatab"), async (importOriginal) => {
  const actual = await importOriginal();
  // FakeAlphaTabApi는 실제 AlphaTabApi의 극히 일부만 흉내 내므로 구조적으로는
  // 호환되지 않는다 — 테스트 목적의 의도된 대체이므로 unknown을 거쳐 강제한다.
  return { ...actual, AlphaTabApi: FakeAlphaTabApi } as unknown as typeof actual;
});

const { useAlphaTab } = await import("./useAlphaTab");
type PlayerHandle = ReturnType<typeof useAlphaTab>;

function Harness({ onReady }: { onReady: (h: PlayerHandle) => void }) {
  const player = useAlphaTab();
  onReady(player);
  return React.createElement("div", { ref: player.containerRef });
}

function mountHarness() {
  let handle: PlayerHandle | undefined;
  render(
    React.createElement(Harness, {
      onReady: (h) => {
        handle = h;
      },
    }),
  );
  const api = fakeInstances[fakeInstances.length - 1];
  return { getHandle: () => handle!, api };
}

describe("setTabOnly no-op guard", () => {
  it("does not call updateSettings/render when the value is unchanged", () => {
    const { getHandle, api } = mountHarness();

    // 기본값이 false인데 같은 값(false)으로 호출 — 설정 복원 이펙트가 매번 하는 일
    act(() => {
      getHandle().setTabOnly(false);
    });

    expect(api.updateSettings).not.toHaveBeenCalled();
    expect(api.render).not.toHaveBeenCalled();
  });

  it("still calls updateSettings/render and updates state when the value actually changes", () => {
    const { getHandle, api } = mountHarness();

    act(() => {
      getHandle().setTabOnly(true);
    });

    expect(api.updateSettings).toHaveBeenCalledTimes(1);
    expect(api.render).toHaveBeenCalledTimes(1);
    expect(getHandle().tabOnly).toBe(true);
  });

  it("skips the second call once already at the new value, but reacts to a further real change", () => {
    const { getHandle, api } = mountHarness();

    act(() => {
      getHandle().setTabOnly(true);
    });
    expect(api.updateSettings).toHaveBeenCalledTimes(1);

    // 같은 값(true)으로 다시 호출 — no-op이어야 한다
    act(() => {
      getHandle().setTabOnly(true);
    });
    expect(api.updateSettings).toHaveBeenCalledTimes(1);
    expect(api.render).toHaveBeenCalledTimes(1);

    // 다시 false로 — 실제 변경이므로 반영돼야 한다
    act(() => {
      getHandle().setTabOnly(false);
    });
    expect(api.updateSettings).toHaveBeenCalledTimes(2);
    expect(api.render).toHaveBeenCalledTimes(2);
    expect(getHandle().tabOnly).toBe(false);
  });
});
