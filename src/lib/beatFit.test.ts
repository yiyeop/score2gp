import { describe, expect, it } from "vitest";
import { fitBeat, offsetFromBeat } from "./beatFit";

/** bpm으로 count번, start초부터 친 타격. jitter를 주면 사람처럼 흔들린다. */
function grid(bpm: number, count: number, start = 1, jitter = 0): number[] {
  const period = 60 / bpm;
  return Array.from({ length: count }, (_, i) => {
    const wobble = jitter === 0 ? 0 : ((i % 3) - 1) * jitter;
    return start + i * period + wobble;
  });
}

describe("fitBeat", () => {
  it("reads a steady beat as its own tempo", () => {
    const fit = fitBeat(grid(132, 10), 128);
    expect(fit).not.toBeNull();
    expect(fit!.bpm).toBeCloseTo(132, 0);
    expect(fit!.strength).toBeGreaterThan(0.95);
  });

  it("still finds the beat when some hits are missing", () => {
    // 4·7번째를 놓친 연주. 남은 타격이 방향을 지킨다.
    const times = grid(128, 10).filter((_, i) => i !== 3 && i !== 6);
    const fit = fitBeat(times, 128);
    expect(fit!.bpm).toBeCloseTo(128, 0);
    expect(fit!.strength).toBeGreaterThan(0.9);
  });

  it("survives a few off-beat hits between the beats", () => {
    // 8비트의 '엔'에 들어간 기타 어택 두 번이 섞여도 박은 그대로다.
    const times = [...grid(128, 10), 1 + 60 / 128 / 2, 1 + (3.5 * 60) / 128].sort(
      (a, b) => a - b,
    );
    const fit = fitBeat(times, 128);
    expect(fit!.bpm).toBeCloseTo(128, 0);
    expect(fit!.strength).toBeGreaterThan(0.6);
  });

  it("follows a band playing faster than the score", () => {
    const fit = fitBeat(grid(148, 12), 128);
    expect(fit!.bpm).toBeCloseTo(148, 0);
    expect(fit!.strength).toBeGreaterThan(0.95);
  });

  it("never wanders outside the range around the score", () => {
    // 악보의 절반으로 친 리듬이라도 ±25% 밖으로는 나가지 않는다.
    const fit = fitBeat(grid(64, 10), 128);
    expect(fit!.bpm).toBeGreaterThanOrEqual(128 * 0.75);
    expect(fit!.bpm).toBeLessThanOrEqual(128 * 1.25);
  });

  it("reports a weak fit for sounds that arrive at random", () => {
    const times = [1, 1.13, 1.9, 2.42, 2.55, 3.4, 3.93, 4.6];
    const fit = fitBeat(times, 128);
    expect(fit!.strength).toBeLessThan(0.55);
  });

  it("stays quiet until there are enough hits", () => {
    expect(fitBeat([1, 1.5, 2], 128)).toBeNull();
    expect(fitBeat(grid(128, 10), 0)).toBeNull();
  });

  it("forgets hits older than its window", () => {
    // 10초 전의 느린 연주는 지금 빠르기를 말해 주지 않는다.
    const old = [0, 1, 2, 3];
    const now = grid(140, 8, 20);
    const fit = fitBeat([...old, ...now], 128);
    expect(fit!.bpm).toBeCloseTo(140, 0);
  });
});

describe("offsetFromBeat", () => {
  const fit = fitBeat(grid(120, 10), 120)!;

  it("is near zero on the beat", () => {
    expect(Math.abs(offsetFromBeat(3, fit))).toBeLessThan(0.02);
  });

  it("is near a half beat between the beats", () => {
    expect(Math.abs(offsetFromBeat(3.25, fit))).toBeCloseTo(0.5, 1);
  });

  it("tells early from late", () => {
    expect(offsetFromBeat(3.05, fit)).toBeGreaterThan(0);
    expect(offsetFromBeat(2.95, fit)).toBeLessThan(0);
  });
});
