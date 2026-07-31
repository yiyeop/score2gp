"""조립한 곡 전체를 요약해 보여준다.

    python dump_song.py <악보.pdf> [보여줄마디수]
"""

from __future__ import annotations

import sys

from assemble import assemble


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        raise SystemExit(1)
    path = sys.argv[1]
    show = int(sys.argv[2]) if len(sys.argv) > 2 else 4

    song = assemble(path)
    print(f"제목 : {song.title or '(못 읽음)'}")
    print(f"템포 : {song.tempo or '(못 읽음)'}")
    print(f"악기 : {len(song.parts)}개, 최대 {song.bar_count}마디\n")

    for p in song.parts:
        kind = "오선+TAB" if p.has_tab else "오선만"
        print(f"── [{p.index}] {p.name or '(이름 없음)'} — {kind}, {len(p.bars)}마디")
        for bar in p.bars[:show]:
            body = " ".join(str(b) for b in bar.beats) or "(빈 마디)"
            print(f"     {body[:100]}")
        if len(p.bars) > show:
            print(f"     … 외 {len(p.bars) - show}마디")
        print()


if __name__ == "__main__":
    main()
