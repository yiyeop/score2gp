// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useScoreEditor } from "./useScoreEditor";
import type { PlayerHandle } from "../../player/useAlphaTab";

/**
 * T-10: "내보냄 ✓" 표시는 `useScoreEditor`가 실제로 악보를 바꿀 때(되돌리기/
 * 다시하기 포함)만 다시 "안 내보냄" 상태로 돌아가야 한다. App.tsx는 이 훅에
 * `onEdit` 콜백을 넘겨 `saved`를 false로 되돌리는 방식으로 그 신호를 받는데,
 * App 전체를 렌더링하려면 alphaTab 플레이어·PDF 변환·파일 다이얼로그를 모두
 * mocking 해야 해서 배보다 배꼽이 크다. 실제 상태 전이가 일어나는 지점은
 * 이 훅(apply/undo/redo)이므로, 그 경계에서 "언제 onEdit이 불리는지"를
 * 검증하는 게 실효성 대비 비용이 맞는 테스트 경계라고 판단했다.
 */

/** useScoreEditor가 쓰는 만큼만 흉내 낸 가짜 음(note)/박(beat)/플레이어. */
function makeFixture() {
  const note = { fret: 3, string: 2, beat: null as unknown } as {
    fret: number;
    string: number;
    beat: unknown;
  };
  const beat = {
    notes: [note],
    duration: 1,
    dots: 0,
    automations: [] as unknown[],
    voice: { bar: { staff: { stringTuning: { tunings: [40, 45, 50, 55, 59, 64] } } } },
  };
  note.beat = beat;
  // moveString이 참조하는 마디 첫 박(setBarTone에서도 재사용)
  (beat.voice.bar as { voices?: unknown[] }).voices = [{ beats: [beat] }];

  const refreshScore = vi.fn();
  const player = {
    score: { title: "fixture" },
    selection: { beat, note },
    refreshScore,
  } as unknown as PlayerHandle;

  return { note, beat, player, refreshScore };
}

describe("useScoreEditor onEdit", () => {
  it("fires once when an edit actually changes the score (setFret)", () => {
    const { player, note } = makeFixture();
    const onEdit = vi.fn();
    const { result } = renderHook(() => useScoreEditor(player, onEdit));

    act(() => result.current.setFret(5));

    expect(note.fret).toBe(5);
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("does not fire for a no-op edit (same fret value)", () => {
    const { player } = makeFixture();
    const onEdit = vi.fn();
    const { result } = renderHook(() => useScoreEditor(player, onEdit));

    act(() => result.current.setFret(3)); // 이미 3프렛이라 실질 변경 없음

    expect(onEdit).not.toHaveBeenCalled();
  });

  it("fires again on undo of a real change, then stays quiet once history is empty", () => {
    const { player, note } = makeFixture();
    const onEdit = vi.fn();
    const { result } = renderHook(() => useScoreEditor(player, onEdit));

    act(() => result.current.setFret(7));
    expect(onEdit).toHaveBeenCalledTimes(1);

    act(() => result.current.undo());
    expect(note.fret).toBe(3);
    expect(onEdit).toHaveBeenCalledTimes(2);

    // 되돌릴 기록이 더 없으니 아무 일도 일어나지 않는다 — onEdit도 안 불려야 한다.
    act(() => result.current.undo());
    expect(onEdit).toHaveBeenCalledTimes(2);
  });

  it("fires again on redo of a real change", () => {
    const { player, note } = makeFixture();
    const onEdit = vi.fn();
    const { result } = renderHook(() => useScoreEditor(player, onEdit));

    act(() => result.current.setFret(9));
    act(() => result.current.undo());
    expect(onEdit).toHaveBeenCalledTimes(2);

    act(() => result.current.redo());
    expect(note.fret).toBe(9);
    expect(onEdit).toHaveBeenCalledTimes(3);

    // 다시할 기록도 더 없으니 조용해야 한다.
    act(() => result.current.redo());
    expect(onEdit).toHaveBeenCalledTimes(3);
  });
});
