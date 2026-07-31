import * as alphaTab from "@coderline/alphatab";

/**
 * 시도할 인코딩 후보. UTF-8이 아닌 파일은 대부분 만든 사람의
 * OS 로컬 인코딩으로 저장돼 있어서, 한국어 사용자 기준으로 정렬했다.
 */
export const ENCODING_CANDIDATES = [
  { value: "utf-8", label: "자동 (UTF-8)" },
  { value: "euc-kr", label: "한국어 (EUC-KR / CP949)" },
  { value: "shift_jis", label: "일본어 (Shift_JIS)" },
  { value: "gb18030", label: "중국어 (GB18030)" },
  { value: "windows-1252", label: "서유럽 (Windows-1252)" },
];

/** 디코딩에 실패한 바이트는 U+FFFD(�)로 치환되므로, 이게 있으면 인코딩이 틀린 것 */
export function isGarbled(score: alphaTab.model.Score): boolean {
  const texts = [
    score.title,
    score.subTitle,
    score.artist,
    score.album,
    score.words,
    score.music,
    ...score.tracks.map((t) => t.name),
  ];
  return texts.some((t) => t?.includes("�"));
}

/**
 * 악보 파일의 문자 인코딩을 추측한다.
 *
 * 구형 Guitar Pro(gp3~gp5)는 문자열을 UTF-8이 아닌 로컬 인코딩으로 저장해서
 * 한국에서 만든 파일은 제목·트랙명이 깨진다. 후보 인코딩으로 차례로 파싱해보고
 * 깨진 문자가 없는 첫 번째를 고른다.
 *
 * 판별용 파싱이 한 번 더 들어가지만, 대부분의 파일은 첫 후보(UTF-8)에서 끝난다.
 */
export function detectScoreEncoding(data: Uint8Array): string {
  for (const { value } of ENCODING_CANDIDATES) {
    try {
      const settings = new alphaTab.Settings();
      settings.importer.encoding = value;
      const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(
        data,
        settings,
      );
      if (!isGarbled(score)) return value;
    } catch {
      // 이 인코딩으로는 파싱 자체가 실패 — 다음 후보를 시도한다.
      // 파일이 아예 손상된 경우는 실제 load()에서 에러로 잡힌다.
    }
  }
  return "utf-8";
}
