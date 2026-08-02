import * as alphaTab from "@coderline/alphatab";

/**
 * 화면에 열린 악보를 다른 포맷으로 내보낸다.
 *
 * 변환한 PDF는 이미 .gp5로 만들어 두었지만, 사람마다 쓰는 프로그램이 다르다.
 * Guitar Pro 7만 쓰는 사람도 있고, DAW로 가져가려면 MIDI가 필요하다.
 */
export type ExportFormatId = "gp5" | "gp" | "mid" | "alphatex";

export interface ExportFormat {
  id: ExportFormatId;
  /** 파일 확장자 (점 없이) */
  extension: string;
  label: string;
  /** 고를 때 보여줄 설명 */
  hint: string;
  /**
   * 변환한 PDF에서만 낼 수 있는 포맷인지.
   *
   * .gp5는 우리 추출기가 직접 쓴 파일이라 그대로 복사하면 되지만,
   * alphaTab에는 gp5로 쓰는 기능이 없어서 다른 악보에서는 만들 수 없다.
   */
  convertedOnly?: boolean;
}

export const EXPORT_FORMATS: ExportFormat[] = [
  {
    id: "gp5",
    extension: "gp5",
    label: "Guitar Pro 5",
    hint: "변환기가 만든 원본 그대로. Guitar Pro 5·6·7과 TuxGuitar에서 열려요.",
    convertedOnly: true,
  },
  {
    id: "gp",
    extension: "gp",
    label: "Guitar Pro 7",
    hint: "Guitar Pro 7 이상에서 쓰는 최신 형식이에요.",
  },
  {
    id: "mid",
    extension: "mid",
    label: "MIDI",
    hint: "DAW나 다른 음악 프로그램으로 가져갈 때 써요. 타브 정보는 빠져요.",
  },
  {
    id: "alphatex",
    extension: "alphatex",
    label: "alphaTex (텍스트)",
    hint: "악보를 글로 적은 형식이에요. 직접 고치거나 비교할 때 편해요.",
  },
];

/**
 * 악보를 해당 포맷의 바이트로 만든다.
 *
 * `gp5`는 여기서 만들 수 없다 — 변환기가 써 둔 파일을 그대로 복사해야 한다.
 */
export function exportScore(
  score: alphaTab.model.Score,
  format: ExportFormatId,
  settings?: alphaTab.Settings | null,
): Uint8Array {
  switch (format) {
    case "gp":
      return new alphaTab.exporter.Gp7Exporter().export(score, settings);
    case "alphatex":
      return new alphaTab.exporter.AlphaTexExporter().export(score, settings);
    case "mid":
      return exportMidi(score, settings);
    case "gp5":
      throw new Error("Guitar Pro 5는 변환한 악보에서만 저장할 수 있습니다");
  }
}

/**
 * 재생용으로 쓰는 것과 같은 방식으로 MIDI를 만든다.
 *
 * alphaTab의 `downloadMidi()`는 브라우저 다운로드를 띄우는 함수라
 * 저장 위치를 우리가 고를 수 없다. 그래서 바이트를 직접 만든다.
 */
function exportMidi(
  score: alphaTab.model.Score,
  settings?: alphaTab.Settings | null,
): Uint8Array {
  const midi = new alphaTab.midi.MidiFile();
  // 표준 MIDI 파일(SMF 1.0) 모드로 만든다. 기본값인 MIDI 2.0 이벤트는 파일로
  // 쓸 수 없어서 그대로 두면 내보내기가 실패한다. 대신 한 음에 여러 번
  // 걸리는 밴딩은 뭉개질 수 있는데, 다른 프로그램에서 열리는 편이 먼저다.
  const handler = new alphaTab.midi.AlphaSynthMidiFileHandler(midi, true);
  const generator = new alphaTab.midi.MidiFileGenerator(
    score,
    settings ?? null,
    handler,
  );
  generator.generate();

  const buffer = alphaTab.io.ByteBuffer.withCapacity(1024);
  midi.writeTo(buffer);
  return buffer.toArray();
}

/** 원본 이름에서 확장자만 바꾼 저장 이름을 만든다. */
export function suggestFileName(source: string, extension: string): string {
  const base = source.replace(/\.[^./\\]+$/, "") || "score";
  return `${base}.${extension}`;
}
