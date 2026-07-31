"""프렛과 음길이를 합친 최종 결과를 마디별로 출력한다.

    python dump_notes.py <악보.pdf> [페이지번호(1부터)]

각 소리를 `[1/8 5현7]` 형태로 보여준다. 앞이 음길이, 뒤가 짚는 자리다.
마디 끝의 `합 4.00박`으로 리듬이 맞는지 바로 확인할 수 있다.
"""

from __future__ import annotations

import sys

import fitz

from notes import extract_bars
from structure import detect_staves, pair_tracks, read_page


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        raise SystemExit(1)
    path = sys.argv[1]
    page_no = int(sys.argv[2]) - 1 if len(sys.argv) > 2 else 0

    doc = fitz.open(path)
    page = doc[page_no]
    h_seg, v_lines, beams, glyphs = read_page(page)
    tracks = pair_tracks(detect_staves(h_seg, page.rect.width))

    print(f"{page_no + 1}페이지 — 악기 슬롯 {len(tracks)}\n")

    for ti, t in enumerate(tracks):
        if not t.score:
            print(f"── 슬롯 {ti}: 오선만 (보컬/멜로디) — 건너뜀\n")
            continue

        bars, orphans = extract_bars(t, glyphs, v_lines, beams)
        tab = f"TAB y{t.tab.top:.0f}" if t.tab else "TAB 없음"
        note = f"  ⚠ 짝 못 찾은 TAB 화음 {orphans}개" if orphans else ""
        print(f"── 슬롯 {ti}: 오선 y{t.score.top:.0f} + {tab}{note}")

        for bar in bars:
            if not bar.beats:
                print(f"   마디{bar.index + 1}: (빈 마디)")
                continue
            body = " ".join(str(b) for b in bar.beats)
            mark = "" if abs(bar.quarters - 4) < 0.01 else "  ← 박자 불일치"
            print(f"   마디{bar.index + 1}: {body}")
            print(f"            합 {bar.quarters:.2f}박{mark}")
        print()


if __name__ == "__main__":
    main()
