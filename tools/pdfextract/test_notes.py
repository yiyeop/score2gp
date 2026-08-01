"""성부 분리 규칙 테스트.

    python3 -m unittest test_notes

추출기 전체는 실제 PDF로 verify.py가 확인한다. 여기서는 PDF 없이도
확인할 수 있는 판단 규칙만 다룬다 — 특히 '언제 나누지 *않는가*'가
중요하다. 근거 없이 나누면 멀쩡한 마디가 망가지기 때문이다.
"""

from __future__ import annotations

import unittest

from notes import Bar, Beat, split_voices


def beat(denom: int, up: bool | None) -> Beat:
    return Beat(x=0.0, denom=denom, dots=0, is_rest=False, stem_up=up)


def bar(*beats: Beat) -> Bar:
    return Bar(index=0, beats=list(beats), x0=0.0, x1=100.0)


class SplitVoices(unittest.TestCase):
    def test_splits_when_one_voice_fills_the_bar(self):
        # 위 기둥 4분음표 4개(4박) + 아래 기둥 온음표 하나(4박)가 겹쳐 적힌 마디
        b = bar(*[beat(4, True) for _ in range(4)], beat(1, False))
        self.assertTrue(split_voices(b))
        self.assertEqual(len(b.beats), 4)
        self.assertEqual(len(b.voice2), 1)
        self.assertEqual(b.quarters, 4)

    def test_keeps_a_correct_bar_untouched(self):
        # 이미 4박이면 기둥 방향이 섞여 있어도 건드리지 않는다
        b = bar(beat(4, True), beat(4, False), beat(4, True), beat(4, False))
        self.assertFalse(split_voices(b))
        self.assertEqual(len(b.beats), 4)
        self.assertEqual(b.voice2, [])

    def test_leaves_a_bar_alone_when_neither_side_adds_up(self):
        # 5박이지만 위 3박·아래 2박으로 어느 쪽도 4박이 아니다
        # → 마디가 넘친 까닭을 성부 탓으로 볼 근거가 없다
        b = bar(beat(2, True), beat(4, True), beat(2, False))
        self.assertFalse(split_voices(b))
        self.assertEqual(len(b.beats), 3)

    def test_needs_both_directions(self):
        # 기둥이 한쪽뿐이면 애초에 두 성부가 아니다
        b = bar(*[beat(4, True) for _ in range(5)])
        self.assertFalse(split_voices(b))


if __name__ == "__main__":
    unittest.main()
