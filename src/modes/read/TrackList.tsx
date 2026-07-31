import type { PlayerHandle } from "../../player/useAlphaTab";

/** 트랙별 볼륨 / 뮤트 / 솔로 사이드바 (읽기 모드) */
export function TrackList({ player }: { player: PlayerHandle }) {
  if (player.tracks.length === 0) {
    return (
      <section className="track-list track-list--empty">
        <p>악보를 열면 트랙이 여기에 표시됩니다.</p>
      </section>
    );
  }

  return (
    <section className="track-list">
      <h2 className="panel-title">트랙</h2>
      {player.tracks.map((t) => (
        <div className={`track-item${t.mute ? " track-item--muted" : ""}`} key={t.index}>
          <div className="track-item__head">
            <span className="track-item__name" title={t.name}>
              {t.name}
            </span>
            <div className="track-item__buttons">
              <button
                type="button"
                className={`chip${t.mute ? " chip--active chip--mute" : ""}`}
                title="뮤트 (이 트랙만 소리 끄기)"
                onClick={() => player.toggleTrackMute(t.index)}
              >
                M
              </button>
              <button
                type="button"
                className={`chip${t.solo ? " chip--active chip--solo" : ""}`}
                title="솔로 (이 트랙만 듣기)"
                onClick={() => player.toggleTrackSolo(t.index)}
              >
                S
              </button>
            </div>
          </div>
          <label className="track-item__volume">
            <span className="control-label">볼륨</span>
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.05}
              value={t.volume}
              onChange={(e) =>
                player.setTrackVolume(t.index, Number(e.target.value))
              }
              onPointerUp={(e) => (e.target as HTMLElement).blur()}
            />
            <span className="track-item__volume-value">
              {Math.round(t.volume * 100)}%
            </span>
          </label>
        </div>
      ))}
    </section>
  );
}
