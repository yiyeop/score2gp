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

        return profile_for(self.font, self.code)

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
        # 빔은 채워진 가로로 긴 도형이다. 그리는 방식이 도구마다 다르다.
        #   Guitar Pro — 기울어질 수 있어 선 4개짜리 다각형('l')
        #   Finale     — 수평이라 사각형 하나('re')
        # 이음줄·붙임줄도 채워진 도형이지만 곡선('c')을 포함하므로 제외한다.
        # 가로세로 비율로는 가를 수 없다. 기울기가 급한 짧은 빔은 경계 상자가
        # 거의 정사각형이라 비율 조건을 걸면 그런 빔이 통째로 빠진다.
        is_beam = (
            filled
            and 3 < rect.width < 300
            and 0.9 < rect.height < 30
            and {i[0] for i in d["items"]} <= {"l", "re"}
        )
        if is_beam:
            beams.append((rect.x0, rect.y0, rect.x1, rect.y1))
            # 빔의 위아래 모서리는 가로선이지만 보표 줄이 아니다. 8분음표가
            # 이어지는 마디에서는 이 모서리가 오선 사이 높이에 깔려, 보표를
            # '간격이 고른 5줄'로 찾는 눈을 흐린다.
            continue
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

    # 음표를 글자가 아니라 도형(윤곽선)으로 저장한 악보가 있다. 그런 파일은
    # 글리프 코드가 없어 무엇이 음표인지 알 방법이 없는데, 크기만은 규칙적이다
    # — 음표머리는 오선 간격의 1.2배쯤 되는 채워진 타원이다.
    # 진짜 음악 폰트가 있으면 그쪽이 훨씬 정확하므로, 없을 때만 쓴다.
    if not any(g.is_music for g in glyphs):
        glyphs += _glyphs_from_shapes(page, h_segments)

    return h_segments, v_lines, beams, glyphs


# 오선 간격을 1로 봤을 때 도형의 크기. 실측(쏜애플 - 아지랑이)에서
# 음표머리 1.18×1.00, 점 0.40×0.40, 온음표 1.80×1.02로 뚜렷이 갈렸다.
_SHAPE_KINDS = (
    (NOTEHEAD_WHOLE, (1.55, 2.10), (0.80, 1.25)),
    (NOTEHEAD_BLACK, (0.90, 1.45), (0.80, 1.25)),
    (AUGMENTATION_DOT, (0.25, 0.55), (0.25, 0.55)),
)


def _glyphs_from_shapes(page: fitz.Page, h_segments) -> list[Glyph]:
    """채워진 도형 중 음표머리·점으로 보이는 것을 글리프처럼 만들어 준다.

    SMuFL 코드를 붙여 내보내므로 뒤 단계(화음 묶기·기둥·빔·점 세기)는
    글자로 그린 악보와 똑같이 처리된다.

    쉼표는 만들지 않는다. 모양이 제각각이라 크기만으로는 가릴 수 없고,
    잘못 넣으면 있지도 않은 박이 생겨 마디가 어그러진다.
    """
    staves = detect_staves(h_segments, page.rect.width)
    if not staves:
        return []
    gaps = sorted(s.gap for s in staves)
    gap = gaps[len(gaps) // 2]
    if gap <= 0:
        return []

    out: list[Glyph] = []
    for d in page.get_drawings():
        if d["type"] not in ("f", "fs"):
            continue
        if {i[0] for i in d["items"]} != {"c"}:  # 곡선만으로 이뤄진 도형
            continue
        r = d["rect"]
        w, h = r.width / gap, r.height / gap
        for code, (wlo, whi), (hlo, hhi) in _SHAPE_KINDS:
            if wlo <= w <= whi and hlo <= h <= hhi:
                out.append(
                    Glyph(
                        code=code, char="", font="shapes",
                        x=r.x0, y=(r.y0 + r.y1) / 2,
                        x0=r.x0, y0=r.y0, x1=r.x1, y1=r.y1,
                    )
                )
                break
    return out


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

    # 문턱을 못 넘은 줄도 자리만은 기억해 둔다. 프렛 숫자가 빽빽한 TAB은
    # 줄이 숫자마다 끊겨(실측 63토막, 38%) 후보에서 빠지는데, 그 자리에
    # 뭔가 있었다는 사실은 4줄/6줄을 가릴 때 필요하다.
    faint = sorted(
        y for y, segs in h_segments.items()
        if page_width * 0.15 < _merge_coverage(segs) <= page_width * 0.4
    )

    def has_line_at(y: float, tol: float = 1.2) -> bool:
        return any(abs(f - y) <= tol for f in faint) or any(
            abs(c[0] - y) <= tol for c in candidates
        )

    # 가능한 창을 모두 만들어 '간격이 얼마나 고른지'로 점수를 매긴다.
    # 보표 바로 위/아래에 다른 선(P.M. 괄호 등)이 붙어 있으면 한 줄 밀린 창도
    # 후보가 되는데, 진짜 보표는 간격 편차가 거의 0이라 점수로 걸러진다.
    # 줄 수가 많은 것부터 본다. 4줄 TAB(베이스)은 5줄 오선과 6줄 TAB 안에도
    # 들어 있으므로, 그 둘을 먼저 확정한 뒤에 남은 줄에서만 찾아야 한다.
    windows = []
    for count, kind in ((6, "tab"), (5, "score"), (4, "tab")):
        for i in range(len(candidates) - count + 1):
            run = candidates[i : i + count]
            gaps = [run[k + 1][0] - run[k][0] for k in range(count - 1)]
            mean = sum(gaps) / len(gaps)
            if mean <= 0 or mean > 12:
                continue
            dev = max(abs(g - mean) for g in gaps) / mean
            if dev > 0.06:
                continue
            # 한 보표의 줄들은 함께 그려져서 시작과 끝이 나란하다. 덧줄은
            # 다르다 — 오선 위로 나간 음표마다 하나씩 붙는데, 그 높이가 정확히
            # 한 칸 위라서 줄 하나처럼 보인다. 음표가 많으면 덮인 길이도 충분해
            # 5줄 오선이 6줄 TAB으로 잡히고, 그 파트가 통째로 어긋난다.
            # 덧줄은 마디 안쪽에만 있어 시스템 가장자리까지 닿지 않는다.
            lefts = [r[1] for r in run]
            rights = [r[2] for r in run]
            slack = max(max(lefts) - min(lefts), max(rights) - min(rights))
            if slack > max(6.0, (max(rights) - min(lefts)) * 0.05):
                continue
            # 4줄 TAB(베이스)은 6줄 TAB의 아래 네 줄과 모양이 같다. 위쪽에
            # 같은 간격으로 줄이 더 있으면 베이스가 아니라 잘린 기타 TAB이다.
            # 이걸 안 보면 기타를 베이스로 읽어 조율까지 틀리게 된다.
            if count == 4 and (
                has_line_at(run[0][0] - mean) or has_line_at(run[0][0] - mean * 2)
            ):
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


# 기타에 실제로 있는 가장 높은 프렛. 24프렛이 가장 많고, 그보다 많은 악기는
# 사실상 없다. 이보다 큰 값이 나왔다면 읽기가 틀린 것이다.
FRET_MAX = 24


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


# 밴딩 화살표 글리프. 화살표 끝에 적힌 숫자는 '올려서 닿을 음'이지
# 따로 치는 음이 아니다.
BEND_ARROW = 0xEB78


def extract_frets(tab: Staff, glyphs: list[Glyph]) -> list[FretMark]:
    """TAB 보표 위의 숫자를 읽어 (현, 프렛)으로 만든다.

    PDF에는 '11'이 '1','1' 두 글자로 따로 들어 있으므로,
    같은 줄에서 가로로 맞붙은 글자는 한 숫자로 합친다.
    글자는 줄 위에 세로 중앙이 오도록 그려지므로 baseline이 아니라
    글자 상자의 중앙 y로 현을 판정한다.

    밴딩 목표음은 세지 않는다. 목표를 숫자로 적는 악보가 있는데(원래 음
    한 줄 위에 화살표로 이어 그린다), 그걸 치는 음으로 세면 마디에 있지도
    않은 음이 들어가고 박자도 넘친다.
    """
    span = tab.gap * 0.5
    arrows = [
        (g.x0, g.x1)
        for g in glyphs
        if g.code == BEND_ARROW and tab.top - tab.gap * 4 < g.y < tab.bottom + span
    ]

    def is_bend_target(mark: "FretMark") -> bool:
        return any(a0 <= mark.right and mark.x <= a1 for a0, a1 in arrows)

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
            # 프렛은 최대 두 자리다. 이 제약이 없으면 빠른 패시지에서
            # 이웃한 프렛까지 이어붙어 '121412' 같은 값이 나온다.
            and len(prev.text) < 2
            # 합쳐서 나올 수 없는 프렛이 되면 원래 두 음이었다는 뜻이다.
            # 빠른 패시지에서는 음 사이 간격이 두 자리 수 내부 간격만큼
            # 좁아져서 자리 배치만으로는 갈리지 않는다. 실제로 '9 11 9'가
            # '91 1 9'로 읽혔다 — 91프렛짜리 기타는 없으므로 여기서 걸러진다.
            and int(prev.text + t) <= FRET_MAX
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

    # 두 자리 수를 합친 뒤에 거른다. 합치기 전에 거르면 화살표에 걸친 글자만
    # 빠져서 '14'가 '4'로 남는다.
    marks = [m for m in marks if not is_bend_target(m)]
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


def _staff_verticals(staff: Staff, v_lines, may_overrun: bool = False) -> list[float]:
    """한 보표를 위아래로 관통하는 세로선의 x 목록.

    `may_overrun`이면 보표 아래끝을 지나쳐 더 내려가는 선도 인정한다.
    보표 사이를 잇는 마디선을 '내 보표 위끝 → 다음 보표 위끝'으로 그리는
    조판기(MuseScore)가 있어서, 아래끝이 딱 맞기를 바라면 놓친다.

    지나침을 허용하면 아래로 길게 뻗은 음표 기둥도 걸릴 수 있다. 그래서
    이 완화는 오선·TAB 양쪽에서 같은 x를 찾는 경우에만 쓴다 — TAB 안에는
    기둥이 없으므로 양쪽에 동시에 나타나는 일이 없다.
    """
    return sorted(
        x
        for x, y0, y1 in v_lines
        if abs(y0 - staff.top) < 1.5
        and (y1 > staff.bottom - 1.5 if may_overrun else abs(y1 - staff.bottom) < 1.5)
    )


def detect_barlines(track: TrackStaff, v_lines) -> list[float]:
    """마디선만 골라낸다.

    음표 기둥(stem)도 보표 높이만큼 긴 세로선이라 길이만으로는 구분되지 않는다.
    마디선을 그리는 방식은 제작 도구마다 달라서 두 가지를 모두 인정한다.

    1. 오선과 TAB을 한 줄로 관통 (Finale 계열)
    2. 보표마다 따로 그리되 같은 x에 나타남 (Guitar Pro·MuseScore 계열)
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
        a = _staff_verticals(track.score, v_lines, may_overrun=True)
        b = _staff_verticals(track.tab, v_lines, may_overrun=True)
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
