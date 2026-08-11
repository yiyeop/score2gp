// @vitest-environment jsdom
/**
 * Timeline의 구간 반복(A-B 루프) 지정 입력 경로 테스트.
 *
 * T-4가 만든 Shift+클릭 두 번 경로는 데스크톱 전용(Shift 키가 마우스에만
 * 있음)이라 터치 기기에서 원천적으로 닿지 않았다(T-17). 여기서는 실제
 * 브라우저 없이 jsdom + 합성 TouchEvent로:
 *  - 새로 추가한 길게 누르기(터치) 경로가 시작점을 찍고, 다음 탭이 끝점을
 *    지정해 setBarLoopRange를 호출하는지
 *  - 움직임이 크면(스크롤 의도) 길게 누르기가 취소돼 goToBar(이동)로만
 *    처리되는지
 *  - 짧게 누르고 떼는 일반 탭은 여전히 이동(goToBar)으로 처리되는지
 *  - 기존 Shift+클릭 경로가 그대로 동작하는지(회귀 확인)
 * 를 검증한다. 실제 모바일 브라우저 렌더링·손가락 제스처 자체의 눈으로
 * 보는 확인은 이 실행 환경에서 브라우저 세션 선택 단계가 사용자 상호작용
 * (AskUserQuestion)을 요구해 서브에이전트가 수행할 수 없었다(T-4/T-12와
 * 같은 제약) — 이 테스트로 로직 수준의 신뢰도를 대신한다.
 */
import { describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach } from "vitest";
import { Timeline } from "./Timeline";
import type { PlayerHandle } from "../../player/useAlphaTab";

afterEach(cleanup);

function makePlayer(overrides: Partial<PlayerHandle> = {}): PlayerHandle {
  const base: Partial<PlayerHandle> = {
    score: { masterBars: [], tracks: [] } as unknown as PlayerHandle["score"],
    revision: 0,
    visibleTracks: [0],
    barCount: 20,
    currentBar: 0,
    barLoopRange: null,
    setBarLoopRange: vi.fn(),
    clearBarLoopRange: vi.fn(),
    goToBar: vi.fn(),
  };
  return { ...base, ...overrides } as PlayerHandle;
}

/** timeline__strip은 너비 기준 비율로 마디를 계산하므로 고정 rect가 필요하다. */
function stubStripRect(strip: Element) {
  vi.spyOn(strip, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 200,
    bottom: 32,
    width: 200,
    height: 32,
    toJSON() {},
  } as DOMRect);
}

function touchAt(x: number, y = 10) {
  return {
    touches: [{ clientX: x, clientY: y } as Touch],
    changedTouches: [{ clientX: x, clientY: y } as Touch],
  };
}

describe("Timeline 구간 반복 입력", () => {
  it("길게 누르기(터치) → 별도 탭으로 구간을 지정한다", () => {
    vi.useFakeTimers();
    const player = makePlayer({ barCount: 20 });
    const { container } = render(<Timeline player={player} />);
    const strip = container.querySelector(".timeline__strip")!;
    stubStripRect(strip);

    // 10% 지점(마디 2)에서 길게 누르기 시작
    fireEvent.touchStart(strip, touchAt(20));
    act(() => {
      vi.advanceTimersByTime(600);
    });
    // 아직 커밋되지 않았어야 한다 — 시작점만 찍힌 상태
    expect(player.setBarLoopRange).not.toHaveBeenCalled();
    expect(strip.querySelector(".timeline__loop-pending")).not.toBeNull();

    fireEvent.touchEnd(strip, touchAt(20));
    // 손을 뗀 뒤, 이후의 별도 탭(클릭)이 끝점을 지정한다
    fireEvent.click(strip, { clientX: 160, clientY: 10 });

    expect(player.setBarLoopRange).toHaveBeenCalledWith(2, 16);
    expect(player.goToBar).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("손가락을 크게 움직이면 길게 누르기가 취소되고 일반 탭은 이동으로 처리된다", () => {
    vi.useFakeTimers();
    const player = makePlayer({ barCount: 20 });
    const { container } = render(<Timeline player={player} />);
    const strip = container.querySelector(".timeline__strip")!;
    stubStripRect(strip);

    fireEvent.touchStart(strip, touchAt(20));
    fireEvent.touchMove(strip, touchAt(60)); // 40px 이동 > 취소 임계값
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(player.setBarLoopRange).not.toHaveBeenCalled();
    expect(strip.querySelector(".timeline__loop-pending")).toBeNull();

    fireEvent.touchEnd(strip, touchAt(60));
    fireEvent.click(strip, { clientX: 60, clientY: 10 });
    expect(player.goToBar).toHaveBeenCalledWith(6);
    expect(player.setBarLoopRange).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("짧게 누르고 떼는 일반 탭은 이동으로 처리된다(길게 누르기 미발동)", () => {
    vi.useFakeTimers();
    const player = makePlayer({ barCount: 20 });
    const { container } = render(<Timeline player={player} />);
    const strip = container.querySelector(".timeline__strip")!;
    stubStripRect(strip);

    fireEvent.touchStart(strip, touchAt(20));
    act(() => {
      vi.advanceTimersByTime(100); // 롱프레스 임계값(500ms) 전에 뗌
    });
    fireEvent.touchEnd(strip, touchAt(20));
    fireEvent.click(strip, { clientX: 20, clientY: 10 });

    expect(player.goToBar).toHaveBeenCalledWith(2);
    expect(player.setBarLoopRange).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("데스크톱 Shift+클릭 두 번 경로는 그대로 동작한다(회귀 확인)", () => {
    const player = makePlayer({ barCount: 20 });
    const { container } = render(<Timeline player={player} />);
    const strip = container.querySelector(".timeline__strip")!;
    stubStripRect(strip);

    fireEvent.click(strip, { clientX: 20, clientY: 10, shiftKey: true });
    expect(player.setBarLoopRange).not.toHaveBeenCalled();
    expect(strip.querySelector(".timeline__loop-pending")).not.toBeNull();

    fireEvent.click(strip, { clientX: 160, clientY: 10, shiftKey: true });
    expect(player.setBarLoopRange).toHaveBeenCalledWith(2, 16);
  });

  it("시작점을 고르던 중 Shift 없는 일반 클릭이 오면 선택을 버리고 이동한다(기존 동작 유지)", () => {
    const player = makePlayer({ barCount: 20 });
    const { container } = render(<Timeline player={player} />);
    const strip = container.querySelector(".timeline__strip")!;
    stubStripRect(strip);

    fireEvent.click(strip, { clientX: 20, clientY: 10, shiftKey: true });
    expect(strip.querySelector(".timeline__loop-pending")).not.toBeNull();

    fireEvent.click(strip, { clientX: 100, clientY: 10 });
    expect(player.setBarLoopRange).not.toHaveBeenCalled();
    expect(player.goToBar).toHaveBeenCalledWith(10);
    expect(strip.querySelector(".timeline__loop-pending")).toBeNull();
  });
});
