import { useMemo, useState } from "react";
import type { PlayerHandle } from "../../player/useAlphaTab";
import { techniquesOfTrack } from "../../lib/techniques";

/**
 * 지금 보고 있는 트랙에 나오는 주법 목록.
 * 악보를 훑기 전에 "이 곡에 뭐가 나오는지" 미리 볼 수 있게 한다.
 * 항목을 누르면 처음 나오는 마디로 이동한다.
 */
export function TechniqueList({ player }: { player: PlayerHandle }) {
  const [openId, setOpenId] = useState<string | null>(null);

  const items = useMemo(() => {
    const tracks = player.score?.tracks;
    if (!tracks) return [];
    // 여러 트랙을 함께 보는 경우 첫 번째 트랙 기준으로 보여준다.
    const track = tracks[player.visibleTracks[0]];
    return track ? techniquesOfTrack(track) : [];
  }, [player.score, player.visibleTracks]);

  if (!player.score || items.length === 0) return null;

  return (
    <section className="techniques">
      <h2 className="panel-title">이 트랙에 나오는 주법</h2>
      <ul className="techniques__list">
        {items.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              className={`techniques__item${openId === t.id ? " techniques__item--open" : ""}`}
              onClick={() => setOpenId(openId === t.id ? null : t.id)}
            >
              <span className="techniques__name">{t.name}</span>
              <span className="techniques__count">{t.count}회</span>
            </button>
            {openId === t.id && (
              <div className="techniques__detail">
                <p>{t.hint}</p>
                <button
                  type="button"
                  className="techniques__jump"
                  onClick={() => player.goToBar(t.firstBar)}
                >
                  처음 나오는 {t.firstBar + 1}마디로 이동
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
