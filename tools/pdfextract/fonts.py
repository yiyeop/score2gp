"""음악 폰트별 글리프 의미 매핑.

악보 PDF의 음표·쉼표는 음악 폰트의 글리프로 들어 있는데, 코드 체계가
폰트 계열마다 다르다.

- **SMuFL 계열** (Bravura, GPBravura 등): 표준 코드포인트를 쓴다.
  Guitar Pro·MuseScore 등 최신 도구가 이쪽이다.
- **레거시 계열** (Maestro 등): ASCII 자리에 음악 기호를 얹은 옛 방식.
  Finale 계열이 이쪽이다.

빔·기둥은 벡터 선이라 폰트와 무관하므로, 여기서 머리·쉼표·점만
가려내면 리듬 판정 로직은 그대로 쓸 수 있다.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class FontProfile:
    name: str
    heads_black: frozenset[int] = field(default_factory=frozenset)
    # 리듬 슬래시(/) — '직전 화음을 그대로 한 번 더'라는 표기다.
    # 음표처럼 박자를 차지하지만 TAB에 프렛이 적히지 않는다.
    slashes: frozenset[int] = field(default_factory=frozenset)
    heads_half: frozenset[int] = field(default_factory=frozenset)
    heads_whole: frozenset[int] = field(default_factory=frozenset)
    heads_dead: frozenset[int] = field(default_factory=frozenset)
    dots: frozenset[int] = field(default_factory=frozenset)
    rests: dict[int, int] = field(default_factory=dict)   # code → 분모
    flags: dict[int, int] = field(default_factory=dict)   # code → 분모

    @property
    def all_heads(self) -> frozenset[int]:
        return (
            self.heads_black
            | self.heads_half
            | self.heads_whole
            | self.heads_dead
            | self.slashes
        )


# ── SMuFL 표준 (Bravura 계열) ────────────────────────────────
SMUFL = FontProfile(
    name="smufl",
    heads_black=frozenset({0xE0A4}),
    heads_half=frozenset({0xE0A3}),
    heads_whole=frozenset({0xE0A2}),
    heads_dead=frozenset({0xE0A9}),
    dots=frozenset({0xE1E7}),
    rests={
        0xE4E3: 1,
        0xE4E4: 2,
        0xE4E5: 4,
        0xE4E6: 8,
        0xE4E7: 16,
        0xE4E8: 32,
    },
    flags={
        0xE240: 8, 0xE241: 8,
        0xE242: 16, 0xE243: 16,
        0xE244: 32, 0xE245: 32,
    },
)

# ── Maestro (Finale 계열) ────────────────────────────────────
# 글리프를 하나씩 잘라 눈으로 확인해 매핑했다(scratchpad/glyphsheet.py).
# 코드값과 모양 사이에 규칙이 없어서 추측으로는 맞출 수 없다.
#   'œ' 검은 머리(가장 많이 쓰임)   '˙' 흰 2분음표 머리   'w' 온음표
#   U+F0C0 데드 노트(×)            '.' 점                'Œ' 4분쉼표
#   '∑'·U+F0EE 온쉼표·2분쉼표      '&' 높은음자리표       'c' 4/4박자
# 'g'는 덧줄이라 머리가 아니다 — 넣으면 음표 수가 부풀어 오른다.
MAESTRO = FontProfile(
    name="maestro",
    heads_black=frozenset({0x0153}),
    slashes=frozenset({0xF0F3}),
    heads_half=frozenset({0x02D9}),
    heads_whole=frozenset({0x0077}),
    heads_dead=frozenset({0xF0C0}),
    dots=frozenset({0x002E}),
    rests={
        0x2211: 1,   # 온쉼표
        0xF0EE: 2,   # 2분쉼표
        0x0152: 4,   # 4분쉼표
        0x2030: 8,   # 8분쉼표
    },
    flags={0x004A: 8, 0x006A: 8},
)

_PROFILES = (
    ("bravura", SMUFL),
    ("maestro", MAESTRO),
)


def profile_for(font_name: str) -> FontProfile | None:
    """폰트 이름으로 프로파일을 고른다.

    PDF에 박힌 폰트 이름은 'HPCJIL+Maestro'처럼 서브셋 접두사가 붙거나
    'GPBravuraRegular'처럼 변형이 있어서 부분 일치로 찾는다.
    """
    lowered = font_name.lower()
    for key, profile in _PROFILES:
        if key in lowered:
            return profile
    return None
