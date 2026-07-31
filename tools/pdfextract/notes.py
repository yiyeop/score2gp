"""오선보에서 읽은 음길이와 TAB에서 읽은 현·프렛을 하나로 합친다.

악보는 같은 소리를 두 곳에 나눠 적는다. 오선보에는 리듬이, TAB에는
어느 줄 몇 프렛을 짚는지가 있다. 둘은 같은 가로 위치에 그려지므로
x좌표로 짝지으면 '언제 무엇을 친다'가 완성된다.

실측상 오선보 음표와 TAB 숫자의 x 차이는 0.5pt 안쪽이라 짝짓기는 안정적이다.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from dump import bar_edges, group_chords
from rhythm import Event, extract_events
from structure import FretMark, Staff, TrackStaff, detect_barlines, extract_frets


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

    @property
    def quarters(self) -> float:
        """4분음표를 1로 봤을 때의 길이."""
        return (4 / self.denom) * (2 - 0.5**self.dots)

    def __str__(self) -> str:
        head = f"1/{self.denom}{'.' * self.dots}"
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


def merge_bar(
    events: list[Event],
    columns: list[list[FretMark]],
    tolerance: float,
) -> tuple[list[Beat], int]:
    """한 마디 안에서 음길이와 프렛을 짝짓는다.

    돌려주는 두 번째 값은 짝을 못 찾고 남은 TAB 화음의 개수다.
    0이 아니면 오선보 쪽 음표를 놓쳤다는 뜻이라 품질 지표로 쓴다.
    """
    used: set[int] = set()
    beats: list[Beat] = []

    for e in events:
        beat = Beat(x=e.x, denom=e.denom, dots=e.dots, is_rest=e.is_rest)
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

    return beats, len(columns) - len(used)


def extract_bars(
    track: TrackStaff,
    glyphs,
    v_lines,
    beams,
) -> tuple[list[Bar], int]:
    """한 악기의 한 시스템 분량을 마디별로 뽑는다."""
    if not track.score:
        return [], 0

    edges = bar_edges(track, detect_barlines(track, v_lines))
    frets = extract_frets(track.tab, glyphs) if track.tab else []
    ref: Staff = track.tab or track.score
    tolerance = ref.gap * 1.2

    bars: list[Bar] = []
    orphans = 0
    for bi in range(len(edges) - 1):
        lo, hi = edges[bi], edges[bi + 1]
        events = extract_events(track.score, glyphs, v_lines, beams, lo, hi)
        columns = group_chords([m for m in frets if lo < m.x < hi])
        beats, left = merge_bar(events, columns, tolerance)
        orphans += left
        bars.append(Bar(index=bi, beats=beats, x0=lo, x1=hi))
    return bars, orphans
