# Score2GP

악보 PDF를 Guitar Pro 파일로 변환하고 Songsterr처럼 재생하는 데스크톱 앱 (Tauri 2 + React + alphaTab).

## 실행

```bash
npm install
npm run tauri dev     # 데스크톱 앱
npm run dev           # 브라우저에서 프론트만 (파일 열기는 <input> 폴백)
```

## 현재 상태 — Phase 0 (플레이어)

- **읽기 모드**: .gp/.gp3~.gpx/MusicXML 열기, 재생/일시정지, 트랙별 볼륨·뮤트·솔로,
  마디 단위 이동, 조옮김(반음, 재생 음정), 재생 속도(25~200%), 전체 반복, 메트로놈, 카운트인
- **단축키**: `?` 키로 전체 목록 확인 (Space 재생, ←→ 마디 이동, [ ] 조옮김, +- 속도 등)
- **편집 모드**: 자리만 존재 (Phase 3 예정)
- 내장 데모 곡(alphaTex)으로 파일 없이 바로 체험 가능

## 구조

```
src/
├── player/useAlphaTab.ts      # alphaTab 인스턴스·재생 상태 관리 (App이 소유, 모드 간 공유)
├── shortcuts/useShortcuts.ts  # 모드별 키보드 단축키 등록 훅
├── modes/
│   ├── registry.ts            # 모드 목록 (새 모드는 여기 등록)
│   ├── read/                  # 읽기 모드: TrackList, TransportBar, readShortcuts, ShortcutHelp
│   └── edit/                  # 편집 모드 스텁 (확장 계약은 EditMode.tsx 주석 참고)
├── lib/openScore.ts           # 파일 열기 (Tauri dialog + read_score / 브라우저 폴백)
└── demo/demoSong.ts           # 내장 데모 곡
src-tauri/src/lib.rs           # read_score 커맨드 (파일 → 바이트)
```

핵심 설계: alphaTab 인스턴스는 모드와 무관하게 App 레벨에 하나만 존재한다.
모드는 그 주변 UI(사이드바/하단 바/단축키)만 교체하므로, 편집 모드를 만들 때
로드된 악보와 재생 상태를 그대로 이어받는다.

## 로드맵

| Phase | 내용 | 상태 |
|---|---|---|
| 0 | GP 플레이어 (읽기 모드) | ✅ |
| 1 | PDF → MusicXML (Audiveris 사이드카) | 예정 |
| 2 | MusicXML → .gp 변환 + 운지 배정 | 예정 |
| 3 | 편집 모드 (OMR 오인식 보정) | 예정 |

## 요구 사항

- Node 20+, Rust 1.88+ (Tauri 의존성 요구)
