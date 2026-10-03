/**
 * 실제로 녹음한 소리로 박 읽기를 확인한다.
 *
 * 합성 파형은 규칙을 지키는지만 말해 줄 뿐, 방에서 스피커를 마이크로 듣는
 * 조건에서 무엇이 무너지는지는 말해 주지 못한다. 녹음 파일이 있을 때만
 * 돌도록 두어, 없는 사람은 그냥 건너뛴다.
 *
 *   SCORE2GP_SAMPLE_WAV=... SCORE2GP_SCORE_BPM=128 SCORE2GP_TRUE_BPM=156 npx vitest run beatFit.live
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeWav } from "./wav";
import { createOnsetDetector } from "./onsetDetect";
import { fitBeat, type BeatSample } from "./beatFit";

const wavPath = process.env.SCORE2GP_SAMPLE_WAV;
const scoreBpm = Number(process.env.SCORE2GP_SCORE_BPM ?? 128);
const trueBpm = Number(process.env.SCORE2GP_TRUE_BPM ?? 0);

describe.skipIf(!wavPath)("실제 녹음", () => {
  it("읽은 빠르기를 시간에 따라 보여준다", () => {
    const { samples, sampleRate } = decodeWav(readFileSync(wavPath as string));
    const detector = createOnsetDetector(sampleRate);

    const all: BeatSample[] = [];
    let onsetCount = 0;
    const CHUNK = 1024;
    const readings: {
      at: number;
      bpm: number;
      strength: number;
      sharp: number;
    }[] = [];

    for (let i = 0; i < samples.length; i += CHUNK) {
      const { onsets, novelty } = detector.push(samples.subarray(i, i + CHUNK));
      onsetCount += onsets.length;
      for (const n of novelty) all.push({ time: n.time, weight: n.value });

      const now = detector.elapsed;
      if (
        now >= 6 &&
        Math.abs(now % 1) < 0.03 &&
        readings[readings.length - 1]?.at !== Math.floor(now)
      ) {
        const recent = all.filter((s) => now - s.time <= 6);
        const fit = fitBeat(recent, scoreBpm, 0.35);
        if (fit) {
          readings.push({
            at: Math.floor(now),
            bpm: fit.bpm,
            strength: fit.strength,
            sharp: fit.sharpness,
          });
        }
      }
    }

    console.log(
      `길이 ${(samples.length / sampleRate).toFixed(1)}초 · 표본율 ${sampleRate}`,
    );
    console.log(`문턱을 넘긴 타격 ${onsetCount}개 · 근거 점 ${all.length}개`);
    if (trueBpm) console.log(`정답으로 본 빠르기 ${trueBpm} BPM`);
    for (const r of readings) {
      console.log(
        `  ${String(r.at).padStart(2)}초: ${r.bpm.toFixed(1)} BPM` +
          ` · 맞은 정도 ${(r.strength * 100).toFixed(0)}%` +
          ` · 두드러짐 ${r.sharp.toFixed(2)}배`,
      );
    }
    expect(readings.length).toBeGreaterThan(0);
  });
});
