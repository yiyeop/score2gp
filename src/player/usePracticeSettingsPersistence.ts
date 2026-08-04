import { useEffect, useRef } from "react";
import {
  loadPracticeSettings,
  savePracticeSettings,
} from "../lib/practiceSettings";
import type { PlayerHandle } from "./useAlphaTab";

/**
 * 연습 설정(속도·조옮김·볼륨·탭 전용 보기)을 파일 단위로 자동 저장/복원한다.
 *
 * - 새 악보가 로드되면(`player.score`가 바뀌면) 그 파일의 저장된 설정을 적용한다
 *   (저장된 값이 없으면 기본값 — 다른 파일 값으로 새지 않는다).
 * - 설정이 바뀌면 "지금 복원이 끝난 파일"의 키로 저장한다.
 *
 * 저장 키는 `fileName` state를 바로 쓰지 않고 `currentKeyRef`에 따로 보관한다.
 * 파일을 열 때 `fileName`은 실제 악보 로드가 끝나기 전에 먼저 바뀌므로,
 * `fileName`을 곧장 저장 키로 쓰면 그 사이(화면엔 아직 이전 파일의 설정값이
 * 남아있는 순간)에 새 파일의 키 밑에 이전 파일 값을 덮어써 버리는 문제가
 * 생긴다. `currentKeyRef`는 실제로 복원이 끝난 뒤에만 갱신되므로 이 경합이
 * 생기지 않는다.
 */
export function usePracticeSettingsPersistence(
  player: PlayerHandle,
  fileName: string | null,
) {
  const currentKeyRef = useRef<string | null | undefined>(undefined);
  const fileNameRef = useRef(fileName);
  fileNameRef.current = fileName;

  // 새 악보가 로드될 때마다(파일 전환 포함) 그 파일의 저장된 설정을 복원한다.
  useEffect(() => {
    if (!player.score) return;
    const key = fileNameRef.current;
    const settings = loadPracticeSettings(key);
    player.setSpeed(settings.speed);
    player.setTranspose(settings.transpose);
    player.setMasterVolume(settings.masterVolume);
    player.setTabOnly(settings.tabOnly);
    currentKeyRef.current = key;
    // player.score 참조가 바뀔 때(=새 로드)만 반응한다. setter들은
    // useAlphaTab에서 안정된 참조로 오므로 의존성에 넣지 않아도 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.score]);

  // 설정이 바뀔 때마다 지금 복원이 끝난 파일의 키로 저장한다.
  useEffect(() => {
    if (currentKeyRef.current === undefined) return; // 아직 복원 전(초기 마운트)
    savePracticeSettings(currentKeyRef.current, {
      speed: player.speed,
      transpose: player.transpose,
      masterVolume: player.masterVolume,
      tabOnly: player.tabOnly,
    });
  }, [player.speed, player.transpose, player.masterVolume, player.tabOnly]);
}
