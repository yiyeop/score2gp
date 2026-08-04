import * as alphaTab from "@coderline/alphatab";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { detectScoreEncoding, isGarbled } from "../lib/detectEncoding";
import {
  describeEffects,
  effectsForTrack,
  readChannelEffects,
  type ChannelEffects,
} from "../lib/gpEffects";
import { exportScore, type ExportFormatId } from "../lib/exportScore";
import { forDisplay, techniquesOfBeat, type Technique } from "../lib/techniques";
import { barRangeToTicks, normalizeBarRange, type BarRange } from "../lib/loopRange";

/** 편집 모드에서 고른 대상. 박은 항상 있고, 쉼표라면 음이 없다. */
export interface ScoreSelection {
  beat: alphaTab.model.Beat;
  note: alphaTab.model.Note | null;
}

/** 고른 음을 덮는 네모. 악보를 다시 그리거나 스크롤하면 다시 잡는다. */
export interface SelectionBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TechniqueHover {
  techniques: Technique[];
  /** 화면 좌표. 툴팁을 해당 음 바로 위에 붙인다. */
  x: number;
  y: number;
}

export interface TrackView {
  /**
   * `score.tracks` 배열에서의 위치.
   *
   * alphaTab의 `Track.index`는 파일에 기록된 트랙 번호라 배열 위치와 다를 수 있다
   * (실제 Guitar Pro 파일에서 확인됨). 훅 안팎을 모두 배열 위치로 통일해야
   * 뮤트/솔로/보기가 엉뚱한 트랙에 적용되지 않는다.
   */
  index: number;
  name: string;
  /** 0 ~ 1.5, 1 = 원본 볼륨 */
  volume: number;
  mute: boolean;
  solo: boolean;
  /**
   * 이 트랙에 걸린 이펙터를 사람 말로 옮긴 것 (예: "코러스 강하게").
   *
   * alphaTab이 버리는 정보라 파일에서 직접 읽는다 (`lib/gpEffects.ts`).
   * 이펙터를 안 걸었거나 GP 파일이 아니면 빈 배열이다.
   */
  effects: string[];
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
  // 구간 반복(마디 A-B)과 곡 전체 반복 토글은 alphaTab의 단일 `isLooping`
  // 플래그를 공유한다. 구간이 지정돼 있으면 항상 그 구간을 반복하고,
  // 해제되면 곡 전체 반복 토글의 상태로 되돌아간다 — 이 판단을 하려면
  // 두 상태를 이벤트 콜백(클로저) 안에서도 최신값으로 읽을 ref가 필요하다.
  const barLoopRangeRef = useRef<BarRange | null>(null);
  const isLoopingRef = useRef(false);
  const lastBytesRef = useRef<Uint8Array | null>(null);
  // 파일에서 직접 읽은 채널별 이펙터. 트랙은 playbackInfo로 채널을 가리킨다.
  const channelEffectsRef = useRef<ChannelEffects[]>([]);
  // 고른 음의 자리를 다시 계산하는 함수. 이펙트 안에서 만들어 밖에서도 부른다.
  const trackSelectionRef = useRef<() => void>(() => {});

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
  // 시작/끝 마디를 직접 골라 지정한 구간 반복. null이면 지정 안 됨.
  const [barLoopRange, setBarLoopRangeState] = useState<BarRange | null>(null);
  const [metronomeOn, setMetronomeOn] = useState(false);
  const [countInOn, setCountInOn] = useState(false);
  const [tabOnly, setTabOnly] = useState(false);
  const [visibleTracks, setVisibleTracks] = useState<number[]>([0]);
  const [hover, setHover] = useState<TechniqueHover | null>(null);
  // 주법 안내(사이드바 목록 + 악보 툴팁) 전체 on/off. 기본은 켜짐.
  const [techniqueGuide, setTechniqueGuide] = useState(true);
  const techniqueGuideRef = useRef(true);
  const [encoding, setEncodingState] = useState("utf-8");
  const [isGarbledText, setIsGarbledText] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 편집 모드에서 고른 음. 읽기 모드에서는 쓰지 않는다.
  const [selection, setSelection] = useState<ScoreSelection | null>(null);
  // 악보 '내용'이 바뀔 때마다 오른다. 편집은 같은 객체를 고치므로 참조만
  // 보는 곳(타임라인 등)은 바뀐 걸 알아채지 못한다.
  const [revision, setRevision] = useState(0);
  // 고른 음을 악보 위에 표시할 자리 (화면 좌표)
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const selectionRef = useRef<ScoreSelection | null>(null);
  selectionRef.current = selection;
  isLoopingRef.current = isLooping;
  barLoopRangeRef.current = barLoopRange;

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
      // 아래에서 React 상태를 모두 기본값으로 되돌리므로, 신디사이저 쪽도 같이 맞춘다.
      // resetChannelStates는 볼륨까지는 지우지 않아서 따로 원래대로 돌린다.
      api.player?.resetChannelStates();
      if (s.tracks.length > 0) api.changeTrackVolume([...s.tracks], 1);

      setScore(s);
      setSelection(null);
      setIsGarbledText(isGarbled(s));
      setScoreTitle(s.title || "제목 없음");
      setBarCount(s.masterBars.length);
      currentBarRef.current = 0;
      setCurrentBar(0);
      setTransposeState(0);
      // 곡이 바뀌면 이전 곡의 tick 기준 구간은 의미가 없어진다.
      api.playbackRange = null;
      barLoopRangeRef.current = null;
      setBarLoopRangeState(null);
      api.isLooping = isLoopingRef.current;
      setIsLoading(false);
      setError(null);
      // alphaTab은 로드 후 첫 트랙만 그리므로 상태를 거기에 맞춘다.
      setVisibleTracks([0]);
      setTracks(
        s.tracks.map((t, i) => {
          const fx = effectsForTrack(
            channelEffectsRef.current,
            t.playbackInfo.primaryChannel,
            t.playbackInfo.program,
          );
          return {
            index: i,
            name: t.name || `트랙 ${i + 1}`,
            volume: 1,
            mute: false,
            solo: false,
            effects: fx ? describeEffects(fx) : [],
          };
        }),
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

    // 편집 모드에서 고칠 음을 고른다. 음표를 정확히 누르면 그 음이,
    // 박 언저리를 누르면 그 박의 첫 음이 잡힌다 — 초보자가 작은 숫자를
    // 정확히 겨냥하지 않아도 되도록.
    api.noteMouseDown.on((note) => {
      setSelection({ beat: note.beat, note });
    });
    api.beatMouseDown.on((beat) => {
      setSelection((prev) =>
        prev?.beat === beat ? prev : { beat, note: beat.notes[0] ?? null },
      );
    });

    // 악보 위에 마우스를 올리면 그 음에 쓰인 주법을 알려준다.
    // alphaTab은 마우스를 누른 상태의 이동만 이벤트로 주기 때문에(구간 선택용),
    // 단순 호버는 boundsLookup으로 직접 찾는다.
    let hoveredBeat: alphaTab.model.Beat | null = null;
    const clearHover = () => {
      if (hoveredBeat) {
        hoveredBeat = null;
        setHover(null);
      }
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!techniqueGuideRef.current) return clearHover();
      const lookup = api.boundsLookup;
      const surface = el.querySelector<HTMLElement>(".at-surface");
      if (!lookup || !surface) return clearHover();

      const rect = surface.getBoundingClientRect();
      const beat = lookup.getBeatAtPos(e.clientX - rect.left, e.clientY - rect.top);
      if (!beat) return clearHover();
      if (beat === hoveredBeat) return; // 같은 음 위에서는 다시 계산하지 않는다

      hoveredBeat = beat;
      const techniques = forDisplay(techniquesOfBeat(beat));
      if (techniques.length === 0) return setHover(null);

      // 커서가 아니라 음 자체에 붙여야 툴팁이 흔들리지 않는다.
      const bounds = lookup.findBeat(beat)?.visualBounds;
      setHover({
        techniques,
        x: bounds ? rect.left + bounds.x + bounds.w / 2 : e.clientX,
        y: bounds ? rect.top + bounds.y : e.clientY,
      });
    };

    // 고른 음의 자리를 다시 잡는다. 악보를 다시 그리거나 스크롤하면 어긋난다.
    const trackSelection = () => {
      const sel = selectionRef.current;
      const lookup = api.boundsLookup;
      const surface = el.querySelector<HTMLElement>(".at-surface");
      if (!sel || !lookup || !surface) return setSelectionBox(null);
      const bounds = lookup.findBeat(sel.beat)?.visualBounds;
      if (!bounds) return setSelectionBox(null);
      const rect = surface.getBoundingClientRect();
      setSelectionBox({
        x: rect.left + bounds.x,
        y: rect.top + bounds.y,
        w: bounds.w,
        h: bounds.h,
      });
    };
    trackSelectionRef.current = trackSelection;
    api.renderFinished.on(trackSelection);

    el.addEventListener("mousemove", onMouseMove);
    el.addEventListener("mouseleave", clearHover);
    const viewport = viewportRef.current;
    viewport?.addEventListener("scroll", clearHover);
    viewport?.addEventListener("scroll", trackSelection);

    return () => {
      el.removeEventListener("mousemove", onMouseMove);
      el.removeEventListener("mouseleave", clearHover);
      viewport?.removeEventListener("scroll", clearHover);
      viewport?.removeEventListener("scroll", trackSelection);
      api.destroy();
      apiRef.current = null;
    };
  }, []);

  // 고른 음이 바뀌면 표시 자리도 따라간다
  useEffect(() => {
    trackSelectionRef.current();
  }, [selection]);

  const loadWithEncoding = useCallback((data: Uint8Array, enc: string) => {
    const api = apiRef.current;
    if (!api) return;
    setIsLoading(true);
    setError(null);
    lastBytesRef.current = data;
    channelEffectsRef.current = readChannelEffects(data);
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
    channelEffectsRef.current = [];
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

  /**
   * 해당 마디가 보이도록 즉시 스크롤한다 (애니메이션 없음).
   *
   * alphaTab은 재생 중일 때만 커서를 따라 자동 스크롤한다
   * (내부적으로 `shouldScroll`이 재생 상태일 때만 true가 됨). 정지·일시정지
   * 상태에서 tickPosition만 옮기면 커서는 이동해도 화면은 그대로다.
   * 그래서 마디 이동·구간 클릭 시 직접 뷰포트를 계산해서 스크롤한다.
   * `scrollTop`을 직접 대입하면 브라우저 스무스 스크롤을 타지 않고 즉시 이동한다.
   */
  const scrollToBarInstant = useCallback((barIndex: number) => {
    const api = apiRef.current;
    const viewport = viewportRef.current;
    const container = containerRef.current;
    if (!api || !viewport || !container) return;
    const bounds = api.boundsLookup?.findMasterBarByIndex(barIndex)?.visualBounds;
    const surface = container.querySelector<HTMLElement>(".at-surface");
    if (!bounds || !surface) return;

    const surfaceTop = surface.getBoundingClientRect().top;
    const viewportTop = viewport.getBoundingClientRect().top;
    const targetTop = surfaceTop + bounds.y - viewportTop + viewport.scrollTop;

    const padding = 16;
    const maxScroll = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    viewport.scrollTop = clamp(targetTop - padding, 0, maxScroll);
  }, []);

  const goToBar = useCallback(
    (index: number) => {
      const api = apiRef.current;
      const starts = barStartsRef.current;
      if (!api || starts.length === 0) return;
      const clamped = clamp(index, 0, starts.length - 1);
      api.tickPosition = starts[clamped];
      currentBarRef.current = clamped;
      setCurrentBar(clamped);
      scrollToBarInstant(clamped);
    },
    [scrollToBarInstant],
  );

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

  /**
   * 지금 마디에 적힌 원래 빠르기(BPM).
   *
   * 곡 중간에 템포가 바뀌는 악보가 있어서 곡 전체의 대표 템포 하나로는
   * 맞지 않는다. 앞 마디부터 훑어 가장 마지막에 지정된 값을 쓴다.
   */
  const baseTempo = useMemo(() => {
    if (!score) return 0;
    let tempo = score.tempo;
    const last = Math.min(currentBar, score.masterBars.length - 1);
    for (let i = 0; i <= last; i++) {
      const changes = score.masterBars[i].tempoAutomations;
      if (changes && changes.length > 0) {
        tempo = changes[changes.length - 1].value;
      }
    }
    return tempo;
  }, [score, currentBar]);

  /** 지금 실제로 들리는 빠르기. 속도를 90%로 낮췄다면 그만큼 느린 값이다. */
  const bpm = baseTempo > 0 ? Math.round(baseTempo * speed) : 0;

  /**
   * 원하는 빠르기(BPM)로 맞춘다. 속도 배율로 환산해 적용하므로
   * 조절 가능한 범위는 속도 한계(25~200%)를 그대로 따른다.
   */
  const setBpm = useCallback(
    (value: number) => {
      if (baseTempo <= 0) return;
      setSpeed(value / baseTempo);
    },
    [baseTempo, setSpeed],
  );

  /**
   * 화면에 열린 악보를 다른 포맷의 바이트로 만든다.
   *
   * 조옮김·트랙 표시 같은 화면 설정이 아니라 악보 자체를 내보내므로,
   * 어떤 트랙을 보고 있든 결과는 같다.
   */
  /**
   * 악보를 고친 뒤 화면과 소리를 다시 만든다.
   *
   * `finish`는 마디 길이·이음줄처럼 음표에서 계산되는 값들을 다시 맞춘다.
   * 이걸 빼먹으면 화면은 바뀌어도 재생이 옛 길이로 흘러간다.
   */
  const refreshScore = useCallback(() => {
    const api = apiRef.current;
    if (!api?.score) return;
    api.score.finish(api.settings);
    // 지금 그리고 있는 트랙을 그대로 유지한다 (api.tracks가 그 목록이다)
    api.renderScore(
      api.score,
      api.tracks.map((t) => api.score!.tracks.indexOf(t)),
    );
    setRevision((r) => r + 1);
  }, []);

  /** 고른 음을 앞/뒤 박으로 옮긴다. 마디와 시스템을 넘어 이어진다. */
  const stepSelection = useCallback((delta: number) => {
    setSelection((prev) => {
      if (!prev) return prev;
      const voice = prev.beat.voice;
      const beats = voice.beats;
      const at = beats.indexOf(prev.beat);
      if (at < 0) return prev;

      const next = beats[at + delta];
      if (next) return { beat: next, note: next.notes[0] ?? null };

      // 마디 끝에 닿으면 옆 마디의 같은 성부로 넘어간다
      const bars = voice.bar.staff.bars;
      const barAt = bars.indexOf(voice.bar);
      const nextBar = bars[barAt + delta];
      const nextVoice = nextBar?.voices[voice.index];
      if (!nextVoice || nextVoice.beats.length === 0) return prev;
      const landing =
        delta > 0
          ? nextVoice.beats[0]
          : nextVoice.beats[nextVoice.beats.length - 1];
      return { beat: landing, note: landing.notes[0] ?? null };
    });
  }, []);

  const exportAs = useCallback((format: ExportFormatId): Uint8Array | null => {
    const api = apiRef.current;
    if (!api?.score) return null;
    return exportScore(api.score, format, api.settings);
  }, []);

  const setTranspose = useCallback((semitones: number) => {
    const api = apiRef.current;
    if (!api?.score) return;
    const v = clamp(Math.round(semitones), TRANSPOSE_MIN, TRANSPOSE_MAX);
    // 드럼은 조옮김에서 제외한다. 타악기는 음높이가 아니라 악기 종류를 가리켜서
    // 키를 옮기면 다른 타악기가 나거나 소리가 사라진다. 게다가 alphaTab은
    // 울리고 있는 음의 키를 보정할 때 타악기 채널만 건너뛰기 때문에,
    // 조옮김을 반복하면 note-off가 매칭되지 않아 드럼 음이 물린다.
    const pitched = api.score.tracks.filter((t) => !t.isPercussion);
    if (pitched.length > 0) api.changeTrackTranspositionPitch(pitched, v);
    setTransposeState(v);
  }, []);

  const setMasterVolume = useCallback((value: number) => {
    const api = apiRef.current;
    if (!api) return;
    const v = clamp(value, 0, 1);
    api.masterVolume = v;
    setMasterVolumeState(v);
  }, []);

  /**
   * alphaTab에는 반복 on/off 플래그(`isLooping`)가 하나뿐이라, 구간 반복과
   * 곡 전체 반복 두 UI 상태를 여기서 하나로 합친다.
   *
   * 구간이 지정돼 있으면(마디 A-B) 그 구간을 무조건 반복한다 — 곡 전체
   * 반복 토글을 껐다 켜도 구간이 있는 동안은 동작이 바뀌지 않는다. 구간을
   * 해제하면 그제야 곡 전체 반복 토글의 상태가 다시 적용된다. 두 기능이
   * "동시 활성 시 우선순위"를 요구할 때 구간 쪽을 우선하는 게 사용자가
   * 방금 한 더 구체적인 지정(구간 선택)을 존중하는 선택이라 판단했다.
   */
  const applyLoopMode = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    api.isLooping = barLoopRangeRef.current !== null || isLoopingRef.current;
  }, []);

  const toggleLoop = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    const next = !isLoopingRef.current;
    isLoopingRef.current = next;
    setIsLooping(next);
    applyLoopMode();
  }, [applyLoopMode]);

  /** 시작·끝 마디를 지정해 그 구간만 반복 재생한다. 순서는 자동으로 정렬된다. */
  const setBarLoopRange = useCallback(
    (startBar: number, endBar: number) => {
      const api = apiRef.current;
      const starts = barStartsRef.current;
      if (!api || starts.length === 0) return;
      const range = normalizeBarRange(startBar, endBar, starts.length);
      if (!range) return;
      const ticks = barRangeToTicks(range, starts, api.endTick);
      if (!ticks) return;
      api.playbackRange = ticks;
      barLoopRangeRef.current = range;
      setBarLoopRangeState(range);
      applyLoopMode();
    },
    [applyLoopMode],
  );

  /** 구간 반복 지정을 해제한다. 곡 전체 반복 토글은 그대로 유지된다. */
  const clearBarLoopRange = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    api.playbackRange = null;
    barLoopRangeRef.current = null;
    setBarLoopRangeState(null);
    applyLoopMode();
  }, [applyLoopMode]);

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

  /**
   * 화면에 악보를 그릴 트랙을 지정한다.
   * 재생은 모든 트랙이 계속되며, 소리는 뮤트/솔로로 따로 조절한다.
   */
  const showTracks = useCallback((indices: number[]) => {
    const api = apiRef.current;
    const all = api?.score?.tracks;
    if (!api || !all) return;
    const positions = indices.filter((i) => i >= 0 && i < all.length);
    if (positions.length === 0) return; // 최소 한 트랙은 보여야 한다
    api.renderTracks(positions.map((i) => all[i]));
    setVisibleTracks(positions);
  }, []);

  /** 보기 목록에 트랙을 추가/제거 (여러 트랙 동시 보기) */
  const toggleTrackVisible = useCallback(
    (trackIndex: number) => {
      const next = visibleTracks.includes(trackIndex)
        ? visibleTracks.filter((i) => i !== trackIndex)
        : [...visibleTracks, trackIndex].sort((a, b) => a - b);
      showTracks(next);
    },
    [visibleTracks, showTracks],
  );

  const showAllTracks = useCallback(() => {
    const all = apiRef.current?.score?.tracks;
    if (all) showTracks(all.map((_, i) => i));
  }, [showTracks]);

  /** 주법 안내를 끄면 사이드바 목록과 악보 툴팁이 함께 사라진다. */
  const toggleTechniqueGuide = useCallback(() => {
    const next = !techniqueGuide;
    techniqueGuideRef.current = next;
    setTechniqueGuide(next);
    if (!next) setHover(null);
  }, [techniqueGuide]);

  const toggleTabOnly = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    const next = !tabOnly;
    api.settings.display.staveProfile = next
      ? alphaTab.StaveProfile.Tab
      : alphaTab.StaveProfile.Default;
    api.updateSettings();
    api.render();
    setTabOnly(next);
  }, [tabOnly]);

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

  // 아래 두 토글은 신디사이저 호출을 setTracks 업데이터 밖에서 한다.
  // 업데이터 안에 두면 StrictMode가 업데이터를 두 번 실행하면서
  // 엔진 호출도 두 번 나가고, 상태와 엔진이 어긋날 여지가 생긴다.
  const toggleTrackMute = useCallback(
    (trackIndex: number) => {
      const api = apiRef.current;
      const track = api?.score?.tracks[trackIndex];
      const current = tracks.find((t) => t.index === trackIndex);
      if (!api || !track || !current) return;
      const mute = !current.mute;
      api.changeTrackMute([track], mute);
      setTracks((prev) =>
        prev.map((t) => (t.index === trackIndex ? { ...t, mute } : t)),
      );
    },
    [tracks],
  );

  const toggleTrackSolo = useCallback(
    (trackIndex: number) => {
      const api = apiRef.current;
      const track = api?.score?.tracks[trackIndex];
      const current = tracks.find((t) => t.index === trackIndex);
      if (!api || !track || !current) return;
      const solo = !current.solo;
      api.changeTrackSolo([track], solo);
      setTracks((prev) =>
        prev.map((t) => (t.index === trackIndex ? { ...t, solo } : t)),
      );
    },
    [tracks],
  );

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
    bpm,
    baseTempo,
    transpose,
    masterVolume,
    isLooping,
    barLoopRange,
    metronomeOn,
    countInOn,
    tabOnly,
    visibleTracks,
    hover,
    selection,
    selectionBox,
    revision,
    techniqueGuide,
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
    setBpm,
    exportAs,
    refreshScore,
    stepSelection,
    setSelection,
    setTranspose,
    setMasterVolume,
    toggleLoop,
    setBarLoopRange,
    clearBarLoopRange,
    toggleMetronome,
    toggleCountIn,
    toggleTabOnly,
    toggleTechniqueGuide,
    showTracks,
    toggleTrackVisible,
    showAllTracks,
    setTrackVolume,
    toggleTrackMute,
    toggleTrackSolo,
  };
}

export type PlayerHandle = ReturnType<typeof useAlphaTab>;
