import { useEffect, useMemo, useRef, useState } from "react";
import type { PlayerHandle } from "../../player/useAlphaTab";
import { extractMarkers } from "../../lib/markers";

/**
 * 곡 전체를 한 줄로 보여주는 타임라인.
 * 구간(Intro/Verse/Chorus…)은 블록으로, 톤 변화는 아래쪽 마커로 표시하고,
 * 아무 데나 누르면 그 마디로 이동하는 탐색 바 역할도 한다.
 *
 * 톤 마커는 지금 악보에 표시 중인 트랙 것만 보여준다.
 * 트랙마다 톤 지시가 따로 있어서, 다 합치면 읽을 수 없게 된다.
 *
 * 구간 반복(A-B 루프) 지정은 두 가지 입력 경로가 있고, 둘 다 같은
 * "시작점만 찍고 끝점을 기다리는" pendingStart 상태를 공유한다:
 *  - 데스크톱: Shift+클릭 두 번(시작 → 끝). 마우스에만 있는 Shift 키를 쓴다.
 *  - 터치: 길게 누르기(시작) → 손을 뗀 뒤 별도의 탭(끝). 터치 기기엔 Shift가
 *    없어서 Shift+클릭 경로가 모바일에서 원천적으로 닿지 않았다.
 *    길게 누르기를 "시작점 선택" 동작으로 쓰는 건, 그 자리에서 곧장 손을
 *    떼는 짧은 탭(=이동)과 확실히 구분되는 유일한 제스처이기 때문이다 —
 *    더블탭은 브라우저의 확대/축소 제스처와 겹치고, 두 손가락 제스처는
 *    이 폭 좁은 스트립에서 쓰기 불편하다.
 * 두 경로 모두 pendingStart가 서면 같은 점선 마커로 "지금 시작점을
 * 골랐다"는 피드백을 준다 — 입력 방식이 달라도 시각 언어는 하나로 유지한다.
 * 한 번의 입력으로 바로 구간이 걸리면 일반 클릭·탭(이동)과 실수로
 * 헷갈리기 쉬워서, 항상 "시작 지정 → 끝 지정" 2단계를 거치게 한다.
 */
const LONG_PRESS_MS = 500;
const TOUCH_MOVE_CANCEL_PX = 10;

interface TouchGestureState {
  bar: number;
  x: number;
  y: number;
  timer: ReturnType<typeof setTimeout> | null;
  longPressFired: boolean;
}

export function Timeline({ player }: { player: PlayerHandle }) {
  // 구간 반복의 시작점만 찍고 끝점을 기다리는 중인 마디. 아직 player에
  // 커밋되지 않은 임시 선택이라 컴포넌트 로컬 상태로 둔다.
  const [pendingStart, setPendingStart] = useState<number | null>(null);
  // 시작점을 어느 경로로 골랐는지: 끝점 지정 방법(다음 Shift+클릭 vs 다음
  // 일반 탭)이 경로마다 다르고, 데스크톱에서 "Shift 없는 일반 클릭은 항상
  // 이동이고 고르던 선택은 버린다"는 기존 동작을 터치 흐름과 갈라 유지하려면
  // 어느 쪽으로 시작했는지 기억해야 한다.
  const [pendingSource, setPendingSource] = useState<"shift" | "touch" | null>(null);
  // 진행 중인 터치 제스처(길게 누르기 타이머 포함)의 가변 상태. 렌더마다
  // 새로 만들 필요가 없고 타이머 id를 들고 있어야 해서 ref로 둔다.
  const touchGestureRef = useRef<TouchGestureState | null>(null);
  // 다른 곡을 열면 마디 번호가 더 이상 맞지 않으니 고르던 시작점을 버린다.
  useEffect(() => {
    setPendingStart(null);
    setPendingSource(null);
  }, [player.score]);
  // revision은 편집으로 악보 '내용'이 바뀌었을 때 오른다. 악보 객체는
  // 그대로라서 이게 없으면 톤을 고쳐도 타임라인이 옛것을 계속 보여준다.
  const markers = useMemo(
    () => (player.score ? extractMarkers(player.score) : []),
    [player.score, player.revision],
  );

  const sections = useMemo(
    () => markers.filter((m) => m.kind === "section"),
    [markers],
  );

  const tones = useMemo(
    () =>
      markers.filter(
        (m) =>
          m.kind === "tone" &&
          m.trackIndex !== undefined &&
          player.visibleTracks.includes(m.trackIndex),
      ),
    [markers, player.visibleTracks],
  );

  if (!player.score || player.barCount === 0) return null;

  const total = player.barCount;
  const pct = (bar: number) => (bar / total) * 100;
  const playedPct = ((player.currentBar + 1) / total) * 100;

  // 구간 블록: 다음 구간이 시작하기 전까지를 한 덩어리로 본다.
  const blocks = sections.map((s, i) => ({
    ...s,
    end: sections[i + 1]?.bar ?? total,
  }));

  const barFromPoint = (clientX: number, rect: DOMRect) => {
    const ratio = (clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(total - 1, Math.floor(ratio * total)));
  };

  const barFromEvent = (e: React.MouseEvent<HTMLDivElement>) =>
    barFromPoint(e.clientX, e.currentTarget.getBoundingClientRect());

  const handleStripClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const bar = barFromEvent(e);
    if (e.shiftKey) {
      if (pendingStart === null) {
        setPendingStart(bar);
        setPendingSource("shift");
      } else {
        player.setBarLoopRange(pendingStart, bar);
        setPendingStart(null);
        setPendingSource(null);
      }
      return;
    }
    // 길게 누르기로 시작점을 찍어 둔 상태라면, 다음 일반 탭은 끝점 지정으로
    // 본다(터치엔 Shift가 없어 여기서 이어받는다).
    if (pendingStart !== null && pendingSource === "touch") {
      player.setBarLoopRange(pendingStart, bar);
      setPendingStart(null);
      setPendingSource(null);
      return;
    }
    // 일반 클릭은 항상 이동이다. 시작점을 고르던 중이었다면 그 선택은 버린다.
    if (pendingStart !== null) {
      setPendingStart(null);
      setPendingSource(null);
    }
    player.goToBar(bar);
  };

  // ── 터치: 길게 누르기 → 시작점, 이후 별도의 탭 → 끝점(handleStripClick이
  // 이어받음). touchend에서 preventDefault로 "길게 누르기 직후 뒤따라오는
  // 합성 클릭"을 막아, 손을 뗀 자리가 그대로 끝점으로 잡히지 않게 한다.
  const clearLongPressTimer = () => {
    const state = touchGestureRef.current;
    if (state?.timer !== null && state?.timer !== undefined) {
      clearTimeout(state.timer);
      state.timer = null;
    }
  };

  const handleStripTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    if (!touch) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const bar = barFromPoint(touch.clientX, rect);
    const state: TouchGestureState = {
      bar,
      x: touch.clientX,
      y: touch.clientY,
      timer: null,
      longPressFired: false,
    };
    touchGestureRef.current = state;
    state.timer = setTimeout(() => {
      state.longPressFired = true;
      setPendingStart(bar);
      setPendingSource("touch");
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate(15);
      }
    }, LONG_PRESS_MS);
  };

  const handleStripTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const state = touchGestureRef.current;
    if (!state) return;
    const touch = e.touches[0];
    if (!touch) return;
    // 손가락이 크게 움직이면 스크롤/드래그 의도로 보고 길게 누르기를 취소한다.
    if (
      Math.abs(touch.clientX - state.x) > TOUCH_MOVE_CANCEL_PX ||
      Math.abs(touch.clientY - state.y) > TOUCH_MOVE_CANCEL_PX
    ) {
      clearLongPressTimer();
    }
  };

  const handleStripTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const state = touchGestureRef.current;
    clearLongPressTimer();
    if (state?.longPressFired) {
      e.preventDefault();
    }
    touchGestureRef.current = null;
  };

  const handleStripTouchCancel = () => {
    clearLongPressTimer();
    touchGestureRef.current = null;
  };

  const activeSection = blocks.find(
    (b) => player.currentBar >= b.bar && player.currentBar < b.end,
  );

  return (
    <div className="timeline">
      <div className="timeline__head">
        <span className="timeline__now">
          {activeSection ? activeSection.label : "구간 정보 없음"}
        </span>
        <span className="timeline__head-right">
          <span className="timeline__count">
            {sections.length > 0 && `구간 ${sections.length}`}
            {sections.length > 0 && tones.length > 0 && " · "}
            {tones.length > 0 && `톤 변화 ${tones.length}`}
          </span>
          {player.barLoopRange && (
            <button
              type="button"
              className="timeline__loop-clear"
              onClick={() => player.clearBarLoopRange()}
              title="구간 반복을 해제합니다"
            >
              🔁 {player.barLoopRange.start + 1}~{player.barLoopRange.end + 1}마디 반복 ✕
            </button>
          )}
        </span>
      </div>

      <div
        className={`timeline__strip${pendingStart !== null ? " timeline__strip--picking" : ""}`}
        onClick={handleStripClick}
        onTouchStart={handleStripTouchStart}
        onTouchMove={handleStripTouchMove}
        onTouchEnd={handleStripTouchEnd}
        onTouchCancel={handleStripTouchCancel}
        title="누르면 그 마디로 이동, Shift+클릭 두 번 또는 길게 눌렀다 뗀 뒤 다시 탭하면 구간 반복(시작·끝 마디) 지정"
      >
        {blocks.map((b) => (
          <div
            key={`${b.bar}-${b.label}`}
            className={`timeline__section${b === activeSection ? " timeline__section--active" : ""}`}
            style={{ left: `${pct(b.bar)}%`, width: `${pct(b.end) - pct(b.bar)}%` }}
            title={`${b.detail} (${b.bar + 1}마디)`}
          >
            <span>{b.label}</span>
          </div>
        ))}
        {player.barLoopRange && (
          <div
            className="timeline__loop-range"
            style={{
              left: `${pct(player.barLoopRange.start)}%`,
              width: `${pct(player.barLoopRange.end + 1) - pct(player.barLoopRange.start)}%`,
            }}
          />
        )}
        {pendingStart !== null && (
          <div
            className="timeline__loop-pending"
            style={{ left: `${pct(pendingStart)}%` }}
            title={
              pendingSource === "touch"
                ? "이제 다른 지점을 탭하면 끝 마디로 지정됩니다"
                : "Shift+클릭으로 끝 마디를 지정하세요"
            }
          />
        )}
        <div className="timeline__played" style={{ width: `${playedPct}%` }} />
        <div className="timeline__playhead" style={{ left: `${pct(player.currentBar)}%` }} />
      </div>

      <div className="timeline__tones">
        {tones.map((t, i) => {
          // 양 끝의 마커는 가운데 정렬하면 화면 밖으로 잘려서 정렬을 바꾼다.
          const left = pct(t.bar);
          const transform =
            left < 4
              ? "translateX(0)"
              : left > 96
                ? "translateX(-100%)"
                : "translateX(-50%)";
          return (
          <button
            key={`${t.bar}-${t.trackIndex}-${i}`}
            type="button"
            className="timeline__tone"
            style={{ left: `${left}%`, transform }}
            title={`${t.detail} (${t.bar + 1}마디)`}
            onClick={(e) => {
              e.stopPropagation();
              player.goToBar(t.bar);
            }}
          >
            <span className="timeline__tone-dot" />
            <span className="timeline__tone-label">{t.label}</span>
          </button>
          );
        })}
      </div>
    </div>
  );
}
