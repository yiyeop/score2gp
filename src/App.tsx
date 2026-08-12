import { useEffect, useState } from "react";
import { Check, EllipsisVertical, TriangleAlert } from "lucide-react";
import { useAlphaTab } from "./player/useAlphaTab";
import { usePracticeSettingsPersistence } from "./player/usePracticeSettingsPersistence";
import { useShortcuts } from "./shortcuts/useShortcuts";
import { APP_MODES, type AppModeId } from "./modes/registry";
import { READ_SHORTCUT_DOCS, buildReadShortcuts } from "./modes/read/readShortcuts";
import { ReadSidebar, type MobileSheetTab } from "./modes/read/ReadSidebar";
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
        {saved ? (
          <>
            내보냄 <Check size={16} strokeWidth={1.75} />
          </>
        ) : (
          "내보내기"
        )}
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

/**
 * 헤더 케밥(⋯) 메뉴 — 모바일 전용(<640px, CSS로만 노출 전환).
 *
 * `header__actions`의 네 버튼을 세로 목록으로 옮긴 것으로, `ExportMenu`가
 * 이미 구현한 열림/백드롭/목록 패턴을 그대로 재사용한다(T-11 "새 드롭다운/
 * 오버레이 컴포넌트를 발명하지 않는다"). 악보가 없으면(`!player.score`)
 * 렌더링하지 않는다 — 그 상태에서는 `.empty-state__actions`가 이미 같은
 * 액션을 본문 중앙에 제공한다.
 */
function HeaderMenu({
  hasScore,
  hasConverted,
  saved,
  converting,
  onDemo,
  onConvert,
  onOpen,
  onExport,
}: {
  hasScore: boolean;
  hasConverted: boolean;
  saved: boolean;
  converting: boolean;
  onDemo: () => void;
  onConvert: () => void;
  onOpen: () => void;
  onExport: (id: ExportFormatId) => void;
}) {
  const [open, setOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const formats = EXPORT_FORMATS.filter((f) => !f.convertedOnly || hasConverted);

  if (!hasScore) return null;

  const close = () => {
    setOpen(false);
    setExportOpen(false);
  };

  return (
    <div className="header-menu">
      <button
        type="button"
        className="header-menu__trigger"
        onClick={() => setOpen((v) => !v)}
        title="더보기"
        aria-label="더보기"
      >
        <EllipsisVertical size={16} strokeWidth={1.75} />
      </button>
      {open && (
        <>
          <div className="export__backdrop" onClick={close} />
          <ul className="export__menu header-menu__list">
            <li>
              <button
                type="button"
                onClick={() => {
                  close();
                  onDemo();
                }}
              >
                데모 곡 열기
              </button>
            </li>
            {isTauri() && (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    close();
                    onConvert();
                  }}
                  disabled={converting}
                >
                  {converting ? "변환 중…" : "PDF 변환하기"}
                </button>
              </li>
            )}
            {isTauri() && (
              <li>
                <button
                  type="button"
                  onClick={() => setExportOpen((v) => !v)}
                  aria-expanded={exportOpen}
                >
                  다른 형식으로 내보내기{saved ? " (내보냄 완료)" : ""} ▸
                </button>
                {exportOpen && (
                  <ul className="header-menu__submenu">
                    {formats.map((f) => (
                      <li key={f.id}>
                        <button
                          type="button"
                          onClick={() => {
                            close();
                            onExport(f.id);
                          }}
                        >
                          <span className="export__label">{f.label}</span>
                          <span className="export__hint">{f.hint}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )}
            <li>
              <button
                type="button"
                onClick={() => {
                  close();
                  onOpen();
                }}
              >
                악보 파일 열기
              </button>
            </li>
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
  // 좁은 화면에서 고치기가 정밀 조작에 불리하다는 안내(모바일 전용).
  // 위 editHintDismissed와 같은 "세션당 한 번" 패턴이라 App에 함께 둔다.
  const [mobileEditBannerDismissed, setMobileEditBannerDismissed] = useState(false);

  // 모바일(<640px) 하단 시트/트랜스포트 tier 2 — 동시에 하나만 열린다는
  // 규칙(T-11)을 지키려면 두 영역을 아우르는 단일 상태가 필요하다.
  // 데스크톱에서는 이 상태가 아무 CSS에도 영향을 주지 않는다(전부 모바일
  // 미디어쿼리 안에서만 쓰인다).
  const [mobilePanel, setMobilePanel] = useState<
    { kind: "sheet"; tab: MobileSheetTab | "edit" } | { kind: "tier2" } | null
  >(null);
  const closeMobilePanel = () => setMobilePanel(null);
  const toggleMobileTier2 = () =>
    setMobilePanel((p) => (p?.kind === "tier2" ? null : { kind: "tier2" }));
  const toggleMobileSheetTab = (tab: MobileSheetTab | "edit") =>
    setMobilePanel((p) =>
      p?.kind === "sheet" && p.tab === tab ? null : { kind: "sheet", tab },
    );
  // 모드를 바꾸면 이전 모드가 열어 둔 시트/tier2는 의미가 없으므로 접는다.
  useEffect(() => setMobilePanel(null), [mode]);

  // 모바일에서 `.sidebar` 탭바는 `.transport`(tier1 고정 + tier2 접힘/펼침)
  // 바로 위에 붙어야 한다. tier2가 펼쳐지면 `.transport`의 실제 높이가
  // 내용에 따라 가변적으로(최대 40vh) 커지는데, 고정 오프셋(52px)으로는
  // 이를 따라가지 못해 사이드바 탭바가 tier2 밑에 가려지고 클릭도 tier2가
  // 가로채는 문제가 있었다(T-15 QA 재검수 1차). `.transport`의 실제
  // 렌더링 높이를 측정해 CSS 변수로 흘려보내 사이드바가 항상 그 위에
  // 붙게 한다 — tier1/tier2 어느 쪽이 열려 있든 값이 스스로 맞다.
  useEffect(() => {
    const transportEl = document.querySelector<HTMLElement>(".transport");
    if (!transportEl) return;
    const update = () => {
      document.documentElement.style.setProperty(
        "--mobile-transport-height",
        `${transportEl.getBoundingClientRect().height}px`,
      );
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(transportEl);
    return () => ro.disconnect();
  }, [mode]);

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
        <span className="header__logo">
          <svg
            className="header__logo-mark"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <line x1="3" y1="3" x2="22" y2="3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            <line x1="3" y1="9" x2="22" y2="9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            <line x1="3" y1="15" x2="22" y2="15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            <line x1="3" y1="21" x2="22" y2="21" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            <path d="M3 1 L11 12 L3 23 Z" fill="currentColor" />
          </svg>
          <span className="header__logo-text">Score2GP</span>
        </span>
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
        {player.score && (
          <div className="header__title">
            <span title={fileName ?? undefined}>{player.scoreTitle}</span>
          </div>
        )}
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
        <HeaderMenu
          hasScore={!!player.score}
          hasConverted={converted !== null}
          saved={saved}
          converting={converting}
          onDemo={handleDemo}
          onConvert={handleConvert}
          onOpen={handleOpen}
          onExport={handleExport}
        />
      </header>

      <div className="app-body">
        {mode === "read" ? (
          <ReadSidebar
            player={player}
            mobileTab={
              mobilePanel?.kind === "sheet" && mobilePanel.tab !== "edit"
                ? mobilePanel.tab
                : null
            }
            onMobileTabChange={toggleMobileSheetTab}
          />
        ) : (
          <EditModeSidebar
            player={player}
            editor={editor}
            showHint={!editHintDismissed}
            onDismissHint={() => setEditHintDismissed(true)}
            mobileOpen={mobilePanel?.kind === "sheet" && mobilePanel.tab === "edit"}
            onMobileToggle={() => toggleMobileSheetTab("edit")}
            showMobileNarrowBanner={!mobileEditBannerDismissed}
            onDismissMobileNarrowBanner={() => setMobileEditBannerDismissed(true)}
          />
        )}

        <main
          className="score-viewport"
          ref={player.viewportRef}
          onClick={
            mobilePanel && !(mobilePanel.kind === "sheet" && mobilePanel.tab === "edit")
              ? closeMobilePanel
              : undefined
          }
        >
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
            <div className="error-banner">
              <TriangleAlert size={16} strokeWidth={1.75} />{" "}
              {convertError ?? player.error}
            </div>
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
          <TransportBar
            player={player}
            onToggleHelp={() => setHelpOpen(true)}
            mobileTier2Open={mobilePanel?.kind === "tier2"}
            onToggleMobileTier2={toggleMobileTier2}
          />
        </>
      ) : (
        <EditModeBar
          player={player}
          editor={editor}
          mobileTier2Open={mobilePanel?.kind === "tier2"}
          onToggleMobileTier2={toggleMobileTier2}
        />
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
