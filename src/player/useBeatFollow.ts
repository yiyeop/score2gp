import { useCallback, useEffect, useRef } from "react";
import { followSpeed, phaseErrorAt } from "../lib/beatFollow";
import { offsetFromBeat, type BeatFit } from "../lib/beatFit";
import { SPEED_MAX, SPEED_MIN, type PlayerHandle } from "./useAlphaTab";
import { useOnsetListener, type OnsetListenerHandle } from "./useOnsetListener";

/**
 * 마이크로 들은 연주에 악보 커서를 맞춘다.
 *
 * 계산은 [beatFollow]·[beatFit]에, 소리 입력은 [useOnsetListener]에 있다.
 * 여기서는 "언제 맞출지"만 정한다 — 재생 중이고 감지를 켠 동안에만.
 *
 * 따라가는 동안 앱 소리는 꺼 둔다. 합주에서는 연주가 기준이라 앱까지 울리면
 * 서로 방해만 된다. 껐다는 사실을 숨기지 않으려고 볼륨 값을 그대로 0으로
 * 내리므로, 듣고 싶으면 볼륨을 올리면 된다(끄면 원래 값으로 돌아온다).
 */

/** 타격 몇 개가 어긋남을 말해 주는지 — 한 방만 보고 속도를 흔들지 않는다. */
const PHASE_WINDOW = 4;

/**
 * 새로 읽은 속도를 한 번에 얼마나 반영할지.
 *
 * 합주에서 빠르기는 한 번 잡히면 크게 변하지 않는다 — 흔들려도 10% 안팎이다.
 * 그래서 읽을 때마다 그대로 갈아끼우지 않고 조금씩 옮긴다. 순간적인 오독이
 * 악보를 끌고 가지 못하게 막는 장치다.
 */
const SPEED_EASE = 0.25;

export interface BeatFollowHandle extends OnsetListenerHandle {
  /** 지금 악보가 연주를 따라가고 있는지(재생 중 + 박이 고를 때). */
  following: boolean;
}

export function useBeatFollow(player: PlayerHandle): BeatFollowHandle {
  const phasesRef = useRef<number[]>([]);
  const restoreVolumeRef = useRef<number | null>(null);
  // 오디오 콜백에서 최신 격자를 보기 위한 통로.
  const fitRef = useRef<BeatFit | null>(null);

  /** 박 위에 떨어진 타격만 믿는다 — 이보다 벗어나면 사이에 낀 소리로 본다. */
  const ON_BEAT = 0.25;

  // 오디오 콜백에서 최신 플레이어를 보기 위한 통로.
  const playerRef = useRef(player);
  playerRef.current = player;

  const onHit = useCallback((onset: { time: number }) => {
    const p = playerRef.current;
    const fit = fitRef.current;
    if (!p.isPlaying || !fit) return;

    // 사이에 낀 어택(8비트의 '엔' 등)은 박을 말해 주지 않으므로 버린다.
    // 이것들까지 세면 커서를 반 박씩 엉뚱하게 끌어당긴다.
    if (Math.abs(offsetFromBeat(onset.time, fit)) > ON_BEAT) return;

    // 박 위의 타격이 왔을 때 커서가 박에서 얼마나 벗어나 있는지 모은다.
    const phases = phasesRef.current;
    phases.push(phaseErrorAt(p.getBeatPosition()));
    if (phases.length > PHASE_WINDOW) phases.shift();
  }, []);

  const onsets = useOnsetListener({ onHit, referenceBpm: player.baseTempo });
  fitRef.current = onsets.fit;

  // 듣기를 멈추면 다음 연주를 위해 어긋남 기록을 비운다.
  useEffect(() => {
    if (!onsets.listening) phasesRef.current = [];
  }, [onsets.listening]);

  // 따라가는 동안에는 앱 소리를 내리고, 끝나면 원래대로 돌린다.
  useEffect(() => {
    if (onsets.listening) {
      if (restoreVolumeRef.current === null) {
        restoreVolumeRef.current = player.masterVolume;
        if (player.masterVolume > 0) player.setMasterVolume(0);
      }
    } else if (restoreVolumeRef.current !== null) {
      player.setMasterVolume(restoreVolumeRef.current);
      restoreVolumeRef.current = null;
    }
    // 볼륨은 사용자가 도중에 올릴 수 있다 — 켜고 끌 때만 건드린다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onsets.listening]);

  const following = onsets.listening && player.isPlaying && onsets.steady;

  // 읽은 빠르기와 어긋남을 재생 속도에 반영한다.
  useEffect(() => {
    if (!onsets.listening || !player.isPlaying) return;

    const phases = phasesRef.current;
    const phaseError =
      phases.length === 0
        ? 0
        : phases.reduce((a, b) => a + b, 0) / phases.length;

    const target = followSpeed({
      playedBpm: onsets.bpm,
      scoreBpm: player.baseTempo,
      phaseError,
      steady: onsets.steady,
      min: SPEED_MIN,
      max: SPEED_MAX,
    });

    // 목표로 한 번에 가지 않고 일부만 옮긴다.
    const next = player.speed + (target - player.speed) * SPEED_EASE;
    if (Math.abs(next - player.speed) >= 0.01) player.setSpeed(next);
    // player 전체를 의존성에 넣으면 렌더마다 돌아간다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    onsets.listening,
    onsets.bpm,
    onsets.steady,
    onsets.hitCount,
    player.isPlaying,
    player.baseTempo,
  ]);

  return { ...onsets, following };
}
