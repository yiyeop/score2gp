import { X } from "lucide-react";
import type { ShortcutDoc } from "./readShortcuts";

/** 단축키 도움말 오버레이. 모드마다 쓸 수 있는 키가 달라 목록을 받는다. */
export function ShortcutHelp({
  docs,
  onClose,
}: {
  docs: ShortcutDoc[];
  onClose: () => void;
}) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="overlay__panel" onClick={(e) => e.stopPropagation()}>
        <div className="overlay__head">
          <h2>키보드 단축키</h2>
          <button type="button" onClick={onClose} aria-label="닫기">
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>
        <table className="shortcut-table">
          <tbody>
            {docs.map((s) => (
              <tr key={s.keys}>
                <td>
                  <kbd>{s.keys}</kbd>
                </td>
                <td>{s.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
