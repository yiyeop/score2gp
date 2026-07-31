"""추출 품질을 자동으로 잰다.

악보를 눈으로 대조하지 않고도 회귀를 잡을 수 있도록 두 가지를 본다.

1. **마디 길이** — 리듬을 제대로 읽었다면 4/4 마디의 합은 정확히 4박이다.
2. **프렛 결합률** — 쉼표가 아닌 소리에 짚는 자리가 붙었는지.
   오선보 음표는 읽었는데 TAB을 못 붙였거나 그 반대면 여기서 드러난다.

    python verify.py <악보.pdf> [기대박자(기본 4)]
"""

from __future__ import annotations

import sys
from fractions import Fraction

import fitz

from notes import extract_bars
from structure import detect_staves, pair_tracks, read_page


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        raise SystemExit(1)
    path = sys.argv[1]
    expected = Fraction(sys.argv[2]) if len(sys.argv) > 2 else Fraction(4)

    doc = fitz.open(path)
    bars_total = bars_ok = 0
    sounds = sounds_with_frets = 0
    orphans_total = 0
    problems: list[str] = []

    for pno in range(len(doc)):
        page = doc[pno]
        h_seg, v_lines, beams, glyphs = read_page(page)
        tracks = pair_tracks(detect_staves(h_seg, page.rect.width))

        for ti, t in enumerate(tracks):
            if not t.score:
                continue
            bars, orphans = extract_bars(t, glyphs, v_lines, beams)
            orphans_total += orphans

            for bar in bars:
                if not bar.beats:
                    continue
                bars_total += 1
                total = sum(
                    Fraction(b.quarters).limit_denominator(64) for b in bar.beats
                )
                if total == expected:
                    bars_ok += 1
                else:
                    detail = " ".join(str(b) for b in bar.beats)
                    problems.append(
                        f"  p{pno + 1} 슬롯{ti} 마디{bar.index + 1}: "
                        f"{float(total):.2f}박  {detail[:88]}"
                    )
                for b in bar.beats:
                    if b.is_rest:
                        continue
                    sounds += 1
                    if b.notes:
                        sounds_with_frets += 1

    def pct(a: int, b: int) -> str:
        return f"{a / b * 100:5.1f}%" if b else "  n/a"

    print(f"마디 길이 일치 : {bars_ok:5}/{bars_total:<5} {pct(bars_ok, bars_total)}")
    print(f"프렛 결합률    : {sounds_with_frets:5}/{sounds:<5} {pct(sounds_with_frets, sounds)}")
    print(f"짝 못 찾은 TAB : {orphans_total}개")

    if problems:
        print(f"\n길이가 어긋난 마디 {len(problems)}개 (앞 15개):")
        for p in problems[:15]:
            print(p)


if __name__ == "__main__":
    main()
