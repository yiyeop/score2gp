import { useMemo, useState } from "react";
import type { PlayerHandle } from "../../player/useAlphaTab";
import { forDisplay, techniquesOfTrack } from "../../lib/techniques";

/**
 * 지금 보고 있는 트랙에 나오는 주법 목록.
 * 악보를 훑기 전에 "이 곡에 뭐가 나오는지" 미리 볼 수 있게 한다.
 * 항목을 누르면 처음 나오는 마디로 이동한다.
 *
 * 여기 토글은 목록만이 아니라 주법 안내 전체를 끄고 켠다.
 * 끄면 악보 위 툴팁도 함께 사라진다.
 */
export function TechniqueList({ player }: { player: PlayerHandle }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const shown = player.techniqueGuide;

  const items = useMemo(() => {
    const tracks = player.score?.tracks;
    if (!tracks) return [];
    // 여러 트랙을 함께 보는 경우 첫 번째 트랙 기준으로 보여준다.
    const track = tracks[player.visibleTracks[0]];
    return track ? forDisplay(techniquesOfTrack(track)) : [];
  }, [player.score, player.visibleTracks]);

  if (!player.score || items.length === 0) return null;

  return (
    <section className="techniques">
      <div className="techniques__head">
        <h2 className="panel-title">이 트랙에 나오는 주법</h2>
        <button
          type="button"
          className={`chip${shown ? " chip--active" : ""}`}
          aria-expanded={shown}
          onClick={player.toggleTechniqueGuide}
          title={
            shown
              ? "주법 안내 끄기 (악보 위 툴팁도 함께 꺼집니다)"
              : "주법 안내 켜기 (악보 위 툴팁도 함께 켜집니다)"
          }
        >
          {shown ? "끄기" : `켜기 ${items.length}`}
        </button>
      </div>
      {shown && (
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
      )}
    </section>
  );
}
