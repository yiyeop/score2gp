import { useState } from "react";
import type { PlayerHandle } from "../../player/useAlphaTab";
import {
  SPEED_MAX,
  SPEED_MIN,
  TRANSPOSE_MAX,
  TRANSPOSE_MIN,
} from "../../player/useAlphaTab";

const SPEED_PRESETS = [0.25, 0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 2];

/**
 * 빠르기를 BPM으로 보여주고 직접 지정한다.
 *
 * %는 원곡을 알아야 의미가 통하는데, 메트로놈이나 합주는 BPM으로 말한다.
 * 실제로 들리는 값을 그대로 보여주고 그 값으로 바꿀 수 있게 한다.
 *
 * 입력 중에는 화면 값을 붙잡아 둔다. 그러지 않으면 '9'만 쳤을 때 곧바로
 * 9 BPM으로 맞춰지면서 남은 자리를 칠 수 없다.
 */
function BpmControl({ player }: { player: PlayerHandle }) {
  const [draft, setDraft] = useState<string | null>(null);
  const disabled = !player.score || player.baseTempo <= 0;

  const commit = () => {
    if (draft !== null) {
      const value = Number(draft);
      if (Number.isFinite(value) && value > 0) player.setBpm(value);
      setDraft(null);
    }
  };

  return (
    <label className="transport__group transport__bpm">
      <span className="control-label">BPM</span>
      <input
        type="number"
        value={draft ?? (disabled ? "" : player.bpm)}
        disabled={disabled}
        min={Math.round(player.baseTempo * SPEED_MIN)}
        max={Math.round(player.baseTempo * SPEED_MAX)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(null);
            (e.target as HTMLInputElement).blur();
          }
        }}
        title={
          disabled
            ? "악보를 열면 빠르기를 조절할 수 있어요"
            : `악보에 적힌 빠르기는 ${player.baseTempo} BPM이에요. ` +
              `${Math.round(player.baseTempo * SPEED_MIN)}~` +
              `${Math.round(player.baseTempo * SPEED_MAX)} 사이로 바꿀 수 있어요.`
        }
      />
    </label>
  );
}

/** 하단 재생 컨트롤 바 (읽기 모드) */
export function TransportBar({
  player,
  onToggleHelp,
}: {
  player: PlayerHandle;
  onToggleHelp: () => void;
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
          title="재생/일시정지 (Space)"
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
          onClick={() => player.seekBars(-1)}
          disabled={disabled}
          title="이전 마디 (←)"
        >
          ◀
        </button>
        <span className="transport__bar-label">
          마디 {player.barCount === 0 ? 0 : player.currentBar + 1} /{" "}
          {player.barCount}
        </span>
        <button
          type="button"
          onClick={() => player.seekBars(1)}
          disabled={disabled}
          title="다음 마디 (→)"
        >
          ▶
        </button>
      </div>

      <label className="transport__group">
        <span className="control-label">속도</span>
        <select
          value={String(player.speed)}
          disabled={disabled}
          onChange={(e) => player.setSpeed(Number(e.target.value))}
          title="재생 속도 (+/-)"
        >
          {!SPEED_PRESETS.includes(player.speed) && (
            <option value={String(player.speed)}>
              {Math.round(player.speed * 100)}%
            </option>
          )}
          {SPEED_PRESETS.map((s) => (
            <option key={s} value={String(s)}>
              {Math.round(s * 100)}%
            </option>
          ))}
        </select>
      </label>

      <BpmControl player={player} />

      <div className="transport__group">
        <span className="control-label">조옮김</span>
        <button
          type="button"
          onClick={() => player.setTranspose(player.transpose - 1)}
          disabled={disabled || player.transpose <= TRANSPOSE_MIN}
          title="반음 내리기 ([)"
        >
          −
        </button>
        <button
          type="button"
          className="transport__transpose-value"
          onClick={() => player.setTranspose(0)}
          disabled={disabled}
          title="클릭하면 원래 조로 되돌립니다"
        >
          {player.transpose > 0 ? `+${player.transpose}` : player.transpose}
        </button>
        <button
          type="button"
          onClick={() => player.setTranspose(player.transpose + 1)}
          disabled={disabled || player.transpose >= TRANSPOSE_MAX}
          title="반음 올리기 (])"
        >
          +
        </button>
      </div>

      <label className="transport__group transport__volume">
        <span className="control-label">볼륨</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={player.masterVolume}
          onChange={(e) => player.setMasterVolume(Number(e.target.value))}
          onPointerUp={(e) => (e.target as HTMLElement).blur()}
          title="전체 볼륨 (↑/↓)"
        />
      </label>

      <div className="transport__group transport__toggles">
        <button
          type="button"
          className={`chip${player.isLooping ? " chip--active" : ""}`}
          onClick={player.toggleLoop}
          disabled={disabled}
          title="곡 전체 반복 (L)"
        >
          🔁 반복
        </button>
        <button
          type="button"
          className={`chip${player.metronomeOn ? " chip--active" : ""}`}
          onClick={player.toggleMetronome}
          disabled={disabled}
          title="메트로놈 (M)"
        >
          🎵 메트로놈
        </button>
        <button
          type="button"
          className={`chip${player.countInOn ? " chip--active" : ""}`}
          onClick={player.toggleCountIn}
          disabled={disabled}
          title="재생 전 한 마디 카운트"
        >
          🥁 카운트인
        </button>
        <button
          type="button"
          className={`chip${player.tabOnly ? " chip--active" : ""}`}
          onClick={player.toggleTabOnly}
          disabled={disabled}
          title="오선보를 숨기고 타브 악보만 보기 (N)"
        >
          🎼 타브만
        </button>
      </div>

      <button
        type="button"
        className="transport__help"
        onClick={onToggleHelp}
        title="단축키 도움말 (?)"
      >
        ?
      </button>
    </footer>
  );
}
