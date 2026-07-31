# Score2GP

악보 PDF를 Guitar Pro 파일로 변환하고 Songsterr처럼 재생하는 데스크톱 앱 (Tauri 2 + React + alphaTab).

## 실행

```bash
npm install
npm run tauri dev     # 데스크톱 앱
npm run dev           # 브라우저에서 프론트만 (파일 열기는 <input> 폴백)
```

## 현재 상태 — Phase 0 (플레이어)

- **읽기 모드**: .gp/.gp3~.gpx/MusicXML 열기, 재생/일시정지, 트랙 선택(악보에 표시할 트랙),
  트랙별 볼륨·뮤트·솔로,
  마디 단위 이동, 조옮김(반음, 재생 음정), 재생 속도(25~200%), 전체 반복, 메트로놈, 카운트인
- **톤/구간 타임라인**: 곡 전체를 한 줄로 보여주는 탐색 바. 구간(Intro/Verse/Chorus…)은
  블록으로, 톤 변화는 아래 마커로 표시하고 누르면 그 마디로 이동한다.
  톤 마커는 지금 악보에 표시 중인 트랙 것만 보여준다 (`src/lib/markers.ts`)
- **주법 툴팁**: 악보의 음에 마우스를 올리면 그 음에 쓰인 주법(슬라이드·태핑·피킹 하모닉스 등)을
  초보자용 설명으로 알려준다. 사이드바에는 지금 트랙에 나오는 주법 목록이 표시되고,
  누르면 처음 나오는 마디로 이동한다 (`src/lib/techniques.ts`)
- **단축키**: `?` 키로 전체 목록 확인 (Space 재생, ←→ 마디 이동, [ ] 조옮김, +- 속도 등)
- **한글 인코딩**: 구형 Guitar Pro(gp3~gp5)는 문자열이 UTF-8이 아닌 로컬 인코딩(한국판 CP949)으로
  저장돼 제목·트랙명이 깨진다. 로드 전에 후보 인코딩으로 파싱해보고 깨지지 않는 것을 자동 선택하며,
  자동 판별이 틀렸을 때는 사이드바에서 직접 고를 수 있다 (`src/lib/detectEncoding.ts`)
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
| 2 | MusicXML → .gp 변환 + 운지 배정, GP 파일 직접 파싱 | 예정 |
| 3 | 편집 모드 (OMR 오인식 보정) | 예정 |

### Phase 2에 포함할 것 — GP 파일 직접 파싱

GP5 포맷은 믹스 테이블에 **chorus / reverb / phaser / tremolo / wah** 값을
구조적으로 저장하는데, alphaTab의 데이터 모델에는 이 항목들이 없어서
(`AutomationType`은 Tempo·Volume·Instrument·Balance뿐) 임포트 과정에서 버려진다.

그래서 지금 톤 타임라인은 이펙터를 비트 텍스트에서 키워드로 긁어오고 있고,
제작자가 글로 안 적어둔 곡에서는 잡히지 않는다. Phase 2에서 어차피 GP 포맷을
직접 다루게 되므로, 그때 믹스 테이블의 이펙터 값을 읽어 타임라인 정확도를 올린다.
(관련 코드: `src/lib/markers.ts`)

## 요구 사항

- Node 20+, Rust 1.88+ (Tauri 의존성 요구)
