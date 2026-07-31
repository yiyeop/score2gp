import type { PlayerHandle } from "../../player/useAlphaTab";
import type { ShortcutMap } from "../../shortcuts/useShortcuts";

export interface ShortcutDoc {
  keys: string;
  label: string;
}

/** 단축키 도움말 오버레이에 표시되는 목록 (읽기 모드) */
export const READ_SHORTCUT_DOCS: ShortcutDoc[] = [
  { keys: "Space", label: "재생 / 일시정지" },
  { keys: "Esc", label: "정지 (처음으로)" },
  { keys: "← / →", label: "이전 / 다음 마디" },
  { keys: "Shift + ← / →", label: "4마디씩 이동" },
  { keys: "Home", label: "첫 마디로" },
  { keys: "↑ / ↓", label: "전체 볼륨 올리기 / 내리기" },
  { keys: "+ / -", label: "재생 속도 빠르게 / 느리게" },
  { keys: "[ / ]", label: "조옮김 반음 내리기 / 올리기" },
  { keys: "L", label: "전체 반복 켜기 / 끄기" },
  { keys: "M", label: "메트로놈 켜기 / 끄기" },
  { keys: "N", label: "타브만 보기 / 오선보 같이 보기" },
  { keys: "?", label: "단축키 도움말" },
];

export function buildReadShortcuts(
  player: PlayerHandle,
  toggleHelp: () => void,
): ShortcutMap {
  return {
    Space: () => player.playPause(),
    Escape: () => player.stop(),
    ArrowLeft: () => player.seekBars(-1),
    ArrowRight: () => player.seekBars(1),
    "Shift+ArrowLeft": () => player.seekBars(-4),
    "Shift+ArrowRight": () => player.seekBars(4),
    Home: () => player.goToBar(0),
    ArrowUp: () => player.setMasterVolume(player.masterVolume + 0.1),
    ArrowDown: () => player.setMasterVolume(player.masterVolume - 0.1),
    "+": () => player.setSpeed(player.speed + 0.1),
    "=": () => player.setSpeed(player.speed + 0.1),
    "-": () => player.setSpeed(player.speed - 0.1),
    "[": () => player.setTranspose(player.transpose - 1),
    "]": () => player.setTranspose(player.transpose + 1),
    L: () => player.toggleLoop(),
    M: () => player.toggleMetronome(),
    N: () => player.toggleTabOnly(),
    "?": () => toggleHelp(),
  };
}
