"""성부 분리 규칙 테스트.

    python3 -m unittest test_notes

추출기 전체는 실제 PDF로 verify.py가 확인한다. 여기서는 PDF 없이도
확인할 수 있는 판단 규칙만 다룬다 — 특히 '언제 나누지 *않는가*'가
중요하다. 근거 없이 나누면 멀쩡한 마디가 망가지기 때문이다.
"""

from __future__ import annotations

import unittest

from notes import Bar, Beat, PlayedNote, _merge_bend_orphans, split_voices
from rhythm import Event
from structure import Glyph


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


class BendDecorations(unittest.TestCase):
    """밴딩을 여러 음표머리로 그리는 악보 대응."""

    @staticmethod
    def head(x: float) -> Glyph:
        return Glyph(code=0xE0A4, char="", font="GPBravuraRegular",
                     x=x, y=280.0, x0=x, y0=277.0, x1=x + 4.5, y1=283.0)

    def make(self, stemless: bool):
        """프렛을 못 찾은 머리 하나가 뒤에 붙은 마디."""
        played = Beat(x=100.0, denom=4, dots=0, is_rest=False,
                      notes=[PlayedNote(string=2, fret=14)])
        extra = Beat(x=120.0, denom=4, dots=0, is_rest=False)
        events = [
            Event(x=100.0, denom=4, dots=0, is_rest=False, heads=[self.head(100.0)]),
            Event(x=120.0, denom=4, dots=0, is_rest=False,
                  heads=[self.head(120.0)], stemless=stemless),
        ]
        return _merge_bend_orphans([played, extra], events, [], 90.0, 200.0)

    def test_drops_a_stemless_head(self):
        # 검은 머리에 기둥이 없으면 정상적인 음표일 수 없다 — 시간도 차지하지
        # 않는다. 길이를 더하면 마디가 넘친다.
        beats = self.make(stemless=True)
        self.assertEqual(len(beats), 1)
        self.assertEqual(beats[0].quarters, 1.0)

    def test_keeps_a_stemmed_head(self):
        # 기둥이 있으면 근거가 약하므로 함부로 지우지 않는다
        beats = self.make(stemless=False)
        self.assertEqual(len(beats), 2)


if __name__ == "__main__":
    unittest.main()
