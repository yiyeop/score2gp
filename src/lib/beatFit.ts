/**
 * 들은 타격들에 박자 격자를 맞춰 보는 순수 계산 로직.
 *
 * 간격의 중앙값으로 빠르기를 읽는 방법은 실제 연주에 약하다. 사람은 박을
 * 건너뛰고, 사이에 한 번 더 넣고, 기타 어택이 끼어든다 — 간격이 제각각이라
 * 중앙값이 쉽게 흔들린다.
 *
 * 대신 "이 빠르기의 격자에 이 타격들이 얼마나 잘 얹히는가"를 본다. 후보
 * 빠르기마다 각 타격을 원 위의 각도로 바꿔 더한다. 모두 격자에 얹혀 있으면
 * 같은 방향으로 모여 합이 커지고, 제각각이면 서로 지워져 합이 작아진다.
 * 한두 개를 놓치거나 사이에 끼어들어도 나머지가 방향을 지킨다.
 *
 * 후보를 악보 빠르기 언저리로만 두는 것이 두 번째 장치다. 같은 곡을 연주하는
 * 중이므로 실제 빠르기는 거기서 크게 벗어나지 않고, 그 덕에 절반·두 배로
 * 잘못 읽는 일이 아예 생기지 않는다.
 */

/** 격자를 맞춰 본 결과. */
export interface BeatFit {
  /** 가장 잘 맞은 빠르기(BPM). */
  bpm: number;
  /**
   * 격자가 어디서 시작하는지 — 한 박을 1로 봤을 때의 위치(0 이상 1 미만).
   * `time`이 박 위인지 보려면 `(time / 박길이 - phase)`의 소수부를 보면 된다.
   */
  phase: number;
  /**
   * 얼마나 잘 맞았는지(0~1). 모든 타격이 격자에 정확히 얹히면 1,
   * 제각각이면 0에 가깝다.
   */
  strength: number;
}

/** 격자를 맞출 때 보는 시간(초). 너무 길면 빨라진 뒤에도 옛 박을 붙잡는다. */
const WINDOW_SECONDS = 6;

/** 후보 빠르기를 몇 갈래로 나눠 볼지. */
const STEPS = 60;

/**
 * 악보 빠르기 언저리에서 가장 잘 맞는 박자 격자를 찾는다.
 *
 * @param times 타격이 울린 시각들(초, 오름차순)
 * @param referenceBpm 악보에 적힌 빠르기
 * @param spread 악보에서 벗어나도 되는 비율(0.25 = ±25%)
 */
export function fitBeat(
  times: number[],
  referenceBpm: number,
  spread = 0.25,
): BeatFit | null {
  if (referenceBpm <= 0 || times.length < 4) return null;

  const latest = times[times.length - 1];
  const recent = times.filter((t) => latest - t <= WINDOW_SECONDS);
  if (recent.length < 4) return null;

  let best: BeatFit | null = null;
  for (let i = 0; i <= STEPS; i++) {
    const bpm = referenceBpm * (1 - spread + (2 * spread * i) / STEPS);
    const period = 60 / bpm;

    // 각 타격을 한 박을 한 바퀴로 보는 각도로 바꿔 더한다.
    let re = 0;
    let im = 0;
    for (const t of recent) {
      const angle = (2 * Math.PI * t) / period;
      re += Math.cos(angle);
      im += Math.sin(angle);
    }
    const strength = Math.hypot(re, im) / recent.length;
    if (!best || strength > best.strength) {
      let phase = Math.atan2(im, re) / (2 * Math.PI);
      if (phase < 0) phase += 1;
      best = { bpm, phase, strength };
    }
  }
  return best;
}

/**
 * 어떤 시각이 격자의 박에서 얼마나 떨어져 있는지(박 단위, -0.5 ~ 0.5).
 *
 * 0에 가까우면 박 위에 떨어진 타격이고, ±0.5에 가까우면 박과 박 사이(예를
 * 들어 8비트의 '엔')다. 어느 타격을 믿고 커서를 맞출지 가릴 때 쓴다.
 */
export function offsetFromBeat(time: number, fit: BeatFit): number {
  const period = 60 / fit.bpm;
  const position = time / period - fit.phase;
  const fraction = position - Math.floor(position);
  return fraction > 0.5 ? fraction - 1 : fraction;
}
