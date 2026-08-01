"""Guitar Pro 파일을 오선+TAB 쌍의 MusicXML로 내보낸다 — 테스트 샘플용.

    python3 gp2xml.py <악보.gp5> <출력.musicxml> [트랙번호 ...]

추출기를 시험하려면 조판 프로그램이 서로 다른 PDF가 필요한데, 손에 넣기가
쉽지 않다. 대신 이미 있는 GP 파일을 MusicXML로 바꿔 MuseScore로 조판하면
새 조판 계열의 PDF를 얼마든지 만들 수 있다.

무엇보다 **원본 GP가 정답지**가 된다. '마디가 4박인가' 같은 간접 지표 대신
마디 길이와 프렛을 하나하나 대조할 수 있다.

TAB을 그리려면 staff 2에 TAB 음자리표와 조율을 주고, 같은 음을 string/fret과
함께 한 번 더 적어야 한다. MuseScore는 이 모양을 오선+TAB 쌍으로 그린다.
"""

from __future__ import annotations

import sys
import xml.etree.ElementTree as ET
from fractions import Fraction

import guitarpro as gp

DIVISIONS = 480  # 4분음표 하나를 480으로 쪼갠다 (32분음표·점음표까지 정수로 떨어진다)

_STEPS = [
    ("C", 0), ("C", 1), ("D", 0), ("D", 1), ("E", 0), ("F", 0),
    ("F", 1), ("G", 0), ("G", 1), ("A", 0), ("A", 1), ("B", 0),
]
_TYPE_NAMES = {
    1: "whole", 2: "half", 4: "quarter", 8: "eighth",
    16: "16th", 32: "32nd", 64: "64th",
}


def sub(parent: ET.Element, tag: str, text: str | None = None) -> ET.Element:
    el = ET.SubElement(parent, tag)
    if text is not None:
        el.text = text
    return el


def pitch_of(midi: int) -> tuple[str, int, int]:
    """MIDI 번호를 (음이름, 반음, 옥타브)로 바꾼다."""
    step, alter = _STEPS[midi % 12]
    return step, alter, midi // 12 - 1


def beat_quarters(beat: gp.models.Beat) -> Fraction:
    """이 박의 길이를 4분음표 단위로."""
    d = beat.duration
    q = Fraction(4, d.value)
    if d.isDotted:
        q *= Fraction(3, 2)
    tup = d.tuplet
    if tup and tup.enters:
        q *= Fraction(tup.times, tup.enters)
    return q


def write_note(
    measure: ET.Element,
    midi: int,
    dur: int,
    type_name: str,
    dots: int,
    staff: int,
    chord: bool,
    string: int | None = None,
    fret: int | None = None,
) -> None:
    note = sub(measure, "note")
    if chord:
        sub(note, "chord")
    p = sub(note, "pitch")
    step, alter, octave = pitch_of(midi)
    sub(p, "step", step)
    if alter:
        sub(p, "alter", str(alter))
    sub(p, "octave", str(octave))
    sub(note, "duration", str(dur))
    sub(note, "voice", "1" if staff == 1 else "2")
    if type_name:
        sub(note, "type", type_name)
    for _ in range(dots):
        sub(note, "dot")
    sub(note, "staff", str(staff))
    if string is not None:
        tech = sub(sub(note, "notations"), "technical")
        sub(tech, "string", str(string))
        sub(tech, "fret", str(fret))


def write_rest(measure: ET.Element, dur: int, type_name: str, staff: int) -> None:
    note = sub(measure, "note")
    sub(note, "rest")
    sub(note, "duration", str(dur))
    sub(note, "voice", "1" if staff == 1 else "2")
    if type_name:
        sub(note, "type", type_name)
    sub(note, "staff", str(staff))


def duration_type(beat: gp.models.Beat) -> tuple[str, int]:
    d = beat.duration
    return _TYPE_NAMES.get(d.value, "quarter"), (1 if d.isDotted else 0)


def add_attributes(measure: ET.Element, track: gp.models.Track, num: int, den: int) -> None:
    attrs = sub(measure, "attributes")
    sub(attrs, "divisions", str(DIVISIONS))
    sub(sub(attrs, "key"), "fifths", "0")
    t = sub(attrs, "time")
    sub(t, "beats", str(num))
    sub(t, "beat-type", str(den))
    sub(attrs, "staves", "2")

    clef1 = sub(attrs, "clef")
    clef1.set("number", "1")
    sub(clef1, "sign", "G")
    sub(clef1, "line", "2")
    sub(clef1, "clef-octave-change", "-1")  # 기타는 적힌 것보다 한 옥타브 낮게 난다

    clef2 = sub(attrs, "clef")
    clef2.set("number", "2")
    sub(clef2, "sign", "TAB")
    sub(clef2, "line", "5")

    details = sub(attrs, "staff-details")
    details.set("number", "2")
    sub(details, "staff-lines", str(len(track.strings)))
    # GP는 1번 줄이 가장 높은 현이고, TAB 보표는 아래에서부터 줄을 센다
    for i, st in enumerate(reversed(track.strings)):
        tune = sub(details, "staff-tuning")
        tune.set("line", str(i + 1))
        step, alter, octave = pitch_of(st.value)
        sub(tune, "tuning-step", step)
        if alter:
            sub(tune, "tuning-alter", str(alter))
        sub(tune, "tuning-octave", str(octave))


def convert(song: gp.models.Song, tracks: list[int]) -> ET.ElementTree:
    root = ET.Element("score-partwise", version="3.1")
    work = sub(root, "work")
    sub(work, "work-title", song.title or "제목 없음")

    part_list = sub(root, "part-list")
    for n, ti in enumerate(tracks):
        sp = sub(part_list, "score-part")
        sp.set("id", f"P{n + 1}")
        sub(sp, "part-name", song.tracks[ti].name or f"Track {ti}")

    for n, ti in enumerate(tracks):
        track = song.tracks[ti]
        part = sub(root, "part")
        part.set("id", f"P{n + 1}")

        for mi, meas in enumerate(track.measures):
            m = sub(part, "measure")
            m.set("number", str(mi + 1))
            sig = meas.header.timeSignature
            if mi == 0:
                add_attributes(m, track, sig.numerator, sig.denominator.value)

            beats = meas.voices[0].beats
            # GP는 쉬는 마디를 '빈 박' 하나로 적는다. 길이는 아무 값이나
            # 들어 있으므로(대개 4분) 그대로 옮기면 마디가 짧아진다.
            if all(b.status == gp.models.BeatStatus.empty for b in beats):
                beats = []
            if not beats:
                bar_q = Fraction(4 * sig.numerator, sig.denominator.value)
                write_rest(m, int(bar_q * DIVISIONS), "whole", 1)
                sub(m, "backup").append(_dur(int(bar_q * DIVISIONS)))
                write_rest(m, int(bar_q * DIVISIONS), "whole", 2)
                continue

            total = 0
            # 오선(staff 1)을 먼저 다 적고, 되감아 TAB(staff 2)을 같은 자리에 적는다
            for staff in (1, 2):
                if staff == 2:
                    back = sub(m, "backup")
                    back.append(_dur(total))
                    total = 0
                for b in beats:
                    q = beat_quarters(b)
                    dur = int(q * DIVISIONS)
                    tname, dots = duration_type(b)
                    if b.status == gp.models.BeatStatus.rest or not b.notes:
                        write_rest(m, dur, tname, staff)
                    else:
                        for k, note in enumerate(b.notes):
                            write_note(
                                m, note.realValue, dur, tname, dots, staff, k > 0,
                                string=note.string if staff == 2 else None,
                                fret=note.value if staff == 2 else None,
                            )
                    total += dur

    return ET.ElementTree(root)


def _dur(value: int) -> ET.Element:
    el = ET.Element("duration")
    el.text = str(value)
    return el


def main() -> None:
    if len(sys.argv) < 3:
        print(__doc__)
        raise SystemExit(1)

    song = gp.parse(sys.argv[1])
    tracks = [int(a) for a in sys.argv[3:]] or [0]
    tree = convert(song, tracks)
    ET.indent(tree, space="  ")
    tree.write(sys.argv[2], encoding="UTF-8", xml_declaration=True)

    picked = ", ".join(song.tracks[t].name or str(t) for t in tracks)
    print(f"{sys.argv[2]} 저장 — 트랙 [{picked}], "
          f"{len(song.tracks[tracks[0]].measures)}마디")


if __name__ == "__main__":
    main()
