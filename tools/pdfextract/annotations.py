"""악보에 글로 적힌 주법·톤 지시를 읽어 음표에 붙인다.

`sl.`(슬라이드) `P.M.`(팜뮤트) `letring` `H`(해머온) 같은 주법과
`Distortion` `Delay` 같은 톤 지시는 모두 일반 텍스트로 그려져 있다.
글리프만 봐서는 알 수 없고, 위치로 어느 음표에 걸리는지 판단해야 한다.

P.M.과 let ring은 점선 괄호로 **구간**을 나타낸다. 지금은 시작 위치만 보고
그 자리의 음표에 표시하며, 구간 끝까지 이어 붙이는 것은 아직 하지 않는다.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from structure import Glyph, Staff


@dataclass
class Annotation:
    """악보 위 텍스트 하나."""

    x: float
    y: float
    text: str

    @property
    def kind(self) -> str:
        return classify(self.text)


# 톤 지시 — GP의 악기(음색) 변경으로 옮길 수 있는 것
TONE_PROGRAMS = {
    "distortion": 30,
    "dist": 30,
    "overdrive": 29,
    "crunch": 29,
    "clean": 27,
    "acoustic": 25,
}

# 톤·이펙터 지시. GP에 직접 대응하는 항목이 없어도 글로는 남긴다.
TONE_WORDS = set(TONE_PROGRAMS) | {
    "delay",
    "chorus",
    "reverb",
    "phaser",
    "flanger",
    "wah",
    "tremolo",
}

_TECHNIQUE_PATTERNS = (
    ("slide", re.compile(r"^sl\.?$", re.I)),
    ("palm_mute", re.compile(r"^p\.?m\.?$", re.I)),
    ("let_ring", re.compile(r"^let\s*ring$", re.I)),
    # H는 해머온, P는 풀오프. GP는 둘을 같은 플래그로 다룬다.
    # 악보마다 대소문자가 섞여 쓰이므로 둘 다 받는다.
    ("hammer", re.compile(r"^[hp]$", re.I)),
    ("bend", re.compile(r"^(full|\d+/\d+)$", re.I)),
)

# 코드 이름 (D5, Fadd11, C#m7 …)
_CHORD_RE = re.compile(r"^[A-G][#b]?(m|maj|min|dim|aug|sus|add)?\d*(/[A-G][#b]?)?$")


def classify(text: str) -> str:
    t = text.strip()
    low = t.lower()
    if low in TONE_WORDS:
        return "tone"
    for kind, pattern in _TECHNIQUE_PATTERNS:
        if pattern.match(t):
            return kind
    if _CHORD_RE.match(t):
        return "chord"
    return "other"


# 점선 괄호로 '구간'을 나타내는 주법. 시작 음표 하나가 아니라
# 괄호가 끝나는 곳까지의 모든 음표에 걸린다.
RANGE_KINDS = frozenset({"palm_mute", "let_ring"})


def collect(
    texts: list[tuple[float, float, str]],
    zone: tuple[float, float],
) -> list[Annotation]:
    """세로 구간(zone) 안에 있는 주석을 모은다.

    zone은 이 악기의 몫으로 정해진 세로 범위다. 넉넉히 잡으면 아래 시스템의
    지시까지 끌어오므로(실제로 Rhythm 2마디에 다음 시스템의 Distortion이
    붙는 문제가 있었다) 이웃 악기와의 중간선으로 잘라서 넘겨받는다.
    """
    y0, y1 = zone
    out = []
    for x, y, t in texts:
        if not (y0 <= y <= y1):
            continue
        kind = classify(t)
        if kind == "other":
            continue
        out.append(Annotation(x=x, y=y, text=t.strip()))
    return sorted(out, key=lambda a: a.x)


def range_end(a: Annotation, h_segments, fallback: float) -> float:
    """P.M.·let ring 점선 괄호가 어디서 끝나는지 찾는다.

    괄호는 글자 바로 위에 가로선으로 그려진다. 같은 줄에 여러 개가 있어도
    사이가 뚜렷이 벌어져 있어서, 글자 오른쪽에서 가장 먼저 시작하는 선을
    고르면 그 구간이 된다.
    """
    best = None
    for y, segs in h_segments.items():
        if abs(y - a.y) > 3.5:
            continue
        for x0, x1 in segs:
            if x0 >= a.x - 2 and (best is None or x0 < best[0]):
                best = (x0, x1)
    return best[1] if best else fallback
