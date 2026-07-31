import type { PlayerHandle } from "../../player/useAlphaTab";

/** 악보 위 음에 마우스를 올렸을 때 그 음의 주법을 설명해주는 툴팁 */
export function TechniqueTooltip({ player }: { player: PlayerHandle }) {
  const hover = player.hover;
  if (!player.techniqueGuide || !hover) return null;

  // 악보 위쪽 음은 툴팁을 위에 띄우면 화면 밖으로 잘려서 아래에 붙인다.
  const below = hover.y < 140;

  return (
    <div
      className={`technique-tip${below ? " technique-tip--below" : ""}`}
      style={{ left: hover.x, top: hover.y }}
      role="tooltip"
    >
      {hover.techniques.map((t) => (
        <div className="technique-tip__item" key={t.id}>
          <div className="technique-tip__head">
            <b>{t.name}</b>
            <span className="technique-tip__short">{t.short}</span>
          </div>
          <p>{t.hint}</p>
        </div>
      ))}
    </div>
  );
}
