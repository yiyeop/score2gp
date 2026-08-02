"""변환 전 사전 점검(inspect) 테스트.

    python3 -m unittest test_convert

안 되는 PDF에 왜 안 되는지 정확히 알려주는 건 기능의 일부다. 틀린 이유를
대면 사용자가 엉뚱한 데서 시간을 쓴다 — 폰트 문제라고 하면 폰트를 찾아
헤매게 되는데, 실은 글자가 아예 없는 파일일 수도 있다.
"""

from __future__ import annotations

import unittest
from pathlib import Path

import fitz

from convert import CannotConvert, inspect

TMP = Path("/tmp/score2gp-inspect-test")


def staff_lines(page: fitz.Page) -> None:
    """오선 다섯 줄을 긋는다. 페이지 폭의 대부분을 덮어야 보표로 잡힌다."""
    for i in range(5):
        y = 100 + i * 5
        page.draw_line((30, y), (page.rect.width - 30, y), width=0.4)


class Inspect(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        TMP.mkdir(exist_ok=True)

    def make(self, name: str, build) -> str:
        doc = fitz.open()
        build(doc.new_page())
        path = str(TMP / name)
        doc.save(path)
        doc.close()
        return path

    def test_blank_page_is_not_a_score(self):
        path = self.make("blank.pdf", lambda p: None)
        with self.assertRaises(CannotConvert) as cm:
            inspect(path)
        self.assertIn("악보를 찾지 못했습니다", str(cm.exception))

    def test_outlined_symbols_say_so(self):
        """음표를 글자가 아닌 그림으로 저장한 PDF.

        실제로 이런 악보가 있다(악보바다 피아노 악보). 오선은 선이라 잡히지만
        글자가 하나도 없어서, 폰트를 못 알아본 것과는 다른 상황이다.
        """
        def build(page):
            staff_lines(page)
            # 음표머리를 글자가 아니라 채운 타원으로 그린다
            for x in range(60, 300, 20):
                page.draw_oval(fitz.Rect(x, 103, x + 5.6, 107.6), fill=(0, 0, 0))

        path = self.make("outlined.pdf", build)
        with self.assertRaises(CannotConvert) as cm:
            inspect(path)
        message = str(cm.exception)
        self.assertIn("그림으로 저장된", message)
        self.assertNotIn("폰트", message)  # 폰트 탓으로 돌리면 안 된다

    def test_a_real_score_passes(self):
        sample = "/Users/yiyeop/Downloads/광인들 Lead and Rhytm full.pdf"
        if not Path(sample).exists():
            self.skipTest("샘플 악보가 없습니다")
        inspect(sample)  # 예외가 나지 않아야 한다

    @classmethod
    def tearDownClass(cls) -> None:
        for f in TMP.glob("*.pdf"):
            f.unlink()
        TMP.rmdir()


if __name__ == "__main__":
    unittest.main()
