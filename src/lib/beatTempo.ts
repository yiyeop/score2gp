/**
 * 킥이 울린 시각들로 연주의 빠르기를 읽는 순수 계산 로직.
 *
 * 사람이 치는 킥은 간격이 들쭉날쭉하고, 한 박을 건너뛰거나 사이에 한 번 더
 * 넣기도 한다. 그래서 평균이 아니라 중앙값을 쓴다 — 한두 번 어긋난 간격이
 * 전체 추정을 끌고 가지 않는다.
 */

/** 사람이 연주하는 곡의 빠르기 범위. 이 밖으로 나가면 배수를 잘못 본 것이다. */
export const BPM_MIN = 50;
export const BPM_MAX = 210;

/** 빠르기를 추정하는 데 쓰는 최근 간격 개수 (4/4 두 마디쯤). */
const WINDOW = 8;

/** 최근 시각들에서 간격의 중앙값(초). 간격이 둘도 안 되면 null. */
function medianGap(times: number[]): number | null {
  const recent = times.slice(-(WINDOW + 1));
  const gaps: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    const gap = recent[i] - recent[i - 1];
    if (gap > 0) gaps.push(gap);
  }
  if (gaps.length < 2) return null;

  const sorted = [...gaps].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return median > 0 ? median : null;
}

/**
 * 최근 킥 시각들(초)에서 BPM을 추정한다. 아직 모르면 null.
 *
 * 킥이 매 박에 오지는 않는다. 8비트 패턴은 반 박에, 느린 곡은 두 박에 한 번
 * 오기도 해서 간격을 그대로 BPM으로 보면 두 배나 절반으로 어긋난다.
 * 사람이 연주하는 범위(50~210)로 들어올 때까지 2배·1/2배로 접는다.
 */
export function estimateBpm(times: number[]): number | null {
  if (times.length < 3) return null;
  const median = medianGap(times);
  if (median === null) return null;

  let bpm = 60 / median;
  while (bpm < BPM_MIN) bpm *= 2;
  while (bpm > BPM_MAX) bpm /= 2;
  if (bpm < BPM_MIN || bpm > BPM_MAX) return null;
  return bpm;
}

/**
 * 최근 킥들이 고른 박으로 들리는지 본다.
 *
 * 따라가기를 시작하기 전에 확인하는 값이다. 말소리·의자 끄는 소리처럼
 * 우연히 잡힌 소리는 간격이 제각각이라 여기서 걸러진다. 값이 작을수록
 * 고르다 — 0.15는 간격이 중앙값에서 평균 15%쯤 어긋났다는 뜻이다.
 */
export function beatSpread(times: number[]): number | null {
  if (times.length < 4) return null;
  const median = medianGap(times);
  if (median === null) return null;

  const recent = times.slice(-(WINDOW + 1));
  const gaps: number[] = [];
  for (let i = 1; i < recent.length; i++) gaps.push(recent[i] - recent[i - 1]);

  // 반 박에 들어온 킥(8비트의 '엔')은 어긋난 것이 아니라 절반 간격이다.
  // 가장 가까운 배수로 접은 뒤 남은 오차만 본다.
  const errors = gaps.map((gap) => {
    const ratio = gap / median;
    const folded = ratio < 0.75 ? ratio * 2 : ratio > 1.5 ? ratio / 2 : ratio;
    return Math.abs(folded - 1);
  });
  return errors.reduce((a, b) => a + b, 0) / errors.length;
}
