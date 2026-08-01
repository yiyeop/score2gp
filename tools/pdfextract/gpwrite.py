"""조립한 Song을 Guitar Pro 5 파일로 쓴다.

추출 단계의 결과(`assemble.Song`)를 PyGuitarPro의 모델로 옮겨 `.gp5`로 저장한다.
이 파일이 나와야 실제로 앱에서 열어 소리로 검증할 수 있다.

옮기는 것
- 음정·리듬, 조율
- 주법: 팜뮤트·레트링·해머온·슬라이드·밴딩
- 톤 지시: 음색에 대응하는 것은 악기 변경으로, 나머지는 글로

한계
- 밴딩의 시간 곡선은 PDF에 없어서 '올려서 유지'하는 표준 모양으로 만든다.
- 잇단음표(셋잇단 등) 미지원.
"""

from __future__ import annotations

from fractions import Fraction

import guitarpro as gp

from annotations import TONE_PROGRAMS
from assemble import Part, Song
from notes import Beat
from tuning import STANDARD_TUNING, parse_tuning

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


# 밴딩 표기 → 반음 수. 'full'은 온음(2반음)이 관례다.
_BEND_AMOUNTS = {
    "full": 2.0,
    "1": 2.0,
    "1/2": 1.0,
    "1/4": 0.5,
    "1 1/2": 3.0,
    "2": 4.0,
}


def bend_semitones(text: str) -> float | None:
    return _BEND_AMOUNTS.get(text.strip().lower())


def _make_bend(semitones: float) -> gp.models.BendEffect:
    """가장 흔한 모양의 밴딩을 만든다 — 쳐서 올린 뒤 유지.

    PDF에는 밴딩의 시간 곡선이 없고 도달 음정만 적혀 있어서, 표준적인
    '중간에 올려서 끝까지 유지' 형태로 만든다.
    """
    value = int(round(semitones * gp.models.BendEffect.semitoneLength))
    return gp.models.BendEffect(
        type=gp.models.BendType.bend,
        value=value,
        points=[
            gp.models.BendPoint(position=0, value=0),
            gp.models.BendPoint(position=6, value=value),
            gp.models.BendPoint(position=12, value=value),
        ],
    )


def _apply_note_effects(
    note: gp.models.Note, beat: Beat, next_beat: Beat | None
) -> None:
    """주법 표시를 음표 이펙트로 옮긴다."""
    fx = note.effect
    if beat.has("palm_mute"):
        fx.palmMute = True
    if beat.has("let_ring"):
        fx.letRing = True
    if beat.has("hammer"):
        fx.hammer = True

    # 데드 노트는 음정이 없어서 밴딩·슬라이드가 성립하지 않는다.
    if note.type is not gp.models.NoteType.dead:
        for kind, text in beat.marks:
            if kind == "bend":
                amount = bend_semitones(text)
                if amount:
                    fx.bend = _make_bend(amount)
                break

    if beat.has("slide"):
        # GP는 슬라이드의 도착 프렛을 따로 저장하지 않는다. 같은 현의 다음
        # 음이 곧 도착점이라, 이어지는 음이 없는 현에 걸면 '갈 곳 없는
        # 슬라이드'가 된다. 그래서 다음 음이 같은 현에 있을 때만 건다.
        lands = next_beat is not None and any(
            n.string == note.string and not n.dead for n in next_beat.notes
        )
        if lands:
            fx.slides = [gp.models.SlideType.shiftSlideTo]


def _apply_tone(gbeat: gp.models.Beat, tone: str) -> None:
    """톤 지시를 음색 변경으로 옮긴다.

    Delay·Chorus 같은 이펙터는 GP5의 믹스 테이블에 자리가 없거나 강도를
    알 수 없어서, 소리를 바꾸는 대신 글로 남긴다. 최소한 악보에는 원본처럼
    보이고, 나중에 더 정확히 옮길 때 근거로도 쓸 수 있다.
    """
    program = TONE_PROGRAMS.get(tone.strip().lower())
    if program is None:
        return
    change = gp.models.MixTableChange()
    change.instrument = gp.models.MixTableItem(value=program)
    gbeat.effect.mixTableChange = change


def _fill_measure(
    measure: gp.models.Measure,
    beats: list[Beat],
    next_bar_first: Beat | None = None,
) -> None:
    """마디 하나를 채운다.

    슬라이드는 다음 음이 어디에 떨어지는지 알아야 해서, 마디 끝 음을 위해
    다음 마디의 첫 음까지 받는다.
    """
    voice = measure.voices[0]
    voice.beats.clear()

    for i, b in enumerate(beats):
        following = beats[i + 1] if i + 1 < len(beats) else next_bar_first
        gbeat = gp.models.Beat(voice=voice)
        gbeat.duration = quarters_to_duration(b.quarters)

        # 악보에 적힌 지시는 글로도 남긴다. 원본과 대조하기 쉽고,
        # GP 이펙트로 옮기지 못한 것(Delay 등)도 정보가 사라지지 않는다.
        labels = [t for k, t in b.marks if k in ("tone", "bend", "chord")]
        if labels:
            gbeat.text = " ".join(dict.fromkeys(labels))

        tone = b.tone
        if tone:
            _apply_tone(gbeat, tone)

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
                _apply_note_effects(note, b, following)
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

        tuning = song.tuning or STANDARD_TUNING
        track.strings = [
            gp.models.GuitarString(number=s + 1, value=v)
            for s, v in enumerate(tuning)
        ]

        track.measures.clear()
        for bi in range(bar_count):
            measure = copy.deepcopy(template.measures[0])
            measure.track = track
            measure.header = out.measureHeaders[bi]
            beats = part.bars[bi].beats if bi < len(part.bars) else []
            nxt = part.bars[bi + 1].beats if bi + 1 < len(part.bars) else []
            _fill_measure(measure, beats, nxt[0] if nxt else None)
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
