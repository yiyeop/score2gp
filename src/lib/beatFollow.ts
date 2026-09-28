/**
 * 악보 커서가 연주를 따라가게 하는 제어 계산.
 *
 * 따라가는 동안 앱은 소리를 내지 않는다. 그래서 할 일은 하나뿐이다 —
 * 커서를 연주와 같은 빠르기로, 같은 지점에서 움직이게 하는 것.
 *
 * 두 가지를 함께 본다.
 *  - **빠르기**: 킥 간격에서 읽은 BPM([kickTempo])을 악보의 BPM과 맞춘다.
 *  - **어긋남**: 같은 빠르기로 달려도 출발이 어긋나 있으면 계속 어긋난 채로
 *    간다. 킥이 올 때 커서가 박에서 얼마나 떨어져 있는지 보고 조금씩 당기거나
 *    늦춘다.
 *
 * 한 번에 끌어다 놓지 않는 이유는 악보가 튀면 읽던 사람이 자리를 잃기
 * 때문이다. 대신 빠르기를 잠깐 몇 % 바꿔 몇 박에 걸쳐 스며들게 한다.
 */

/** 한 번에 바꿀 수 있는 빠르기 폭. 이보다 크게 움직이면 눈에 띄게 튄다. */
const MAX_TRIM = 0.12;

/**
 * 악보 빠르기에서 벗어날 수 있는 한계.
 *
 * 합주에서 빠르기는 한 번 잡히면 10% 안팎으로만 흔들린다. 들은 값이 그보다
 * 멀다면 그건 연주가 빨라진 게 아니라 박을 잘못 짚은 것이다. 잘못 짚은 값을
 * 그대로 따라가면 악보가 엉뚱한 속도로 달아나 연주자가 자리를 잃는다 —
 * 따라가다 놓치는 것보다 나쁘다.
 */
const MAX_DRIFT = 0.12;

/** 어긋남을 되돌리는 세기. 1이면 한 박 만에 다 따라잡으려 든다. */
const PHASE_GAIN = 0.35;

/** 이만큼(박) 안쪽이면 맞은 것으로 본다 — 사람의 연주는 원래 흔들린다. */
const DEAD_ZONE = 0.04;

export interface FollowInput {
  /** 마이크로 읽은 연주의 빠르기(BPM). 아직 모르면 null. */
  playedBpm: number | null;
  /** 악보에 적힌 원래 빠르기(BPM). */
  scoreBpm: number;
  /**
   * 커서가 박에서 얼마나 벗어나 있는지(박 단위, -0.5 ~ 0.5).
   * 양수면 커서가 앞서 있다(악보가 연주보다 빨리 간다).
   */
  phaseError: number;
  /** 박이 고르게 들어오는지. 아니면 따라가지 않고 원래 빠르기를 지킨다. */
  steady: boolean;
  /** 재생 속도의 허용 범위 — 플레이어가 받아 주는 값과 같아야 한다. */
  min: number;
  max: number;
}

/**
 * 지금 줘야 할 재생 속도 배율(1 = 악보에 적힌 빠르기)을 구한다.
 *
 * 연주를 아직 읽지 못했거나 박이 흔들리면 1을 돌려준다 — 모를 때는 악보에
 * 적힌 빠르기를 지키는 편이 낫다. 따라가다 놓치면 연주자는 자기 감으로
 * 계속 치지만, 엉뚱한 속도로 끌려간 악보는 되돌릴 방법이 없다.
 */
export function followSpeed({
  playedBpm,
  scoreBpm,
  phaseError,
  steady,
  min,
  max,
}: FollowInput): number {
  if (!steady || playedBpm === null || scoreBpm <= 0) return 1;

  const ratio = clamp(playedBpm / scoreBpm, 1 - MAX_DRIFT, 1 + MAX_DRIFT);

  // 어긋난 만큼 빠르기를 잠깐 깎거나 더한다. 커서가 앞섰으면(양수) 늦춘다.
  const drift = Math.abs(phaseError) <= DEAD_ZONE ? 0 : phaseError;
  const trim = clamp(-drift * PHASE_GAIN, -MAX_TRIM, MAX_TRIM);

  return clamp(ratio * (1 + trim), min, max);
}

/**
 * 커서가 가장 가까운 박에서 얼마나 벗어났는지 구한다(박 단위, -0.5 ~ 0.5).
 *
 * 킥은 박 위에 떨어진다고 본다. 8비트의 '엔'처럼 반 박에 오는 킥도 있지만,
 * 그건 가장 가까운 박에서 0.5 떨어진 것이라 어느 쪽으로도 치우치지 않는다 —
 * 여러 번 모이면 서로 상쇄된다.
 */
export function phaseErrorAt(cursorBeats: number): number {
  const fraction = cursorBeats - Math.floor(cursorBeats);
  return fraction > 0.5 ? fraction - 1 : fraction;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}
