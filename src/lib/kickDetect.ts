/**
 * 드럼 킥 감지의 순수 계산 로직.
 *
 * 연주를 따라가려면 "방금 킥이 울렸다"는 시각만 있으면 된다 — 무슨 음인지,
 * 어떤 악기인지는 필요 없다. 그래서 음정 추적이 아니라 저역대 에너지가
 * 갑자기 솟는 순간만 잡는다. 킥의 기본음은 대개 50~90Hz에 몰려 있고,
 * 기타·보컬·심벌은 그보다 위라 대역만 걸러도 꽤 갈라진다.
 *
 * 마이크·오디오 노드와 떼어 둔 이유는 검증 때문이다. 실제 소리로는 회귀를
 * 확인할 수 없어서, 합성한 파형을 넣어 감지 시각을 테스트로 박아 둔다.
 */

/** 감지기가 내놓는 킥 하나. 시각은 스트림 시작 기준 초. */
export interface Kick {
  time: number;
  /** 때리기 직전보다 몇 배로 솟았는지. 화면 표시와 진단용. */
  strength: number;
}

export interface KickDetectorOptions {
  /** 통과시킬 대역의 중심 주파수(Hz). 기본 65Hz — 킥의 기본음 언저리. */
  centerHz?: number;
  /** 대역폭. 낮을수록 넓게 통과시킨다. */
  q?: number;
  /**
   * 때리기 직전(`lookBack`초 전)보다 몇 배로 솟아야 킥으로 볼지.
   * 낮추면 여린 킥도 잡지만 베이스 음에도 반응한다.
   */
  riseRatio?: number;
  /**
   * 얼마나 거슬러 올라가 비교할지(초).
   * 이보다 느리게 커지는 소리(길게 끄는 베이스, 앰프 험, 서서히 커지는
   * 연주)는 때린 것이 아니므로 킥으로 보지 않는다.
   */
  lookBack?: number;
  /** 이보다 조용하면 아무리 솟아도 무시한다(무음 구간의 헛detection 방지). */
  floor?: number;
  /**
   * 켠 직후 듣기만 하는 시간(초).
   *
   * 마이크가 열리는 순간에는 소리가 무음에서 시작하는 것처럼 보여서, 이미
   * 울리고 있던 소리도 한 번 때린 것처럼 잡힌다. 그 구간을 통째로 버린다.
   */
  settle?: number;
  /**
   * 한 번 잡은 뒤 귀를 닫는 시간(초). 킥 한 방은 여러 블록에 걸쳐 울리므로
   * 이게 없으면 한 번의 타격이 여러 번으로 세어진다. 0.12초는 500BPM의
   * 16비트보다도 촘촘해서, 사람이 칠 수 있는 어떤 킥도 놓치지 않는다.
   */
  refractory?: number;
}

const HOP = 128;

/**
 * 포락선을 다듬는 시간(초).
 *
 * 65Hz 한 주기는 15ms인데 블록 하나는 2.7ms뿐이라, 블록마다 재면 같은 크기의
 * 소리도 파형의 어느 지점을 담았느냐에 따라 몇 배씩 출렁인다. 한 주기보다
 * 조금 짧게 다듬어 그 출렁임을 없앤다 — 대신 킥이 잡히는 시각이 10ms쯤
 * 늦는다(따라가기에서는 일정한 지연이라 문제되지 않는다).
 */
const ENVELOPE_TAU = 0.01;

const DEFAULTS: Required<KickDetectorOptions> = {
  centerHz: 65,
  q: 0.9,
  riseRatio: 2.6,
  lookBack: 0.06,
  floor: 0.004,
  settle: 0.25,
  refractory: 0.12,
};

export interface KickDetector {
  /** 마이크에서 온 표본 덩어리를 넣고, 그 안에서 잡힌 킥을 받는다. */
  push(samples: Float32Array): Kick[];
  /** 다시 처음부터 듣는다(따라가기를 껐다 켤 때). */
  reset(): void;
  /** 지금까지 흘려보낸 시간(초). */
  readonly elapsed: number;
}

/**
 * 표본을 흘려 넣으면 킥이 잡힐 때마다 알려주는 감지기를 만든다.
 *
 * 블록(128 표본, 48kHz에서 2.7ms)마다 대역 에너지를 재고, 그 값이
 *  (1) `lookBack`초 전보다 `riseRatio`배 이상 크고
 *  (2) 직전 블록보다 커지는 중이고
 *  (3) `floor`보다 크고
 *  (4) 마지막 킥에서 `refractory`초가 지났을 때
 * 킥으로 본다. 기준을 곡 전체 평균이 아니라 '조금 전'으로 잡는 것이 핵심이다.
 * 킥은 때리는 소리라 수십 ms 만에 솟지만, 크레셴도나 앰프 험처럼 서서히
 * 커지는 소리는 같은 창에서 거의 변하지 않아 저절로 걸러진다.
 */
export function createKickDetector(
  sampleRate: number,
  options: KickDetectorOptions = {},
): KickDetector {
  const opt = { ...DEFAULTS, ...options };

  // RBJ 밴드패스(정규화 없는 피크 게인 = Q). 계수는 고정이라 한 번만 구한다.
  const w0 = (2 * Math.PI * opt.centerHz) / sampleRate;
  const alpha = Math.sin(w0) / (2 * opt.q);
  const a0 = 1 + alpha;
  const b0 = alpha / a0;
  const b2 = -alpha / a0;
  const a1 = (-2 * Math.cos(w0)) / a0;
  const a2 = (1 - alpha) / a0;

  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  let envelope = 0;
  let filled = 0;
  let blocks = 0;
  let previous = 0;
  let lastKick = Number.NEGATIVE_INFINITY;

  // 최근 음량을 담아 두는 고리 버퍼. 가장 오래된 칸이 곧 `lookBack`초 전이다.
  const history = new Float32Array(
    Math.max(1, Math.round((opt.lookBack * sampleRate) / HOP)),
  );
  let historyAt = 0;
  let heard = 0;

  const envelopeAdapt = 1 / (ENVELOPE_TAU * sampleRate);

  const detector: KickDetector = {
    get elapsed() {
      return (blocks * HOP) / sampleRate;
    },
    reset() {
      x1 = x2 = y1 = y2 = 0;
      envelope = 0;
      filled = 0;
      blocks = 0;
      history.fill(0);
      historyAt = 0;
      heard = 0;
      previous = 0;
      lastKick = Number.NEGATIVE_INFINITY;
    },
    push(samples: Float32Array) {
      const kicks: Kick[] = [];
      for (let i = 0; i < samples.length; i++) {
        const x0 = samples[i];
        const y0 = b0 * x0 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = x0;
        y2 = y1; y1 = y0;
        envelope += (y0 * y0 - envelope) * envelopeAdapt;
        if (++filled < HOP) continue;

        const rms = Math.sqrt(envelope);
        filled = 0;
        // 블록이 끝난 시각 = 그 블록의 마지막 표본 시각.
        const time = (++blocks * HOP) / sampleRate;

        const before = history[historyAt];
        history[historyAt] = rms;
        historyAt = (historyAt + 1) % history.length;

        // 고리 버퍼가 한 바퀴 차기 전에는 비교할 '조금 전'이 없다.
        // 켜자마자 울린 킥 한 방은 이 구간에서 놓칠 수 있다 — 실제로는
        // 재생을 누른 뒤 카운트인이 오므로 이 창에 걸릴 일이 드물다.
        if (heard < history.length) {
          heard++;
          previous = rms;
          continue;
        }

        const ratio = before > 0 ? rms / before : Number.POSITIVE_INFINITY;
        if (
          time >= opt.settle &&
          rms > opt.floor &&
          rms > previous &&
          ratio >= opt.riseRatio &&
          time - lastKick >= opt.refractory
        ) {
          lastKick = time;
          kicks.push({
            time,
            strength: Number.isFinite(ratio) ? ratio : opt.riseRatio,
          });
        }
        previous = rms;
      }
      return kicks;
    },
  };
  return detector;
}
