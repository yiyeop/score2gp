import * as alphaTab from "@coderline/alphatab";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PlayerHandle } from "../../player/useAlphaTab";

/**
 * 악보 고치기와 되돌리기.
 *
 * 이 모드가 있는 이유는 **PDF 변환이 틀린 곳을 사람이 잡아주기 위해서**다.
 * 그래서 새 곡을 쓰는 데 필요한 기능(마디 추가, 주법 넣기 등)은 두지 않고,
 * 잘못 읽힌 것을 고치는 데 필요한 것만 둔다 — 프렛, 줄, 길이, 지우기.
 *
 * 되돌리기는 바뀐 값만 기억한다. 악보 전체를 복사해 쌓으면 큰 곡에서
 * 메모리가 금방 불어나는데, 우리가 다루는 편집은 값 하나씩이라 그럴 필요가 없다.
 */

/** 되돌릴 수 있는 변경 하나. 되돌리기·다시하기가 같은 방식으로 쓴다. */
interface Change {
  label: string;
  undo: () => void;
  redo: () => void;
}

/** 초보자에게 보여줄 음길이 선택지. 이보다 잘게는 거의 쓰지 않는다. */
export const DURATIONS: Array<{ value: alphaTab.model.Duration; label: string }> = [
  { value: alphaTab.model.Duration.Whole, label: "온음표" },
  { value: alphaTab.model.Duration.Half, label: "2분음표" },
  { value: alphaTab.model.Duration.Quarter, label: "4분음표" },
  { value: alphaTab.model.Duration.Eighth, label: "8분음표" },
  { value: alphaTab.model.Duration.Sixteenth, label: "16분음표" },
];

export const FRET_MAX = 24;
/** 되돌리기 기록은 이만큼만 남긴다. 그보다 옛 편집으로 돌아갈 일은 드물다. */
const HISTORY_LIMIT = 100;

export function useScoreEditor(player: PlayerHandle) {
  const [past, setPast] = useState<Change[]>([]);
  const [future, setFuture] = useState<Change[]>([]);
  // 프렛을 두 자리로 칠 수 있게 잠깐 기억한다 ('1' 다음 '2' → 12프렛)
  const typingRef = useRef<{ beat: unknown; digits: string; at: number } | null>(null);

  // 다른 악보를 열면 이전 악보의 편집 기록은 뜻이 없다
  useEffect(() => {
    setPast([]);
    setFuture([]);
  }, [player.score]);

  const apply = useCallback(
    (change: Change) => {
      change.redo();
      player.refreshScore();
      setPast((p) => [...p, change].slice(-HISTORY_LIMIT));
      setFuture([]);
    },
    [player],
  );

  const undo = useCallback(() => {
    setPast((p) => {
      const last = p[p.length - 1];
      if (!last) return p;
      last.undo();
      player.refreshScore();
      setFuture((f) => [last, ...f]);
      return p.slice(0, -1);
    });
  }, [player]);

  const redo = useCallback(() => {
    setFuture((f) => {
      const [next, ...rest] = f;
      if (!next) return f;
      next.redo();
      player.refreshScore();
      setPast((p) => [...p, next].slice(-HISTORY_LIMIT));
      return rest;
    });
  }, [player]);

  const beat = player.selection?.beat ?? null;

  /**
   * 지금 고쳐야 할 음.
   *
   * 고를 때 잡아둔 음을 그대로 쓰면 안 된다 — 지우거나 되돌리면 그 음이
   * 박에서 빠지거나 다시 들어오는데, 잡아둔 값은 그대로라 사라진 음을
   * 계속 가리키게 된다. 항상 박에서 다시 확인한다.
   */
  const picked = player.selection?.note ?? null;
  const note =
    picked && beat?.notes.includes(picked) ? picked : (beat?.notes[0] ?? null);

  /** 짚는 자리(프렛)를 바꾼다. */
  const setFret = useCallback(
    (value: number) => {
      if (!note) return;
      const next = Math.max(0, Math.min(FRET_MAX, Math.round(value)));
      const before = note.fret;
      if (next === before) return;
      apply({
        label: `${next}프렛으로`,
        redo: () => {
          note.fret = next;
        },
        undo: () => {
          note.fret = before;
        },
      });
    },
    [note, apply],
  );

  /**
   * 숫자를 눌러 프렛을 입력한다.
   *
   * 12프렛처럼 두 자리를 치려면 '1'과 '2'를 이어 눌러야 하는데, 그 사이에
   * 1프렛으로 확정해 버리면 안 된다. 잠깐 기다렸다가 이어지면 두 자리로 읽는다.
   */
  const typeFretDigit = useCallback(
    (digit: number) => {
      if (!note || !beat) return;
      const now = Date.now();
      const typing = typingRef.current;
      const continued =
        typing && typing.beat === beat && now - typing.at < 1200;
      const digits = continued ? typing.digits + digit : String(digit);
      const value = Number(digits);
      // 세 자리로 넘어가면 새로 치는 것으로 본다
      const next = value > FRET_MAX ? digit : value;
      typingRef.current = { beat, digits: String(next), at: now };
      setFret(next);
    },
    [note, beat, setFret],
  );

  /** 같은 음을 다른 줄로 옮긴다. 소리 높이는 그대로 두고 짚는 자리를 다시 잡는다. */
  const moveString = useCallback(
    (delta: number) => {
      if (!note) return;
      const strings = note.beat.voice.bar.staff.stringTuning.tunings.length;
      const next = note.string + delta;
      if (next < 1 || next > strings) return;
      // 같은 줄에 이미 다른 음이 있으면 겹쳐 칠 수 없다
      if (note.beat.notes.some((n) => n !== note && n.string === next)) return;

      const beforeString = note.string;
      const beforeFret = note.fret;
      // 줄이 바뀌면 같은 소리를 내는 프렛도 달라진다
      const tunings = note.beat.voice.bar.staff.stringTuning.tunings;
      const pitchOf = (s: number) => tunings[tunings.length - s];
      const nextFret = beforeFret + pitchOf(beforeString) - pitchOf(next);
      if (nextFret < 0 || nextFret > FRET_MAX) return;

      apply({
        label: `${next}번 줄로`,
        redo: () => {
          note.string = next;
          note.fret = nextFret;
        },
        undo: () => {
          note.string = beforeString;
          note.fret = beforeFret;
        },
      });
    },
    [note, apply],
  );

  /** 음길이를 바꾼다. 박 전체(화음이면 같이)에 걸린다. */
  const setDuration = useCallback(
    (value: alphaTab.model.Duration) => {
      if (!beat || beat.duration === value) return;
      const before = beat.duration;
      apply({
        label: DURATIONS.find((d) => d.value === value)?.label ?? "길이 바꾸기",
        redo: () => {
          beat.duration = value;
        },
        undo: () => {
          beat.duration = before;
        },
      });
    },
    [beat, apply],
  );

  /** 점음표를 켜고 끈다 (길이가 1.5배가 된다). */
  const toggleDot = useCallback(() => {
    if (!beat) return;
    const before = beat.dots;
    const next = before > 0 ? 0 : 1;
    apply({
      label: next ? "점음표로" : "점 없애기",
      redo: () => {
        beat.dots = next;
      },
      undo: () => {
        beat.dots = before;
      },
    });
  }, [beat, apply]);

  /**
   * 이 자리를 쉼표로 만든다 (음을 지운다).
   *
   * 박 자체는 남긴다. 박을 없애면 마디 길이가 어긋나서, 초보자가 되돌리기
   * 없이는 수습하기 어려운 상태가 된다.
   */
  const clearNotes = useCallback(() => {
    if (!beat || beat.notes.length === 0) return;
    const before = [...beat.notes];
    apply({
      label: "쉼표로",
      redo: () => {
        beat.notes = [];
      },
      undo: () => {
        beat.notes = before;
      },
    });
  }, [beat, apply]);

  return {
    beat,
    note,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    lastChange: past[past.length - 1]?.label ?? null,
    undo,
    redo,
    setFret,
    typeFretDigit,
    moveString,
    setDuration,
    toggleDot,
    clearNotes,
  };
}

export type ScoreEditor = ReturnType<typeof useScoreEditor>;
