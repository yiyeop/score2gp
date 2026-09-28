import { useCallback, useEffect, useRef } from "react";
import { followSpeed, phaseErrorAt } from "../lib/beatFollow";
import { SPEED_MAX, SPEED_MIN, type PlayerHandle } from "./useAlphaTab";
import { useKickListener, type KickListenerHandle } from "./useKickListener";

/**
 * 마이크로 들은 연주에 악보 커서를 맞춘다.
 *
 * 계산은 [beatFollow]·[kickTempo]에, 소리 입력은 [useKickListener]에 있다.
 * 여기서는 "언제 맞출지"만 정한다 — 재생 중이고 마이크를 켠 동안에만.
 *
 * 따라가는 동안 앱 소리는 꺼 둔다. 합주에서는 드럼이 기준이라 앱까지 울리면
 * 서로 방해만 된다. 껐다는 사실을 숨기지 않으려고 볼륨 값을 그대로 0으로
 * 내리므로, 듣고 싶으면 볼륨을 올리면 된다(끄면 원래 값으로 돌아온다).
 */

/** 킥 몇 개가 어긋남을 말해 주는지 — 한 방만 보고 속도를 흔들지 않는다. */
const PHASE_WINDOW = 4;

export interface BeatFollowHandle extends KickListenerHandle {
  /** 지금 악보가 연주를 따라가고 있는지(재생 중 + 박이 고를 때). */
  following: boolean;
}

export function useBeatFollow(player: PlayerHandle): BeatFollowHandle {
  const phasesRef = useRef<number[]>([]);
  const followingRef = useRef(false);
  const restoreVolumeRef = useRef<number | null>(null);

  // 오디오 콜백에서 최신 플레이어를 보기 위한 통로.
  const playerRef = useRef(player);
  playerRef.current = player;

  const onKick = useCallback(() => {
    const p = playerRef.current;
    if (!p.isPlaying) return;

    // 킥은 박 위에 떨어진다고 보고, 커서가 그 박에서 얼마나 벗어났는지 모은다.
    const phases = phasesRef.current;
    phases.push(phaseErrorAt(p.getBeatPosition()));
    if (phases.length > PHASE_WINDOW) phases.shift();
  }, []);

  const kicks = useKickListener({ onKick });

  // 듣기를 멈추면 다음 연주를 위해 어긋남 기록을 비운다.
  useEffect(() => {
    if (!kicks.listening) phasesRef.current = [];
  }, [kicks.listening]);

  // 따라가는 동안에는 앱 소리를 내리고, 끝나면 원래대로 돌린다.
  useEffect(() => {
    if (kicks.listening) {
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
  }, [kicks.listening]);

  const following = kicks.listening && player.isPlaying && kicks.steady;
  followingRef.current = following;

  // 읽은 빠르기와 어긋남을 재생 속도에 반영한다. 킥마다 곧바로 바꾸면
  // 속도가 떨린다 — 상태가 바뀔 때만(박·BPM이 갱신될 때) 한 번 맞춘다.
  useEffect(() => {
    if (!kicks.listening || !player.isPlaying) return;

    const phases = phasesRef.current;
    const phaseError =
      phases.length === 0
        ? 0
        : phases.reduce((a, b) => a + b, 0) / phases.length;

    const speed = followSpeed({
      playedBpm: kicks.bpm,
      scoreBpm: player.baseTempo,
      phaseError,
      steady: kicks.steady,
      min: SPEED_MIN,
      max: SPEED_MAX,
    });
    if (Math.abs(speed - player.speed) >= 0.01) player.setSpeed(speed);
    // player 전체를 의존성에 넣으면 렌더마다 돌아간다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    kicks.listening,
    kicks.bpm,
    kicks.steady,
    kicks.kickCount,
    player.isPlaying,
    player.baseTempo,
  ]);

  return { ...kicks, following };
}
