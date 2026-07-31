"""인식 결과를 원본 PDF 위에 겹쳐 그려 눈으로 검증하는 도구.

    python overlay.py <악보.pdf> [페이지번호(1부터)] [출력.png]

- 파랑 상자: 오선    - 초록 상자: TAB
- 빨강 세로선: 마디선  - 주황 점: 인식한 프렛 표시
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


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        raise SystemExit(1)
    path = sys.argv[1]
    page_no = int(sys.argv[2]) - 1 if len(sys.argv) > 2 else 0
    out = sys.argv[3] if len(sys.argv) > 3 else "overlay.png"

    doc = fitz.open(path)
    page = doc[page_no]
    h_seg, v_lines, _beams, glyphs = read_page(page)
    staves = detect_staves(h_seg, page.rect.width)
    tracks = pair_tracks(staves)

    for t in tracks:
        for st, color in ((t.score, (0, 0, 1)), (t.tab, (0, 0.6, 0))):
            if st:
                page.draw_rect(
                    fitz.Rect(st.x0, st.top, st.x1, st.bottom), color=color, width=0.7
                )
        for x in detect_barlines(t, v_lines):
            page.draw_line(
                fitz.Point(x, t.top - 4),
                fitz.Point(x, t.bottom + 4),
                color=(1, 0, 0),
                width=1.2,
            )
        if t.tab:
            for m in extract_frets(t.tab, glyphs):
                page.draw_circle(
                    fitz.Point(m.x - 1.2, m.y), 1.1, color=(1, 0.5, 0), width=0.9
                )

    pix = page.get_pixmap(matrix=fitz.Matrix(2.2, 2.2))
    pix.save(out)
    print(f"{out} 저장 ({pix.width}x{pix.height})")
    print(f"보표 {len(staves)}, 악기 슬롯 {len(tracks)}")


if __name__ == "__main__":
    main()
