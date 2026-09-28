/**
 * 들은 소리에 박자 격자를 맞춰 보는 순수 계산 로직.
 *
 * "이 빠르기의 격자에 소리가 얼마나 잘 얹히는가"를 본다. 후보 빠르기마다
 * 각 시점을 원 위의 각도로 바꿔 그 순간의 세기만큼 더한다. 박마다 소리가
 * 커지면 같은 방향으로 모여 합이 커지고, 아무 데서나 커지면 서로 지워져
 * 합이 작아진다.
 *
 * 문턱을 넘긴 '타격'만 세지 않고 커지는 정도를 그대로 쓰는 것이 중요하다.
 * 실제 합주 음원에서는 킥이 다른 소리에 묻혀 문턱을 못 넘는 일이 잦은데,
 * 그렇게 세면 근거가 초당 한두 개로 줄어 격자가 흔들린다. 반대로 문턱을
 * 낮추면 잡음까지 섞인다. 크기를 그대로 두면 작은 소리는 작게, 큰 소리는
 * 크게 반영되어 그 사이에서 고를 필요가 없다.
 *
 * 후보를 악보 빠르기 언저리로만 두는 것이 두 번째 장치다. 같은 곡을 연주하는
 * 중이므로 실제 빠르기는 거기서 크게 벗어나지 않고, 그 덕에 절반·두 배로
 * 잘못 읽는 일이 아예 생기지 않는다.
 */

/** 격자를 맞출 때 쓰는 한 점 — 그 시각에 소리가 얼마나 커졌는지. */
export interface BeatSample {
  time: number;
  /** 커진 정도(0 이상). 0이면 그 순간은 아무것도 말해 주지 않는다. */
  weight: number;
}

/** 격자를 맞춰 본 결과. */
export interface BeatFit {
  /** 가장 잘 맞은 빠르기(BPM). */
  bpm: number;
  /**
   * 격자가 어디서 시작하는지 — 한 박을 1로 봤을 때의 위치(0 이상 1 미만).
   * `time`이 박 위인지 보려면 [offsetFromBeat]를 쓴다.
   */
  phase: number;
  /**
   * 얼마나 잘 맞았는지(0~1). 소리가 커지는 순간이 모두 격자에 얹히면 1,
   * 아무 데서나 커지면 0에 가깝다.
   */
  strength: number;
  /**
   * 다른 빠르기보다 얼마나 뾰족하게 두드러지는지(1이면 아무 데나 똑같다).
   *
   * 이 값으로 판단하는 이유는 절대값이 소리마다 다르기 때문이다. 같은 연주도
   * 마이크가 멀면 0.2, 가까우면 0.6이 나오는데, '다른 후보들보다 얼마나
   * 두드러지는가'는 그런 사정에 휘둘리지 않는다.
   */
  sharpness: number;
}

/** 격자를 맞출 때 보는 시간(초). 너무 길면 빨라진 뒤에도 옛 박을 붙잡는다. */
export const FIT_WINDOW = 6;

/** 후보 빠르기를 몇 갈래로 나눠 볼지. */
const STEPS = 72;

/**
 * 악보 빠르기 언저리에서 가장 잘 맞는 박자 격자를 찾는다.
 *
 * @param samples 시간순 (시각, 커진 정도) 목록
 * @param referenceBpm 악보에 적힌 빠르기
 * @param spread 악보에서 벗어나도 되는 비율(0.25 = ±25%)
 */
export function fitBeat(
  samples: BeatSample[],
  referenceBpm: number,
  spread = 0.25,
): BeatFit | null {
  if (referenceBpm <= 0 || samples.length === 0) return null;

  const latest = samples[samples.length - 1].time;
  const recent = samples.filter(
    (s) => latest - s.time <= FIT_WINDOW && s.weight > 0,
  );
  if (recent.length < 8) return null;

  let total = 0;
  for (const s of recent) total += s.weight;
  if (total <= 0) return null;

  const scores: number[] = [];
  let best: BeatFit | null = null;
  for (let i = 0; i <= STEPS; i++) {
    const bpm = referenceBpm * (1 - spread + (2 * spread * i) / STEPS);
    const period = 60 / bpm;

    let re = 0;
    let im = 0;
    for (const s of recent) {
      const angle = (2 * Math.PI * s.time) / period;
      re += s.weight * Math.cos(angle);
      im += s.weight * Math.sin(angle);
    }
    const strength = Math.hypot(re, im) / total;
    scores.push(strength);
    if (!best || strength > best.strength) {
      let phase = Math.atan2(im, re) / (2 * Math.PI);
      if (phase < 0) phase += 1;
      best = { bpm, phase, strength, sharpness: 1 };
    }
  }
  if (!best) return null;

  const sorted = [...scores].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  best.sharpness = median > 0 ? best.strength / median : 1;
  return best;
}

/**
 * 어떤 시각이 격자의 박에서 얼마나 떨어져 있는지(박 단위, -0.5 ~ 0.5).
 *
 * 0에 가까우면 박 위에 떨어진 소리이고, ±0.5에 가까우면 박과 박 사이(예를
 * 들어 8비트의 '엔')다. 어느 소리를 믿고 커서를 맞출지 가릴 때 쓴다.
 */
export function offsetFromBeat(time: number, fit: BeatFit): number {
  const period = 60 / fit.bpm;
  const position = time / period - fit.phase;
  const fraction = position - Math.floor(position);
  return fraction > 0.5 ? fraction - 1 : fraction;
}
