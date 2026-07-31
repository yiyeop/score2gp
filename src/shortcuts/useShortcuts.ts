import { useEffect, useRef } from "react";

export type ShortcutMap = Record<string, (e: KeyboardEvent) => void>;

function comboOf(e: KeyboardEvent): string {
  const key =
    e.key === " " ? "Space" : e.key.length === 1 ? e.key.toUpperCase() : e.key;
  const parts: string[] = [];
  if (e.metaKey) parts.push("Meta");
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  // 단일 문자 키는 이미 Shift가 반영된 값이므로(예: '?') Shift를 조합에 넣지 않는다.
  if (e.shiftKey && e.key.length > 1 && e.key !== " ") parts.push("Shift");
  parts.push(key);
  return parts.join("+");
}

/**
 * 모드별 키보드 단축키 등록 훅.
 * 텍스트 입력 요소에 포커스가 있을 때는 동작하지 않는다.
 * 편집 모드는 나중에 자기만의 ShortcutMap을 만들어 같은 훅으로 등록하면 된다.
 */
export function useShortcuts(map: ShortcutMap, enabled = true) {
  const mapRef = useRef(map);
  mapRef.current = map;

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (
        target?.closest(
          "input[type=text], input[type=number], input[type=search], textarea, select, [contenteditable=true]",
        )
      ) {
        return;
      }
      const handler = mapRef.current[comboOf(e)];
      if (handler) {
        e.preventDefault();
        handler(e);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
