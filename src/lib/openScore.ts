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
