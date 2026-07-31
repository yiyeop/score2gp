import type { PlayerHandle } from "../../player/useAlphaTab";

/**
 * 편집 모드 (Phase 3 예정) — 지금은 자리만 잡아둔다.
 *
 * 확장 시 계약:
 * - 악보 뷰(alphaTab 인스턴스)는 App이 소유하므로 여기서 새로 만들지 않고
 *   전달받은 PlayerHandle로 같은 인스턴스를 제어한다.
 * - 편집 전용 단축키는 shortcuts/useShortcuts의 ShortcutMap을 새로 정의해서
 *   editShortcuts.ts로 분리한다 (readShortcuts.ts 참고).
 * - 사이드바/하단 바는 modes/read의 TrackList/TransportBar처럼
 *   이 디렉토리 안에 편집 전용 컴포넌트로 만든다.
 */
export function EditModeSidebar(_props: { player: PlayerHandle }) {
  return (
    <aside className="track-list track-list--empty">
      <h2 className="panel-title">편집 도구</h2>
      <p>
        편집 모드는 준비 중입니다.
        <br />
        음표 수정, OMR 오인식 보정 기능이 여기에 들어갈 예정이에요.
      </p>
    </aside>
  );
}

export function EditModeBar() {
  return (
    <footer className="transport transport--placeholder">
      <span>🚧 편집 모드는 다음 단계에서 만들어질 예정입니다.</span>
    </footer>
  );
}
