import { describe, expect, it } from "vitest";
import { beatSpread, estimateBpm, foldToReference } from "./beatTempo";

/** start초부터 gap 간격으로 count개의 킥. jitter를 주면 사람처럼 흔들린다. */
function beats(gap: number, count: number, start = 1, jitter = 0): number[] {
  return Array.from({ length: count }, (_, i) => {
    const wobble = jitter === 0 ? 0 : ((i % 3) - 1) * jitter;
    return start + i * gap + wobble;
  });
}

describe("estimateBpm", () => {
  it("reads a steady four-on-the-floor as its own tempo", () => {
    // 0.5초 간격 = 120BPM
    expect(estimateBpm(beats(0.5, 8))).toBeCloseTo(120, 5);
  });

  it("ignores one badly-off gap", () => {
    // 한 번 놓쳐 간격이 두 배로 벌어져도 중앙값은 흔들리지 않는다.
    const times = beats(0.5, 8);
    times.splice(4, 1);
    expect(estimateBpm(times)).toBeCloseTo(120, 1);
  });

  it("folds a fast 8th-note pattern back into a playable tempo", () => {
    // 0.25초 간격을 그대로 보면 240BPM — 사람이 치는 범위 밖이라 절반으로 본다.
    expect(estimateBpm(beats(0.25, 8))).toBeCloseTo(120, 5);
  });

  it("folds a slow half-note pattern up into a playable tempo", () => {
    // 두 박에 한 번(1.6초)이면 37.5BPM — 두 배로 접어 75BPM으로 본다.
    expect(estimateBpm(beats(1.6, 8))).toBeCloseTo(75, 5);
  });

  it("stays quiet until there are enough kicks", () => {
    expect(estimateBpm([])).toBeNull();
    expect(estimateBpm([1, 1.5])).toBeNull();
  });

  it("survives human wobble", () => {
    const bpm = estimateBpm(beats(0.5, 9, 1, 0.02));
    expect(bpm).not.toBeNull();
    expect(Math.abs((bpm as number) - 120)).toBeLessThan(6);
  });
});

describe("beatSpread", () => {
  it("is near zero for a metronome", () => {
    expect(beatSpread(beats(0.5, 8))).toBeLessThan(0.01);
  });

  it("stays small when a kick lands on the off-beat", () => {
    // 8비트: 박과 반 박이 섞여도 어긋난 것이 아니다.
    const times = [1, 1.25, 1.5, 2, 2.5, 2.75, 3];
    expect(beatSpread(times)).toBeLessThan(0.2);
  });

  it("is large for sounds that arrive at random", () => {
    const times = [1, 1.1, 1.9, 2.05, 3.4, 3.5, 5.2];
    expect(beatSpread(times)).toBeGreaterThan(0.25);
  });

  it("stays quiet until there are enough kicks", () => {
    expect(beatSpread([1, 1.5, 2])).toBeNull();
  });
});

describe("foldToReference", () => {
  it("keeps a tempo that already matches the score", () => {
    expect(foldToReference(128, 125)).toBeCloseTo(128, 5);
  });

  it("doubles a half-beat reading back onto the score's tempo", () => {
    // 반 박마다 소리가 나면 간격이 절반이라 두 배로 읽힌다.
    expect(foldToReference(250, 125)).toBeCloseTo(125, 5);
  });

  it("halves a two-beat reading", () => {
    expect(foldToReference(62, 125)).toBeCloseTo(124, 5);
  });

  it("accepts a live version played faster than the score", () => {
    // 합주는 악보보다 빨라지기도 한다 — 10% 남짓은 그대로 받는다.
    expect(foldToReference(138, 125)).toBeCloseTo(138, 5);
  });

  it("refuses a reading that is nowhere near the score", () => {
    // 어느 배수로도 악보 근처에 못 오면 박을 잘못 짚은 것이다.
    expect(foldToReference(93, 125)).toBeNull();
  });
});

describe("estimateBpm with the score as a guide", () => {
  it("folds an 8th-note pattern onto the score tempo", () => {
    const times = beats(0.24, 8);
    expect(estimateBpm(times, 125)).toBeCloseTo(125, 0);
  });

  it("gives nothing when the beat is nowhere near the score", () => {
    expect(estimateBpm(beats(0.7, 8), 125)).toBeNull();
  });
});
