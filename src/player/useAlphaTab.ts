import * as alphaTab from "@coderline/alphatab";
import { useCallback, useEffect, useRef, useState } from "react";
import { detectScoreEncoding, isGarbled } from "../lib/detectEncoding";

export interface TrackView {
  index: number;
  name: string;
  /** 0 ~ 1.5, 1 = 원본 볼륨 */
  volume: number;
  mute: boolean;
  solo: boolean;
}

export const SPEED_MIN = 0.25;
export const SPEED_MAX = 2;
export const TRANSPOSE_MIN = -12;
export const TRANSPOSE_MAX = 12;

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

/**
 * alphaTab 인스턴스의 수명과 재생 상태를 관리하는 훅.
 * 모드(읽기/편집)와 무관하게 App 레벨에서 하나만 생성하고,
 * 각 모드 UI는 이 핸들을 통해서만 플레이어를 제어한다.
 */
export function useAlphaTab() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<alphaTab.AlphaTabApi | null>(null);
  const barStartsRef = useRef<number[]>([]);
  const currentBarRef = useRef(0);
  const lastBytesRef = useRef<Uint8Array | null>(null);

  const [score, setScore] = useState<alphaTab.model.Score | null>(null);
  const [scoreTitle, setScoreTitle] = useState("");
  const [tracks, setTracks] = useState<TrackView[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentBar, setCurrentBar] = useState(0);
  const [barCount, setBarCount] = useState(0);
  const [speed, setSpeedState] = useState(1);
  const [transpose, setTransposeState] = useState(0);
  const [masterVolume, setMasterVolumeState] = useState(1);
  const [isLooping, setIsLooping] = useState(false);
  const [metronomeOn, setMetronomeOn] = useState(false);
  const [countInOn, setCountInOn] = useState(false);
  const [tabOnly, setTabOnly] = useState(false);
  const [encoding, setEncodingState] = useState("utf-8");
  const [isGarbledText, setIsGarbledText] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const api = new alphaTab.AlphaTabApi(el, {
      core: {
        fontDirectory: "/font/",
        logLevel: alphaTab.LogLevel.Warning,
      },
      display: {
        layoutMode: alphaTab.LayoutMode.Page,
      },
      player: {
        playerMode: alphaTab.PlayerMode.EnabledAutomatic,
        soundFont: "/soundfont.sf3",
        scrollElement: viewportRef.current ?? undefined,
        scrollMode: alphaTab.ScrollMode.Continuous,
      },
    });
    apiRef.current = api;

    api.scoreLoaded.on((s) => {
      setScore(s);
      setIsGarbledText(isGarbled(s));
      setScoreTitle(s.title || "제목 없음");
      setBarCount(s.masterBars.length);
      currentBarRef.current = 0;
      setCurrentBar(0);
      setTransposeState(0);
      setIsLoading(false);
      setError(null);
      setTracks(
        s.tracks.map((t) => ({
          index: t.index,
          name: t.name || `트랙 ${t.index + 1}`,
          volume: 1,
          mute: false,
          solo: false,
        })),
      );
    });

    api.midiLoaded.on(() => {
      const s = api.score;
      const tc = api.tickCache;
      barStartsRef.current =
        s && tc ? s.masterBars.map((mb) => tc.getMasterBarStart(mb)) : [];
    });

    api.playerReady.on(() => setIsPlayerReady(true));

    api.playerStateChanged.on((e) => {
      setIsPlaying(e.state === alphaTab.synth.PlayerState.Playing);
    });

    api.playerPositionChanged.on((e) => {
      const starts = barStartsRef.current;
      for (let i = starts.length - 1; i >= 0; i--) {
        if (e.currentTick >= starts[i]) {
          if (currentBarRef.current !== i) {
            currentBarRef.current = i;
            setCurrentBar(i);
          }
          break;
        }
      }
    });

    api.error.on((err) => {
      setIsLoading(false);
      setError(err.message ?? String(err));
    });

    return () => {
      api.destroy();
      apiRef.current = null;
    };
  }, []);

  const loadWithEncoding = useCallback((data: Uint8Array, enc: string) => {
    const api = apiRef.current;
    if (!api) return;
    setIsLoading(true);
    setError(null);
    lastBytesRef.current = data;
    api.settings.importer.encoding = enc;
    api.updateSettings();
    setEncodingState(enc);
    api.load(data);
  }, []);

  const loadBytes = useCallback(
    (data: Uint8Array) => {
      // 파일마다 문자 인코딩이 다르므로 로드 전에 먼저 판별한다.
      loadWithEncoding(data, detectScoreEncoding(data));
    },
    [loadWithEncoding],
  );

  /** 자동 판별이 틀렸을 때 사용자가 직접 인코딩을 지정해 다시 읽는다. */
  const setEncoding = useCallback(
    (enc: string) => {
      const data = lastBytesRef.current;
      if (data) loadWithEncoding(data, enc);
    },
    [loadWithEncoding],
  );

  const loadTex = useCallback((tex: string) => {
    setIsLoading(true);
    setError(null);
    // alphaTex는 문자열 입력이라 인코딩과 무관하다. 이전 파일의 인코딩 상태를 지운다.
    lastBytesRef.current = null;
    setIsGarbledText(false);
    setEncodingState("utf-8");
    apiRef.current?.tex(tex);
  }, []);

  const playPause = useCallback(() => {
    apiRef.current?.playPause();
  }, []);

  const stop = useCallback(() => {
    apiRef.current?.stop();
    currentBarRef.current = 0;
    setCurrentBar(0);
  }, []);

  const goToBar = useCallback((index: number) => {
    const api = apiRef.current;
    const starts = barStartsRef.current;
    if (!api || starts.length === 0) return;
    const clamped = clamp(index, 0, starts.length - 1);
    api.tickPosition = starts[clamped];
    currentBarRef.current = clamped;
    setCurrentBar(clamped);
  }, []);

  const seekBars = useCallback(
    (delta: number) => goToBar(currentBarRef.current + delta),
    [goToBar],
  );

  const setSpeed = useCallback((value: number) => {
    const api = apiRef.current;
    if (!api) return;
    const v = clamp(Math.round(value * 100) / 100, SPEED_MIN, SPEED_MAX);
    api.playbackSpeed = v;
    setSpeedState(v);
  }, []);

  const setTranspose = useCallback((semitones: number) => {
    const api = apiRef.current;
    if (!api?.score) return;
    const v = clamp(Math.round(semitones), TRANSPOSE_MIN, TRANSPOSE_MAX);
    api.changeTrackTranspositionPitch([...api.score.tracks], v);
    setTransposeState(v);
  }, []);

  const setMasterVolume = useCallback((value: number) => {
    const api = apiRef.current;
    if (!api) return;
    const v = clamp(value, 0, 1);
    api.masterVolume = v;
    setMasterVolumeState(v);
  }, []);

  const toggleLoop = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    api.isLooping = !api.isLooping;
    setIsLooping(api.isLooping);
  }, []);

  const toggleMetronome = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    const on = api.metronomeVolume === 0;
    api.metronomeVolume = on ? 1 : 0;
    setMetronomeOn(on);
  }, []);

  const toggleCountIn = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    const on = api.countInVolume === 0;
    api.countInVolume = on ? 1 : 0;
    setCountInOn(on);
  }, []);

  const toggleTabOnly = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    setTabOnly((prev) => {
      const next = !prev;
      api.settings.display.staveProfile = next
        ? alphaTab.StaveProfile.Tab
        : alphaTab.StaveProfile.Default;
      api.updateSettings();
      api.render();
      return next;
    });
  }, []);

  const setTrackVolume = useCallback((trackIndex: number, volume: number) => {
    const api = apiRef.current;
    const track = api?.score?.tracks[trackIndex];
    if (!api || !track) return;
    const v = clamp(volume, 0, 1.5);
    api.changeTrackVolume([track], v);
    setTracks((prev) =>
      prev.map((t) => (t.index === trackIndex ? { ...t, volume: v } : t)),
    );
  }, []);

  const toggleTrackMute = useCallback((trackIndex: number) => {
    const api = apiRef.current;
    const track = api?.score?.tracks[trackIndex];
    if (!api || !track) return;
    setTracks((prev) =>
      prev.map((t) => {
        if (t.index !== trackIndex) return t;
        api.changeTrackMute([track], !t.mute);
        return { ...t, mute: !t.mute };
      }),
    );
  }, []);

  const toggleTrackSolo = useCallback((trackIndex: number) => {
    const api = apiRef.current;
    const track = api?.score?.tracks[trackIndex];
    if (!api || !track) return;
    setTracks((prev) =>
      prev.map((t) => {
        if (t.index !== trackIndex) return t;
        api.changeTrackSolo([track], !t.solo);
        return { ...t, solo: !t.solo };
      }),
    );
  }, []);

  return {
    containerRef,
    viewportRef,
    score,
    scoreTitle,
    tracks,
    isPlaying,
    isPlayerReady,
    isLoading,
    currentBar,
    barCount,
    speed,
    transpose,
    masterVolume,
    isLooping,
    metronomeOn,
    countInOn,
    tabOnly,
    encoding,
    isGarbledText,
    error,
    loadBytes,
    loadTex,
    setEncoding,
    playPause,
    stop,
    goToBar,
    seekBars,
    setSpeed,
    setTranspose,
    setMasterVolume,
    toggleLoop,
    toggleMetronome,
    toggleCountIn,
    toggleTabOnly,
    setTrackVolume,
    toggleTrackMute,
    toggleTrackSolo,
  };
}

export type PlayerHandle = ReturnType<typeof useAlphaTab>;
