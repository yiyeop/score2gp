"""PDF 악보를 Guitar Pro 파일로 변환한다.

    python convert.py <악보.pdf> [출력.gp5]

지금은 TAB이 있는 악기만 내보낸다. 보컬 보표는 프렛 정보가 없어 GP로
옮길 근거가 없기 때문이다.
"""

from __future__ import annotations

import sys
from pathlib import Path

from assemble import assemble
from gpwrite import write_gp5


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        raise SystemExit(1)

    src = sys.argv[1]
    dst = sys.argv[2] if len(sys.argv) > 2 else str(Path(src).with_suffix(".gp5"))

    song = assemble(src)
    print(f"제목 : {song.title or '(못 읽음)'}")
    print(f"템포 : {song.tempo or '(못 읽음)'}")

    tab_parts = [p for p in song.parts if p.has_tab]
    for p in tab_parts:
        played = sum(1 for b in p.bars for beat in b.beats if beat.notes)
        total = sum(len(b.beats) for b in p.bars)
        print(f"  [{p.index}] {p.name or '(이름 없음)'} — {len(p.bars)}마디, "
              f"소리 {total}개 중 프렛 있는 것 {played}개")

    out = write_gp5(song, dst)
    print(f"\n{dst} 저장 — 트랙 {len(out.tracks)}개, "
          f"{len(out.tracks[0].measures)}마디")


if __name__ == "__main__":
    main()
