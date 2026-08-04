import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRACTICE_SETTINGS,
  loadPracticeSettings,
  savePracticeSettings,
  type KeyValueStorage,
} from "./practiceSettings";

/** 실제 브라우저 localStorage 없이 테스트할 수 있게 하는 메모리 스토리지. */
function memoryStorage(): KeyValueStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

describe("loadPracticeSettings", () => {
  it("returns defaults for a file with no saved settings (no global fallback)", () => {
    const storage = memoryStorage();
    expect(loadPracticeSettings("song-a.gp", storage)).toEqual(
      DEFAULT_PRACTICE_SETTINGS,
    );
  });

  it("returns defaults when storage has corrupted JSON", () => {
    const storage = memoryStorage();
    storage.setItem("score2gp:practice-settings:song-a.gp", "{not json");
    expect(loadPracticeSettings("song-a.gp", storage)).toEqual(
      DEFAULT_PRACTICE_SETTINGS,
    );
  });

  it("fills in defaults for missing/invalid fields in stored JSON", () => {
    const storage = memoryStorage();
    storage.setItem(
      "score2gp:practice-settings:song-a.gp",
      JSON.stringify({ speed: 1.5 }),
    );
    expect(loadPracticeSettings("song-a.gp", storage)).toEqual({
      ...DEFAULT_PRACTICE_SETTINGS,
      speed: 1.5,
    });
  });

  it("round-trips a saved value for the same file", () => {
    const storage = memoryStorage();
    const settings = { speed: 0.75, transpose: -2, masterVolume: 0.5, tabOnly: true };
    savePracticeSettings("song-a.gp", settings, storage);
    expect(loadPracticeSettings("song-a.gp", storage)).toEqual(settings);
  });

  it("scopes settings per file — a different file never sees another file's values", () => {
    const storage = memoryStorage();
    savePracticeSettings(
      "song-a.gp",
      { speed: 1.8, transpose: 5, masterVolume: 0.2, tabOnly: true },
      storage,
    );
    expect(loadPracticeSettings("song-b.gp", storage)).toEqual(
      DEFAULT_PRACTICE_SETTINGS,
    );
  });

  it("re-opening the same file after switching away restores its last settings", () => {
    const storage = memoryStorage();
    const forA = { speed: 1.2, transpose: 3, masterVolume: 0.6, tabOnly: false };
    const forB = { speed: 0.5, transpose: -1, masterVolume: 1, tabOnly: true };
    savePracticeSettings("song-a.gp", forA, storage);
    savePracticeSettings("song-b.gp", forB, storage);

    expect(loadPracticeSettings("song-a.gp", storage)).toEqual(forA);
    expect(loadPracticeSettings("song-b.gp", storage)).toEqual(forB);
  });

  it("gives the demo song (null file name) its own persisted key, isolated from real files", () => {
    const storage = memoryStorage();
    savePracticeSettings(null, { speed: 1.3, transpose: 1, masterVolume: 0.8, tabOnly: true }, storage);
    savePracticeSettings(
      "song-a.gp",
      { speed: 0.9, transpose: -4, masterVolume: 0.3, tabOnly: false },
      storage,
    );

    expect(loadPracticeSettings(null, storage)).toEqual({
      speed: 1.3,
      transpose: 1,
      masterVolume: 0.8,
      tabOnly: true,
    });
  });
});
