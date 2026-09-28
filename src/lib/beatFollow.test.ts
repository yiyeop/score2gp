import { describe, expect, it } from "vitest";
import { followSpeed, phaseErrorAt } from "./beatFollow";

const base = {
  scoreBpm: 100,
  phaseError: 0,
  steady: true,
  min: 0.25,
  max: 2,
};

describe("followSpeed", () => {
  it("matches the tempo the band is actually playing", () => {
    // 악보는 100, 연주는 108 → 1.08배로 흐른다.
    expect(followSpeed({ ...base, playedBpm: 108 })).toBeCloseTo(1.08, 5);
  });

  it("refuses to run far away from the written tempo", () => {
    // 합주가 악보보다 40% 빨라지는 일은 없다 — 박을 잘못 짚은 것이므로
    // 12%까지만 따라간다.
    expect(followSpeed({ ...base, playedBpm: 140 })).toBeCloseTo(1.12, 5);
    expect(followSpeed({ ...base, playedBpm: 60 })).toBeCloseTo(0.88, 5);
  });

  it("keeps the written tempo while the beat is still unclear", () => {
    expect(followSpeed({ ...base, playedBpm: null })).toBe(1);
    expect(followSpeed({ ...base, playedBpm: 112, steady: false })).toBe(1);
  });

  it("slows down when the cursor has run ahead", () => {
    const ahead = followSpeed({ ...base, playedBpm: 100, phaseError: 0.25 });
    expect(ahead).toBeLessThan(1);
    expect(ahead).toBeGreaterThan(0.85);
  });

  it("speeds up when the cursor has fallen behind", () => {
    const behind = followSpeed({ ...base, playedBpm: 100, phaseError: -0.25 });
    expect(behind).toBeGreaterThan(1);
    expect(behind).toBeLessThan(1.15);
  });

  it("leaves a small wobble alone", () => {
    // 연주자는 늘 몇 ms씩 앞뒤로 흔들린다. 그때마다 속도를 건드리면
    // 악보가 미세하게 떨린다.
    expect(followSpeed({ ...base, playedBpm: 100, phaseError: 0.02 })).toBe(1);
  });

  it("never trims the tempo far enough to be seen as a jump", () => {
    const worst = followSpeed({ ...base, playedBpm: 100, phaseError: -0.5 });
    expect(worst).toBeLessThanOrEqual(1.12);
  });

  it("stays inside the speeds the player accepts", () => {
    expect(followSpeed({ ...base, playedBpm: 400 })).toBeLessThanOrEqual(2);
    expect(followSpeed({ ...base, playedBpm: 10 })).toBeGreaterThanOrEqual(0.25);
  });
});

describe("phaseErrorAt", () => {
  it("is zero right on a beat", () => {
    expect(phaseErrorAt(8)).toBe(0);
  });

  it("is positive just after a beat (cursor ahead of the kick)", () => {
    expect(phaseErrorAt(8.1)).toBeCloseTo(0.1, 5);
  });

  it("is negative just before a beat (cursor behind the kick)", () => {
    expect(phaseErrorAt(7.9)).toBeCloseTo(-0.1, 5);
  });

  it("treats an off-beat kick as equally far either way", () => {
    expect(Math.abs(phaseErrorAt(8.5))).toBeCloseTo(0.5, 5);
  });
});
