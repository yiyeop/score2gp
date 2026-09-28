/**
 * 타격이 울린 시각들로 연주의 빠르기를 읽는 순수 계산 로직.
 *
 * 사람이 치는 리듬은 간격이 들쭉날쭉하고, 한 박을 건너뛰거나 사이에 한 번 더
 * 넣기도 한다. 그래서 평균이 아니라 중앙값을 쓴다 — 한두 번 어긋난 간격이
 * 전체 추정을 끌고 가지 않는다.
 *
 * 간격만으로는 그 값이 한 박인지 반 박인지 알 수 없다. 대신 우리는 지금 어떤
 * 곡을 보고 있는지 안다 — 같은 곡을 연주하는 중이므로 실제 빠르기는 악보에
 * 적힌 값 언저리다. 그래서 배수를 악보 쪽으로 접는다([foldToReference]).
 */

/** 악보 빠르기에서 이만큼까지 벗어나는 연주는 받아들인다. */
export const TEMPO_TOLERANCE = 0.25;

/** 빠르기를 추정하는 데 쓰는 최근 간격 개수. */
const WINDOW = 12;

/**
 * 간격이 한 박의 몇 배인지 — 절반과 두 배만 둔다.
 *
 * 3분할까지 넣으면 후보가 촘촘해져서 어떤 값이든 '어느 배수엔가 가깝다'가
 * 되고, 그러면 박을 잘못 짚은 경우를 가려낼 수 없다.
 */
const SUBDIVISIONS = [1 / 4, 1 / 2, 1, 2, 4];

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
 * 읽은 빠르기를 악보 쪽으로 접는다. 너무 멀면 null.
 *
 * 간격이 반 박이면 두 배로, 두 박이면 절반으로 읽힌 것이다. 어느 쪽인지는
 * 소리만으로 알 수 없지만, 악보에 적힌 빠르기가 있으니 거기서 가장 가까운
 * 배수를 고르면 된다. 합주에서 빠르기가 악보와 25% 넘게 벌어지는 일은
 * 드물고, 그렇게 멀면 애초에 박을 잘못 짚은 것이다.
 */
export function foldToReference(
  bpm: number,
  referenceBpm: number,
  tolerance = TEMPO_TOLERANCE,
): number | null {
  if (bpm <= 0 || referenceBpm <= 0) return null;

  let best: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const factor of SUBDIVISIONS) {
    const candidate = bpm * factor;
    const distance = Math.abs(candidate - referenceBpm) / referenceBpm;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best !== null && bestDistance <= tolerance ? best : null;
}

/**
 * 최근 타격 시각들(초)에서 BPM을 추정한다. 아직 모르면 null.
 *
 * 악보의 빠르기를 함께 주면 배수를 그쪽으로 접어 돌려준다 — 같은 곡을
 * 연주하는 중이라는 사실이 가장 믿을 만한 단서다.
 */
export function estimateBpm(
  times: number[],
  referenceBpm?: number,
): number | null {
  if (times.length < 3) return null;
  const median = medianGap(times);
  if (median === null) return null;

  const raw = 60 / median;
  if (referenceBpm && referenceBpm > 0) return foldToReference(raw, referenceBpm);

  // 기준이 없으면 사람이 연주하는 범위로만 접는다.
  let bpm = raw;
  while (bpm < 50) bpm *= 2;
  while (bpm > 210) bpm /= 2;
  return bpm >= 50 && bpm <= 210 ? bpm : null;
}

/**
 * 최근 타격들이 고른 박으로 들리는지 본다.
 *
 * 따라가기를 시작하기 전에 확인하는 값이다. 말소리·의자 끄는 소리처럼
 * 우연히 잡힌 소리는 간격이 제각각이라 여기서 걸러진다. 값이 작을수록
 * 고르다 — 0.15는 간격이 박의 배수에서 평균 15%쯤 어긋났다는 뜻이다.
 */
export function beatSpread(times: number[]): number | null {
  if (times.length < 4) return null;
  const median = medianGap(times);
  if (median === null) return null;

  const recent = times.slice(-(WINDOW + 1));
  const gaps: number[] = [];
  for (let i = 1; i < recent.length; i++) gaps.push(recent[i] - recent[i - 1]);

  // 반 박이나 두 박에 들어온 타격은 어긋난 것이 아니라 세분이다. 가장 가까운
  // 세분으로 접은 뒤 남은 오차만 본다. 여기서는 후보를 좁게 잡는다 — 후보가
  // 촘촘하면 아무 간격이나 '어떤 세분에는 가깝다'가 되어, 제각각인 소음까지
  // 고른 박으로 보이게 된다.
  const errors = gaps.map((gap) => {
    const ratio = gap / median;
    let closest = Number.POSITIVE_INFINITY;
    for (const sub of [1 / 2, 1, 2]) {
      closest = Math.min(closest, Math.abs(ratio / sub - 1));
    }
    return closest;
  });
  return errors.reduce((a, b) => a + b, 0) / errors.length;
}
