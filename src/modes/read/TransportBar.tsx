import type { PlayerHandle } from "../../player/useAlphaTab";
import { TRANSPOSE_MAX, TRANSPOSE_MIN } from "../../player/useAlphaTab";

const SPEED_PRESETS = [0.25, 0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 2];

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
