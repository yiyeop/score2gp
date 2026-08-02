import type { PlayerHandle } from "../../player/useAlphaTab";

/**
 * 지금 고른 음을 악보 위에 네모로 표시한다.
 *
 * 사이드바에 "3번 줄 5프렛"이라고 적어줘도, 악보의 어느 자리인지 눈으로
 * 짚어주지 않으면 초보자는 자기가 무엇을 고치는지 확신할 수 없다.
 */
export function EditMarker({ player }: { player: PlayerHandle }) {
  const box = player.selectionBox;
  if (!box) return null;
  return (
    <div
      className="edit-marker"
      style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
    />
  );
}
