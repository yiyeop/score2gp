import type { ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { PlayerHandle } from "../../player/useAlphaTab";
import { TONE_CHOICES } from "../../lib/markers";
import { DURATIONS, FRET_MAX, type ScoreEditor } from "./useScoreEditor";

/**
 * 편집 모드 — 변환이 잘못 읽은 곳을 고치는 자리.
 *
 * 악보 편집 프로그램을 써 본 적 없는 사람이 쓴다고 보고 만들었다.
 * - 지금 고친 음은 악보 위에 네모로 표시되고, 값은 아래 칸에 그대로 보인다
 * - 버튼은 크게, 한 번에 하나씩만 바꾸게 한다
 * - 잘못 눌러도 되돌리기가 항상 하단에 있다
 */
export function EditModeSidebar({
  player,
  editor,
  showHint,
  onDismissHint,
  mobileOpen,
  onMobileToggle,
  showMobileNarrowBanner,
  onDismissMobileNarrowBanner,
}: {
  player: PlayerHandle;
  editor: ScoreEditor;
  /** 편집 모드가 "보정 전용 도구"라는 첫 진입 안내를 보여줄지. */
  showHint: boolean;
  onDismissHint: () => void;
  /** 모바일 하단 시트가 펼쳐져 있는지 (읽기 모드의 sidebar tab 하나에 해당). */
  mobileOpen: boolean;
  onMobileToggle: () => void;
  /** 좁은 화면에서 편집 모드가 정밀 조작에 불리하다는 안내를 보여줄지(세션당 1회). */
  showMobileNarrowBanner: boolean;
  onDismissMobileNarrowBanner: () => void;
}) {
  // 어느 하위 상태(빈 악보/음 미선택/음 선택)에서도 똑같이 보여준다.
  const hint = showHint ? (
    <button
      type="button"
      className="edit-panel__what"
      onClick={onDismissHint}
      title="누르면 닫혀요"
    >
      PDF 변환이 놓친 부분만 고치는 도구예요
    </button>
  ) : null;

  // 모바일 전용 — 데스크톱에서는 CSS로 항상 숨김. 화면이 좁으면 정밀
  // 조작이 어렵다는 걸 막지 않고 안내만 한다.
  const mobileNarrowBanner = showMobileNarrowBanner ? (
    <button
      type="button"
      className="edit-mobile-banner"
      onClick={onDismissMobileNarrowBanner}
      title="누르면 닫혀요"
    >
      편집 모드는 화면이 좁으면 정밀하게 조작하기 어려워요 — 큰 화면에서 이용을
      권장해요
    </button>
  ) : null;

  const tabbar = (
    <div className="sidebar__tabbar">
      <button
        type="button"
        className={`sidebar__tab${mobileOpen ? " sidebar__tab--active" : ""}`}
        onClick={onMobileToggle}
      >
        편집 모드
      </button>
    </div>
  );

  const wrapSheet = (body: ReactNode) => (
    <>
      {mobileNarrowBanner}
      {tabbar}
      <div className={`sidebar__sheet${mobileOpen ? " sidebar__sheet--open" : ""}`}>
        <div className="sidebar__grabber" aria-hidden="true" />
        <div className="sidebar__sheet-body">{body}</div>
      </div>
    </>
  );

  if (!player.score) {
    return (
      <aside className="sidebar track-list--empty">
        {wrapSheet(
          <>
            <h2 className="panel-title">편집 모드</h2>
            {hint}
            <p>악보를 열면 여기서 고칠 수 있어요.</p>
          </>,
        )}
      </aside>
    );
  }

  const { note, beat } = editor;

  if (!beat) {
    return (
      <aside className="sidebar track-list--empty">
        {wrapSheet(
          <>
            <h2 className="panel-title">편집 모드</h2>
            {hint}
            <p>
              악보에서 고칠 음을 눌러보세요.
              <br />
              <br />
              PDF를 바꾼 악보라면 잘못 읽힌 음이 있을 수 있어요. 그런 자리를
              여기서 바로잡을 수 있습니다.
            </p>
          </>,
        )}
      </aside>
    );
  }

  return (
    <aside className="sidebar edit-panel">
      {wrapSheet(
        <>
      <h2 className="panel-title">편집 모드</h2>
      {hint}

      {note ? (
        <>
          <section className="edit-group">
            <h3 className="edit-group__title">짚는 자리 (프렛)</h3>
            <div className="edit-stepper">
              <button
                type="button"
                onClick={() => editor.setFret(note.fret - 1)}
                disabled={note.fret <= 0}
                title="한 칸 낮추기"
              >
                −
              </button>
              <span className="edit-stepper__value">{note.fret}</span>
              <button
                type="button"
                onClick={() => editor.setFret(note.fret + 1)}
                disabled={note.fret >= FRET_MAX}
                title="한 칸 높이기"
              >
                +
              </button>
            </div>
            <p className="edit-hint">숫자 키를 눌러 바로 칠 수도 있어요.</p>
          </section>

          <section className="edit-group">
            <h3 className="edit-group__title">줄</h3>
            <div className="edit-stepper">
              <button
                type="button"
                onClick={() => editor.moveString(-1)}
                title="위쪽(가는) 줄로 — 소리는 그대로예요"
              >
                ↑
              </button>
              <span className="edit-stepper__value">{note.string}번</span>
              <button
                type="button"
                onClick={() => editor.moveString(1)}
                title="아래쪽(굵은) 줄로 — 소리는 그대로예요"
              >
                ↓
              </button>
            </div>
            <p className="edit-hint">
              같은 소리를 다른 줄에서 짚도록 옮겨요. 프렛도 같이 맞춰집니다.
            </p>
          </section>
        </>
      ) : (
        <p className="edit-hint edit-hint--block">
          이 자리는 쉼표라 짚는 자리가 없어요. 길이는 아래에서 바꿀 수 있어요.
        </p>
      )}

      <section className="edit-group">
        <h3 className="edit-group__title">길이</h3>
        <div className="edit-durations">
          {DURATIONS.map((d) => (
            <button
              key={d.value}
              type="button"
              className={`chip${beat.duration === d.value ? " chip--active" : ""}`}
              onClick={() => editor.setDuration(d.value)}
            >
              {d.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`chip edit-dot${beat.dots > 0 ? " chip--active" : ""}`}
          onClick={editor.toggleDot}
          title="점을 붙이면 길이가 1.5배가 돼요"
        >
          점음표 {beat.dots > 0 ? "켜짐" : "꺼짐"}
        </button>
      </section>

      <section className="edit-group">
        <h3 className="edit-group__title">
          이 마디의 톤
          {editor.barTone === null && (
            <span className="edit-group__note"> — 앞 마디에서 이어짐</span>
          )}
        </h3>
        <div className="edit-durations">
          {TONE_CHOICES.map((t) => (
            <button
              key={t.program}
              type="button"
              className={`chip${editor.barTone === t.program ? " chip--active" : ""}`}
              onClick={() => editor.setBarTone(t.program)}
              title={t.hint}
            >
              {t.label}
            </button>
          ))}
        </div>
        {editor.barTone !== null && (
          <button
            type="button"
            className="chip edit-dot"
            onClick={() => editor.setBarTone(null)}
            title="이 마디에서 톤을 바꾸지 않고 앞에서 쓰던 소리를 이어갑니다"
          >
            톤 바꾸지 않기
          </button>
        )}
        <p className="edit-hint">
          여기서부터 소리가 바뀌어요. 다음에 또 바꾸기 전까지 이어집니다.
        </p>
      </section>

      {note && (
        <section className="edit-group">
          <button
            type="button"
            className="edit-clear"
            onClick={editor.clearNotes}
            title="이 자리를 쉼표로 만들어요. 마디 길이는 그대로 유지됩니다."
          >
            이 음 지우기 (쉼표로)
          </button>
        </section>
      )}
        </>,
      )}
    </aside>
  );
}

/**
 * 편집 모드 하단 바 — 이동, 되돌리기, 그리고 소리로 확인하기.
 *
 * 읽기 모드 `TransportBar`와 같은 tier1/tier2 경계를 그대로 적용한다
 * — 재생/정지 + 스텝 이동이 tier1(상시 노출), 되돌리기/다시하기/상태
 * 텍스트가 tier2(모바일에서 접힘).
 */
export function EditModeBar({
  player,
  editor,
  mobileTier2Open,
  onToggleMobileTier2,
}: {
  player: PlayerHandle;
  editor: ScoreEditor;
  mobileTier2Open: boolean;
  onToggleMobileTier2: () => void;
}) {
  const disabled = !player.score;

  return (
    <footer className="transport">
      <div className="transport__tier1">
      <div className="transport__group">
        <button
          type="button"
          className="transport__play"
          onClick={player.playPause}
          disabled={disabled}
          title="고친 곳을 소리로 확인해보세요 (Space)"
        >
          {player.isPlaying ? "⏸" : "▶"}
        </button>
        <button
          type="button"
          className="transport__stop"
          onClick={player.stop}
          disabled={disabled}
          title="정지 (Esc)"
        >
          ⏹
        </button>
      </div>

      <div className="transport__group transport__bars">
        <button
          type="button"
          onClick={() => player.stepSelection(-1)}
          disabled={!editor.beat}
          title="앞 음으로 (←)"
        >
          ◀
        </button>
        <span className="transport__bar-label">
          {editor.beat ? `${editor.beat.voice.bar.index + 1}마디` : "음 고르기"}
        </span>
        <button
          type="button"
          onClick={() => player.stepSelection(1)}
          disabled={!editor.beat}
          title="다음 음으로 (→)"
        >
          ▶
        </button>
      </div>

        <button
          type="button"
          className="transport__tier2-toggle"
          onClick={onToggleMobileTier2}
          aria-expanded={mobileTier2Open}
          title="되돌리기·다시하기 등 더 보기"
        >
          {mobileTier2Open ? (
            <ChevronDown size={16} strokeWidth={1.75} />
          ) : (
            <ChevronUp size={16} strokeWidth={1.75} />
          )}
        </button>
      </div>

      <div
        className={`transport__tier2${mobileTier2Open ? " transport__tier2--open" : ""}`}
      >
      <div className="transport__group">
        <button
          type="button"
          onClick={editor.undo}
          disabled={!editor.canUndo}
          title="방금 한 것을 되돌려요 (Cmd/Ctrl+Z)"
        >
          ↩︎ 되돌리기
        </button>
        <button
          type="button"
          onClick={editor.redo}
          disabled={!editor.canRedo}
          title="되돌린 것을 다시 해요 (Shift+Cmd/Ctrl+Z)"
        >
          ↪︎ 다시하기
        </button>
      </div>

      <span className="edit-status">
        {editor.lastChange
          ? `방금: ${editor.lastChange}`
          : "악보에서 음을 눌러 고르세요"}
      </span>
      </div>
    </footer>
  );
}
