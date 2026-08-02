"""PDF 악보를 Guitar Pro 파일로 변환한다.

    python convert.py <악보.pdf> [출력.gp5]

지금은 TAB이 있는 악기만 내보낸다. 보컬 보표는 프렛 정보가 없어 GP로
옮길 근거가 없기 때문이다.

변환할 수 없는 PDF는 이유를 밝히고 1로 끝낸다. 앱이 그 문장을 그대로
사용자에게 보여주므로, 트레이스백 대신 무엇이 문제인지 적는다.
"""

from __future__ import annotations

import sys
from pathlib import Path

import fitz

from assemble import assemble
from gpwrite import write_gp5
from structure import detect_staves, read_page


class CannotConvert(Exception):
    """사용자에게 그대로 보여줄 수 있는 실패."""


def inspect(path: str) -> None:
    """변환을 시도하기 전에 '애초에 될 만한 PDF인지' 본다.

    안 되는 이유를 일찍, 구체적으로 알려주기 위해서다. 끝까지 갔다가
    빈 결과를 내놓으면 사용자는 무엇이 잘못됐는지 알 수 없다.
    """
    try:
        doc = fitz.open(path)
    except Exception as e:  # noqa: BLE001 - 열리지 않는 이유는 다양하다
        raise CannotConvert(f"PDF를 열 수 없습니다: {e}") from e

    if doc.page_count == 0:
        raise CannotConvert("빈 PDF입니다.")

    music = staves = letters = 0
    for pno in range(min(3, doc.page_count)):
        page = doc[pno]
        h_seg, _v, _b, glyphs = read_page(page)
        music += sum(1 for g in glyphs if g.is_music)
        letters += len(glyphs)
        staves += len(detect_staves(h_seg, page.rect.width))

    if staves == 0:
        raise CannotConvert(
            "악보를 찾지 못했습니다.\n"
            "이 도구는 Guitar Pro·Finale 등에서 내보낸 PDF만 읽을 수 있습니다.\n"
            "스캔하거나 사진으로 찍은 악보는 아직 지원하지 않습니다."
        )
    if music == 0:
        # 글자가 하나도 없다면 폰트를 못 알아본 게 아니라, 애초에 글자가 아니다.
        # 음표를 글자가 아닌 그림(윤곽선)으로 저장한 PDF가 있는데, 그러면
        # 모양만 남고 '이게 무슨 기호인지'가 사라져서 읽을 방법이 없다.
        if letters == 0:
            raise CannotConvert(
                "악보 기호가 글자가 아니라 그림으로 저장된 PDF입니다.\n"
                "이런 파일은 음표와 쉼표를 구분할 단서가 남아 있지 않아\n"
                "아직 변환할 수 없습니다.\n"
                "같은 악보를 다른 곳에서 받을 수 있다면 그쪽을 시도해보세요."
            )
        raise CannotConvert(
            "오선은 찾았지만 음표를 읽지 못했습니다.\n"
            "지원하지 않는 음악 폰트로 만들어진 악보일 수 있습니다."
        )


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        raise SystemExit(1)

    src = sys.argv[1]
    dst = sys.argv[2] if len(sys.argv) > 2 else str(Path(src).with_suffix(".gp5"))

    try:
        inspect(src)
        song = assemble(src)

        tab_parts = [p for p in song.parts if p.has_tab]
        if not tab_parts:
            raise CannotConvert(
                "TAB(타브) 악보를 찾지 못했습니다.\n"
                "기타 TAB이 함께 있는 악보만 변환할 수 있습니다."
            )

        print(f"제목 : {song.title or '(못 읽음)'}")
        print(f"템포 : {song.tempo or '(못 읽음)'}")
        for p in tab_parts:
            played = sum(1 for b in p.bars for beat in b.beats if beat.notes)
            total = sum(len(b.beats) for b in p.bars)
            print(
                f"  [{p.index}] {p.name or '(이름 없음)'} — {len(p.bars)}마디, "
                f"소리 {total}개 중 프렛 있는 것 {played}개"
            )

        out = write_gp5(song, dst)
        print(f"\n{dst} 저장 — 트랙 {len(out.tracks)}개, "
              f"{len(out.tracks[0].measures)}마디")

    except CannotConvert as e:
        print(str(e), file=sys.stderr)
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
