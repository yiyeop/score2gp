/**
 * 연주에서 '때린 순간'을 잡아내는 순수 계산 로직.
 *
 * 따라가는 데 필요한 것은 "방금 쳤다"는 시각뿐이다 — 무슨 음인지, 어떤
 * 악기인지는 필요 없다. 그래서 음정 추적이 아니라 에너지가 갑자기 솟는
 * 순간만 본다.
 *
 * 두 대역을 따로 듣는다.
 *  - **낮은 대역(65Hz 언저리)**: 베이스드럼. 합주에서 가장 또렷한 기준.
 *  - **중간 대역(200Hz 언저리)**: 스네어 몸통과 기타·베이스의 어택.
 *    드럼이 묻히거나 킥이 성긴 곡에서도 박을 짚을 수 있다.
 *
 * 마이크·오디오 노드와 떼어 둔 이유는 검증 때문이다. 실제 소리로는 회귀를
 * 확인할 수 없어서, 합성한 파형을 넣어 감지 시각을 테스트로 박아 둔다.
 */

/** 어느 대역에서 잡힌 소리인지. */
export type OnsetBand = "low" | "mid";

/** 감지기가 내놓는 타격 하나. 시각은 스트림 시작 기준 초. */
export interface Onset {
  time: number;
  /** 때리기 직전보다 몇 배로 솟았는지. 화면 표시와 진단용. */
  strength: number;
  band: OnsetBand;
}

export interface OnsetDetectorOptions {
  /**
   * 때리기 직전(`lookBack`초 전)보다 몇 배로 솟아야 타격으로 볼지.
   * 낮추면 여린 소리도 잡지만 울림에도 반응한다.
   */
  riseRatio?: number;
  /**
   * 얼마나 거슬러 올라가 비교할지(초).
   * 이보다 느리게 커지는 소리(길게 끄는 음, 앰프 험, 크레셴도)는 때린 것이
   * 아니므로 타격으로 보지 않는다.
   */
  lookBack?: number;
  /**
   * 이보다 조용하면 아무리 솟아도 무시한다(무음 구간의 헛detection 방지).
   *
   * 마이크와 방에 따라 들어오는 크기가 수십 배씩 차이 나서, 고정값 하나로는
   * 어떤 환경에서는 전부 놓치고 어떤 환경에서는 전부 잡는다. 그래서 이 값은
   * 최소선일 뿐이고, 실제 기준은 최근 평균 크기에서 함께 따라간다.
   */
  floor?: number;
  /** 최근 평균 크기의 몇 배를 넘어야 하는지 — 위 floor와 함께 큰 쪽을 쓴다. */
  floorRatio?: number;
  /**
   * 켠 직후 듣기만 하는 시간(초).
   *
   * 마이크가 열리는 순간에는 소리가 무음에서 시작하는 것처럼 보여서, 이미
   * 울리고 있던 소리도 한 번 때린 것처럼 잡힌다. 그 구간을 통째로 버린다.
   */
  settle?: number;
  /**
   * 한 번 잡은 뒤 귀를 닫는 시간(초). 한 번의 타격은 여러 블록에 걸쳐
   * 울리므로, 이게 없으면 한 방이 여러 번으로 세어진다. 0.09초는 240BPM의
   * 16비트보다도 촘촘해서 사람이 칠 수 있는 어떤 리듬도 놓치지 않는다.
   */
  refractory?: number;
}

const HOP = 128;

/**
 * 포락선을 다듬는 시간(초).
 *
 * 65Hz 한 주기는 15ms인데 블록 하나는 2.7ms뿐이라, 블록마다 재면 같은 크기의
 * 소리도 파형의 어느 지점을 담았느냐에 따라 몇 배씩 출렁인다. 한 주기보다
 * 조금 짧게 다듬어 그 출렁임을 없앤다 — 대신 타격이 잡히는 시각이 10ms쯤
 * 늦는다(따라가기에서는 일정한 지연이라 문제되지 않는다).
 */
const ENVELOPE_TAU = 0.01;

/** 대역별 설정. 중간 대역은 소리가 더 촘촘해 조금 더 엄격하게 본다. */
const BANDS: { band: OnsetBand; centerHz: number; q: number; rise: number }[] = [
  { band: "low", centerHz: 65, q: 0.9, rise: 1 },
  { band: "mid", centerHz: 200, q: 0.8, rise: 1.15 },
];

const DEFAULTS: Required<OnsetDetectorOptions> = {
  riseRatio: 2.2,
  lookBack: 0.06,
  floor: 0.0008,
  floorRatio: 0.6,
  settle: 0.25,
  refractory: 0.09,
};

/** 기준선이 되는 평균을 따라가는 시간(초). 곡의 셈여림을 따라갈 만큼 느리게. */
const BASELINE_TAU = 2;

export interface OnsetDetector {
  /** 마이크에서 온 표본 덩어리를 넣고, 그 안에서 잡힌 타격을 받는다. */
  push(samples: Float32Array): Onset[];
  /** 다시 처음부터 듣는다(감지를 껐다 켤 때). */
  reset(): void;
  /** 지금까지 흘려보낸 시간(초). */
  readonly elapsed: number;
  /** 가장 최근에 잰 소리 크기(0~1 근처). 마이크가 듣고 있는지 보여줄 때 쓴다. */
  readonly level: number;
}

/** 한 대역을 듣는 부분. 대역만 다르고 판단 규칙은 같다. */
function createBand(
  sampleRate: number,
  opt: Required<OnsetDetectorOptions>,
  spec: (typeof BANDS)[number],
) {
  // RBJ 밴드패스(피크 게인 = 1). 계수는 고정이라 한 번만 구한다.
  const w0 = (2 * Math.PI * spec.centerHz) / sampleRate;
  const alpha = Math.sin(w0) / (2 * spec.q);
  const a0 = 1 + alpha;
  const b0 = alpha / a0;
  const b2 = -alpha / a0;
  const a1 = (-2 * Math.cos(w0)) / a0;
  const a2 = (1 - alpha) / a0;

  const envelopeAdapt = 1 / (ENVELOPE_TAU * sampleRate);
  const history = new Float32Array(
    Math.max(1, Math.round((opt.lookBack * sampleRate) / HOP)),
  );
  const threshold = opt.riseRatio * spec.rise;

  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  let envelope = 0;
  let historyAt = 0;
  let heard = 0;
  let previous = 0;
  let level = 0;
  let baseline = -1;
  const baselineAdapt = HOP / (BASELINE_TAU * sampleRate);

  return {
    band: spec.band,
    get level() {
      return level;
    },
    reset() {
      x1 = x2 = y1 = y2 = 0;
      envelope = 0;
      history.fill(0);
      historyAt = 0;
      heard = 0;
      previous = 0;
      level = 0;
      baseline = -1;
    },
    /** 한 표본을 대역 필터에 흘려 넣고 포락선을 갱신한다. */
    step(x0: number) {
      const y0 = b0 * x0 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x0;
      y2 = y1; y1 = y0;
      envelope += (y0 * y0 - envelope) * envelopeAdapt;
    },
    /** 블록 경계에서 부른다 — 이 블록이 타격인지 판단한다. */
    decide(): { hit: boolean; strength: number } {
      const rms = Math.sqrt(envelope);
      level = rms;

      const before = history[historyAt];
      history[historyAt] = rms;
      historyAt = (historyAt + 1) % history.length;

      // 고리 버퍼가 한 바퀴 차기 전에는 비교할 '조금 전'이 없다.
      if (heard < history.length) {
        heard++;
        previous = rms;
        return { hit: false, strength: 0 };
      }

      // 기준선은 이 방에서 '보통 들리는 크기'다. 조용한 마이크에서도 같은
      // 규칙이 서도록, 절대값과 상대값 중 큰 쪽을 문턱으로 쓴다.
      baseline = baseline < 0 ? rms : baseline + (rms - baseline) * baselineAdapt;
      const floor = Math.max(opt.floor, baseline * opt.floorRatio);

      const ratio = before > 0 ? rms / before : Number.POSITIVE_INFINITY;
      const hit = rms > floor && rms > previous && ratio >= threshold;
      previous = rms;
      return { hit, strength: Number.isFinite(ratio) ? ratio : threshold };
    },
  };
}

/**
 * 표본을 흘려 넣으면 타격이 잡힐 때마다 알려주는 감지기를 만든다.
 *
 * 블록(128 표본, 48kHz에서 2.7ms)마다 대역 에너지를 재고, 그 값이
 *  (1) `lookBack`초 전보다 `riseRatio`배 이상 크고
 *  (2) 직전 블록보다 커지는 중이고
 *  (3) `floor`보다 크고
 *  (4) 마지막 타격에서 `refractory`초가 지났을 때
 * 타격으로 본다. 기준을 곡 전체 평균이 아니라 '조금 전'으로 잡는 것이 핵심이다.
 * 때리는 소리는 수십 ms 만에 솟지만, 크레셴도나 앰프 험처럼 서서히 커지는
 * 소리는 같은 창에서 거의 변하지 않아 저절로 걸러진다.
 *
 * 두 대역이 같은 타격을 함께 잡는 일이 흔하므로(킥에도 중역이 조금 있다),
 * 휴지기는 대역별이 아니라 전체에 하나만 둔다 — 한 번 친 것은 한 번으로 센다.
 */
export function createOnsetDetector(
  sampleRate: number,
  options: OnsetDetectorOptions = {},
): OnsetDetector {
  const opt = { ...DEFAULTS, ...options };
  const bands = BANDS.map((spec) => createBand(sampleRate, opt, spec));

  let filled = 0;
  let blocks = 0;
  let lastHit = Number.NEGATIVE_INFINITY;

  return {
    get elapsed() {
      return (blocks * HOP) / sampleRate;
    },
    get level() {
      return Math.max(...bands.map((b) => b.level));
    },
    reset() {
      for (const b of bands) b.reset();
      filled = 0;
      blocks = 0;
      lastHit = Number.NEGATIVE_INFINITY;
    },
    push(samples: Float32Array) {
      const onsets: Onset[] = [];
      for (let i = 0; i < samples.length; i++) {
        for (const b of bands) b.step(samples[i]);
        if (++filled < HOP) continue;
        filled = 0;
        const time = (++blocks * HOP) / sampleRate;

        // 두 대역 모두 판정을 진행시킨다(하나만 보면 기준이 멈춘다).
        const verdicts = bands.map((b) => ({ band: b.band, ...b.decide() }));
        if (time < opt.settle || time - lastHit < opt.refractory) continue;

        // 함께 잡혔으면 더 세게 솟은 쪽을 그 타격의 대표로 본다.
        const best = verdicts
          .filter((v) => v.hit)
          .sort((a, b) => b.strength - a.strength)[0];
        if (!best) continue;

        lastHit = time;
        onsets.push({ time, strength: best.strength, band: best.band });
      }
      return onsets;
    },
  };
}
