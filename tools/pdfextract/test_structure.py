"""TAB 숫자 읽기 규칙 테스트.

    python3 -m unittest test_structure

빠른 패시지에서 이웃한 프렛이 이어붙는 문제는 눈에 잘 안 띈다. 소리가
이상해도 '변환이 원래 그런가 보다' 하고 넘어가기 쉬워서, 규칙을 못으로
박아 둔다.
"""

from __future__ import annotations

import unittest

from structure import Glyph, Staff, extract_frets

# 실측한 광인들 악보 기준 (6줄, 줄 간격 6.38pt)
TAB = Staff(kind="tab", lines=[600.0 + 6.38 * i for i in range(6)], x0=0.0, x1=600.0)
DIGIT_W = 3.89


def digit(text: str, x: float, string: int) -> Glyph:
    """TAB 위의 숫자 글자 하나. 줄 위에 세로 중앙이 오도록 놓는다."""
    cy = TAB.top + TAB.gap * (string - 1)
    return Glyph(
        code=ord(text), char=text, font="Arial",
        x=x, y=cy, x0=x, y0=cy - 2.5, x1=x + DIGIT_W, y1=cy + 2.5,
    )


def read(glyphs: list[Glyph]) -> list[tuple[str, int]]:
    return [(m.text, m.string) for m in extract_frets(TAB, glyphs)]


class MergeDigits(unittest.TestCase):
    def test_joins_a_two_digit_fret(self):
        # 두 자리 수의 글자는 딱 붙거나 살짝 겹쳐 그려진다
        self.assertEqual(
            read([digit("1", 100.0, 4), digit("1", 103.5, 4)]),
            [("11", 4)],
        )

    def test_keeps_neighbouring_frets_apart(self):
        # 실측: 9와 11 사이가 1.33pt까지 좁아진다. 자리만 보면 '91'로 붙는데
        # 91프렛짜리 기타는 없으므로 값으로 갈라야 한다.
        glyphs = [
            digit("9", 331.55, 4),
            digit("1", 336.77, 4),
            digit("1", 340.13, 4),
            digit("9", 346.13, 4),
        ]
        self.assertEqual(read(glyphs), [("9", 4), ("11", 4), ("9", 4)])

    def test_never_reads_an_impossible_fret(self):
        # 붙이면 24프렛을 넘는 조합은 어떤 간격이어도 붙이지 않는다
        for a, b in (("9", "9"), ("5", "0"), ("3", "0")):
            with self.subTest(pair=a + b):
                marks = read([digit(a, 100.0, 3), digit(b, 103.5, 3)])
                self.assertEqual(marks, [(a, 3), (b, 3)])

    def test_allows_the_highest_real_fret(self):
        self.assertEqual(
            read([digit("2", 100.0, 1), digit("4", 103.5, 1)]),
            [("24", 1)],
        )

    def test_reads_dead_notes(self):
        self.assertEqual(read([digit("X", 100.0, 5)]), [("X", 5)])

    def test_reads_a_dead_note_drawn_as_a_music_glyph(self):
        # Finale은 TAB의 데드 노트를 글자 X가 아니라 Maestro의 × 글리프로
        # 찍는다. 글자만 보면 그 음이 통째로 사라져서, 오선보에는 있는데
        # 짚는 자리가 없는 소리가 된다 — 달빛소년에서 100개가 그랬다.
        cy = TAB.top + TAB.gap * 2
        cross = Glyph(
            code=0xF0C0, char="", font="ABCDEF+Maestro",
            x=100.0, y=cy, x0=100.0, y0=cy - 2.5, x1=104.0, y1=cy + 2.5,
        )
        self.assertEqual(read([cross]), [("X", 3)])


class BassTab(unittest.TestCase):
    """4줄 TAB(베이스). 6줄 TAB의 아래 네 줄과 모양이 같아 헷갈리기 쉽다."""

    @staticmethod
    def staff(lines: int, top: float, gap: float = 5.86) -> Staff:
        return Staff(
            kind="tab",
            lines=[top + gap * i for i in range(lines)],
            x0=28.0,
            x1=567.0,
        )

    def rows(self, staves):
        """보표 줄을 가로선 묶음으로 바꾼다 (detect_staves 입력 모양)."""
        import collections
        h = collections.defaultdict(list)
        for st in staves:
            for y in st.lines:
                h[round(y, 1)].append((st.x0, st.x1))
        return h

    def test_finds_a_four_line_tab(self):
        from structure import detect_staves
        # 오선 5줄 + TAB 4줄 (실측 아지랑이 베이스 배치)
        score = Staff(kind="score", lines=[100 + 3.92 * i for i in range(5)], x0=28.0, x1=567.0)
        tab = self.staff(4, 140.0)
        found = detect_staves(self.rows([score, tab]), 595.0)
        self.assertEqual([len(s.lines) for s in found], [5, 4])

    def test_does_not_split_a_six_line_tab(self):
        from structure import detect_staves
        # 6줄 TAB 하나만 있을 때 아래 네 줄을 베이스로 잘라내면 안 된다
        found = detect_staves(self.rows([self.staff(6, 140.0)]), 595.0)
        self.assertEqual([len(s.lines) for s in found], [6])


class BendTargets(unittest.TestCase):
    """밴딩 목표음은 치는 음이 아니다."""

    @staticmethod
    def arrow(x: float) -> Glyph:
        # 화살표는 TAB 줄 사이에 그려진다 (실측 y는 원래 음 한 줄 위쯤)
        y = TAB.top + TAB.gap * 0.5
        return Glyph(
            code=0xEB78, char="", font="GPBravuraRegular",
            x=x, y=y, x0=x, y0=y - 3, x1=x + 2.43, y1=y + 3,
        )

    def test_drops_the_number_at_the_arrow(self):
        # 실측 광인들 112마디: 2현 14를 치고 1현 자리에 목표음 14를 적어 둔다
        glyphs = [
            digit("1", 500.86, 2), digit("4", 504.75, 2),   # 실제로 치는 음
            self.arrow(515.45),
            digit("1", 515.88, 1), digit("4", 519.77, 1),   # 올려서 닿을 음
        ]
        self.assertEqual(read(glyphs), [("14", 2)])

    def test_keeps_notes_away_from_the_arrow(self):
        glyphs = [
            digit("1", 500.86, 2), digit("4", 504.75, 2),
            self.arrow(515.45),
            digit("1", 540.00, 2), digit("2", 543.89, 2),
        ]
        self.assertEqual(read(glyphs), [("14", 2), ("12", 2)])


if __name__ == "__main__":
    unittest.main()
