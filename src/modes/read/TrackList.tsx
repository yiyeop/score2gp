import type { PlayerHandle } from "../../player/useAlphaTab";

/**
 * 트랙(세션) 목록.
 * 트랙 이름을 누르면 그 트랙의 악보만 화면에 표시되고,
 * M(뮤트)/S(솔로)와 볼륨은 화면 표시와 무관하게 소리만 조절한다.
 */
export function TrackList({ player }: { player: PlayerHandle }) {
  if (player.tracks.length === 0) {
    return (
      <section className="track-list track-list--empty">
        <p>악보를 열면 트랙이 여기에 표시됩니다.</p>
      </section>
    );
  }

  const multiTrack = player.tracks.length > 1;
  const allVisible = player.visibleTracks.length === player.tracks.length;

  return (
    <section className="track-list">
      <div className="track-list__head">
        <h2 className="panel-title">트랙</h2>
        {multiTrack && (
          <button
            type="button"
            className={`chip${allVisible ? " chip--active" : ""}`}
            onClick={player.showAllTracks}
            title="모든 트랙의 악보를 함께 보기 (0)"
          >
            전체 보기
          </button>
        )}
      </div>

      {multiTrack && (
        <p className="track-list__hint">
          트랙 이름을 누르면 그 악보만 보여요. M·S는 소리만 조절해요.
        </p>
      )}

      {player.tracks.map((t) => {
        const visible = player.visibleTracks.includes(t.index);
        return (
          <div
            className={[
              "track-item",
              visible ? "track-item--visible" : "",
              t.mute ? "track-item--muted" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            key={t.index}
          >
            <div className="track-item__head">
              <button
                type="button"
                className="track-item__name"
                title={`${t.name} — 클릭하면 이 트랙 악보만 보기 (Cmd/Ctrl+클릭: 함께 보기)`}
                aria-pressed={visible}
                onClick={(e) =>
                  e.metaKey || e.ctrlKey
                    ? player.toggleTrackVisible(t.index)
                    : player.showTracks([t.index])
                }
              >
                {t.name}
              </button>
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
        );
      })}
    </section>
  );
}
