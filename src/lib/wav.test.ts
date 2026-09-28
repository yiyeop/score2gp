import { describe, expect, it } from "vitest";
import { decodeWav, encodeWav } from "./wav";

function tone(hz: number, seconds: number, rate: number): Float32Array {
  const out = new Float32Array(Math.round(rate * seconds));
  for (let i = 0; i < out.length; i++) {
    out[i] = 0.5 * Math.sin((2 * Math.PI * hz * i) / rate);
  }
  return out;
}

describe("encodeWav", () => {
  it("writes a header any tool can read", () => {
    const bytes = encodeWav(tone(440, 0.01, 48000), 48000);
    const text = String.fromCharCode(...bytes.slice(0, 4), ...bytes.slice(8, 12));
    expect(text).toBe("RIFFWAVE");
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(24, true)).toBe(48000); // 표본율
    expect(view.getUint16(22, true)).toBe(1); // 모노
    expect(view.getUint16(34, true)).toBe(16); // 16비트
  });

  it("comes back as the same sound", () => {
    const samples = tone(220, 0.05, 44100);
    const back = decodeWav(encodeWav(samples, 44100));
    expect(back.sampleRate).toBe(44100);
    expect(back.samples).toHaveLength(samples.length);
    // 16비트로 접었다 펴는 만큼의 오차만 허용한다.
    for (let i = 0; i < samples.length; i += 37) {
      expect(Math.abs(back.samples[i] - samples[i])).toBeLessThan(0.0001);
    }
  });

  it("clips instead of wrapping when the sound is too loud", () => {
    // 넘치는 값을 그냥 두면 반대 부호로 감겨 찢어진 소리가 된다.
    const back = decodeWav(encodeWav(new Float32Array([2, -2, 0.5]), 8000));
    expect(back.samples[0]).toBeCloseTo(1, 3);
    expect(back.samples[1]).toBeCloseTo(-1, 3);
    expect(back.samples[2]).toBeCloseTo(0.5, 3);
  });

  it("keeps the length so timings stay true", () => {
    const back = decodeWav(encodeWav(tone(100, 1.5, 16000), 16000));
    expect(back.samples.length / back.sampleRate).toBeCloseTo(1.5, 3);
  });
});
