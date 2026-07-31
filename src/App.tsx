import { useState } from "react";
import { useAlphaTab } from "./player/useAlphaTab";
import { useShortcuts } from "./shortcuts/useShortcuts";
import { APP_MODES, type AppModeId } from "./modes/registry";
import { buildReadShortcuts } from "./modes/read/readShortcuts";
import { ReadSidebar } from "./modes/read/ReadSidebar";
import { TransportBar } from "./modes/read/TransportBar";
import { Timeline } from "./modes/read/Timeline";
import { ShortcutHelp } from "./modes/read/ShortcutHelp";
import { EditModeBar, EditModeSidebar } from "./modes/edit/EditMode";
import { openScoreFile } from "./lib/openScore";
import { DEMO_SONG_TEX } from "./demo/demoSong";
import "./App.css";

function App() {
  // 악보 뷰(alphaTab)는 모드와 무관하게 App이 소유한다.
  // 모드 전환 시에도 로드된 악보와 재생 상태가 유지된다.
  const player = useAlphaTab();
  const [mode, setMode] = useState<AppModeId>("read");
  const [helpOpen, setHelpOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  useShortcuts(
    buildReadShortcuts(player, () => setHelpOpen((v) => !v)),
    mode === "read",
  );

  const handleOpen = async () => {
    const opened = await openScoreFile();
    if (opened) {
      setFileName(opened.name);
      player.loadBytes(opened.data);
    }
  };

  const handleDemo = () => {
    setFileName(null);
    player.loadTex(DEMO_SONG_TEX);
  };

  return (
    <div className="app">
      <header className="header">
        <span className="header__logo">🎸 Score2GP</span>
        <nav className="header__modes">
          {APP_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`mode-tab${mode === m.id ? " mode-tab--active" : ""}`}
              onClick={() => setMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </nav>
        <div className="header__title">
          {player.score && (
            <span title={fileName ?? undefined}>{player.scoreTitle}</span>
          )}
        </div>
        <div className="header__actions">
          <button type="button" onClick={handleDemo}>
            데모 곡
          </button>
          <button type="button" className="primary" onClick={handleOpen}>
            악보 열기
          </button>
        </div>
      </header>

      <div className="app-body">
        {mode === "read" ? (
          <ReadSidebar player={player} />
        ) : (
          <EditModeSidebar player={player} />
        )}

        <main className="score-viewport" ref={player.viewportRef}>
          <div className="score-surface" ref={player.containerRef} />
          {!player.score && !player.isLoading && (
            <div className="empty-state">
              <h1>악보를 열어보세요</h1>
              <p>
                Guitar Pro 파일(.gp, .gp3~.gpx)이나 MusicXML을 열 수 있어요.
                <br />
                처음이라면 <b>데모 곡</b> 버튼으로 바로 체험해보세요.
              </p>
              <div className="empty-state__actions">
                <button type="button" className="primary" onClick={handleOpen}>
                  악보 파일 열기
                </button>
                <button type="button" onClick={handleDemo}>
                  데모 곡 재생해보기
                </button>
              </div>
            </div>
          )}
          {player.isLoading && <div className="loading">악보 불러오는 중…</div>}
          {player.error && (
            <div className="error-banner">⚠️ {player.error}</div>
          )}
        </main>
      </div>

      {mode === "read" ? (
        <>
          <Timeline player={player} />
          <TransportBar player={player} onToggleHelp={() => setHelpOpen(true)} />
        </>
      ) : (
        <EditModeBar />
      )}

      {helpOpen && <ShortcutHelp onClose={() => setHelpOpen(false)} />}
    </div>
  );
}

export default App;
