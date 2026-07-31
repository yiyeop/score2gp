import type { PlayerHandle } from "../../player/useAlphaTab";
import { ENCODING_CANDIDATES } from "../../lib/detectEncoding";
import { TrackList } from "./TrackList";
import { TechniqueList } from "./TechniqueList";

/**
 * 글자 인코딩 선택.
 * 대부분의 파일은 자동 판별로 해결되므로, 판별 결과가 UTF-8이 아니거나
 * 그래도 글자가 깨진 경우에만 노출해서 평소에는 UI를 단순하게 유지한다.
 */
function EncodingPicker({ player }: { player: PlayerHandle }) {
  const needsAttention = player.isGarbledText || player.encoding !== "utf-8";
  if (!player.score || !needsAttention) return null;

  return (
    <section
      className={`encoding${player.isGarbledText ? " encoding--warn" : ""}`}
    >
      <h2 className="panel-title">글자 인코딩</h2>
      <p className="encoding__hint">
        {player.isGarbledText
          ? "제목이나 트랙 이름이 깨져 보이면 다른 언어를 골라보세요."
          : "이 파일은 UTF-8이 아니어서 자동으로 맞춰 읽었어요."}
      </p>
      <select
        value={player.encoding}
        onChange={(e) => player.setEncoding(e.target.value)}
      >
        {ENCODING_CANDIDATES.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
    </section>
  );
}

/** 읽기 모드 좌측 패널 */
export function ReadSidebar({ player }: { player: PlayerHandle }) {
  return (
    <aside className="sidebar">
      <TrackList player={player} />
      <TechniqueList player={player} />
      <EncodingPicker player={player} />
    </aside>
  );
}
