"""오선보에서 읽은 음길이와 TAB에서 읽은 현·프렛을 하나로 합친다.

악보는 같은 소리를 두 곳에 나눠 적는다. 오선보에는 리듬이, TAB에는
어느 줄 몇 프렛을 짚는지가 있다. 둘은 같은 가로 위치에 그려지므로
x좌표로 짝지으면 '언제 무엇을 친다'가 완성된다.

실측상 오선보 음표와 TAB 숫자의 x 차이는 0.5pt 안쪽이라 짝짓기는 안정적이다.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from fractions import Fraction

from annotations import RANGE_KINDS, Annotation, collect, range_end
from dump import bar_edges, group_chords
from rhythm import BEND_ARROW, Event, apply_tuplets, extract_events
from structure import (TIE_FONT, FretMark, Staff, TrackStaff, detect_barlines,
                       extract_frets)


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

    playable = [b for b in beats if b.notes and not all(n.dead for n in b.notes)]

    for a in marks:
        if a.kind == "bend":
            # 밴딩 표기('full' 등)는 목표음 위에 적히는데 그 목표음은 이미
            # 시작음에 병합돼 사라졌다. 그래서 가장 가까운 음을 고르면 뒤쪽
            # 엉뚱한 음(데드 노트 등)에 붙는다. 표기보다 앞에 있는, 실제로
            # 칠 수 있는 마지막 음이 밴딩의 시작음이다.
            before = [b for b in playable if b.x <= a.x + gap]
            if before:
                before[-1].marks.append((a.kind, a.text))
            continue

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
    # 리듬 슬래시로 그려진 박 (직전 화음 반복)
    is_slash: bool = False
    # 기둥 방향. 한 보표를 두 성부가 나눠 쓸 때 어느 쪽인지 가리는 근거다.
    stem_up: bool | None = None
    # 잇단음표 비율 (셋잇단음표면 2/3 — 적힌 셋이 둘 길이만큼 간다)
    ratio: Fraction = Fraction(1)
    # 앞 소리에서 타이로 이어진 음. 다시 튕기지 않고 소리를 잇는다.
    tied: bool = False

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
        base = (4 / self.denom) * (2 - 0.5**self.dots)
        return base * float(self.ratio) + self.extra_beats

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
    # 둘째 성부. 한 보표에 두 성부가 겹쳐 적힌 마디에서만 채워진다.
    voice2: list[Beat] = field(default_factory=list)

    @property
    def quarters(self) -> float:
        return sum(b.quarters for b in self.beats)


def split_voices(bar: Bar, expected: float = 4.0, eps: float = 1e-6) -> bool:
    """한 보표에 겹쳐 적힌 두 성부를 기둥 방향으로 갈라놓는다.

    기타 악보에서는 한 보표에 멜로디와 베이스를 위/아래 기둥으로 나눠
    적는 일이 흔하다. 그대로 한 줄로 읽으면 두 성부의 길이가 더해져
    마디가 넘친다.

    다만 기둥 방향은 성부와 무관하게도 바뀐다(음 높이에 따라). 그래서
    갈라봤을 때 **한쪽이 정확히 마디 길이와 맞아떨어질 때만** 나눈다.
    아니라면 근거가 부족하므로 건드리지 않는다 — 잘못 나누면 멀쩡한
    마디를 망가뜨린다.
    """
    if abs(bar.quarters - expected) < eps or len(bar.beats) < 2:
        return False

    up = [b for b in bar.beats if b.stem_up is True]
    down = [b for b in bar.beats if b.stem_up is not True]
    if not up or not down:
        return False

    total = lambda bs: sum(b.quarters for b in bs)  # noqa: E731
    if abs(total(up) - expected) < eps:
        main, second = up, down
    elif abs(total(down) - expected) < eps:
        main, second = down, up
    else:
        return False

    bar.beats, bar.voice2 = main, second
    return True


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

    **기둥이 없는** 머리는 길이를 더하지 않고 아예 뺀다. 검은 음표머리에
    기둥이 없는 건 정상적인 음표일 수 없다 — 시간을 차지하지 않는 표시라는
    뜻이다. 밴딩을 여러 머리로 그리는 악보에서 이런 머리가 마디마다 끼어
    박자를 부풀린다(악보 A 솔로의 111·112·113·118마디가 모두 이 경우였고,
    빼고 나니 넷 다 정확히 4박이 됐다).

    프렛을 못 찾은 것(orphan)에만 적용하므로, 기둥 검출이 실패한 진짜 음표를
    잘못 지울 위험은 낮다 — 진짜 음표라면 TAB에 숫자가 있어 orphan이 아니다.
    """
    arrows = [(g.x0, g.x1) for g in glyphs if g.code == BEND_ARROW and lo < g.x0 < hi]

    tol = 2.0
    cleaned: list[Beat] = []
    for e, b in zip(events, beats):
        orphan = not b.is_rest and not b.notes and e.heads
        if orphan:
            if e.stemless:
                continue  # 시간을 차지하지 않는 표시용 머리
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
    gap: float = 0.0,
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
            is_slash=e.is_slash,
            stem_up=e.stem_up,
            ratio=e.ratio,
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
        _carry_ties(beats, events, glyphs, gap)
        beats = _merge_bend_orphans(beats, events, glyphs, lo, hi)

    return beats, len(columns) - len(used)


def _carry_ties(beats: list[Beat], events: list[Event], glyphs, gap: float) -> None:
    """타이로 이어진 음에 앞 화음을 물려준다.

    타이로 이어진 음은 TAB에 숫자를 다시 적지 않는다. 그대로 두면 짚는
    자리가 없어 재생할 때 소리가 뚝 끊긴다 — 악보 A에서 122개가 그랬다.

    근거는 세 가지를 모두 만족할 때만 인정한다.

    - 짚는 자리를 못 찾았다 (숫자가 없다)
    - 앞 소리와 **음 높이가 같다** (타이는 같은 음끼리만 잇는다)
    - 둘 사이에 **이음줄 곡선이 그려져 있다** (`structure._tie_curves`)

    셋 다 봐야 하는 이유는, 앞 둘만으로는 이음줄과 붙임줄(slur)을 못
    가리고 진짜로 못 읽은 프렛까지 앞 음으로 덮어쓰기 때문이다.
    """
    curves = [g for g in glyphs if g.font == TIE_FONT]
    if not curves or gap <= 0:
        return

    prev: tuple[Beat, Event] | None = None
    for beat, event in zip(beats, events):
        if event.is_rest:
            continue
        if beat.notes:
            prev = (beat, event)
            continue
        if prev is None or not event.heads:
            continue
        pbeat, pevent = prev
        ys = sorted(round(h.y, 1) for h in event.heads)
        if ys != sorted(round(h.y, 1) for h in pevent.heads):
            continue
        reach = max(event.heads[0].x1 - event.heads[0].x0, gap)
        joined = any(
            pevent.x < c.x < event.x + reach
            and any(abs(c.y - y) < gap * 1.6 for y in ys)
            for c in curves
        )
        if joined:
            beat.notes = list(pbeat.notes)
            beat.tied = True
            prev = (beat, event)


def carry_slash_chords(bars: list[Bar]) -> None:
    """리듬 슬래시(/)에 직전 화음을 채워 넣는다.

    슬래시는 '직전 화음을 그대로 한 번 더'라는 표기라 TAB에 프렛이 적히지
    않는다. 그대로 두면 소리가 나지 않으므로, 마디를 넘어가며 마지막으로
    실제 프렛이 있었던 화음을 이어받는다.
    """
    last: list[PlayedNote] = []
    for bar in bars:
        for b in bar.beats:
            if b.is_rest:
                continue
            if b.notes:
                last = b.notes
            elif b.is_slash and last:
                b.notes = list(last)


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
        # 잇단음표 숫자는 오선 아래에도 놓인다. TAB 윗줄을 알려줘서 그 아래
        # 숫자(프렛)까지 잇단음표로 읽는 일이 없게 한다.
        apply_tuplets(
            events, glyphs, track.score, lo, hi,
            floor_y=track.tab.top if track.tab else None,
        )
        columns = group_chords([m for m in frets if lo < m.x < hi])
        beats, left = merge_bar(
            events, columns, tolerance, glyphs, lo, hi, track.score.gap
        )
        orphans += left
        attach_marks(
            beats,
            [a for a in points if lo - 2 < a.x < hi + 2],
            ranges,
            ref.gap,
        )
        bar = Bar(index=bi, beats=beats, x0=lo, x1=hi)
        split_voices(bar)
        bars.append(bar)
    return bars, orphans
