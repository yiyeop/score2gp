/**
 * 연습 설정(속도·조옮김·볼륨·탭 전용 보기)을 파일(곡) 단위로 로컬에 저장한다.
 *
 * PRD 결정(T-3): 저장 스코프는 파일 단위이지 전역이 아니다 — 곡마다 원하는
 * 속도·조옮김이 다르기 때문이다. 키는 파일명을 쓴다(내용 해시가 이름 변경에는
 * 더 강하지만, 열 때마다 파일 전체를 해시해야 해서 비용이 더 크다 — 이 앱은
 * 순수 로컬 데스크톱 앱이라 파일명 충돌·이름 변경이 흔한 시나리오가 아니라고
 * 보고 더 단순한 쪽을 택했다).
 *
 * 백엔드가 없는 순수 로컬 앱이고 Tauri 웹뷰 안에서 돌아가므로, 별도 플러그인
 * (tauri-plugin-store) 없이 웹뷰가 이미 제공하는 `localStorage`를 그대로 쓴다.
 */

export interface PracticeSettings {
  speed: number;
  transpose: number;
  masterVolume: number;
  tabOnly: boolean;
}

export const DEFAULT_PRACTICE_SETTINGS: PracticeSettings = {
  speed: 1,
  transpose: 0,
  masterVolume: 1,
  tabOnly: false,
};

const STORAGE_PREFIX = "score2gp:practice-settings:";
// 데모 곡은 파일명이 없다(alphaTex 문자열을 바로 불러옴). 그래도 자기 설정을
// 유지하도록 고정 키를 쓴다 — 그래야 데모 곡을 열 때 방금 전 파일의 설정이
// 새어 들어오는 것도 막을 수 있다.
const DEMO_KEY = "__demo__";

/** `localStorage`와 같은 모양이면 충분 — 테스트에서 실제 브라우저 스토리지 없이 갈아끼울 수 있다. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function storageKeyFor(fileName: string | null): string {
  return STORAGE_PREFIX + (fileName ?? DEMO_KEY);
}

function fallbackStorage(): KeyValueStorage {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  // SSR·테스트 등 localStorage가 없는 환경에서도 죽지 않게 하는 안전망.
  return { getItem: () => null, setItem: () => {} };
}

function isPlausibleSettings(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/**
 * 파일의 저장된 연습 설정을 읽는다. 저장된 값이 없거나(첫 곡) 손상된 경우
 * 기본값을 돌려준다 — 다른 파일의 값으로 폴백하지 않는다.
 */
export function loadPracticeSettings(
  fileName: string | null,
  storage: KeyValueStorage = fallbackStorage(),
): PracticeSettings {
  try {
    const raw = storage.getItem(storageKeyFor(fileName));
    if (!raw) return DEFAULT_PRACTICE_SETTINGS;
    const parsed: unknown = JSON.parse(raw);
    if (!isPlausibleSettings(parsed)) return DEFAULT_PRACTICE_SETTINGS;
    return {
      speed:
        typeof parsed.speed === "number"
          ? parsed.speed
          : DEFAULT_PRACTICE_SETTINGS.speed,
      transpose:
        typeof parsed.transpose === "number"
          ? parsed.transpose
          : DEFAULT_PRACTICE_SETTINGS.transpose,
      masterVolume:
        typeof parsed.masterVolume === "number"
          ? parsed.masterVolume
          : DEFAULT_PRACTICE_SETTINGS.masterVolume,
      tabOnly:
        typeof parsed.tabOnly === "boolean"
          ? parsed.tabOnly
          : DEFAULT_PRACTICE_SETTINGS.tabOnly,
    };
  } catch {
    return DEFAULT_PRACTICE_SETTINGS;
  }
}

/** 파일의 연습 설정을 저장한다. 실패해도(용량 초과 등) 조용히 무시한다 — 부가 기능이라 앱 사용을 막으면 안 된다. */
export function savePracticeSettings(
  fileName: string | null,
  settings: PracticeSettings,
  storage: KeyValueStorage = fallbackStorage(),
): void {
  try {
    storage.setItem(storageKeyFor(fileName), JSON.stringify(settings));
  } catch {
    // no-op
  }
}
