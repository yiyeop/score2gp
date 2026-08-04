import { describe, expect, it } from "vitest";
import { barRangeToTicks, normalizeBarRange } from "./loopRange";

describe("normalizeBarRange", () => {
  it("orders reversed picks (end clicked before start)", () => {
    expect(normalizeBarRange(10, 3, 20)).toEqual({ start: 3, end: 10 });
  });

  it("keeps an already-ordered pair as-is", () => {
    expect(normalizeBarRange(3, 10, 20)).toEqual({ start: 3, end: 10 });
  });

  it("allows a single-bar range (start === end)", () => {
    expect(normalizeBarRange(5, 5, 20)).toEqual({ start: 5, end: 5 });
  });

  it("clamps picks below 0 or at/above barCount", () => {
    expect(normalizeBarRange(-3, 25, 20)).toEqual({ start: 0, end: 19 });
  });

  it("rounds non-integer input defensively", () => {
    expect(normalizeBarRange(2.4, 7.6, 20)).toEqual({ start: 2, end: 8 });
  });

  it("returns null when the song has no bars", () => {
    expect(normalizeBarRange(0, 0, 0)).toBeNull();
  });
});

describe("barRangeToTicks", () => {
  // 4개 마디, 각 1000 tick 길이. 곡 전체는 4000 tick.
  const barStarts = [0, 1000, 2000, 3000];
  const totalTicks = 4000;

  it("maps a middle range to [start bar's tick, next bar's tick)", () => {
    expect(barRangeToTicks({ start: 1, end: 2 }, barStarts, totalTicks)).toEqual({
      startTick: 1000,
      endTick: 3000,
    });
  });

  it("uses totalTicks as the end when the range includes the last bar", () => {
    expect(barRangeToTicks({ start: 2, end: 3 }, barStarts, totalTicks)).toEqual({
      startTick: 2000,
      endTick: 4000,
    });
  });

  it("handles a single-bar range", () => {
    expect(barRangeToTicks({ start: 0, end: 0 }, barStarts, totalTicks)).toEqual({
      startTick: 0,
      endTick: 1000,
    });
  });

  it("returns null for an out-of-bounds end bar", () => {
    expect(barRangeToTicks({ start: 0, end: 4 }, barStarts, totalTicks)).toBeNull();
  });

  it("returns null when start is after end", () => {
    expect(barRangeToTicks({ start: 2, end: 1 }, barStarts, totalTicks)).toBeNull();
  });

  it("returns null when there are no bars yet (midi not loaded)", () => {
    expect(barRangeToTicks({ start: 0, end: 0 }, [], totalTicks)).toBeNull();
  });
});
