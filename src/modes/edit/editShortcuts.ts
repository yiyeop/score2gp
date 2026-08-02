import type { PlayerHandle } from "../../player/useAlphaTab";
import type { ShortcutMap } from "../../shortcuts/useShortcuts";
import type { ShortcutDoc } from "../read/readShortcuts";
import type { ScoreEditor } from "./useScoreEditor";

/**
 * 편집 모드 단축키.
 *
 * 타브 악보를 고치는 가장 빠른 방법은 '음을 고르고 숫자를 치는 것'이다.
 * 화면의 버튼으로도 다 되지만, 여러 곳을 고칠 때는 손이 키보드를 떠나지
 * 않는 편이 훨씬 빠르다.
 */
export const EDIT_SHORTCUT_DOCS: ShortcutDoc[] = [
  { keys: "← / →", label: "앞 / 다음 음 고르기" },
  { keys: "0 ~ 9", label: "프렛 입력 (이어 치면 두 자리)" },
  { keys: "↑ / ↓", label: "위 / 아래 줄로 옮기기" },
  { keys: "Backspace", label: "이 음 지우기 (쉼표로)" },
  { keys: "Cmd/Ctrl + Z", label: "되돌리기" },
  { keys: "Shift + Cmd/Ctrl + Z", label: "다시하기" },
  { keys: "Space", label: "재생 / 일시정지" },
  { keys: "Esc", label: "정지 (처음으로)" },
  { keys: "?", label: "단축키 도움말" },
];

export function buildEditShortcuts(
  player: PlayerHandle,
  editor: ScoreEditor,
  toggleHelp: () => void,
): ShortcutMap {
  // 프렛은 숫자를 이어 칠 수 있다 (1 다음 2 → 12프렛)
  const digits: ShortcutMap = {};
  for (let n = 0; n <= 9; n++) {
    digits[String(n)] = () => editor.typeFretDigit(n);
  }

  return {
    ...digits,
    ArrowLeft: () => player.stepSelection(-1),
    ArrowRight: () => player.stepSelection(1),
    ArrowUp: () => editor.moveString(-1),
    ArrowDown: () => editor.moveString(1),
    Backspace: () => editor.clearNotes(),
    Delete: () => editor.clearNotes(),
    "Meta+Z": () => editor.undo(),
    "Ctrl+Z": () => editor.undo(),
    "Meta+Shift+Z": () => editor.redo(),
    "Ctrl+Shift+Z": () => editor.redo(),
    Space: () => player.playPause(),
    Escape: () => player.stop(),
    "?": toggleHelp,
  };
}
