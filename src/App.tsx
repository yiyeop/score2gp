import { useState } from "react";
import { useAlphaTab } from "./player/useAlphaTab";
import { usePracticeSettingsPersistence } from "./player/usePracticeSettingsPersistence";
import { useShortcuts } from "./shortcuts/useShortcuts";
import { APP_MODES, type AppModeId } from "./modes/registry";
import { READ_SHORTCUT_DOCS, buildReadShortcuts } from "./modes/read/readShortcuts";
import { ReadSidebar } from "./modes/read/ReadSidebar";
import { TransportBar } from "./modes/read/TransportBar";
import { Timeline } from "./modes/read/Timeline";
import { TechniqueTooltip } from "./modes/read/TechniqueTooltip";
import { ShortcutHelp } from "./modes/read/ShortcutHelp";
import { EditModeBar, EditModeSidebar } from "./modes/edit/EditMode";
import { EditMarker } from "./modes/edit/EditMarker";
import { useScoreEditor } from "./modes/edit/useScoreEditor";
import { EDIT_SHORTCUT_DOCS, buildEditShortcuts } from "./modes/edit/editShortcuts";
import { convertPdfFile, openScoreFile, saveScoreAs } from "./lib/openScore";
import {
  EXPORT_FORMATS,
  suggestFileName,
  type ExportFormatId,
} from "./lib/exportScore";
import { DEMO_SONG_TEX } from "./demo/demoSong";
import "./App.css";

const isTauri = () => "__TAURI_INTERNALS__" in window;

/**
 * 악보를 다른 포맷으로 내보내는 메뉴.
 *
 * 포맷마다 쓰는 곳이 달라서(Guitar Pro 7만 쓰는 사람, DAW로 가져갈 사람)
 * 고를 수 있어야 한다. 무엇에 쓰는 형식인지 한 줄씩 붙여 둔다.
 */
function ExportMenu({
  hasConverted,
  saved,
  onExport,
}: {
  hasConverted: boolean;
  saved: boolean;
  onExport: (id: ExportFormatId) => void;
}) {
  const [open, setOpen] = useState(false);
  // .gp5는 변환기가 쓴 파일을 옮기는 것이라 변환한 악보에서만 낼 수 있다.
  const formats = EXPORT_FORMATS.filter((f) => !f.convertedOnly || hasConverted);

  return (
    <div className="export">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="악보를 다른 형식으로 저장합니다"
      >
        {saved ? "내보냄 ✓" : "내보내기"}
      </button>
      {open && (
        <>
          <div className="export__backdrop" onClick={() => setOpen(false)} />
          <ul className="export__menu">
            {formats.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onExport(f.id);
                  }}
                >
                  <span className="export__label">{f.label}</span>
                  <span className="export__hint">{f.hint}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function App() {
  // 악보 뷰(alphaTab)는 모드와 무관하게 App이 소유한다.
  // 모드 전환 시에도 로드된 악보와 재생 상태가 유지된다.
  const player = useAlphaTab();
  const [mode, setMode] = useState<AppModeId>("read");
  const [helpOpen, setHelpOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  // 방금 변환해서 만든 파일의 경로. 임시 폴더에 있으므로 저장할 수 있게 한다.
  const [converted, setConverted] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // 전에 바꿔 둔 결과를 그대로 열었을 때만 잠깐 알린다.
  const [reusedNotice, setReusedNotice] = useState(false);
  // 고치기 모드가 "보정 전용 도구"라는 안내. 세션당 한 번만 보여주고,
  // 닫으면(또는 최초 진입 후 확인하면) 다시 모드를 오가도 다시 뜨지 않는다.
  const [editHintDismissed, setEditHintDismissed] = useState(false);

  // 내보낸 뒤 고치기 모드에서 실제로 뭔가 바뀌면(되돌리기/다시하기 포함)
  // "내보냄 ✓" 표시가 최신 상태를 가리키지 않으므로 되돌린다.
  const editor = useScoreEditor(player, () => setSaved(false));
  // 속도·조옮김·볼륨·탭 전용 보기를 파일(곡) 단위로 저장/복원한다 (T-8).
  usePracticeSettingsPersistence(player, fileName);

  useShortcuts(
    buildReadShortcuts(player, () => setHelpOpen((v) => !v)),
    mode === "read",
  );
  useShortcuts(
    buildEditShortcuts(player, editor, () => setHelpOpen((v) => !v)),
    mode === "edit",
  );

  const handleOpen = async () => {
    const opened = await openScoreFile();
    if (opened) {
      setFileName(opened.name);
      setConverted(null);
      setReusedNotice(false);
      setSaved(false);
      player.loadBytes(opened.data);
    }
  };

  const handleDemo = () => {
    setFileName(null);
    setConverted(null);
    setReusedNotice(false);
    setSaved(false);
    player.loadTex(DEMO_SONG_TEX);
  };

  const handleConvert = async () => {
    setConvertError(null);
    setConverting(true);
    try {
      const result = await convertPdfFile();
      if (result) {
        setFileName(result.name);
        setConverted(result.converted);
        setSaved(false);
        setReusedNotice(result.fromCache);
        player.loadBytes(result.data);
      }
    } catch (e) {
      setConvertError(e instanceof Error ? e.message : String(e));
    } finally {
      setConverting(false);
    }
  };

  const handleExport = async (id: ExportFormatId) => {
    const format = EXPORT_FORMATS.find((f) => f.id === id);
    if (!format || !player.score) return;
    setConvertError(null);
    try {
      // .gp5는 변환기가 이미 써 둔 파일이라 그대로 옮긴다.
      const content = id === "gp5" ? converted : player.exportAs(id);
      if (!content) return;
      const name = suggestFileName(fileName ?? player.scoreTitle, format.extension);
      if (await saveScoreAs(content, name, format)) setSaved(true);
    } catch (e) {
      setConvertError(e instanceof Error ? e.message : String(e));
    }
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
              className={`mode-tab${
                m.tone === "secondary" ? " mode-tab--secondary" : ""
              }${mode === m.id ? " mode-tab--active" : ""}`}
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
          {isTauri() && (
            <button type="button" onClick={handleConvert} disabled={converting}>
              {converting ? "변환 중…" : "PDF 변환"}
            </button>
          )}
          {isTauri() && player.score && (
            <ExportMenu
              hasConverted={converted !== null}
              saved={saved}
              onExport={handleExport}
            />
          )}
          <button type="button" className="primary" onClick={handleOpen}>
            악보 열기
          </button>
        </div>
      </header>

      <div className="app-body">
        {mode === "read" ? (
          <ReadSidebar player={player} />
        ) : (
          <EditModeSidebar
            player={player}
            editor={editor}
            showHint={!editHintDismissed}
            onDismissHint={() => setEditHintDismissed(true)}
          />
        )}

        <main className="score-viewport" ref={player.viewportRef}>
          <div className="score-surface" ref={player.containerRef} />
          {!player.score && !player.isLoading && (
            <div className="empty-state">
              <h1>악보를 열어보세요</h1>
              <p>
                Guitar Pro 파일(.gp, .gp3~.gpx)이나 MusicXML을 열 수 있어요.
                {isTauri() && (
                  <>
                    <br />
                    악보 <b>PDF</b>를 넣으면 연주할 수 있게 바꿔줍니다.
                  </>
                )}
                <br />
                처음이라면 <b>데모 곡</b> 버튼으로 바로 체험해보세요.
              </p>
              <div className="empty-state__actions">
                <button type="button" className="primary" onClick={handleOpen}>
                  악보 파일 열기
                </button>
                {isTauri() && (
                  <button
                    type="button"
                    onClick={handleConvert}
                    disabled={converting}
                  >
                    {converting ? "변환 중…" : "PDF 변환하기"}
                  </button>
                )}
                <button type="button" onClick={handleDemo}>
                  데모 곡 재생해보기
                </button>
              </div>
            </div>
          )}
          {converting && (
            <div className="loading">
              PDF를 악보로 바꾸는 중… (몇 초 걸릴 수 있어요)
            </div>
          )}
          {player.isLoading && <div className="loading">악보 불러오는 중…</div>}
          {(player.error || convertError) && (
            <div className="error-banner">⚠️ {convertError ?? player.error}</div>
          )}
          {reusedNotice && !convertError && (
            <button
              type="button"
              className="notice"
              onClick={() => setReusedNotice(false)}
              title="누르면 사라져요"
            >
              전에 바꿔 둔 결과라 기다리지 않고 바로 열었어요.
            </button>
          )}
        </main>
      </div>

      {mode === "read" ? (
        <>
          <Timeline player={player} />
          <TransportBar player={player} onToggleHelp={() => setHelpOpen(true)} />
        </>
      ) : (
        <EditModeBar player={player} editor={editor} />
      )}

      {mode === "read" && <TechniqueTooltip player={player} />}
      {mode === "edit" && <EditMarker player={player} />}
      {helpOpen && (
        <ShortcutHelp
          docs={mode === "edit" ? EDIT_SHORTCUT_DOCS : READ_SHORTCUT_DOCS}
          onClose={() => setHelpOpen(false)}
        />
      )}
    </div>
  );
}

export default App;
