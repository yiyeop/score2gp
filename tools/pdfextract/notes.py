"""오선보에서 읽은 음길이와 TAB에서 읽은 현·프렛을 하나로 합친다.

악보는 같은 소리를 두 곳에 나눠 적는다. 오선보에는 리듬이, TAB에는
어느 줄 몇 프렛을 짚는지가 있다. 둘은 같은 가로 위치에 그려지므로
x좌표로 짝지으면 '언제 무엇을 친다'가 완성된다.

실측상 오선보 음표와 TAB 숫자의 x 차이는 0.5pt 안쪽이라 짝짓기는 안정적이다.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from annotations import RANGE_KINDS, Annotation, collect, range_end
from dump import bar_edges, group_chords
from rhythm import BEND_ARROW, Event, extract_events
from structure import FretMark, Staff, TrackStaff, detect_barlines, extract_frets


def _page_texts(glyphs):
    """가까이 붙은 글자들을 한 덩어리 텍스트로 모은다."""
    items = sorted(
        (g for g in glyphs if not g.is_music and g.char.strip()),
        key=lambda g: (round(g.y, 0), g.x0),
    )
    out: list[list] = []
    for g in items:
        if out and abs(out[-1][1] - g.y) < 1.5 and g.x0 - out[-1][3] < 3.0:
            out[-1][2] += g.char
            out[-1][3] = g.x1
        else:
            out.append([g.x0, g.y, g.char, g.x1])
    return [(o[0], o[1], o[2].strip()) for o in out if o[2].strip()]


def attach_marks(
    beats: list[Beat],
    marks: list[Annotation],
    ranges: list[tuple[Annotation, float]],
    gap: float,
) -> None:
    """주석을 소리에 붙인다.

    한 음표에만 걸리는 것(슬라이드·톤 등)은 x가 가장 가까운 소리에 붙이고,
    구간을 나타내는 것(P.M.·let ring)은 괄호가 끝날 때까지의 모든 소리에 건다.
    """
    if not beats:
        return

    for a in marks:
        limit = gap * 6 if a.kind == "tone" else gap * 2.5
        best = min(beats, key=lambda b: abs(b.x - a.x))
        if abs(best.x - a.x) <= limit:
            best.marks.append((a.kind, a.text))

    for a, end in ranges:
        for b in beats:
            if a.x - gap * 2 <= b.x <= end + gap:
                b.marks.append((a.kind, a.text))


@dataclass
class PlayedNote:
    """한 번에 짚는 음 하나."""

    string: int
    fret: int | None  # 데드 노트면 None

    @property
    def dead(self) -> bool:
        return self.fret is None

    def __str__(self) -> str:
        return f"{self.string}현{'X' if self.dead else self.fret}"


@dataclass
class Beat:
    """한 박자 자리의 소리. 화음이면 notes가 여럿, 쉼표면 비어 있다."""

    x: float
    denom: int
    dots: int
    is_rest: bool
    notes: list[PlayedNote] = field(default_factory=list)
    # 밴딩 목표음을 흡수해 붙은 여분 길이. Event.extra_beats를 그대로 옮긴 값.
    extra_beats: float = 0.0
    # 이 소리에 걸린 주법·톤 지시 (kind, text). 예: ("slide", "sl.")
    marks: list[tuple[str, str]] = field(default_factory=list)

    def has(self, kind: str) -> bool:
        return any(k == kind for k, _ in self.marks)

    @property
    def tone(self) -> str | None:
        for k, t in self.marks:
            if k == "tone":
                return t
        return None

    @property
    def quarters(self) -> float:
        """4분음표를 1로 봤을 때의 길이."""
        return (4 / self.denom) * (2 - 0.5**self.dots) + self.extra_beats

    def __str__(self) -> str:
        head = f"1/{self.denom}{'.' * self.dots}"
        if self.extra_beats:
            head += f"+{self.extra_beats:g}"
        if self.is_rest:
            return f"[{head} 쉼표]"
        body = "+".join(str(n) for n in self.notes) or "?"
        return f"[{head} {body}]"


@dataclass
class Bar:
    index: int
    beats: list[Beat]
    x0: float
    x1: float

    @property
    def quarters(self) -> float:
        return sum(b.quarters for b in self.beats)


def _to_notes(column: list[FretMark]) -> list[PlayedNote]:
    return [
        PlayedNote(string=m.string, fret=None if m.is_dead else m.fret)
        for m in sorted(column, key=lambda m: m.string)
    ]


def _merge_bend_orphans(
    beats: list[Beat],
    events: list[Event],
    glyphs,
    lo: float,
    hi: float,
) -> list[Beat]:
    """TAB과 못 맞은 음표 중 밴딩 목표음으로 보이는 것을 직전 음에 흡수시킨다.

    Guitar Pro는 밴딩을 '원음 + 목표음(위로 밀린 음표머리) + full 텍스트 +
    화살표'로 그리는데, TAB에는 원음의 프렛 하나만 적힌다. 그래서 목표음은
    항상 TAB 매칭에 실패한다 — 매칭이 끝난 뒤 그 실패작만 후처리하면,
    이미 TAB과 잘 맞은 원음을 건드릴 위험 없이 안전하게 정리할 수 있다.
    (곡 전체 x 순서로 먼저 합치는 방식은 시도했으나, 온음 밴딩을 반음
    두 번 화살표로 겹쳐 그리는 경우 등에서 엉뚱한 원음에 붙는 문제가 있었다.)
    """
    arrows = [(g.x0, g.x1) for g in glyphs if g.code == BEND_ARROW and lo < g.x0 < hi]
    if not arrows:
        return beats

    tol = 2.0
    cleaned: list[Beat] = []
    for e, b in zip(events, beats):
        orphan = not b.is_rest and not b.notes and e.heads
        if orphan:
            hx0 = min(h.x0 for h in e.heads)
            hx1 = max(h.x1 for h in e.heads)
            near_arrow = any(hx1 >= ax0 - tol and hx0 <= ax1 + tol for ax0, ax1 in arrows)
            if near_arrow and cleaned and not cleaned[-1].is_rest:
                cleaned[-1].extra_beats += b.quarters
                continue
        cleaned.append(b)
    return cleaned


def merge_bar(
    events: list[Event],
    columns: list[list[FretMark]],
    tolerance: float,
    glyphs=None,
    lo: float = 0.0,
    hi: float = 0.0,
) -> tuple[list[Beat], int]:
    """한 마디 안에서 음길이와 프렛을 짝짓는다.

    돌려주는 두 번째 값은 짝을 못 찾고 남은 TAB 화음의 개수다.
    0이 아니면 오선보 쪽 음표를 놓쳤다는 뜻이라 품질 지표로 쓴다.
    """
    used: set[int] = set()
    beats: list[Beat] = []

    for e in events:
        beat = Beat(
            x=e.x,
            denom=e.denom,
            dots=e.dots,
            is_rest=e.is_rest,
            extra_beats=e.extra_beats,
        )
        if not e.is_rest:
            best, best_d = None, tolerance
            for i, col in enumerate(columns):
                if i in used:
                    continue
                d = abs(col[0].x - e.x)
                if d < best_d:
                    best, best_d = i, d
            if best is not None:
                used.add(best)
                beat.notes = _to_notes(columns[best])
        beats.append(beat)

    if glyphs is not None:
        beats = _merge_bend_orphans(beats, events, glyphs, lo, hi)

    return beats, len(columns) - len(used)


def extract_bars(
    track: TrackStaff,
    glyphs,
    v_lines,
    beams,
    barlines: list[float] | None = None,
    h_segments=None,
    zone: tuple[float, float] | None = None,
) -> tuple[list[Bar], int]:
    """한 악기의 한 시스템 분량을 마디별로 뽑는다.

    `barlines`를 주면 그걸 쓴다. 같은 시스템의 악기들은 마디선이 같으므로,
    시스템 전체에서 합의한 위치를 넘겨주면 보표 하나만 보고 판단할 때보다
    안정적이다. TAB 없는 보표(보컬 등)는 음표 기둥이 마디선으로 오인되기
    쉬워서 특히 도움이 된다.
    """
    if not track.score:
        return [], 0

    if barlines is None:
        barlines = detect_barlines(track, v_lines)
    edges = bar_edges(track, barlines)
    frets = extract_frets(track.tab, glyphs) if track.tab else []
    ref: Staff = track.tab or track.score
    tolerance = ref.gap * 1.2

    # 주석은 마디가 아니라 이 악기 전체를 기준으로 한 번만 모은다.
    # P.M. 구간이 마디를 넘어 이어질 수 있어서 마디별로 자르면 안 된다.
    if zone is None:
        zone = (track.score.top - ref.gap * 5, (track.tab or track.score).bottom)
    marks_all = collect(_page_texts(glyphs), zone)

    points = [a for a in marks_all if a.kind not in RANGE_KINDS]
    ranges = [
        (a, range_end(a, h_segments, edges[-1]) if h_segments else a.x)
        for a in marks_all
        if a.kind in RANGE_KINDS
    ]

    bars: list[Bar] = []
    orphans = 0
    for bi in range(len(edges) - 1):
        lo, hi = edges[bi], edges[bi + 1]
        events = extract_events(track.score, glyphs, v_lines, beams, lo, hi)
        columns = group_chords([m for m in frets if lo < m.x < hi])
        beats, left = merge_bar(events, columns, tolerance, glyphs, lo, hi)
        orphans += left
        attach_marks(
            beats,
            [a for a in points if lo - 2 < a.x < hi + 2],
            ranges,
            ref.gap,
        )
        bars.append(Bar(index=bi, beats=beats, x0=lo, x1=hi))
    return bars, orphans
