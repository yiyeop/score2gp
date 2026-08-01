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
    # 밴딩 목표음을 병합하면서 흡수한 길이. denom/dots로는 표현 못 하는
    # 임의의 길이(예: 1/4 + 1/8)도 정확히 더할 수 있도록 별도로 둔다.
    extra_beats: float = 0.0

    @property
    def beats(self) -> float:
        """4분음표를 1로 봤을 때의 길이."""
        base = 4 / self.denom
        return base * (2 - 0.5 ** self.dots) + self.extra_beats


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
    """
    cy = head.y  # 글리프 origin의 y가 머리의 세로 중심
    best: Stem | None = None
    for x, y0, y1 in v_lines:
        if y1 - y0 < 3:
            continue
        if not (y0 - 2 <= cy <= y1 + 2):
            continue
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
    near_beams = [
        b for b in beams
        if staff.top - margin < (b[1] + b[3]) / 2 < staff.bottom + margin
    ]

    heads = sorted(
        (g for g in local if g.profile and g.code in g.profile.all_heads),
        key=lambda g: g.x0,
    )

    # 가로 위치가 거의 같은 머리는 한 화음.
    # 2도 간격(반 칸 차이)으로 붙은 음은 서로 겹치지 않도록 머리 하나 폭만큼
    # 옆으로 밀어 그리는 것이 조판 관례다. 그래서 '같은 x'가 아니라
    # '머리 폭 이내'로 묶어야 한 화음이 둘로 쪼개지지 않는다.
    columns: list[list[Glyph]] = []
    for h in heads:
        width = max(h.x1 - h.x0, 1.0)
        if columns and h.x0 - columns[-1][0].x0 < width * 1.1:
            columns[-1].append(h)
        else:
            columns.append([h])

    events: list[Event] = []
    for col in columns:
        head = col[0]
        prof = head.profile
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
            else:
                n = count_beams(stem, near_beams)
                if n > 0:
                    denom = 4 * (2 ** n)
                else:
                    denom = find_flag_denom(stem, local) or 4
        events.append(
            Event(
                x=head.x0,
                denom=denom,
                dots=count_dots(col, local, staff.gap),
                is_rest=False,
                heads=col,
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
