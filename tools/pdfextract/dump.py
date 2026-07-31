"""추출한 TAB을 마디별로 찍어 실제 악보와 대조하기 위한 도구.

    python dump.py <악보.pdf> [페이지번호(1부터)]
"""

from __future__ import annotations

import sys

import fitz

from structure import (
    detect_barlines,
    detect_staves,
    extract_frets,
    pair_tracks,
    read_page,
)


def bar_edges(track, barlines: list[float]) -> list[float]:
    """마디 경계. 시스템 시작점은 마디선이 아니라 보표 왼쪽 끝이다."""
    ref = track.tab or track.score
    edges = [ref.x0 - 1] + [b for b in barlines if b > ref.x0 + 2]
    return edges if len(edges) >= 2 else [ref.x0 - 1, ref.x1]


def group_chords(marks, tolerance: float = 2.5):
    """가로 위치가 거의 같은 표시들은 한 화음으로 묶는다."""
    groups: list[list] = []
    for m in marks:
        if groups and m.x - groups[-1][0].x < tolerance:
            groups[-1].append(m)
        else:
            groups.append([m])
    for g in groups:
        g.sort(key=lambda m: m.string)
    return groups


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        raise SystemExit(1)
    path = sys.argv[1]
    page_no = int(sys.argv[2]) - 1 if len(sys.argv) > 2 else 0

    doc = fitz.open(path)
    page = doc[page_no]
    h_seg, v_lines, _beams, glyphs = read_page(page)
    staves = detect_staves(h_seg, page.rect.width)
    tracks = pair_tracks(staves)

    print(f"{page_no + 1}페이지 — 보표 {len(staves)}, 악기 슬롯 {len(tracks)}\n")

    for ti, t in enumerate(tracks):
        bars = detect_barlines(t, v_lines)
        label = []
        if t.score:
            label.append(f"오선 y{t.score.top:.0f}")
        if t.tab:
            label.append(f"TAB y{t.tab.top:.0f}")
        print(f"── 슬롯 {ti}: {' + '.join(label)}  마디선 {len(bars)}개")

        if not t.tab:
            print("   (TAB 없음 — 보컬/멜로디 보표)\n")
            continue

        marks = extract_frets(t.tab, glyphs)
        if not marks:
            print("   (프렛 표시 없음 — 쉼표만 있는 구간)\n")
            continue

        edges = bar_edges(t, bars)
        for bi in range(len(edges) - 1):
            lo, hi = edges[bi], edges[bi + 1]
            inbar = [m for m in marks if lo < m.x < hi]
            if not inbar:
                print(f"   마디{bi + 1}: (빈 마디)")
                continue
            cells = [
                "+".join(f"{m.string}현{m.text}" for m in g)
                for g in group_chords(inbar)
            ]
            print(f"   마디{bi + 1}: {'  '.join(cells)}")
        print()


if __name__ == "__main__":
    main()
