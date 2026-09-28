import { useCallback, useEffect, useRef, useState } from "react";
import { createOnsetDetector, type Onset } from "../lib/onsetDetect";
import { fitBeat, FIT_WINDOW, type BeatFit, type BeatSample } from "../lib/beatFit";

/**
 * 마이크를 열어 연주를 듣는다.
 *
 * 감지 규칙은 [onsetDetect]에, 박자 계산은 [beatFit]에 있다. 여기서는
 * 브라우저 오디오와 React 상태만 잇는다 — 소리를 다루는 부분과 계산을
 * 떼어 둬야 계산 쪽을 테스트로 검증할 수 있다.
 *
 * 녹음하지 않는다. 표본은 감지에 쓰고 바로 버리며, 어디로도 보내지 않는다.
 */

/**
 * 박이 잡혔다고 볼 기준 — 붙을 때와 놓을 때를 다르게 둔다.
 *
 * 맞은 정도의 절대값이 아니라 '다른 빠르기보다 얼마나 두드러지는가'로 본다.
 * 절대값은 마이크 거리와 방에 따라 몇 배씩 달라져서 기준으로 삼을 수 없다.
 * 실제 연주에서는 이 값도 계속 오르내리므로, 한 번 잡으면 확실히 나빠질
 * 때까지 놓지 않는다.
 */
const STEADY_SHARP_ON = 1.8;
const STEADY_SHARP_OFF = 1.3;

/**
 * 이보다 작게만 움직이면 연주가 멎은 것으로 본다.
 *
 * 커진 정도는 기준선으로 나눈 값이라 방의 크기와 상관없이 비교할 수 있다.
 * 조용한 방에서도 미세한 잡음은 늘 움직이므로, 그것까지 박으로 엮지 않는다.
 */
const QUIET = 0.05;

/**
 * 박을 다시 맞추는 간격(초).
 *
 * 매 블록(2.7ms)마다 맞추면 헛돈다. 사람의 빠르기는 그렇게 빨리 변하지 않아서
 * 0.25초에 한 번이면 충분하고, 그 사이 들어온 소리는 다음 번에 함께 반영된다.
 */
const REFIT_EVERY = 0.25;

export interface OnsetListenerHandle {
  /** 마이크를 열어 듣고 있는지. */
  listening: boolean;
  /** 마이크를 여는 중(권한 대화상자가 떠 있을 수 있다). */
  starting: boolean;
  /** 열지 못한 이유. 사용자에게 그대로 보여줄 수 있는 문장. */
  error: string | null;
  /** 켠 뒤 잡은 타격 수. 화면의 깜빡임을 이 값의 변화로 만든다. */
  hitCount: number;
  /** 마지막 타격의 세기(직전보다 몇 배). 없으면 0. */
  lastStrength: number;
  /** 마이크가 지금 듣고 있는 소리 크기(0~1). 잡히는 게 없는지 볼 때 쓴다. */
  level: number;
  /** 지금 듣고 있는 연주의 빠르기. 아직 모르면 null. */
  bpm: number | null;
  /** 박이 잡혔는지 — 따라가도 되는 상태인지 판단하는 값. */
  steady: boolean;
  /** 지금 맞춘 박자 격자. 아직 못 맞췄으면 null. */
  fit: BeatFit | null;
  start: () => void;
  stop: () => void;
  toggle: () => void;
}

/** 브라우저가 돌려주는 오류를 사람이 읽을 문장으로 바꾼다. */
function describeMicError(err: unknown): string {
  const name = (err as { name?: string })?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "마이크 사용이 허용되지 않았어요. 시스템 설정 > 개인정보 보호 및 보안 > 마이크에서 Score2GP를 켜주세요.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "쓸 수 있는 마이크를 찾지 못했어요.";
  }
  if (name === "NotReadableError") {
    return "다른 프로그램이 마이크를 쓰고 있어요.";
  }
  return `마이크를 열지 못했어요 (${(err as Error)?.message ?? String(err)})`;
}

export interface OnsetListenerOptions {
  /**
   * 타격이 잡힐 때마다 부른다.
   *
   * React 상태로 알리면 한 박자 늦는다 — 따라가기는 소리가 난 바로 그때
   * 커서 위치를 봐야 해서, 오디오 콜백에서 곧장 부른다.
   */
  onHit?: (onset: Onset) => void;
  /**
   * 지금 열린 악보에 적힌 빠르기(BPM).
   *
   * 들은 간격이 한 박인지 반 박인지는 소리만으로 가릴 수 없다. 같은 곡을
   * 연주하는 중이니 악보의 빠르기가 가장 믿을 만한 기준이 된다.
   */
  referenceBpm?: number;
}

export function useOnsetListener(
  options: OnsetListenerOptions = {},
): OnsetListenerHandle {
  // 콜백은 매 렌더 바뀔 수 있으므로 최신 것을 ref로 들고 본다.
  const onHitRef = useRef(options.onHit);
  onHitRef.current = options.onHit;

  // 악보에 적힌 빠르기. 들은 간격이 한 박인지 반 박인지 가리는 기준이다.
  const referenceBpmRef = useRef(0);
  referenceBpmRef.current = options.referenceBpm ?? 0;

  const [listening, setListening] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hitCount, setHitCount] = useState(0);
  const [lastStrength, setLastStrength] = useState(0);
  const [level, setLevel] = useState(0);
  const [fit, setFit] = useState<BeatFit | null>(null);
  const [steady, setSteady] = useState(false);
  const steadyRef = useRef(false);
  steadyRef.current = steady;

  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const nodeRef = useRef<ScriptProcessorNode | null>(null);
  const samplesRef = useRef<BeatSample[]>([]);
  const lastFitRef = useRef(0);

  const stop = useCallback(() => {
    nodeRef.current?.disconnect();
    nodeRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void contextRef.current?.close();
    contextRef.current = null;
    samplesRef.current = [];
    lastFitRef.current = 0;
    setListening(false);
    setStarting(false);
    setFit(null);
    setSteady(false);
    setLastStrength(0);
    setLevel(0);
  }, []);

  const start = useCallback(() => {
    if (streamRef.current || starting) return;
    setError(null);
    setStarting(true);

    navigator.mediaDevices
      ?.getUserMedia({
        // 자동 게인과 잡음 억제는 사람 목소리를 위한 기능이라, 드럼의 순간적인
        // 세기 차이를 눌러 버린다. 킥을 세는 데는 방해만 되므로 모두 끈다.
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })
      .then((stream) => {
        const context = new AudioContext();
        const detector = createOnsetDetector(context.sampleRate);
        const source = context.createMediaStreamSource(stream);
        // 1024 표본 = 48kHz에서 21ms. AudioWorklet으로 옮기면 더 매끄럽지만,
        // 먼저 실제 기기에서 마이크가 열리는지부터 확인하는 단계라 간단한
        // 쪽을 쓴다.
        const node = context.createScriptProcessor(1024, 1, 1);

        node.onaudioprocess = (e) => {
          const { onsets, novelty } = detector.push(e.inputBuffer.getChannelData(0));
          const now = detector.elapsed;

          setLevel(detector.level);

          // 박을 맞출 근거는 '커진 정도'의 흐름이다. 창 밖으로 나간 것은 버린다.
          const samples = samplesRef.current;
          for (const n of novelty) samples.push({ time: n.time, weight: n.value });
          const cutoff = now - FIT_WINDOW;
          let drop = 0;
          while (drop < samples.length && samples[drop].time < cutoff) drop++;
          if (drop > 0) samples.splice(0, drop);

          if (onsets.length > 0) {
            for (const onset of onsets) onHitRef.current?.(onset);
            const last = onsets[onsets.length - 1] as Onset;
            setHitCount((n) => n + onsets.length);
            setLastStrength(last.strength);
          }

          if (now - lastFitRef.current < REFIT_EVERY) return;
          lastFitRef.current = now;

          const loudest = samples.reduce((m, s) => Math.max(m, s.weight), 0);
          if (loudest < QUIET) {
            // 아무도 연주하지 않는다. 옛 소리로 박을 우기지 않는다.
            setFit(null);
            setSteady(false);
            return;
          }

          const next = fitBeat(samples, referenceBpmRef.current);
          setFit(next);
          setSteady(
            !!next &&
              next.sharpness >=
                (steadyRef.current ? STEADY_SHARP_OFF : STEADY_SHARP_ON),
          );
        };

        source.connect(node);
        // ScriptProcessor는 목적지에 이어야 소리가 흐른다. 앱이 스스로
        // 마이크 소리를 내면 하울링이 나므로, 소리를 죽인 노드를 거쳐 잇는다.
        const mute = context.createGain();
        mute.gain.value = 0;
        node.connect(mute);
        mute.connect(context.destination);

        streamRef.current = stream;
        contextRef.current = context;
        nodeRef.current = node;
        setStarting(false);
        setListening(true);
      })
      .catch((err) => {
        setStarting(false);
        setListening(false);
        setError(describeMicError(err));
      });
  }, [starting]);

  const toggle = useCallback(() => {
    if (listening || starting) stop();
    else start();
  }, [listening, starting, start, stop]);

  // 화면을 떠날 때 마이크를 놓아준다 — 켜 둔 채로 두면 표시등이 남는다.
  useEffect(() => stop, [stop]);

  return {
    listening,
    starting,
    error,
    hitCount,
    lastStrength,
    level,
    fit,
    bpm: steady && fit ? fit.bpm : null,
    steady,
    start,
    stop,
    toggle,
  };
}
