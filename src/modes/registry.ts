/**
 * 앱 모드 레지스트리.
 * 새 모드를 추가할 때는 여기에 id/label을 등록하고
 * App.tsx의 모드 분기에 해당 모드의 레이아웃을 연결한다.
 */
export type AppModeId = "read" | "edit";

export interface AppModeDefinition {
  id: AppModeId;
  label: string;
}

export const APP_MODES: AppModeDefinition[] = [
  { id: "read", label: "읽기 모드" },
  { id: "edit", label: "편집 모드" },
];
