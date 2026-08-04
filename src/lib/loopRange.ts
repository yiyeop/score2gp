/**
 * 마디 단위 A-B 구간 반복의 순수 계산 로직.
 *
 * alphaTab 재생 엔진은 tick(밀리초 아님, 곡 내부 시간 단위) 범위로만 구간을
 * 이해한다(`api.playbackRange`). 사용자는 마디 번호로 구간을 고르므로, 그
 * 변환은 항상 필요하고 실수하기 쉬운 지점(순서 뒤바뀜, 범위 밖 클릭, 마지막
 * 마디의 끝 tick 계산)이라 UI/엔진 연동과 분리해 여기서 검증한다.
 */

/** 정규화된(시작 ≤ 끝, 곡 범위 안) 마디 구간 */
export interface BarRange {
  start: number;
  end: number;
}

/**
 * 사용자가 순서 없이 고른 두 마디를 정렬하고 곡 범위 안으로 자른다.
 *
 * 사용자는 끝 마디를 시작 마디보다 먼저 클릭할 수도 있어서(뒤에서 앞으로
 * 구간을 지정) 순서를 강제하지 않고 여기서 정렬한다.
 */
export function normalizeBarRange(
  a: number,
  b: number,
  barCount: number,
): BarRange | null {
  if (barCount <= 0) return null;
  const clamp = (v: number) => Math.max(0, Math.min(barCount - 1, Math.round(v)));
  const start = clamp(Math.min(a, b));
  const end = clamp(Math.max(a, b));
  return { start, end };
}

/**
 * 마디 구간을 alphaTab의 `playbackRange`(tick)로 바꾼다.
 *
 * `barStarts[i]`는 i번째 마디가 시작하는 tick이다(useAlphaTab이 커서 위치
 * 계산에도 같은 배열을 쓴다). 끝 마디가 곡의 마지막 마디라 다음 마디가
 * 없으면 `totalTicks`(곡 전체 길이)를 끝점으로 쓴다.
 */
export function barRangeToTicks(
  range: BarRange,
  barStarts: number[],
  totalTicks: number,
): { startTick: number; endTick: number } | null {
  if (
    barStarts.length === 0 ||
    range.start < 0 ||
    range.end < range.start ||
    range.end >= barStarts.length
  ) {
    return null;
  }
  const startTick = barStarts[range.start];
  const endTick =
    range.end + 1 < barStarts.length ? barStarts[range.end + 1] : totalTicks;
  return { startTick, endTick };
}
