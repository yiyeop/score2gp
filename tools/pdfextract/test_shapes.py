"""도형 악보에서 쉼표·플래그 길이를 배우는 규칙 테스트.

    python3 -m unittest test_shapes

이 학습기는 조용히 틀릴 수 있어서 위험하다. 근거 없이 길이를 붙이면
멀쩡한 마디까지 망가지는데, 수치로는 '조금 나아졌다'로 보일 수 있다.
그래서 '증거가 없으면 아무것도 하지 않는다'를 못으로 박아 둔다.
"""

from __future__ import annotations

import unittest
from collections import Counter
from fractions import Fraction

from shapes import fit


def bar(short, **shapes):
    """모자란 박이 `short`이고 그 안에 도형이 이만큼 있는 마디."""
    return Fraction(short).limit_denominator(64), Counter(shapes)


class LearnRests(unittest.TestCase):
    def test_learns_a_quarter_rest(self):
        # 1박이 모자란 마디마다 같은 도형이 하나씩 들어 있다
        rows = [bar(1, Rq=1) for _ in range(6)]
        self.assertEqual(fit(rows), {"Rq": 4})

    def test_learns_two_rests_at_once(self):
        rows = [bar(1, Rq=1) for _ in range(5)]
        rows += [bar("1/2", Re=1) for _ in range(5)]
        rows += [bar("3/2", Rq=1, Re=1) for _ in range(3)]
        self.assertEqual(fit(rows), {"Rq": 4, "Re": 8})

    def test_counts_repeats(self):
        # 한 마디에 8분쉼표가 넷이면 2박이 모자라야 한다
        rows = [bar(2, Re=4) for _ in range(5)]
        self.assertEqual(fit(rows), {"Re": 8})

    def test_tells_a_whole_rest_from_a_half_rest(self):
        # 온쉼표와 2분쉼표는 똑같은 사각형이라 자리로만 갈린다.
        # 서명에 자리가 들어가 있으므로 서로 다른 후보가 된다.
        rows = [bar(4, **{"Rr@1.25": 1}) for _ in range(5)]
        rows += [bar(2, **{"Rr@1.75": 1}) for _ in range(5)]
        self.assertEqual(fit(rows), {"Rr@1.25": 1, "Rr@1.75": 2})


class LearnFlags(unittest.TestCase):
    """플래그가 붙은 음표는 이미 4분음표로 세고 있다 — 값이 아니라 차액이다."""

    def test_learns_an_eighth_flag(self):
        rows = [bar("-1/2", Ff=1) for _ in range(6)]
        self.assertEqual(fit(rows), {"Ff": 8})

    def test_learns_a_sixteenth_flag(self):
        rows = [bar("-3/4", Ff=1) for _ in range(6)]
        self.assertEqual(fit(rows), {"Ff": 16})


class RefusesToGuess(unittest.TestCase):
    def test_ignores_a_shape_that_explains_nothing(self):
        # 임시표(샾)는 쉼표와 크기가 비슷하지만 박을 차지하지 않는다.
        # 이미 맞는 마디에 들어 있으므로 어떤 길이를 줘도 마디가 깨진다.
        rows = [bar(0, Rsharp=1) for _ in range(10)]
        self.assertEqual(fit(rows), {})

    def test_ignores_weak_evidence(self):
        # 두 마디만 맞아떨어지는 건 우연일 수 있다
        rows = [bar(1, Rx=1), bar(1, Rx=1)]
        rows += [bar(0, Rx=1) for _ in range(3)]
        self.assertEqual(fit(rows), {})

    def test_does_not_break_bars_that_are_already_right(self):
        # 맞는 마디를 더 많이 깨뜨리는 조합은 점수가 떨어져 밀려난다
        rows = [bar(1, Rx=1) for _ in range(4)]
        rows += [bar(0, Rx=1) for _ in range(9)]
        self.assertEqual(fit(rows), {})

    def test_no_bars_no_learning(self):
        self.assertEqual(fit([]), {})


if __name__ == "__main__":
    unittest.main()
