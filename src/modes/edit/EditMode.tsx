import type { PlayerHandle } from "../../player/useAlphaTab";
import { DURATIONS, FRET_MAX, type ScoreEditor } from "./useScoreEditor";

/**
 * 편집 모드 — 변환이 잘못 읽은 곳을 고치는 자리.
 *
 * 악보 편집 프로그램을 써 본 적 없는 사람이 쓴다고 보고 만들었다.
 * - 고른 음이 무엇인지 "3번 줄 5프렛"처럼 말로 먼저 알려준다
 * - 버튼은 크게, 한 번에 하나씩만 바꾸게 한다
 * - 잘못 눌러도 되돌리기가 항상 하단에 있다
 */
export function EditModeSidebar({
  player,
  editor,
}: {
  player: PlayerHandle;
  editor: ScoreEditor;
}) {
  if (!player.score) {
    return (
      <aside className="sidebar track-list--empty">
        <h2 className="panel-title">고치기</h2>
        <p>악보를 열면 여기서 고칠 수 있어요.</p>
      </aside>
    );
  }

  const { note, beat } = editor;

  if (!beat) {
    return (
      <aside className="sidebar track-list--empty">
        <h2 className="panel-title">고치기</h2>
        <p>
          악보에서 고칠 음을 눌러보세요.
          <br />
          <br />
          PDF를 바꾼 악보라면 잘못 읽힌 음이 있을 수 있어요. 그런 자리를 여기서
          바로잡을 수 있습니다.
        </p>
      </aside>
    );
  }

  return (
    <aside className="sidebar edit-panel">
      <h2 className="panel-title">고치기</h2>

      <p className="edit-panel__what">
        <b>{beat.voice.bar.index + 1}마디</b>의{" "}
        {note ? (
          <b>
            {note.string}번 줄 {note.fret}프렛
          </b>
        ) : (
          <b>쉼표</b>
        )}
      </p>

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
    </aside>
  );
}

/** 편집 모드 하단 바 — 이동, 되돌리기, 그리고 소리로 확인하기. */
export function EditModeBar({
  player,
  editor,
}: {
  player: PlayerHandle;
  editor: ScoreEditor;
}) {
  const disabled = !player.score;

  return (
    <footer className="transport">
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
    </footer>
  );
}
