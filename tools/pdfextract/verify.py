"""마디별 음길이 합으로 리듬 판정을 자동 검증한다.

리듬을 제대로 읽었다면 4/4 마디의 길이 합은 정확히 4박이 된다.
악보를 눈으로 대조하지 않고도 판정 오류를 잡아낼 수 있어,
휴리스틱을 고칠 때마다 회귀를 확인하는 용도로 쓴다.

    python verify.py <악보.pdf> [기대박자(기본 4)]
"""

from __future__ import annotations

import sys
from fractions import Fraction

import fitz

from dump import bar_edges
from rhythm import extract_events
from structure import detect_barlines, detect_staves, pair_tracks, read_page


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        raise SystemExit(1)
    path = sys.argv[1]
    expected = Fraction(sys.argv[2]) if len(sys.argv) > 2 else Fraction(4)

    doc = fitz.open(path)
    total = ok = 0
    problems: list[str] = []

    for pno in range(len(doc)):
        page = doc[pno]
        h_seg, v_lines, beams, glyphs = read_page(page)
        tracks = pair_tracks(detect_staves(h_seg, page.rect.width))

        for ti, t in enumerate(tracks):
            if not t.score:
                continue
            edges = bar_edges(t, detect_barlines(t, v_lines))
            for bi in range(len(edges) - 1):
                lo, hi = edges[bi], edges[bi + 1]
                events = extract_events(t.score, glyphs, v_lines, beams, lo, hi)
                if not events:
                    continue
                total += 1
                s = sum(Fraction(e.beats).limit_denominator(64) for e in events)
                if s == expected:
                    ok += 1
                else:
                    detail = " ".join(
                        f"{'R' if e.is_rest else 'N'}1/{e.denom}{'.' * e.dots}"
                        for e in events
                    )
                    problems.append(
                        f"  p{pno + 1} 슬롯{ti} 마디{bi + 1}: 합계 {float(s):.3f}박 "
                        f"({len(events)}개) {detail[:96]}"
                    )

    rate = ok / total * 100 if total else 0
    print(f"검사한 마디 {total}개 중 박자 일치 {ok}개 ({rate:.1f}%)\n")
    if problems:
        print(f"어긋난 마디 {len(problems)}개 (앞 25개):")
        for p in problems[:25]:
            print(p)


if __name__ == "__main__":
    main()
