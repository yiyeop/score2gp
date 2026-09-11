"""음표의 길이(리듬)를 판정한다.

TAB에는 프렛만 있고 길이 정보가 없다. 길이는 위에 짝지어진 오선보의
음표 머리·기둥·빔·플래그에서 읽어야 한다.

판정 규칙
- 머리 모양: 흰 온음표 / 흰 2분음표 / 검은 머리(4분 이하)
- 검은 머리는 기둥에 걸린 **빔 개수**로 갈린다. 0개면 4분, 1개 8분, 2개 16분…
- 빔 없이 홀로 있는 음표는 플래그 글리프가 대신한다
- 오른쪽의 점(augmentation dot) 개수만큼 길이를 1.5배씩 늘린다
- 쉼표는 글리프 코드 자체가 길이를 담고 있다
"""

from __future__ import annotations

from dataclasses import dataclass
from fractions import Fraction

from structure import Glyph, Staff


@dataclass
class Stem:
    x: float
    y0: float
    y1: float
    up: bool  # 위로 뻗으면 True

    @property
    def far_y(self) -> float:
        """음표 머리 반대쪽 끝. 빔·플래그가 붙는 위치."""
        return self.y0 if self.up else self.y1


@dataclass
class Event:
    """오선보에서 읽어낸 소리 하나 (음표 또는 쉼표)."""

    x: float
    denom: int          # 4 = 4분음표, 8 = 8분음표 …
    dots: int
    is_rest: bool
    heads: list[Glyph]  # 화음이면 여러 개
    # 리듬 슬래시(/)로 그려진 박. 직전 화음을 그대로 다시 친다는 뜻이다.
    is_slash: bool = False
    # 기둥이 위로 뻗는지. 한 보표에 성부가 둘이면 위/아래로 갈라 적는다.
    stem_up: bool | None = None
    # 밴딩 목표음을 병합하면서 흡수한 길이. denom/dots로는 표현 못 하는
    # 임의의 길이(예: 1/4 + 1/8)도 정확히 더할 수 있도록 별도로 둔다.
    extra_beats: float = 0.0
    # 잇단음표 비율. 셋잇단음표면 2/3 — 적힌 음표 셋이 둘 길이만큼만 간다.
    ratio: Fraction = Fraction(1)
    # 검은 음표머리인데 기둥이 없다. 정상적인 음표라면 있을 수 없는 모양이라
    # 밴딩 목표음 같은 '표시용' 머리로 본다.
    stemless: bool = False

    @property
    def beats(self) -> float:
        """4분음표를 1로 봤을 때의 길이."""
        base = 4 / self.denom
        return base * (2 - 0.5 ** self.dots) * float(self.ratio) + self.extra_beats


# 밴딩 화살표 글리프 (SMuFL PUA). 목표음이 이 글리프와 x범위가 겹치면
# TAB에는 없는 '밴딩으로 도달한 음'이라고 본다.
#
# 병합은 여기서 하지 않는다. 순전히 x 순서로 '직전 이벤트에 흡수'하면,
# 다중 화살표(온음 밴딩을 반음 두 번으로 표기하는 경우)나 목표음이 다음
# 원음보다 TAB과 더 가까운 경우에 엉뚱한 원음에 붙는다. 대신 notes.py에서
# TAB과 먼저 매칭한 뒤, 매칭에 실패한 것만 병합한다 — 실패한 것만 건드리므로
# 이미 올바르게 맞은 원음을 망가뜨릴 위험이 없다.
BEND_ARROW = 0xEB78


def find_stem(head: Glyph, v_lines, tolerance: float = 1.2) -> Stem | None:
    """음표 머리에 붙은 기둥을 찾는다.

    기둥은 머리의 오른쪽 끝(위로 뻗음) 또는 왼쪽 끝(아래로 뻗음)에 닿는다.

    세로로는 넉넉히 본다. 리듬 슬래시(/)처럼 글리프의 기준점이 기둥이 닿는
    자리와 어긋나 있는 경우가 있어서, 딱 맞게 보면 기둥을 놓치고 전부
    4분음표로 읽힌다(실제로 Finale 악보에서 이 때문에 길이가 틀렸다).
    """
    cy = head.y  # 글리프 origin의 y가 머리의 세로 중심
    reach = 5.5
    best: Stem | None = None
    for x, y0, y1 in v_lines:
        if y1 - y0 < 3:
            continue
        if not (y0 - reach <= cy <= y1 + reach):
            continue
        # 방향은 기둥이 머리의 어느 쪽에 닿는지로 본다. 세로로 어디까지
        # 뻗었는지로 정해 보았지만 훨씬 나빴다 — 합성 샘플이 100% → 76.2%,
        # 악보 A가 98.9% → 95.8%가 됐다. 성부 나누기가 이 방향에 기대고
        # 있어서, 방향 규칙을 바꾸면 멀쩡하던 마디까지 갈라진다.
        if abs(x - head.x1) <= tolerance:
            up = True
        elif abs(x - head.x0) <= tolerance:
            up = False
        else:
            continue
        cand = Stem(x=x, y0=y0, y1=y1, up=up)
        if best is None or (cand.y1 - cand.y0) > (best.y1 - best.y0):
            best = cand
    return best


def count_beams(stem: Stem, beams) -> int:
    """기둥에 걸린 빔의 개수.

    빔은 기둥의 x를 가로로 포함하고, 기둥의 세로 범위와 겹친다.
    기울어진 빔은 경계 상자가 두꺼워지므로 상자 겹침으로 본다.
    """
    n = 0
    for bx0, by0, bx1, by1 in beams:
        if not (bx0 - 1.5 <= stem.x <= bx1 + 1.5):
            continue
        if by1 < stem.y0 - 1.5 or by0 > stem.y1 + 1.5:
            continue
        n += 1
    return n


def find_flag_denom(stem: Stem, glyphs: list[Glyph]) -> int | None:
    """빔이 없는 음표에 붙은 플래그로 길이를 읽는다."""
    for g in glyphs:
        flags = g.profile.flags if g.profile else {}
        if g.code not in flags:
            continue
        if abs(g.x0 - stem.x) > 4:
            continue
        if abs(g.y - stem.far_y) > 8:
            continue
        return flags[g.code]
    return None


def count_dots(heads: list[Glyph], glyphs: list[Glyph], staff_gap: float) -> int:
    """음표(또는 화음) 오른쪽에 붙은 점의 개수.

    화음은 음표마다 점이 하나씩 찍힌다. 그런데 줄 위의 음표는 점이 반 칸
    위로 밀려 그려지므로, 음표 하나씩 따로 세면 옆 음표의 점까지 자기 것으로
    세어 버린다(3화음인데 2점으로 읽히는 식). 그래서 화음 전체의 점을 모아
    음표 수로 나눈다.
    """
    if not heads:
        return 0
    right = max(h.x1 for h in heads)
    ys = [h.y for h in heads]
    hits = [
        g
        for g in glyphs
        if (g.profile and g.code in g.profile.dots)
        and 0 < g.x0 - right < staff_gap * 1.8
        and any(abs(g.y - y) <= staff_gap * 0.6 for y in ys)
    ]
    return round(len(hits) / len(heads)) if hits else 0


def extract_events(
    staff: Staff,
    glyphs: list[Glyph],
    v_lines,
    beams,
    x0: float | None = None,
    x1: float | None = None,
) -> list[Event]:
    """오선보 한 구간에서 음표·쉼표를 시간 순으로 뽑는다."""
    margin = staff.gap * 6  # 보표 밖으로 나간 덧줄 음표까지 포함
    lo = x0 if x0 is not None else staff.x0
    hi = x1 if x1 is not None else staff.x1

    def in_area(g: Glyph) -> bool:
        return lo < g.x0 < hi and staff.top - margin < g.y < staff.bottom + margin

    local = [g for g in glyphs if g.is_music and in_area(g)]

    # 빔은 기둥의 먼 쪽 끝에 붙는다. 음역이 넓은 화음이나 덧줄 음표는 기둥이
    # 길어서 빔이 오선에서 한참 떨어진다 — 실측 악보 C에서 오선 아래 26pt
    # (한 칸의 7배)였고, 음표 기준 여유(6칸)로는 걸러져 8분음표 넷이 통째로
    # 4분음표가 됐다. 그래서 빔은 훨씬 넉넉히 본다.
    # 넉넉해도 안전한 이유는 `count_beams`가 **기둥과 겹치는지**를 다시 보기
    # 때문이다. 이웃 보표의 빔은 이 보표의 기둥에 닿지 않는다.
    beam_margin = staff.gap * 12
    near_beams = [
        b for b in beams
        if staff.top - beam_margin < (b[1] + b[3]) / 2 < staff.bottom + beam_margin
    ]

    heads = sorted(
        (g for g in local if g.profile and g.code in g.profile.all_heads),
        key=lambda g: g.x0,
    )

    # 꾸밈음(grace note)은 작게 그린다. 장식일 뿐 박을 차지하지 않으므로
    # 그대로 세면 마디가 넘친다. 실측 악보 D에서 보통 머리는 1.27~1.47칸인데
    # 꾸밈음은 0.63칸으로 절반이라 크기로 뚜렷이 갈린다.
    # 기준은 **페이지 전체**의 중앙값으로 잡는다 — 한 마디 안에서 재면
    # 꾸밈음만 있는 마디에서 기준이 무너진다.
    page_heads = [
        g.x1 - g.x0
        for g in glyphs
        if g.profile and g.code in g.profile.all_heads and g.x1 > g.x0
    ]
    if page_heads:
        typical = sorted(page_heads)[len(page_heads) // 2]
        heads = [g for g in heads if g.x1 - g.x0 >= typical * 0.8]

    # 가로 위치가 거의 같은 머리는 한 화음.
    # 2도 간격(반 칸 차이)으로 붙은 음은 서로 겹치지 않도록 머리 하나 폭만큼
    # 옆으로 밀어 그리는 것이 조판 관례다. 그래서 '같은 x'가 아니라
    # '머리 폭 이내'로 묶어야 한 화음이 둘로 쪼개지지 않는다.
    #
    # 다만 폭 하나만큼 밀린 것이 늘 같은 화음은 아니다. 16분음표가 빽빽한
    # 마디에서는 **다음 박**도 딱 그만큼 떨어져 온다(실측 4.62pt로 동일).
    # 가로만 보면 갈리지 않으므로 세로를 함께 본다 — 밀려 그린 음은 정의상
    # 2도(반 칸) 떨어져 있다. 그만큼 벌어져 있지 않으면 다음 박이다.
    def displaced(head: Glyph, column: list[Glyph]) -> bool:
        return min(abs(head.y - c.y) for c in column) >= staff.gap * 0.25

    # 음이 아주 빽빽하면 머리끼리 가로로 겹쳐서(실측 간격 4.3pt < 머리 폭
    # 4.6pt) 자리로는 전혀 갈리지 않는다. 그럴 때 남는 단서가 기둥이다 —
    # 한 화음은 기둥 하나를 함께 쓰고, 밀려 그린 음표에는 기둥이 아예 없다.
    # 그래서 **자기 기둥을 따로 가진 머리**는 다음 박이다.
    # (악보 E에서 16분음표 16개가 8개로 뭉쳐 마디가 절반이 됐다.)
    stem_at: dict[int, float | None] = {}

    def stem_x(head: Glyph) -> float | None:
        if id(head) not in stem_at:
            s = find_stem(head, v_lines)
            stem_at[id(head)] = None if s is None else round(s.x, 1)
        return stem_at[id(head)]

    columns: list[list[Glyph]] = []
    for h in heads:
        width = max(h.x1 - h.x0, 1.0)
        if columns and h.x0 - columns[-1][0].x0 < width * 1.1:
            mine = stem_x(h)
            theirs = {stem_x(c) for c in columns[-1]} - {None}
            if mine is not None and theirs and mine not in theirs:
                columns.append([h])
                continue
            shifted = h.x0 - columns[-1][0].x0 > width * 0.4
            if not shifted or displaced(h, columns[-1]):
                columns[-1].append(h)
                continue
        columns.append([h])

    events: list[Event] = []
    for col in columns:
        head = col[0]
        prof = head.profile
        stem_up: bool | None = None
        stemless = False
        if head.code in prof.heads_whole:
            denom = 1
        elif head.code in prof.heads_half:
            denom = 2
        else:
            # 밀려 그려진 음표에는 기둥이 붙어 있지 않으므로 화음 전체에서 찾는다
            stem = next(
                (s for s in (find_stem(h, v_lines) for h in col) if s is not None),
                None,
            )
            if stem is None:
                denom = 4
                stemless = True
            else:
                stem_up = stem.up
                n = count_beams(stem, near_beams)
                if n > 0:
                    denom = 4 * (2 ** n)
                else:
                    denom = find_flag_denom(stem, local) or 4
        prof_slashes = prof.slashes if prof else frozenset()
        events.append(
            Event(
                x=head.x0,
                denom=denom,
                dots=count_dots(col, local, staff.gap),
                is_rest=False,
                heads=col,
                is_slash=all(h.code in prof_slashes for h in col),
                stem_up=stem_up,
                stemless=stemless,
            )
        )

    for g in local:
        rests = g.profile.rests if g.profile else {}
        if g.code in rests:
            events.append(
                Event(
                    x=g.x0,
                    denom=rests[g.code],
                    dots=count_dots([g], local, staff.gap),
                    is_rest=True,
                    heads=[],
                )
            )

    events.sort(key=lambda e: e.x)
    return events


# 잇단음표 표시는 어느 조판기든 보통 글자 숫자로 찍는다(Edwin, Times, Verdana…).
# 숫자 → (묶이는 음표 수, 길이 비율). 셋잇단음표면 셋이 둘 길이만큼 간다.
#
# 다섯·여섯잇단음표도 같은 방식이지만 손에 있는 악보에 없어서 넣지 않았다.
# 근거 없이 넓히면 가사나 코드 이름의 숫자에 걸려 멀쩡한 마디를 망친다.
TUPLETS = {"3": (3, Fraction(2, 3))}


def _tuplet_marks(
    glyphs: list[Glyph],
    staff: Staff,
    lo: float,
    hi: float,
    floor_y: float | None,
) -> list[tuple[float, int, Fraction]]:
    """마디 안에서 잇단음표 숫자를 찾는다.

    TAB의 프렛도 같은 글자라서 오선 언저리만 본다. `floor_y`(TAB 윗줄)를
    주면 그 아래는 보지 않는다 — 거기 있는 숫자는 프렛이다.

    세로 범위는 **오선 안쪽까지** 넉넉히 본다. 숫자는 빔 쪽에 붙는데,
    음이 덧줄 위로 높이 올라가면 빔도 오선 위로 올라가고 숫자는 그
    바로 아래, 즉 오선 한복판에 놓인다(악보 D의 16분 셋잇단 구간).
    바깥만 보면 이런 마디를 통째로 놓친다.

    넓혀도 되는 이유는 마지막에 안전장치가 있기 때문이다 — 줄여본 결과가
    마디 길이와 정확히 맞을 때만 받아들이므로, 엉뚱한 숫자를 집으면
    그냥 되돌아간다.
    """
    band = staff.gap * 4.5
    out: list[tuple[float, int, Fraction]] = []
    for g in glyphs:
        spec = TUPLETS.get(g.char)
        if spec is None or g.is_music or not (lo < g.x0 < hi):
            continue
        if floor_y is not None and g.y > floor_y - 1.0:
            continue
        if staff.top - band < g.y < staff.bottom + band:
            out.append((g.x0, spec[0], spec[1]))
    return out


def _pick_group(events: list[Event], mark_x: float, size: int, reach: float):
    """숫자가 가리키는 묶음을 고른다.

    숫자는 묶음 가운데에 놓이므로, 가운데 음표가 숫자에 가장 가까운
    연속 묶음을 고른다. 길이가 제각각인 묶음은 잇단음표로 보지 않는다 —
    같은 길이 음표가 나란한 것이 흔한 모양이고, 아니면 근거가 약하다.
    """
    best = None
    for i in range(len(events) - size + 1):
        run = events[i : i + size]
        if any(e.ratio != 1 or e.extra_beats for e in run):
            continue
        if len({(e.denom, e.dots) for e in run}) != 1:
            continue
        d = abs(run[size // 2].x - mark_x)
        if d < reach and (best is None or d < best[0]):
            best = (d, i)
    return None if best is None else best[1]


def apply_tuplets(
    events: list[Event],
    glyphs: list[Glyph],
    staff: Staff,
    lo: float,
    hi: float,
    floor_y: float | None = None,
    expected: float = 4.0,
) -> bool:
    """잇단음표 표시를 찾아 그 묶음의 길이를 줄인다.

    숫자 하나로 판단하기에는 근거가 약하다 — 가사나 코드 이름에 섞인 숫자도
    있고, 어느 음표까지 묶이는지는 표시만 봐서는 알 수 없다. 그래서 줄여본
    결과가 **마디 길이와 정확히 맞아떨어질 때만** 받아들인다. 아니면 되돌린다.
    """
    marks = _tuplet_marks(glyphs, staff, lo, hi, floor_y)
    if not marks or not events:
        return False

    touched: list[tuple[Event, Fraction]] = []
    for mark_x, size, ratio in sorted(marks):
        i = _pick_group(events, mark_x, size, staff.gap * 4)
        if i is None:
            continue
        for e in events[i : i + size]:
            touched.append((e, e.ratio))
            e.ratio = ratio

    if not touched:
        return False
    if abs(sum(e.beats for e in events) - expected) < 1e-6:
        return True
    for e, old in touched:
        e.ratio = old
    return False
