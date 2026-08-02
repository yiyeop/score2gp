/** 지원하는 악보 파일 확장자 (alphaTab이 읽을 수 있는 포맷) */
export const SCORE_EXTENSIONS = [
  "gp",
  "gp3",
  "gp4",
  "gp5",
  "gpx",
  "xml",
  "musicxml",
  "mxl",
];

export interface OpenedScore {
  name: string;
  data: Uint8Array;
}

const isTauri = () => "__TAURI_INTERNALS__" in window;

/**
 * 악보 파일 열기.
 * - Tauri 환경: 네이티브 파일 다이얼로그 + Rust `read_score` 커맨드
 * - 브라우저(개발용): <input type="file"> 폴백
 */
export async function openScoreFile(): Promise<OpenedScore | null> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { invoke } = await import("@tauri-apps/api/core");
    const path = await open({
      multiple: false,
      filters: [{ name: "악보 파일", extensions: SCORE_EXTENSIONS }],
    });
    if (!path) return null;
    const data = await invoke<number[]>("read_score", { path });
    const name = path.replace(/\\/g, "/").split("/").pop() ?? path;
    return { name, data: new Uint8Array(data) };
  }

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = SCORE_EXTENSIONS.map((e) => `.${e}`).join(",");
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      resolve({ name: file.name, data: new Uint8Array(await file.arrayBuffer()) });
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export interface ConvertResult {
  output: string;
  log: string;
  /** 전에 바꿔 둔 결과를 그대로 열었는지 */
  fromCache: boolean;
}

/**
 * PDF 악보를 Guitar Pro 파일로 변환해 연다.
 *
 * 변환은 네이티브 쪽에서 돌아가므로 앱(Tauri)에서만 쓸 수 있다.
 * 브라우저로 열어 개발할 때는 이 기능이 보이지 않는다.
 */
export async function convertPdfFile(): Promise<
  (OpenedScore & { log: string; converted: string; fromCache: boolean }) | null
> {
    if (!isTauri()) {
    throw new Error("PDF 변환은 앱에서만 됩니다");
  }

  const { open } = await import("@tauri-apps/plugin-dialog");
  const { invoke } = await import("@tauri-apps/api/core");

  const path = await open({
    multiple: false,
    filters: [{ name: "PDF 악보", extensions: ["pdf"] }],
  });
  if (!path) return null;

  const result = await invoke<ConvertResult>("convert_pdf", { path });
  const data = await invoke<number[]>("read_score", { path: result.output });
  const name = path.replace(/\\/g, "/").split("/").pop() ?? path;
  return {
    name,
    data: new Uint8Array(data),
    log: result.log,
    converted: result.output,
    fromCache: result.fromCache,
  };
}

/**
 * 악보를 사용자가 고른 자리에 저장한다.
 *
 * 변환물은 임시 폴더에 있어 앱을 끄면 사라진다. Guitar Pro나 TuxGuitar로
 * 이어서 쓰려면 남길 수 있어야 한다.
 *
 * `content`가 파일 경로면 그 파일을 복사하고(변환기가 쓴 .gp5),
 * 바이트면 그대로 쓴다(alphaTab이 만들어낸 .gp·MIDI 등).
 */
export async function saveScoreAs(
  content: string | Uint8Array,
  suggestedName: string,
  format: { label: string; extension: string },
): Promise<boolean> {
  if (!isTauri()) {
    throw new Error("저장은 앱에서만 됩니다");
  }

  const { save } = await import("@tauri-apps/plugin-dialog");
  const { invoke } = await import("@tauri-apps/api/core");

  const target = await save({
    defaultPath: suggestedName,
    filters: [{ name: format.label, extensions: [format.extension] }],
  });
  if (!target) return false;

  if (typeof content === "string") {
    await invoke("save_score", { source: content, target });
  } else {
    await invoke("write_score", { target, data: Array.from(content) });
  }
  return true;
}
