"""페이지·시스템으로 흩어진 조각을 곡 하나로 조립한다.

악보는 한 곡을 여러 시스템에 잘라 싣는다. 같은 악기가 페이지마다 다시
나타나므로, 시스템을 나누고 각 시스템의 몇 번째 자리가 어느 악기인지
맞춰야 곡 전체가 이어진다.
"""

from __future__ import annotations

import collections
import re
from dataclasses import dataclass, field
from fractions import Fraction

import fitz

from notes import Bar, Beat, carry_slash_chords, extract_bars
from shapes import candidates, fit
from tuning import parse_tuning
from structure import (
    Glyph,
    TrackStaff,
    detect_barlines,
    detect_staves,
    merge_doubles,
    pair_tracks,
    read_page,
)


@dataclass
class Part:
    """한 악기의 곡 전체."""

    index: int
    name: str | None
    has_tab: bool
    bars: list[Bar] = field(default_factory=list)
    # TAB 줄 수 = 현 수. 4줄이면 베이스다.
    strings: int = 6


@dataclass
class Song:
    title: str | None
    tempo: int | None
    parts: list[Part]
    # 1번 현부터의 MIDI 음높이. 표기를 못 읽으면 None(표준 튜닝).
    tuning: list[int] | None = None

    @property
    def bar_count(self) -> int:
        return max((len(p.bars) for p in self.parts), default=0)


def _signature(track: TrackStaff, v_lines) -> tuple[int, ...]:
    """마디선 위치를 시스템 식별용 서명으로 만든다.

    시스템 맨 앞의 세로줄(시작선·괄호)은 마디선이 아니므로 뺀다.
    """
    ref = track.score or track.tab
    return tuple(
        round(x / 2) for x in detect_barlines(track, v_lines) if x > ref.x0 + 5
    )


def _kind(track: TrackStaff) -> str:
    return ("S" if track.score else "") + ("T" if track.tab else "")


def _period(kinds: list[str]) -> int:
    """보표 구성 패턴이 몇 개마다 반복되는지.

    한 시스템은 늘 같은 악기 구성을 갖는다. 예를 들어 보컬+기타1+기타2면
    [S, ST, ST]가 반복된다. 이 주기가 곧 시스템당 악기 수다.
    """
    n = len(kinds)
    for p in range(1, n + 1):
        if n % p:
            continue
        if all(kinds[i] == kinds[i % p] for i in range(n)):
            return p
    return n


def _join_touching(v_lines) -> list[tuple[float, float, float]]:
    """같은 x에서 끝과 끝이 맞닿은 세로선 토막을 하나로 잇는다.

    시스템 괄호를 한 줄로 긋지 않고 보표 사이마다 토막 내어 그리는
    조판기(MuseScore)가 있다. 토막만 보면 파트 하나 높이밖에 안 돼서
    시스템이 파트별로 쪼개진다.
    """
    by_x: dict[float, list[tuple[float, float]]] = {}
    for x, y0, y1 in v_lines:
        by_x.setdefault(round(x, 1), []).append((y0, y1))

    joined: list[tuple[float, float, float]] = []
    for x, segs in by_x.items():
        segs.sort()
        cur0, cur1 = segs[0]
        for y0, y1 in segs[1:]:
            if y0 <= cur1 + 1.0:  # 맞닿았거나 살짝 겹친다
                cur1 = max(cur1, y1)
            else:
                joined.append((x, cur0, cur1))
                cur0, cur1 = y0, y1
        joined.append((x, cur0, cur1))
    return joined


def split_systems(tracks: list[TrackStaff], v_lines) -> list[list[TrackStaff]]:
    """페이지의 보표들을 시스템 단위로 묶는다.

    악보 맨 왼쪽에는 한 시스템의 보표들을 위아래로 묶는 **시스템 괄호**가
    세로줄로 그려진다. 이게 가장 확실한 단서다. 다만 토막 내어 그리는
    조판기가 있어서, 맞닿은 토막은 먼저 이어 붙인다.

    세로 간격은 못 쓴다 — 시스템 안쪽 간격이 시스템 사이보다 넓은 경우가
    실제로 있다. 마디선 위치도 못 쓴다 — 반복이 많은 곡은 여러 시스템의
    마디선이 거의 같은 자리에 온다. 악기 구성의 주기도 못 쓴다 — 쉬는 악기의
    보표를 아예 빼고 찍는 악보가 있어 시스템마다 보표 수가 달라진다.
    """
    if not tracks:
        return []

    # 첫 시스템은 악기 이름을 넣느라 보표가 오른쪽으로 밀려 있고, 괄호도 그만큼
    # 따라 밀린다. 그래서 페이지 전체의 최소 x 하나로 찾으면 첫 시스템 괄호를
    # 놓친다. 보표가 시작하는 x들을 모두 기준으로 삼아야 한다.
    edges = {round((t.score or t.tab).x0, 1) for t in tracks}
    spans = sorted(
        (
            (y1 - y0, y0, y1)
            for x, y0, y1 in _join_touching(v_lines)
            if (y1 - y0) > 20 and any(e - 12 <= x <= e + 8 for e in edges)
        ),
        reverse=True,
    )

    # 긴 것부터 집되, 이미 잡은 구간과 겹치면 버린다.
    # 기타 파트만 따로 묶는 안쪽 괄호가 함께 그려져 있어서다.
    chosen: list[tuple[float, float]] = []
    for _len, y0, y1 in spans:
        if all(y1 <= c0 or y0 >= c1 for c0, c1 in chosen):
            chosen.append((y0, y1))
    chosen.sort()

    if not chosen:
        return [tracks]

    systems: list[list[TrackStaff]] = []
    leftover: list[TrackStaff] = []
    for t in tracks:
        for i, (y0, y1) in enumerate(chosen):
            if y0 - 3 <= t.top and t.bottom <= y1 + 3:
                while len(systems) <= i:
                    systems.append([])
                systems[i].append(t)
                break
        else:
            # 괄호에 안 묶인 보표는 혼자짜리 시스템이다 (보컬만 나오는 줄 등)
            leftover.append(t)

    result = [s for s in systems if s] + [[t] for t in leftover]
    result.sort(key=lambda s: s[0].top)
    return result


def annotation_zones(
    tracks: list[TrackStaff],
) -> dict[int, tuple[float, float]]:
    """악기마다 '이 지시는 내 것' 이라고 볼 세로 범위를 정한다.

    주법·톤 지시는 보표 위에 적히는데, 넉넉히 잡으면 아래 시스템의 지시까지
    끌어온다(실제로 Rhythm 2마디에 다음 시스템의 Distortion이 붙었다).
    이웃 악기와의 중간선으로 잘라 서로 침범하지 않게 한다.
    """
    ordered = sorted(tracks, key=lambda t: t.top)
    zones: dict[int, tuple[float, float]] = {}
    for i, t in enumerate(ordered):
        above = ordered[i - 1].bottom if i > 0 else t.top - 40
        below = ordered[i + 1].top if i + 1 < len(ordered) else t.bottom + 20
        zones[id(t)] = ((above + t.top) / 2, (t.bottom + below) / 2)
    return zones


def consensus_barlines(
    system: list[TrackStaff], v_lines, tolerance: float = 2.5
) -> list[float]:
    """시스템 전체가 동의하는 마디선 위치.

    같은 시스템의 악기들은 마디선이 같은 x에 있다. 반면 음표 기둥은 한 보표에만
    나타나므로, 여러 보표에서 함께 발견된 위치만 남기면 기둥을 걸러낼 수 있다.

    투표는 **겹세로줄을 합치기 전** 목록으로 한다. 합치고 나면 왼쪽 선만
    남아서, 마디선 왼쪽에 기둥이 붙은 보표는 진짜 마디선을 잃고 이웃과
    어긋나 버린다. 합치는 건 표를 다 센 뒤에 한다.
    """
    if not system:
        return []

    votes: list[tuple[float, int]] = []
    for i, track in enumerate(system):
        for x in detect_barlines(track, v_lines, merge=False):
            for j, (cx, _n) in enumerate(votes):
                if abs(cx - x) <= tolerance:
                    votes[j] = (cx, _n + 1)
                    break
            else:
                votes.append((x, 1))

    need = 2 if len(system) > 1 else 1
    found = merge_doubles([x for x, n in votes if n >= need])

    # 보표가 하나뿐인 시스템(보컬만 나오는 줄 등)은 서로 대조할 상대가 없어서
    # 음표 기둥이 마디선으로 섞여 들어온다. 마디 폭이 들쭉날쭉해지므로,
    # 다른 마디에 비해 터무니없이 좁은 구간을 만드는 선을 걷어낸다.
    if len(system) > 1 or len(found) < 3:
        return found

    while len(found) >= 3:
        widths = [found[i + 1] - found[i] for i in range(len(found) - 1)]
        typical = sorted(widths)[len(widths) // 2]
        narrowest = min(range(len(widths)), key=lambda i: widths[i])
        if widths[narrowest] >= typical * 0.45:
            break
        # 좁은 구간의 양 끝 중 이웃과 더 가까운 쪽을 지운다
        left, right = narrowest, narrowest + 1
        drop = right if right < len(found) - 1 else left
        if left == 0:
            drop = right
        found.pop(drop)
    return found


TEMPO_RE = re.compile(r"=\s*(\d{2,3})")


def _page_texts(glyphs: list[Glyph]) -> list[tuple[float, float, str]]:
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


def read_metadata(page: fitz.Page, glyphs: list[Glyph]) -> tuple[str | None, int | None]:
    """첫 페이지에서 제목과 템포를 읽는다."""
    texts = _page_texts(glyphs)
    title = None
    best_size = 0.0
    for g in glyphs:
        if g.is_music or not g.char.strip():
            continue
        if g.y > page.rect.height * 0.25:
            continue
        size = g.y1 - g.y0
        if size > best_size:
            best_size = size
            title = None  # 아래에서 같은 줄 전체를 다시 잇는다
            for x, y, t in texts:
                if abs(y - g.y) < 1.5:
                    title = t if title is None else title
    tempo = None
    for _x, _y, t in texts:
        m = TEMPO_RE.search(t)
        if m:
            tempo = int(m.group(1))
            break
    return title, tempo


def _track_names(
    glyphs: list[Glyph], systems: list[list[TrackStaff]]
) -> dict[int, str]:
    """보표 왼쪽에 적힌 악기 이름을 보표 위치별로 읽는다."""
    texts = _page_texts(glyphs)
    names: dict[int, str] = {}
    for system in systems:
        for t in system:
            edge = (t.score or t.tab).x0
            for x, y, txt in texts:
                if x >= edge - 2 or not (t.top - 8 <= y <= t.bottom + 8):
                    continue
                if len(txt) >= 2 and not txt.replace(".", "").isdigit():
                    names.setdefault(round(t.top), txt)
                    break
    return names


def _resting_bar(index: int) -> Bar:
    """온쉼표 한 마디. 보표를 뺀 자리를 대신 채운다."""
    return Bar(
        index=index,
        beats=[Beat(x=0.0, denom=1, dots=0, is_rest=True)],
        x0=0.0,
        x1=0.0,
    )


def _shape_candidates(page, staves, glyphs, v_lines) -> list[tuple[str, str, object]]:
    """그림으로 그린 악보에서 쉼표일 수 있는 도형을 모은다.

    글자로 된 음악 폰트가 있는 악보에는 해당 없다 — 그런 악보의 쉼표는
    글리프 코드로 이미 읽고 있다.
    """
    made = [g for g in glyphs if g.font == "shapes"]
    if not made or not staves:
        return []
    gaps = sorted(s.gap for s in staves)
    return candidates(page, staves, gaps[len(gaps) // 2], made, v_lines)


def _build(
    doc, rest_shapes: dict[str, int] | None, observe: bool
) -> tuple[Song, list[tuple[Fraction, collections.Counter]]]:
    title = tempo = None
    tuning = None
    parts: dict[tuple[str, int], Part] = {}
    rows: list[tuple[Fraction, collections.Counter]] = []

    for pno in range(len(doc)):
        page = doc[pno]
        h_seg, v_lines, beams, glyphs = read_page(page, rest_shapes)
        staves = detect_staves(h_seg, page.rect.width)
        tracks = pair_tracks(staves)
        systems = split_systems(tracks, v_lines)
        shape_cands = _shape_candidates(page, staves, glyphs, v_lines) if observe else []

        if pno == 0:
            title, tempo = read_metadata(page, glyphs)
            names = _track_names(glyphs, systems)
            tuning = parse_tuning(glyphs)

        zones = annotation_zones(tracks)

        for system in systems:
            shared = consensus_barlines(system, v_lines)
            # 쉬는 악기의 보표를 빼고 찍는 악보가 있어서 시스템마다 보표 수가
            # 다르다. 그래서 '몇 번째 보표'가 아니라 'TAB 있는 것 중 몇 번째'로
            # 세어야 기타 파트가 시스템을 넘어 어긋나지 않는다.
            tab_slot = melody_slot = 0
            played: set[tuple[str, int]] = set()
            width = 0
            for track in system:
                if track.tab:
                    key = ("tab", tab_slot)
                    tab_slot += 1
                else:
                    key = ("melody", melody_slot)
                    melody_slot += 1
                part = parts.get(key)
                if part is None:
                    part = Part(index=len(parts), name=None, has_tab=bool(track.tab))
                    parts[key] = part
                if part.name is None and pno == 0:
                    part.name = names.get(round(track.top))
                if track.tab:
                    part.strings = len(track.tab.lines)
                bars, _orphans = extract_bars(
                    track,
                    glyphs,
                    v_lines,
                    beams,
                    barlines=shared,
                    h_segments=h_seg,
                    zone=zones.get(id(track)),
                )
                part.bars.extend(bars)
                played.add(key)
                width = max(width, len(bars))
                if shape_cands and track.score:
                    rows += _deficits(bars, track.score, shape_cands)

            # 쉬는 악기는 보표를 아예 빼고 찍는다. 그 마디를 그냥 건너뛰면
            # 그 악기의 악보가 곡보다 짧아지고, 다시 나오는 자리부터 전부
            # 앞으로 밀린다 — 같이 연주하면 박이 맞지 않는다.
            # 그래서 빠진 만큼 온쉼표 마디를 채워 자리를 지킨다.
            for key, part in parts.items():
                if key in played:
                    continue
                for _ in range(width):
                    part.bars.append(_resting_bar(len(part.bars)))

    # 리듬 슬래시는 직전 화음을 반복하라는 표기다. 시스템·페이지를 넘어
    # 이어지므로 곡 전체를 조립한 뒤에 채운다.
    for part in parts.values():
        carry_slash_chords(part.bars)

    ordered = [parts[k] for k in sorted(parts, key=lambda k: (k[0] != "tab", k[1]))]
    return Song(title=title, tempo=tempo, parts=ordered, tuning=tuning), rows


# 박자표는 아직 읽지 않아서 4/4로 본다. 쉼표를 배울 때도 같은 가정을 쓴다.
BAR_BEATS = Fraction(4)


def _deficits(bars, score, shape_cands) -> list[tuple[Fraction, collections.Counter]]:
    """마디마다 '몇 박이 모자란지'와 '그 안에 있는 도형'을 짝지어 둔다."""
    out = []
    lo, hi = score.top - score.gap * 0.7, score.bottom + score.gap * 0.7
    for bar in bars:
        counts = collections.Counter(
            sig for _kind, sig, r in shape_cands
            if bar.x0 < (r.x0 + r.x1) / 2 < bar.x1 and lo < (r.y0 + r.y1) / 2 < hi
        )
        if not counts:
            continue
        have = sum(
            (Fraction(b.quarters).limit_denominator(64) for b in bar.beats),
            Fraction(0),
        )
        out.append((BAR_BEATS - have, counts))
    return out


def assemble(path: str) -> Song:
    doc = fitz.open(path)
    song, rows = _build(doc, None, observe=True)

    # 그림으로 그린 악보는 쉼표를 크기로 가릴 수 없다. 모자란 박을 보고
    # 어느 윤곽이 몇 분쉼표인지 배운 다음, 그걸 넣어 한 번 더 조립한다.
    # 배울 게 없으면(글자로 된 악보) 첫 결과를 그대로 쓴다.
    rest_shapes = fit(rows) if rows else {}
    if rest_shapes:
        song, _ = _build(doc, rest_shapes, observe=False)
    return song
