"""벡터 악보 PDF에서 보표·시스템·마디 구조를 뽑아낸다.

Guitar Pro가 내보낸 PDF를 기준으로 만들었다. 악보 기호가 SMuFL 표준
폰트(Bravura) 글리프로 들어 있고, 오선/TAB 선과 마디선은 벡터 선이라
이미지 인식 없이 좌표만으로 구조를 복원할 수 있다.
"""

from __future__ import annotations

import collections
from dataclasses import dataclass, field

import fitz

# ── SMuFL 코드포인트 (Bravura 기준) ──────────────────────────
NOTEHEAD_BLACK = 0xE0A4
NOTEHEAD_HALF = 0xE0A3
NOTEHEAD_WHOLE = 0xE0A2
NOTEHEAD_X = 0xE0A9  # 데드 노트
AUGMENTATION_DOT = 0xE1E7
FLAG_8_UP, FLAG_8_DOWN = 0xE240, 0xE241
FLAG_16_UP, FLAG_16_DOWN = 0xE242, 0xE243
FLAG_32_UP, FLAG_32_DOWN = 0xE244, 0xE245
G_CLEF = 0xE050
TAB_CLEF = 0xE06D

# 쉼표는 코드포인트 자체에 길이가 들어 있다
RESTS = {
    0xE4E3: 1,    # whole
    0xE4E4: 2,    # half
    0xE4E5: 4,    # quarter
    0xE4E6: 8,    # 8th
    0xE4E7: 16,   # 16th
    0xE4E8: 32,
}
FLAG_DENOM = {
    FLAG_8_UP: 8, FLAG_8_DOWN: 8,
    FLAG_16_UP: 16, FLAG_16_DOWN: 16,
    FLAG_32_UP: 32, FLAG_32_DOWN: 32,
}


@dataclass
class Glyph:
    code: int
    char: str
    font: str
    x: float
    y: float
    x0: float
    y0: float
    x1: float
    y1: float

    @property
    def profile(self):
        from fonts import profile_for

        return profile_for(self.font)

    @property
    def is_music(self) -> bool:
        return self.profile is not None


@dataclass
class Staff:
    """오선(5줄) 또는 TAB(6줄) 하나."""

    kind: str            # "score" | "tab"
    lines: list[float]   # 각 줄의 y좌표 (위→아래)
    x0: float
    x1: float

    @property
    def top(self) -> float:
        return self.lines[0]

    @property
    def bottom(self) -> float:
        return self.lines[-1]

    @property
    def gap(self) -> float:
        return (self.bottom - self.top) / (len(self.lines) - 1)

    def string_at(self, y: float) -> int | None:
        """TAB에서 y좌표가 몇 번 줄인지 (1 = 가장 높은 음 = 1번 현)."""
        if self.kind != "tab":
            return None
        idx = round((y - self.top) / self.gap)
        return idx + 1 if 0 <= idx < len(self.lines) else None


@dataclass
class TrackStaff:
    """한 악기의 한 시스템 분량 — 오선과 TAB이 짝을 이룬다."""

    score: Staff | None
    tab: Staff | None
    barlines: list[float] = field(default_factory=list)

    @property
    def top(self) -> float:
        return (self.score or self.tab).top

    @property
    def bottom(self) -> float:
        return (self.tab or self.score).bottom


def _merge_coverage(segments: list[tuple[float, float]]) -> float:
    """겹치는 구간을 합쳐 실제 덮인 길이를 구한다."""
    if not segments:
        return 0.0
    segments = sorted(segments)
    total, end = 0.0, segments[0][0]
    for x0, x1 in segments:
        if x0 > end:
            total += x1 - x0
            end = x1
        elif x1 > end:
            total += x1 - end
            end = x1
    return total


def read_page(page: fitz.Page):
    """페이지에서 선·글리프·빔을 원시 형태로 뽑는다."""
    h_segments: dict[float, list[tuple[float, float]]] = collections.defaultdict(list)
    v_lines: list[tuple[float, float, float]] = []
    beams: list[tuple[float, float, float, float]] = []

    for d in page.get_drawings():
        rect = d["rect"]
        filled = d["type"] in ("f", "fs")
        for item in d["items"]:
            if item[0] == "l":
                p1, p2 = item[1], item[2]
                if abs(p1.y - p2.y) < 0.3:
                    h_segments[round(p1.y, 1)].append((min(p1.x, p2.x), max(p1.x, p2.x)))
                elif abs(p1.x - p2.x) < 0.3 and abs(p1.y - p2.y) > 2:
                    v_lines.append((p1.x, min(p1.y, p2.y), max(p1.y, p2.y)))
            elif item[0] == "re":
                r = item[1]
                if r.height < 0.9 and r.width > 2:
                    h_segments[round(r.y0, 1)].append((r.x0, r.x1))
                elif r.width < 1.5 and r.height > 2:
                    v_lines.append((r.x0, r.y0, r.y1))
        # 빔: 채워진 다각형인데 오선처럼 얇지는 않은 것
        if filled and 3 < rect.width < 300 and 0.9 < rect.height < 30:
            if all(i[0] == "l" for i in d["items"]):
                beams.append((rect.x0, rect.y0, rect.x1, rect.y1))

    glyphs: list[Glyph] = []
    for block in page.get_text("rawdict")["blocks"]:
        for line in block.get("lines", []):
            for span in line["spans"]:
                for ch in span["chars"]:
                    bbox = ch["bbox"]
                    glyphs.append(
                        Glyph(
                            code=ord(ch["c"]) if ch["c"] else 0,
                            char=ch["c"],
                            font=span["font"],
                            x=ch["origin"][0],
                            y=ch["origin"][1],
                            x0=bbox[0], y0=bbox[1], x1=bbox[2], y1=bbox[3],
                        )
                    )

    return h_segments, v_lines, beams, glyphs


def detect_staves(h_segments, page_width: float) -> list[Staff]:
    """가로선 중 '일정한 간격으로 5줄 또는 6줄'인 묶음만 보표로 본다.

    단순히 가까운 선끼리 묶으면 P.M. 괄호선처럼 보표 바로 위에 붙어 그려지는
    선까지 섞여 줄 수가 어긋난다. 오선·TAB은 줄 간격이 정확히 일정하다는 점을
    이용해, 간격이 균일한 연속 구간만 골라낸다.
    """
    candidates = []
    for y, segs in h_segments.items():
        if _merge_coverage(segs) > page_width * 0.4:
            xs = [s[0] for s in segs] + [s[1] for s in segs]
            candidates.append((y, min(xs), max(xs)))
    candidates.sort()

    # 가능한 창을 모두 만들어 '간격이 얼마나 고른지'로 점수를 매긴다.
    # 보표 바로 위/아래에 다른 선(P.M. 괄호 등)이 붙어 있으면 한 줄 밀린 창도
    # 후보가 되는데, 진짜 보표는 간격 편차가 거의 0이라 점수로 걸러진다.
    windows = []
    for count, kind in ((6, "tab"), (5, "score")):
        for i in range(len(candidates) - count + 1):
            run = candidates[i : i + count]
            gaps = [run[k + 1][0] - run[k][0] for k in range(count - 1)]
            mean = sum(gaps) / len(gaps)
            if mean <= 0 or mean > 12:
                continue
            dev = max(abs(g - mean) for g in gaps) / mean
            if dev > 0.06:
                continue
            windows.append((dev, -count, i, count, kind, run))

    # 줄 수가 많은 것부터 확정한다. 6줄 TAB 안에는 5줄짜리 균일 구간이
    # 반드시 들어 있어서, 편차만으로 정렬하면 TAB이 오선으로 쪼개진다.
    windows.sort(key=lambda w: (w[1], w[0]))

    staves: list[Staff] = []
    used: set[int] = set()
    for dev, _, i, count, kind, run in windows:
        idx = range(i, i + count)
        if any(j in used for j in idx):
            continue
        used.update(idx)
        staves.append(
            Staff(
                kind=kind,
                lines=[r[0] for r in run],
                x0=min(r[1] for r in run),
                x1=max(r[2] for r in run),
            )
        )
    staves.sort(key=lambda s: s.top)
    return staves


@dataclass
class FretMark:
    """TAB 위의 프렛 표시 하나. 두 자리 수(10~24)도 하나로 묶인다."""

    text: str
    string: int
    x: float       # 왼쪽 끝 (시간 순 정렬 기준)
    right: float   # 오른쪽 끝 (다음 글자와 붙었는지 판정용)
    y: float

    @property
    def fret(self) -> int | None:
        return int(self.text) if self.text.isdigit() else None

    @property
    def is_dead(self) -> bool:
        return self.text.upper() == "X"


def extract_frets(tab: Staff, glyphs: list[Glyph]) -> list[FretMark]:
    """TAB 보표 위의 숫자를 읽어 (현, 프렛)으로 만든다.

    PDF에는 '11'이 '1','1' 두 글자로 따로 들어 있으므로,
    같은 줄에서 가로로 맞붙은 글자는 한 숫자로 합친다.
    글자는 줄 위에 세로 중앙이 오도록 그려지므로 baseline이 아니라
    글자 상자의 중앙 y로 현을 판정한다.
    """
    span = tab.gap * 0.5
    cand = []
    for g in glyphs:
        if g.is_music:
            continue
        t = g.char.strip()
        if not (t.isdigit() or t.upper() == "X"):
            continue
        cy = (g.y0 + g.y1) / 2
        if tab.top - span <= cy <= tab.bottom + span:
            cand.append((cy, g, t))
    cand.sort(key=lambda c: (round(c[0], 1), c[1].x0))

    marks: list[FretMark] = []
    for cy, g, t in cand:
        prev = marks[-1] if marks else None
        if (
            prev is not None
            and abs(prev.y - cy) < 1.0
            and t.isdigit()
            and prev.text.isdigit()
            # 프렛은 최대 두 자리(0~24)다. 이 제약이 없으면 빠른 패시지에서
            # 이웃한 프렛까지 이어붙어 '121412' 같은 값이 나온다.
            and len(prev.text) < 2
            # 두 자리 수의 글자는 살짝 겹쳐 그려지기도 해서 음수 간격을 허용한다
            and -1.5 <= g.x0 - prev.right <= (g.x1 - g.x0) * 0.5
        ):
            prev.text += t
            prev.right = g.x1
            continue
        s = tab.string_at(cy)
        if s is None:
            continue
        marks.append(FretMark(text=t, string=s, x=g.x0, right=g.x1, y=cy))
    marks.sort(key=lambda m: m.x)
    return marks


def pair_tracks(staves: list[Staff]) -> list[TrackStaff]:
    """오선 바로 아래 붙은 TAB을 같은 악기로 묶는다."""
    tracks: list[TrackStaff] = []
    i = 0
    while i < len(staves):
        s = staves[i]
        if s.kind == "score" and i + 1 < len(staves) and staves[i + 1].kind == "tab":
            tracks.append(TrackStaff(score=s, tab=staves[i + 1]))
            i += 2
        else:
            tracks.append(TrackStaff(score=s if s.kind == "score" else None,
                                     tab=s if s.kind == "tab" else None))
            i += 1
    return tracks


def _staff_verticals(staff: Staff, v_lines) -> list[float]:
    """한 보표를 위아래로 정확히 관통하는 세로선의 x 목록."""
    return sorted(
        x
        for x, y0, y1 in v_lines
        if abs(y0 - staff.top) < 1.5 and abs(y1 - staff.bottom) < 1.5
    )


def detect_barlines(track: TrackStaff, v_lines) -> list[float]:
    """마디선만 골라낸다.

    음표 기둥(stem)도 보표 높이만큼 긴 세로선이라 길이만으로는 구분되지 않는다.
    마디선을 그리는 방식은 제작 도구마다 달라서 두 가지를 모두 인정한다.

    1. 오선과 TAB을 한 줄로 관통 (Finale 계열)
    2. 보표마다 따로 그리되 같은 x에 나타남 (Guitar Pro 계열)
    """
    found: list[float] = []

    if track.score and track.tab:
        # 1. 트랙 전체를 관통하는 세로선
        found += [
            x
            for x, y0, y1 in v_lines
            if abs(y0 - track.score.top) < 2.0 and abs(y1 - track.tab.bottom) < 2.0
        ]
        # 2. 오선·TAB 양쪽에서 같은 x로 발견되는 세로선
        a = _staff_verticals(track.score, v_lines)
        b = _staff_verticals(track.tab, v_lines)
        found += [x for x in a if any(abs(x - y) < 2.0 for y in b)]
        found.sort()
    else:
        found = _staff_verticals(track.score or track.tab, v_lines)

    # 겹세로줄(반복 기호 등)은 선이 2~3개 붙어 있으므로 하나로 본다
    merged: list[float] = []
    for x in found:
        if not merged or x - merged[-1] > 4:
            merged.append(x)
    return merged
