"""페이지·시스템으로 흩어진 조각을 곡 하나로 조립한다.

악보는 한 곡을 여러 시스템에 잘라 싣는다. 같은 악기가 페이지마다 다시
나타나므로, 시스템을 나누고 각 시스템의 몇 번째 자리가 어느 악기인지
맞춰야 곡 전체가 이어진다.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

import fitz

from notes import Bar, carry_slash_chords, extract_bars
from tuning import parse_tuning
from structure import (
    Glyph,
    TrackStaff,
    detect_barlines,
    detect_staves,
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


def split_systems(tracks: list[TrackStaff], v_lines) -> list[list[TrackStaff]]:
    """페이지의 보표들을 시스템 단위로 묶는다.

    악보 맨 왼쪽에는 한 시스템의 보표들을 위아래로 묶는 **시스템 괄호**가
    세로줄로 그려진다. 이게 가장 확실한 단서다.

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
            for x, y0, y1 in v_lines
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
    """
    if not system:
        return []

    votes: list[tuple[float, int]] = []
    for i, track in enumerate(system):
        for x in detect_barlines(track, v_lines):
            for j, (cx, _n) in enumerate(votes):
                if abs(cx - x) <= tolerance:
                    votes[j] = (cx, _n + 1)
                    break
            else:
                votes.append((x, 1))

    need = 2 if len(system) > 1 else 1
    return sorted(x for x, n in votes if n >= need)


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


def assemble(path: str) -> Song:
    doc = fitz.open(path)
    title = tempo = None
    tuning = None
    parts: dict[tuple[str, int], Part] = {}

    for pno in range(len(doc)):
        page = doc[pno]
        h_seg, v_lines, beams, glyphs = read_page(page)
        tracks = pair_tracks(detect_staves(h_seg, page.rect.width))
        systems = split_systems(tracks, v_lines)

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

    # 리듬 슬래시는 직전 화음을 반복하라는 표기다. 시스템·페이지를 넘어
    # 이어지므로 곡 전체를 조립한 뒤에 채운다.
    for part in parts.values():
        carry_slash_chords(part.bars)

    ordered = [parts[k] for k in sorted(parts, key=lambda k: (k[0] != "tab", k[1]))]
    return Song(title=title, tempo=tempo, parts=ordered, tuning=tuning)
