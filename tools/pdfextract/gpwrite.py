"""조립한 Song을 Guitar Pro 5 파일로 쓴다.

추출 단계의 결과(`assemble.Song`)를 PyGuitarPro의 모델로 옮겨 `.gp5`로 저장한다.
이 파일이 나와야 실제로 앱에서 열어 소리로 검증할 수 있다.

한계
- 밴딩·슬라이드 같은 주법은 아직 넣지 않는다. 음정과 리듬만 옮긴다.
- 조율은 표준 튜닝으로 고정한다(PDF에서 조율을 아직 안 읽는다).
"""

from __future__ import annotations

from fractions import Fraction

import guitarpro as gp

from assemble import Part, Song
from notes import Beat

# 표준 튜닝 (1번 현 = 가장 높은 음). PyGuitarPro의 strings는 이 순서를 쓴다.
STANDARD_TUNING = [64, 59, 55, 50, 45, 40]  # E4 B3 G3 D3 A2 E2

# 4분음표를 1로 봤을 때의 길이 → (Duration.value, isDotted)
# Duration.value는 온음표를 1로 하는 분모다. 4 = 4분음표.
_DURATION_TABLE: list[tuple[Fraction, int, bool]] = [
    (Fraction(4), 1, False),      # 온음표
    (Fraction(6), 1, True),
    (Fraction(2), 2, False),      # 2분음표
    (Fraction(3), 2, True),
    (Fraction(1), 4, False),      # 4분음표
    (Fraction(3, 2), 4, True),
    (Fraction(1, 2), 8, False),   # 8분음표
    (Fraction(3, 4), 8, True),
    (Fraction(1, 4), 16, False),  # 16분음표
    (Fraction(3, 8), 16, True),
    (Fraction(1, 8), 32, False),
    (Fraction(3, 16), 32, True),
    (Fraction(1, 16), 64, False),
]


def quarters_to_duration(quarters: float) -> gp.models.Duration:
    """길이(4분음표=1)를 가장 가까운 GP 음표 길이로 바꾼다.

    밴딩 목표음을 흡수한 박자는 1/4+1/8처럼 표준 음표로 딱 떨어지지 않는
    값이 나올 수 있다. 그럴 때는 가장 가까운 표준 길이로 반올림한다.
    """
    q = Fraction(quarters).limit_denominator(64)
    best = min(_DURATION_TABLE, key=lambda row: abs(row[0] - q))
    return gp.models.Duration(value=best[1], isDotted=best[2])


def _string_to_gp(string: int) -> int:
    """TAB의 현 번호(1 = 가장 높은 음)를 그대로 쓴다.

    PyGuitarPro도 1번을 가장 높은 현으로 센다.
    """
    return string


def _fill_measure(measure: gp.models.Measure, beats: list[Beat]) -> None:
    voice = measure.voices[0]
    voice.beats.clear()

    for b in beats:
        gbeat = gp.models.Beat(voice=voice)
        gbeat.duration = quarters_to_duration(b.quarters)

        if b.is_rest or not b.notes:
            # 프렛을 못 읽은 음은 쉼표로 둔다. 소리를 지어내는 것보다
            # 비워 두는 편이 원본과의 차이를 확인하기 쉽다.
            gbeat.status = gp.models.BeatStatus.rest
        else:
            gbeat.status = gp.models.BeatStatus.normal
            for n in b.notes:
                note = gp.models.Note(beat=gbeat)
                note.string = _string_to_gp(n.string)
                if n.dead:
                    note.value = 0
                    note.type = gp.models.NoteType.dead
                else:
                    note.value = n.fret
                    note.type = gp.models.NoteType.normal
                gbeat.notes.append(note)

        voice.beats.append(gbeat)


def build_gp_song(song: Song, only_tab: bool = True) -> gp.models.Song:
    """추출 결과를 PyGuitarPro의 Song으로 옮긴다."""
    parts: list[Part] = [p for p in song.parts if p.has_tab or not only_tab]
    if not parts:
        raise ValueError("TAB이 있는 악기를 찾지 못했습니다")

    bar_count = max(len(p.bars) for p in parts)

    out = gp.models.Song()
    out.title = song.title or ""
    if song.tempo:
        out.tempo = song.tempo

    # 마디 헤더를 곡 길이만큼 확보한다
    base_header = out.measureHeaders[0]
    while len(out.measureHeaders) < bar_count:
        import copy

        h = copy.deepcopy(base_header)
        h.number = len(out.measureHeaders) + 1
        out.measureHeaders.append(h)

    template = out.tracks[0]
    out.tracks.clear()

    import copy

    for i, part in enumerate(parts):
        track = copy.deepcopy(template)
        track.song = out
        track.number = i + 1
        track.name = part.name or f"Guitar {i + 1}"
        track.channel.channel = min(i * 2, 15)
        track.channel.effectChannel = min(i * 2 + 1, 15)

        track.strings = [
            gp.models.GuitarString(number=s + 1, value=v)
            for s, v in enumerate(STANDARD_TUNING)
        ]

        track.measures.clear()
        for bi in range(bar_count):
            measure = copy.deepcopy(template.measures[0])
            measure.track = track
            measure.header = out.measureHeaders[bi]
            beats = part.bars[bi].beats if bi < len(part.bars) else []
            _fill_measure(measure, beats)
            track.measures.append(measure)

        out.tracks.append(track)

    return out


def write_gp5(
    song: Song, path: str, only_tab: bool = True, encoding: str = "cp949"
) -> gp.models.Song:
    """GP5로 저장한다.

    GP5는 문자열을 UTF-8이 아닌 로컬 인코딩으로 담는다. 기본값(cp1252)으로는
    한글 제목·트랙명을 쓸 수 없어 인코딩을 명시한다. 앱 쪽 리더는 이미
    EUC-KR/CP949 자동 판별을 하므로 그대로 읽힌다.
    """
    out = build_gp_song(song, only_tab=only_tab)
    gp.write(out, path, encoding=encoding)
    return out
