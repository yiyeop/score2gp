import { useMemo } from "react";
import type { PlayerHandle } from "../../player/useAlphaTab";
import { extractMarkers } from "../../lib/markers";

/**
 * 곡 전체를 한 줄로 보여주는 타임라인.
 * 구간(Intro/Verse/Chorus…)은 블록으로, 톤 변화는 아래쪽 마커로 표시하고,
 * 아무 데나 누르면 그 마디로 이동하는 탐색 바 역할도 한다.
 *
 * 톤 마커는 지금 악보에 표시 중인 트랙 것만 보여준다.
 * 트랙마다 톤 지시가 따로 있어서, 다 합치면 읽을 수 없게 된다.
 */
export function Timeline({ player }: { player: PlayerHandle }) {
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

  const seekFromEvent = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    player.goToBar(Math.floor(ratio * total));
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
        <span className="timeline__count">
          {sections.length > 0 && `구간 ${sections.length}`}
          {sections.length > 0 && tones.length > 0 && " · "}
          {tones.length > 0 && `톤 변화 ${tones.length}`}
        </span>
      </div>

      <div
        className="timeline__strip"
        onClick={seekFromEvent}
        title="누르면 그 마디로 이동합니다"
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
