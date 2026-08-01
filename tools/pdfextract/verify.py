"""추출 품질을 자동으로 잰다.

악보를 눈으로 대조하지 않고도 회귀를 잡을 수 있도록 두 가지를 본다.

1. **마디 길이** — 리듬을 제대로 읽었다면 4/4 마디의 합은 정확히 4박이다.
2. **프렛 결합률** — 쉼표가 아닌 소리에 짚는 자리가 붙었는지.
   오선보 음표는 읽었는데 TAB을 못 붙였거나 그 반대면 여기서 드러난다.

실제 변환과 같은 경로(`assemble`)를 쓴다. 조립 단계에서만 하는 처리
(리듬 슬래시 화음 이어받기 등)까지 함께 재기 위해서다.

    python verify.py <악보.pdf> [기대박자(기본 4)]
"""

from __future__ import annotations

import sys
from fractions import Fraction

from assemble import assemble


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        raise SystemExit(1)
    path = sys.argv[1]
    expected = Fraction(sys.argv[2]) if len(sys.argv) > 2 else Fraction(4)

    song = assemble(path)

    bars_total = bars_ok = 0
    sounds = sounds_with_frets = 0
    problems: list[str] = []

    for part in song.parts:
        for bar in part.bars:
            if not bar.beats:
                continue
            bars_total += 1
            total = sum(Fraction(b.quarters).limit_denominator(64) for b in bar.beats)
            if total == expected:
                bars_ok += 1
            else:
                detail = " ".join(str(b) for b in bar.beats)
                problems.append(
                    f"  파트{part.index} 마디{bar.index + 1}: "
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
    print(
        f"프렛 결합률    : {sounds_with_frets:5}/{sounds:<5} "
        f"{pct(sounds_with_frets, sounds)}"
    )

    if problems:
        print(f"\n길이가 어긋난 마디 {len(problems)}개 (앞 15개):")
        for p in problems[:15]:
            print(p)


if __name__ == "__main__":
    main()
