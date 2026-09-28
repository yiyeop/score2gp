import { describe, expect, it } from "vitest";
import { createOnsetDetector } from "./onsetDetect";

const RATE = 48000;

/** 킥 한 방: 60Hz가 빠르게 잦아드는 소리. 실제 베이스드럼과 모양이 비슷하다. */
function addKick(buf: Float32Array, at: number, gain = 0.9) {
  const start = Math.round(at * RATE);
  for (let i = 0; i < RATE * 0.25 && start + i < buf.length; i++) {
    const t = i / RATE;
    buf[start + i] += gain * Math.sin(2 * Math.PI * 60 * t) * Math.exp(-t * 22);
  }
}

/** 지정한 시각들에 킥이 찍힌 구간을 만든다. 앞 0.3초는 감지기 워밍업용. */
function track(times: number[], seconds = 4): Float32Array {
  const buf = new Float32Array(Math.round(RATE * seconds));
  for (const t of times) addKick(buf, t);
  return buf;
}

function detect(buf: Float32Array, options = {}) {
  const d = createOnsetDetector(RATE, options);
  return d.push(buf).map((k) => k.time);
}

/**
 * 기대한 시각마다 킥이 하나씩 잡혔는지 본다.
 * 포락선을 다듬는 만큼 10~20ms 늦게 잡히므로 30ms까지 허용한다.
 */
function expectKicksNear(found: number[], expected: number[]) {
  expect(found).toHaveLength(expected.length);
  found.forEach((t, i) => {
    expect(t - expected[i]).toBeGreaterThan(-0.005);
    expect(t - expected[i]).toBeLessThan(0.03);
  });
}

describe("createOnsetDetector", () => {
  it("finds each kick in a steady four-on-the-floor bar", () => {
    // 120BPM 4분음표 = 0.5초 간격
    const times = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0];
    expectKicksNear(detect(track(times)), times);
  });

  it("follows a 16th-note kick pattern without merging hits", () => {
    // 100BPM의 16비트 = 0.15초 간격. 휴지기(0.12초)보다 촘촘한 실제 연주.
    const times = [0.5, 0.65, 0.8, 0.95, 1.1];
    expectKicksNear(detect(track(times, 2)), times);
  });

  it("counts one long kick once, not once per block", () => {
    expectKicksNear(detect(track([0.8], 2)), [0.8]);
  });

  it("stays silent on guitar-range sound", () => {
    // 440Hz(A4)를 크게 울려도 저역 대역에는 거의 남지 않는다.
    const buf = new Float32Array(RATE * 2);
    for (let i = 0; i < buf.length; i++) {
      buf[i] = 0.8 * Math.sin((2 * Math.PI * 440 * i) / RATE);
    }
    expect(detect(buf)).toEqual([]);
  });

  it("stays silent on room noise with no beat", () => {
    const buf = new Float32Array(RATE * 2);
    let seed = 7;
    for (let i = 0; i < buf.length; i++) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      buf[i] = ((seed / 2147483648) * 2 - 1) * 0.02;
    }
    expect(detect(buf)).toEqual([]);
  });

  it("does not fire on a low sound that swells instead of striking", () => {
    // 서서히 커지는 저음(길게 끄는 베이스, 앰프 험)은 킥이 아니다.
    // 기준이 되는 평균이 같이 따라 올라가므로 솟은 것으로 보이지 않는다.
    const buf = new Float32Array(RATE * 2);
    for (let i = 0; i < buf.length; i++) {
      const swell = Math.min(1, i / (RATE * 0.5));
      buf[i] = 0.5 * swell * Math.sin((2 * Math.PI * 60 * i) / RATE);
    }
    expect(detect(buf)).toEqual([]);
  });

  it("ignores kicks that land while it is still settling", () => {
    // 켠 직후 0.25초는 듣기만 한다. 실제 사용에서는 재생을 누르고 드럼이
    // 카운트인을 하므로 이 구간에 킥이 걸릴 일이 드물다.
    expect(detect(track([0.05, 0.15], 1))).toEqual([]);
  });

  it("reads the same kicks whatever size the audio chunks arrive in", () => {
    const buf = track([0.5, 1.0, 1.5], 2);
    const whole = detect(buf);
    const d = createOnsetDetector(RATE);
    const piecemeal: number[] = [];
    for (let i = 0; i < buf.length; i += 333) {
      piecemeal.push(...d.push(buf.subarray(i, i + 333)).map((k) => k.time));
    }
    expect(piecemeal).toEqual(whole);
  });

  it("keeps hearing quiet kicks after a loud passage", () => {
    // 앞은 세게, 뒤는 절반 세기로 — 기준이 큰 소리에 고정되면 뒤를 놓친다.
    const buf = new Float32Array(RATE * 3);
    for (const t of [0.5, 1.0]) addKick(buf, t, 0.9);
    for (const t of [1.5, 2.0, 2.5]) addKick(buf, t, 0.35);
    expectKicksNear(detect(buf), [0.5, 1.0, 1.5, 2.0, 2.5]);
  });

  it("hears a snare-range hit, not just the kick drum", () => {
    // 스네어 몸통(200Hz 언저리)만 있는 백비트. 킥이 묻히는 합주에서도
    // 박을 짚으려면 이쪽을 들어야 한다.
    const buf = new Float32Array(RATE * 3);
    const times = [0.6, 1.1, 1.6, 2.1];
    for (const at of times) {
      const start = Math.round(at * RATE);
      for (let i = 0; i < RATE * 0.2 && start + i < buf.length; i++) {
        const t = i / RATE;
        buf[start + i] += 0.7 * Math.sin(2 * Math.PI * 205 * t) * Math.exp(-t * 30);
      }
    }
    expectKicksNear(detect(buf), times);
  });

  it("counts one hit once even when both bands hear it", () => {
    // 실제 킥에는 중역도 조금 섞여 있다. 두 대역이 함께 잡아도 한 번이다.
    const buf = new Float32Array(RATE * 2);
    const start = Math.round(0.8 * RATE);
    for (let i = 0; i < RATE * 0.2; i++) {
      const t = i / RATE;
      buf[start + i] =
        (0.9 * Math.sin(2 * Math.PI * 60 * t) + 0.5 * Math.sin(2 * Math.PI * 210 * t)) *
        Math.exp(-t * 25);
    }
    expect(detect(buf)).toHaveLength(1);
  });

  it("starts over after reset", () => {
    const d = createOnsetDetector(RATE);
    d.push(track([0.5], 1));
    expect(d.elapsed).toBeGreaterThan(0.9);
    d.reset();
    expect(d.elapsed).toBe(0);
  });
});
