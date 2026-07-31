import * as alphaTab from "@coderline/alphatab";

export type MarkerKind = "section" | "tone";

export interface TimelineMarker {
  /** 0부터 세는 마디 번호 */
  bar: number;
  kind: MarkerKind;
  /** 화면에 보여줄 짧은 이름 */
  label: string;
  /** 마우스를 올렸을 때 보여줄 설명 */
  detail: string;
  /** 구간 마커는 곡 전체에 적용되므로 없음 */
  trackIndex?: number;
}

/**
 * 기타 악보에서 자주 쓰이는 General MIDI 악기의 한국어 이름.
 * 여기 없는 번호는 "악기 #N"으로 표시한다.
 */
const TONE_NAMES = new Map<number, string>([
  [24, "나일론 어쿠스틱"],
  [25, "스틸 어쿠스틱"],
  [26, "재즈 기타"],
  [27, "클린 기타"],
  [28, "뮤트 기타"],
  [29, "오버드라이브"],
  [30, "디스토션"],
  [31, "하모닉스"],
  [32, "어쿠스틱 베이스"],
  [33, "핑거 베이스"],
  [34, "픽 베이스"],
  [35, "프렛리스 베이스"],
  [80, "신스 리드(사각파)"],
  [81, "신스 리드(톱니파)"],
  [87, "신스 리드(베이스+리드)"],
]);

export function toneName(program: number): string {
  return TONE_NAMES.get(program) ?? `악기 #${program}`;
}

/**
 * 비트 텍스트에서 톤·주법 변화를 가리키는 표현들.
 *
 * Guitar Pro 파일에는 코러스·딜레이 같은 이펙터를 담는 자리가 없어서,
 * 제작자가 비트 텍스트에 글로 적어두는 게 사실상 유일한 방법이다.
 * 보컬 트랙은 같은 자리에 가사를 넣으므로, 아무 텍스트나 가져오지 않고
 * 아래 표현이 포함된 것만 고른다.
 */
const TONE_KEYWORDS = [
  "dist",
  "overdrive",
  "od",
  "drive",
  "clean",
  "crunch",
  "chorus",
  "delay",
  "echo",
  "reverb",
  "phaser",
  "flanger",
  "wah",
  "tremolo",
  "fade in",
  "fade out",
  "volume",
  "quietly",
  "louder",
  "pickup",
  "acoustic",
  "electric",
  "capo",
  "디스토션",
  "오버드라이브",
  "클린",
  "코러스",
  "딜레이",
  "리버브",
  "와우",
  "볼륨",
];

function matchToneKeyword(text: string): string | null {
  const lower = text.toLowerCase();
  for (const kw of TONE_KEYWORDS) {
    if (lower.includes(kw)) return kw;
  }
  return null;
}

/** 텍스트가 너무 길면 마커 라벨로 쓰기 어렵다 */
const MAX_LABEL = 24;

const shorten = (s: string) =>
  s.length > MAX_LABEL ? `${s.slice(0, MAX_LABEL - 1)}…` : s;

/**
 * 악보에서 구간·톤 마커를 뽑아 마디 순으로 돌려준다.
 *
 * 톤 마커의 출처는 두 가지다.
 * 1. Instrument 오토메이션(MIDI 프로그램 체인지) — 기계가 읽을 수 있는 확실한 정보
 * 2. 비트 텍스트 — 이펙터는 여기 글로만 적혀 있다
 */
export function extractMarkers(score: alphaTab.model.Score): TimelineMarker[] {
  const markers: TimelineMarker[] = [];

  for (const mb of score.masterBars) {
    const label = mb.section?.text || mb.section?.marker;
    if (label) {
      markers.push({
        bar: mb.index,
        kind: "section",
        label: shorten(label),
        detail: `구간: ${label}`,
      });
    }
  }

  score.tracks.forEach((track, trackIndex) => {
    // 같은 내용이 연달아 나오면("as before" 반복 등) 처음 것만 남긴다.
    let lastProgram: number | null = null;
    let lastText: string | null = null;

    for (const staff of track.staves) {
      for (const bar of staff.bars) {
        for (const voice of bar.voices) {
          for (const beat of voice.beats) {
            for (const auto of beat.automations) {
              if (auto.type !== alphaTab.model.AutomationType.Instrument)
                continue;
              const program = Math.round(auto.value);
              // 첫 악기 지정은 '변화'가 아니라 시작 톤이라 건너뛴다.
              if (lastProgram !== null && program !== lastProgram) {
                const name = toneName(program);
                markers.push({
                  bar: bar.index,
                  kind: "tone",
                  label: name,
                  detail: `${track.name}: ${toneName(lastProgram)} → ${name}`,
                  trackIndex,
                });
              }
              lastProgram = program;
            }

            const text = beat.text?.trim();
            if (text && text !== lastText && matchToneKeyword(text)) {
              markers.push({
                bar: bar.index,
                kind: "tone",
                label: shorten(text),
                detail: `${track.name}: ${text}`,
                trackIndex,
              });
              lastText = text;
            } else if (text) {
              lastText = text;
            }
          }
        }
      }
    }
  });

  return markers.sort((a, b) => a.bar - b.bar);
}
