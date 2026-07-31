import * as alphaTab from "@coderline/alphatab";

const {
  HarmonicType,
  SlideInType,
  SlideOutType,
  VibratoType,
  BendType,
  GraceType,
  BrushType,
  WhammyType,
  FadeType,
} = alphaTab.model;

export interface Technique {
  /** 중복 제거용 키 */
  id: string;
  /** 악보에 흔히 쓰이는 표기 (예: "P.H.") */
  short: string;
  /** 한국어 이름 */
  name: string;
  /** 초보자용 한 줄 설명 */
  hint: string;
}

const T = (id: string, short: string, name: string, hint: string): Technique => ({
  id,
  short,
  name,
  hint,
});

/**
 * 기타 악보에 나오는 주법 사전.
 *
 * 설명은 "이 기호를 보면 손으로 뭘 해야 하는지"를 기준으로 썼다.
 * 음악 용어를 모르는 사람이 읽는다고 가정한다.
 */
export const TECHNIQUES = {
  slideShift: T(
    "slideShift",
    "slide",
    "슬라이드",
    "누른 손가락을 떼지 않고 다음 프렛까지 줄 위를 미끄러뜨립니다. 두 음이 이어져 들려요.",
  ),
  slideLegato: T(
    "slideLegato",
    "legato slide",
    "레가토 슬라이드",
    "미끄러뜨리되 도착한 음은 다시 튕기지 않습니다. 더 부드럽게 이어집니다.",
  ),
  slideIn: T(
    "slideIn",
    "slide in",
    "슬라이드 인",
    "목표 음보다 아래(또는 위)에서 미끄러져 들어와 그 음에 도착합니다.",
  ),
  slideOut: T(
    "slideOut",
    "slide out",
    "슬라이드 아웃",
    "음을 낸 뒤 손가락을 미끄러뜨리며 음정을 흘려 내보냅니다.",
  ),
  pickSlide: T(
    "pickSlide",
    "P.S.",
    "피크 슬라이드",
    "피크의 옆면을 줄에 대고 길게 긁습니다. 쇠 긁히는 소리가 납니다.",
  ),
  hammerPull: T(
    "hammerPull",
    "H / P",
    "해머온 · 풀오프",
    "피크로 튕기지 않고 왼손으로 지판을 때리거나(해머온) 튕기듯 떼서(풀오프) 소리를 냅니다.",
  ),
  tap: T(
    "tap",
    "T",
    "태핑",
    "오른손 손가락으로 지판을 직접 두드려 소리를 냅니다.",
  ),
  leftHandTap: T(
    "leftHandTap",
    "L.H.T.",
    "왼손 태핑",
    "왼손만으로 지판을 두드려 소리를 냅니다. 피크는 쓰지 않아요.",
  ),
  harmonicNatural: T(
    "harmonicNatural",
    "N.H.",
    "내추럴 하모닉스",
    "12·7·5프렛 위에 손가락을 살짝 얹은 채로 튕깁니다. 맑은 종소리가 납니다.",
  ),
  harmonicArtificial: T(
    "harmonicArtificial",
    "A.H.",
    "인공 하모닉스",
    "왼손으로 음을 누른 채, 오른손으로 한 옥타브 위 지점을 짚으며 튕깁니다.",
  ),
  harmonicPinch: T(
    "harmonicPinch",
    "P.H.",
    "피킹 하모닉스",
    "피크를 잡은 엄지를 줄에 살짝 스치며 튕깁니다. 째지는 듯한 고음이 납니다.",
  ),
  harmonicTap: T(
    "harmonicTap",
    "T.H.",
    "탭 하모닉스",
    "누른 음에서 정확히 12프렛 위 지점을 손가락으로 톡 쳐서 하모닉스를 냅니다.",
  ),
  bend: T(
    "bend",
    "bend",
    "밴딩(초킹)",
    "누른 줄을 위아래로 밀어 음을 올립니다. 표시된 숫자만큼 음이 올라가요.",
  ),
  vibrato: T(
    "vibrato",
    "vib.",
    "비브라토",
    "누른 손가락을 좌우로 떨어 음을 흔듭니다.",
  ),
  whammy: T(
    "whammy",
    "w/bar",
    "와미바(트레몰로 암)",
    "기타에 달린 암을 눌렀다 놓아 음 전체를 흔들거나 떨어뜨립니다.",
  ),
  palmMute: T(
    "palmMute",
    "P.M.",
    "팜 뮤트",
    "오른손 손날을 브리지 근처 줄에 얹고 튕깁니다. 답답하고 짧은 소리가 납니다.",
  ),
  letRing: T(
    "letRing",
    "let ring",
    "레트 링",
    "친 음을 손으로 막지 말고 계속 울리게 둡니다.",
  ),
  deadNote: T(
    "deadNote",
    "×",
    "데드 노트",
    "줄을 누르지 않고 살짝 막은 채 튕깁니다. 음정 없이 '툭' 소리만 납니다.",
  ),
  ghostNote: T(
    "ghostNote",
    "( )",
    "고스트 노트",
    "아주 여리게 스치듯 치는 음입니다. 리듬만 살짝 채워줍니다.",
  ),
  staccato: T(
    "staccato",
    "stacc.",
    "스타카토",
    "음을 짧게 끊어서 냅니다.",
  ),
  trill: T(
    "trill",
    "tr",
    "트릴",
    "두 음을 해머온·풀오프로 아주 빠르게 번갈아 냅니다.",
  ),
  tremoloPicking: T(
    "tremoloPicking",
    "trem.",
    "트레몰로 피킹",
    "같은 음을 피크로 아주 빠르게 반복해서 튕깁니다.",
  ),
  slap: T(
    "slap",
    "S",
    "슬랩",
    "엄지로 줄을 때려 타악기 같은 소리를 냅니다. 주로 베이스에서 씁니다.",
  ),
  pop: T(
    "pop",
    "P",
    "팝",
    "손가락으로 줄을 잡아당겼다 놓아 튕겨냅니다. 슬랩과 짝으로 씁니다.",
  ),
  brush: T(
    "brush",
    "strum",
    "브러시(스트로크)",
    "여러 줄을 한 번에 쓸어내리거나 쓸어올립니다.",
  ),
  grace: T(
    "grace",
    "grace",
    "꾸밈음",
    "박자를 거의 차지하지 않는 짧은 장식음입니다. 본 음 직전에 스치듯 냅니다.",
  ),
  fadeIn: T(
    "fadeIn",
    "fade in",
    "페이드 인",
    "볼륨 노브를 0에서 서서히 올려 소리가 스며들게 합니다.",
  ),
} satisfies Record<string, Technique>;

/** 한 비트에 쓰인 주법을 모은다 (비트 자체 + 그 비트의 모든 음) */
export function techniquesOfBeat(beat: alphaTab.model.Beat): Technique[] {
  const found = new Map<string, Technique>();
  const add = (t: Technique) => found.set(t.id, t);

  if (beat.tap) add(TECHNIQUES.tap);
  if (beat.slap) add(TECHNIQUES.slap);
  if (beat.pop) add(TECHNIQUES.pop);
  if (beat.isPalmMute) add(TECHNIQUES.palmMute);
  if (beat.isLetRing) add(TECHNIQUES.letRing);
  if (beat.vibrato !== VibratoType.None) add(TECHNIQUES.vibrato);
  if (beat.whammyBarType !== WhammyType.None) add(TECHNIQUES.whammy);
  if (beat.brushType !== BrushType.None) add(TECHNIQUES.brush);
  if (beat.graceType !== GraceType.None) add(TECHNIQUES.grace);
  if (beat.tremoloSpeed !== null) add(TECHNIQUES.tremoloPicking);
  if (beat.fade === FadeType.FadeIn) add(TECHNIQUES.fadeIn);

  for (const note of beat.notes) {
    if (note.isPalmMute) add(TECHNIQUES.palmMute);
    if (note.isLetRing) add(TECHNIQUES.letRing);
    if (note.isDead) add(TECHNIQUES.deadNote);
    if (note.isGhost) add(TECHNIQUES.ghostNote);
    if (note.isStaccato) add(TECHNIQUES.staccato);
    if (note.isHammerPullOrigin) add(TECHNIQUES.hammerPull);
    if (note.isLeftHandTapped) add(TECHNIQUES.leftHandTap);
    if (note.trillValue >= 0) add(TECHNIQUES.trill);
    if (note.vibrato !== VibratoType.None) add(TECHNIQUES.vibrato);
    if (note.bendType !== BendType.None) add(TECHNIQUES.bend);

    switch (note.harmonicType) {
      case HarmonicType.Natural:
        add(TECHNIQUES.harmonicNatural);
        break;
      case HarmonicType.Artificial:
        add(TECHNIQUES.harmonicArtificial);
        break;
      case HarmonicType.Pinch:
        add(TECHNIQUES.harmonicPinch);
        break;
      case HarmonicType.Tap:
        add(TECHNIQUES.harmonicTap);
        break;
    }

    if (
      note.slideInType === SlideInType.IntoFromBelow ||
      note.slideInType === SlideInType.IntoFromAbove
    ) {
      add(TECHNIQUES.slideIn);
    }

    switch (note.slideOutType) {
      case SlideOutType.Shift:
        add(TECHNIQUES.slideShift);
        break;
      case SlideOutType.Legato:
        add(TECHNIQUES.slideLegato);
        break;
      case SlideOutType.OutUp:
      case SlideOutType.OutDown:
        add(TECHNIQUES.slideOut);
        break;
      case SlideOutType.PickSlideDown:
      case SlideOutType.PickSlideUp:
        add(TECHNIQUES.pickSlide);
        break;
    }
  }

  return [...found.values()];
}

export interface TechniqueUsage extends Technique {
  /** 이 주법이 처음 나오는 마디 (0부터) */
  firstBar: number;
  count: number;
}

/** 트랙 전체에서 쓰인 주법을 처음 나오는 순서대로 모은다 */
export function techniquesOfTrack(
  track: alphaTab.model.Track,
): TechniqueUsage[] {
  const usage = new Map<string, TechniqueUsage>();

  for (const staff of track.staves) {
    for (const bar of staff.bars) {
      for (const voice of bar.voices) {
        for (const beat of voice.beats) {
          for (const t of techniquesOfBeat(beat)) {
            const prev = usage.get(t.id);
            if (prev) prev.count++;
            else usage.set(t.id, { ...t, firstBar: bar.index, count: 1 });
          }
        }
      }
    }
  }

  return [...usage.values()].sort((a, b) => a.firstBar - b.firstBar);
}
