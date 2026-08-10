import type { PlayerHandle } from "../../player/useAlphaTab";
import { ENCODING_CANDIDATES } from "../../lib/detectEncoding";
import { TrackList } from "./TrackList";
import { TechniqueList } from "./TechniqueList";

/** 모바일 하단 시트에서 펼쳐진 탭. `null`이면 접힘(탭바만 보임). */
export type MobileSheetTab = "track" | "technique" | "encoding";

function encodingNeedsAttention(player: PlayerHandle) {
  return player.isGarbledText || player.encoding !== "utf-8";
}

/**
 * 글자 인코딩 선택.
 * 대부분의 파일은 자동 판별로 해결되므로, 판별 결과가 UTF-8이 아니거나
 * 그래도 글자가 깨진 경우에만 노출해서 평소에는 UI를 단순하게 유지한다.
 */
function EncodingPicker({ player }: { player: PlayerHandle }) {
  if (!player.score || !encodingNeedsAttention(player)) return null;

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

/**
 * 읽기 모드 좌측 패널.
 *
 * 데스크톱(≥640px)에서는 기존처럼 세 섹션이 세로로 항상 다 보이는 고정
 * 컬럼이다. 모바일(<640px)에서는 CSS가 이 같은 마크업을 화면 하단 시트로
 * 바꾼다 — 탭바(`sidebar__tabbar`)만 상시 노출되고, `mobileTab`으로 고른
 * 섹션 하나만 시트를 펼쳐 보여준다(T-11). 어느 탭이 열려 있는지는 상위
 * (`App.tsx`)가 소유한다 — 트랜스포트 tier 2와 "동시에 하나만 열림"을
 * 조율해야 하기 때문이다.
 */
export function ReadSidebar({
  player,
  mobileTab,
  onMobileTabChange,
}: {
  player: PlayerHandle;
  mobileTab: MobileSheetTab | null;
  onMobileTabChange: (tab: MobileSheetTab) => void;
}) {
  const showEncodingTab = !!player.score && encodingNeedsAttention(player);

  return (
    <aside className="sidebar">
      <div className="sidebar__tabbar">
        <button
          type="button"
          className={`sidebar__tab${mobileTab === "track" ? " sidebar__tab--active" : ""}`}
          onClick={() => onMobileTabChange("track")}
        >
          트랙
        </button>
        <button
          type="button"
          className={`sidebar__tab${mobileTab === "technique" ? " sidebar__tab--active" : ""}`}
          onClick={() => onMobileTabChange("technique")}
        >
          주법
        </button>
        {showEncodingTab && (
          <button
            type="button"
            className={`sidebar__tab${mobileTab === "encoding" ? " sidebar__tab--active" : ""}`}
            onClick={() => onMobileTabChange("encoding")}
          >
            인코딩
          </button>
        )}
      </div>
      <div className={`sidebar__sheet${mobileTab ? " sidebar__sheet--open" : ""}`}>
        <div className="sidebar__grabber" aria-hidden="true" />
        <div className="sidebar__sheet-body">
          <div
            className={`sidebar__section${mobileTab === "track" ? " sidebar__section--active" : ""}`}
          >
            <TrackList player={player} />
          </div>
          <div
            className={`sidebar__section${mobileTab === "technique" ? " sidebar__section--active" : ""}`}
          >
            <TechniqueList player={player} />
          </div>
          {showEncodingTab && (
            <div
              className={`sidebar__section${mobileTab === "encoding" ? " sidebar__section--active" : ""}`}
            >
              <EncodingPicker player={player} />
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
