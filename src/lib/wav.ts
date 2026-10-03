/**
 * 마이크로 들은 소리를 WAV 바이트로 만든다.
 *
 * 박을 읽는 계산은 실제 연주 소리 앞에서만 정직하게 검증된다. 그런데 소리는
 * 볼 수도 없고 다시 틀 수도 없어서, 앱을 고칠 때마다 사람에게 "다시 틀어
 * 주세요"를 부탁하게 된다. 그러지 않으려고 몇십 초를 파일로 남겨 두고,
 * 그 파일로 테스트를 돌린다.
 *
 * 16비트 PCM 한 채널로만 쓴다 — 분석에 필요한 건 파형뿐이고, 형식이 단순할수록
 * 어떤 도구로든 열어 볼 수 있다.
 */

/** Float32 표본(-1~1)을 16비트 모노 WAV 바이트로 만든다. */
export function encodeWav(
  samples: Float32Array,
  sampleRate: number,
): Uint8Array {
  const bytesPerSample = 2;
  const dataBytes = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++)
      view.setUint8(offset + i, text.charCodeAt(i));
  };

  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true); // 이 헤더 뒤로 남은 바이트 수
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // fmt 청크 길이
  view.setUint16(20, 1, true); // 1 = 압축 없는 PCM
  view.setUint16(22, 1, true); // 채널 수
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // 초당 바이트
  view.setUint16(32, bytesPerSample, true); // 한 프레임의 바이트
  view.setUint16(34, 8 * bytesPerSample, true); // 표본 비트 수
  ascii(36, "data");
  view.setUint32(40, dataBytes, true);

  for (let i = 0; i < samples.length; i++) {
    // 범위를 벗어난 값은 잘라 낸다 — 넘치면 반대 부호로 감겨 찢어진 소리가 된다.
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * bytesPerSample, Math.round(clamped * 32767), true);
  }
  return new Uint8Array(buffer);
}

/** WAV 바이트에서 표본과 표본율을 되읽는다(테스트와 오프라인 분석용). */
export function decodeWav(bytes: Uint8Array): {
  samples: Float32Array;
  sampleRate: number;
} {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sampleRate = view.getUint32(24, true);
  const channels = view.getUint16(22, true);
  const bits = view.getUint16(34, true);
  if (bits !== 16) throw new Error(`16비트 WAV만 읽는다 (${bits}비트)`);

  // 청크 순서는 도구마다 달라서 data 청크를 찾아 들어간다.
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const id = String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3),
    );
    const size = view.getUint32(offset + 4, true);
    if (id === "data") {
      const count = Math.floor(size / 2);
      const samples = new Float32Array(Math.floor(count / channels));
      for (let i = 0; i < samples.length; i++) {
        // 여러 채널이면 첫 채널만 본다.
        samples[i] = view.getInt16(offset + 8 + i * 2 * channels, true) / 32768;
      }
      return { samples, sampleRate };
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error("WAV에 data 청크가 없다");
}
