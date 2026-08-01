"""악보 첫머리의 조율 표기를 읽는다.

기타 악보는 표준 튜닝이 아닐 때 첫 페이지에 조율을 적어둔다.

    Tune down 1/2 step
    ① = E♭   ④ = D♭
    ② = B♭   ⑤ = A♭
    ③ = G♭   ⑥ = E♭

현 번호는 음악 폰트의 글리프(U+E834=① … U+E839=⑥)로, 음이름은 일반 텍스트로,
♭·♯은 다시 음악 글리프로 들어 있어서 셋을 좌표로 엮어야 읽을 수 있다.
"""

from __future__ import annotations

import re

from structure import Glyph

# SMuFL 현 번호 글리프. ①이 1번 현(가장 높은 음)이다.
STRING_NUMBER_BASE = 0xE834
STRING_NUMBER_MAX = 0xE839

FLAT, NATURAL, SHARP = 0xE260, 0xE261, 0xE262

# 표준 튜닝 (1번 현 → 6번 현)
STANDARD_TUNING = [64, 59, 55, 50, 45, 40]

_PITCH_CLASS = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}

TUNE_DOWN_RE = re.compile(r"tune\s*down\s*(\d+)\s*/\s*(\d+)\s*step", re.I)


def _nearest_octave(pitch_class: int, reference: int) -> int:
    """음이름만으로는 옥타브를 모르니 표준 튜닝에서 가장 가까운 옥타브를 고른다."""
    best = None
    for octave in range(0, 9):
        value = octave * 12 + pitch_class
        if best is None or abs(value - reference) < abs(best - reference):
            best = value
    return best


def parse_tuning(glyphs: list[Glyph]) -> list[int] | None:
    """조율 표기를 읽어 1번 현부터의 MIDI 음높이로 돌려준다.

    읽지 못하면 None. 호출한 쪽에서 표준 튜닝을 쓰면 된다.
    """
    numbers = [
        g for g in glyphs if STRING_NUMBER_BASE <= g.code <= STRING_NUMBER_MAX
    ]
    if not numbers:
        return _parse_tune_down(glyphs)

    letters = [
        g for g in glyphs if not g.is_music and g.char.strip() in _PITCH_CLASS
    ]
    accidentals = [g for g in glyphs if g.code in (FLAT, NATURAL, SHARP)]

    found: dict[int, int] = {}
    for num in numbers:
        string = num.code - STRING_NUMBER_BASE + 1
        if string in found:
            continue  # 악기가 여러 개면 표기가 반복된다. 첫 번째만 쓴다.

        # 같은 줄에서 오른쪽으로 가장 가까운 음이름
        letter = min(
            (
                g
                for g in letters
                if abs(g.y - num.y) < 4 and 0 < g.x0 - num.x1 < 30
            ),
            key=lambda g: g.x0 - num.x1,
            default=None,
        )
        if letter is None:
            continue

        # 음이름 바로 오른쪽 위에 붙는 임시표
        shift = 0
        for a in accidentals:
            if abs(a.y - letter.y) < 5 and -1 < a.x0 - letter.x1 < 6:
                shift = {FLAT: -1, NATURAL: 0, SHARP: 1}[a.code]
                break

        pc = (_PITCH_CLASS[letter.char.strip()] + shift) % 12
        reference = STANDARD_TUNING[string - 1] if string <= 6 else 40
        found[string] = _nearest_octave(pc, reference)

    if len(found) < 6:
        return _parse_tune_down(glyphs)
    return [found[s] for s in range(1, 7)]


def _parse_tune_down(glyphs: list[Glyph]) -> list[int] | None:
    """'Tune down 1/2 step'처럼 글로 적힌 경우를 처리한다."""
    text = "".join(g.char for g in glyphs if not g.is_music)
    m = TUNE_DOWN_RE.search(text.replace(" ", ""))
    if not m:
        m = TUNE_DOWN_RE.search(text)
    if not m:
        return None
    numerator, denominator = int(m.group(1)), int(m.group(2))
    semitones = round(numerator / denominator * 2)  # 1/2 step = 반음 1개
    return [v - semitones for v in STANDARD_TUNING]
