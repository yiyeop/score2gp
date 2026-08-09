/**
 * 앱 모드 레지스트리.
 * 새 모드를 추가할 때는 여기에 id/label을 등록하고
 * App.tsx의 모드 분기에 해당 모드의 레이아웃을 연결한다.
 */
export type AppModeId = "read" | "edit";

export interface AppModeDefinition {
  id: AppModeId;
  label: string;
  /**
   * 탭의 시각적 무게. "secondary"는 채워진 버튼 대신 아웃라인 스타일로
   * 낮은 무게를 갖는다 — "고치기"는 보정 전용 도구라 기본 모드인
   * "읽기 모드"와 대등하게 보이면 안 된다(PRD "고치기 모드 이름과 위치").
   */
  tone?: "primary" | "secondary";
}

export const APP_MODES: AppModeDefinition[] = [
  { id: "read", label: "읽기 모드" },
  { id: "edit", label: "고치기", tone: "secondary" },
];
