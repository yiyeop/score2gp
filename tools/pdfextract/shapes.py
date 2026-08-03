"""그림으로 그린 악보에서 '어느 도형이 몇 박짜리 쉼표인지'를 알아낸다.

음표를 글자가 아니라 윤곽선으로 저장한 PDF가 있다. 음표머리는 크기가
규칙적이라 크기만으로 찾을 수 있지만(`structure._glyphs_from_shapes`),
쉼표는 그렇지 않다 — 4분쉼표(1.07×2.98)와 16분쉼표(1.28×2.71), 그리고
샾(0.99×2.78)이 죄다 비슷한 크기다. 크기와 위치만으로 가르려던 시도는
실패했다(넣은 마디가 43.7%만 4박이 됐다).

그래서 두 가지를 쓴다.

**윤곽 모양** — 같은 폰트에서 온 같은 기호는 곡선 제어점이 정확히 같다.
좌표를 오선 간격으로 나눠 정규화하고 해시하면, 무엇인지는 몰라도
'같은 기호끼리' 묶을 수는 있다.

**마디 길이** — 어느 묶음이 무슨 쉼표인지는 악보 자신이 알려준다.
4/4 악보의 마디 합은 4박이어야 하므로, 지금 모자란 박이 곧 정답이다.
묶음마다 길이를 하나씩 넣어 보고 맞아떨어지는 마디가 가장 많이
늘어나는 조합을 고른다. 사람이 기호를 지목해 줄 필요가 없고, 폰트가
달라져도 같은 방식으로 다시 배운다.
"""

from __future__ import annotations

import hashlib
from fractions import Fraction

# 후보로 볼 크기(오선 간격 기준). 음표머리·점보다 크고, 음자리표나
# 박자표보다 작다. 빔은 가로로 길어(5.5칸) 여기서 빠진다.
_MIN_W, _MAX_W = 0.5, 1.6
_MIN_H, _MAX_H = 0.4, 3.6

# 이 정도는 맞춰 줘야 받아들인다. 우연히 맞는 마디 한둘로 길이를
# 정하면 멀쩡한 마디를 망가뜨린다.
_MIN_GAIN = 3

REST, FLAG = "R", "F"

# 쉼표는 지금 아예 안 세고 있으므로 값이 곧 길이다.
_REST_DURATIONS = (
    (1, Fraction(4)),
    (2, Fraction(2)),
    (4, Fraction(1)),
    (8, Fraction(1, 2)),
    (16, Fraction(1, 4)),
    (32, Fraction(1, 8)),
)

# 플래그는 다르다. 플래그가 붙은 음표는 기둥만 보고 이미 4분음표로 읽고
# 있으므로, 값이 아니라 **줄어드는 양**이 우리가 찾는 수다.
_FLAG_DURATIONS = (
    (8, Fraction(-1, 2)),
    (16, Fraction(-3, 4)),
    (32, Fraction(-7, 8)),
)

_DURATIONS = {REST: _REST_DURATIONS, FLAG: _FLAG_DURATIONS}


def signature(drawing, gap: float, pos: float) -> str:
    """도형의 윤곽을 문자열 하나로 줄인다.

    좌표는 경계 상자 왼쪽 위를 원점으로, 오선 간격을 1로 정규화한다.
    같은 크기로 찍힌 같은 기호는 이 값이 정확히 같다.

    보표 안에서의 세로 자리도 함께 넣는다. 온쉼표와 2분쉼표는 똑같은
    사각형이고 매달리느냐 얹히느냐만 다르기 때문이다.
    """
    r = drawing["rect"]
    pts: list[tuple] = []
    for item in drawing["items"]:
        for p in item[1:]:
            if hasattr(p, "x"):
                pts.append((round((p.x - r.x0) / gap, 2), round((p.y - r.y0) / gap, 2)))
            elif hasattr(p, "x0"):
                pts.append((
                    round((p.x0 - r.x0) / gap, 2), round((p.y0 - r.y0) / gap, 2),
                    round((p.x1 - r.x0) / gap, 2), round((p.y1 - r.y0) / gap, 2),
                ))
    kinds = "".join(sorted({i[0] for i in drawing["items"]}))
    digest = hashlib.md5(repr((len(drawing["items"]), pts)).encode()).hexdigest()[:10]
    return f"{kinds}:{digest}@{round(pos * 4) / 4:g}"


def _stem_end(r, v_lines, gap: float) -> str | None:
    """도형이 기둥 끝에 매달려 있는지. 매달렸으면 기둥이 뻗는 방향.

    기둥은 도형의 **왼쪽 끝**에 닿아 있어야 한다. 플래그는 기둥에서
    시작해 오른쪽으로 휘어 나가기 때문이다. 상자 어디든 허용하면
    바로 오른쪽 음표의 기둥을 제 것으로 착각한다 — 실제로 16분쉼표가
    옆 음표의 기둥에 걸려 플래그로 분류되는 바람에, 같은 쉼표인데
    어떤 건 읽히고 어떤 건 통째로 사라졌다.
    """
    for x, y0, y1 in v_lines:
        if y1 - y0 < gap * 2 or abs(x - r.x0) > 1.5:
            continue
        if abs(y0 - r.y0) <= gap * 0.8:
            return "up"      # 위로 뻗은 기둥 꼭대기에서 아래로 늘어진다
        if abs(y1 - r.y1) <= gap * 0.8:
            return "down"
    return None


def candidates(page, staves, gap: float, heads, v_lines) -> list[tuple[str, str, object]]:
    """쉼표나 플래그일 수 있는 도형을 (종류, 서명, 상자)로 돌려준다.

    **플래그**는 기둥 끝에 매달려 있다는 것으로 알아본다. 몇 분음표인지는
    갈고리 수로 정해지는데 8분(1.05×3.28)과 16분(1.11×3.25)은 크기가
    거의 같아서 크기로는 못 가른다 — 윤곽으로 묶고 길이는 나중에 배운다.

    **쉼표**는 반대로 아무것에도 붙어 있지 않다. 세 가지로 거른다.

    - **크기** — 음표머리·점보다 크고 음자리표보다 작아야 한다.
    - **자리** — 쉼표는 오선 안에 그린다. 오선을 벗어난 표시류는 뺀다.
    - **혼자 있을 것** — 쉼표는 자기 박을 차지하므로 같은 가로 위치에
      음표머리가 없다. 임시표(샾·내림표)는 늘 음표 바로 왼쪽에 붙는데,
      이게 크기로는 4분쉼표와 구별되지 않아서 이 조건이 꼭 필요하다.
    """
    scores = [s for s in staves if s.kind == "score"]
    if not scores or gap <= 0:
        return []

    # 이미 음표머리·점으로 읽은 도형은 후보에서 뺀다. 음표머리는 기둥에
    # 닿아 있어서 그냥 두면 죄다 플래그 후보가 되고, 그 수가 다른 후보를
    # 압도해 학습이 느려진다.
    taken = {(round(g.x0, 1), round(g.y0, 1)) for g in heads}

    out: list[tuple[str, str, object]] = []
    for d in page.get_drawings():
        if d["type"] not in ("f", "fs"):
            continue
        r = d["rect"]
        if r.width <= 0 or r.height <= 0:
            continue
        if (round(r.x0, 1), round(r.y0, 1)) in taken:
            continue
        w, h = r.width / gap, r.height / gap
        if not (_MIN_W <= w <= _MAX_W and _MIN_H <= h <= _MAX_H):
            continue

        cx, cy = (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2
        st = min(scores, key=lambda s: min(abs(cy - s.top), abs(cy - s.bottom)))

        side = _stem_end(r, v_lines, st.gap)
        if side is not None:
            out.append((FLAG, FLAG + signature(d, gap, 0) + side, r))
            continue

        pos = (cy - st.top) / st.gap
        if not (-0.6 <= pos <= 4.6):
            continue
        lo, hi = st.top - st.gap * 6, st.bottom + st.gap * 6
        if any(
            abs((g.x0 + g.x1) / 2 - cx) <= st.gap * 1.2 and lo <= g.y <= hi
            for g in heads
        ):
            continue
        out.append((REST, REST + signature(d, gap, pos), r))
    return out


def fit(rows: list[tuple[Fraction, dict[str, int]]]) -> dict[str, int]:
    """마디마다 모자란 박을 보고 묶음별 길이를 정한다.

    `rows`는 마디마다 (모자란 박, {서명: 개수}). 한 번에 하나씩,
    맞아떨어지는 마디를 가장 많이 늘리는 (묶음, 길이)를 고른다.
    이미 맞는 마디를 깨뜨리는 조합은 점수가 떨어져 저절로 밀려난다.
    """
    if not rows:
        return {}

    chosen: dict[str, Fraction] = {}

    def score(trial: dict[str, Fraction]) -> int:
        n = 0
        for need, counts in rows:
            got = sum(trial.get(s, 0) * k for s, k in counts.items())
            if got == need:
                n += 1
        return n

    base = score(chosen)
    seen = {s for _need, counts in rows for s in counts}

    while True:
        best = None
        for sig in sorted(seen - set(chosen)):
            for _denom, dur in _DURATIONS[sig[0]]:
                trial = dict(chosen)
                trial[sig] = dur
                got = score(trial)
                if best is None or got > best[0]:
                    best = (got, sig, dur)
        if best is None or best[0] - base < _MIN_GAIN:
            break
        base, sig, dur = best
        chosen[sig] = dur

    # 길이를 분모(4분음표 = 4)로 돌려준다. 쉼표·플래그 글리프 코드가 그 형태다.
    return {
        sig: next(d for d, v in _DURATIONS[sig[0]] if v == dur)
        for sig, dur in chosen.items()
    }
