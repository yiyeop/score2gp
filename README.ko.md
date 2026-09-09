# Score2GP

*[English](README.md) · 한국어*

**PDF 악보를 소리로.** 악보 프로그램이 내보낸 PDF를 읽어 TAB·리듬·주법까지
Guitar Pro 파일로 옮기고, Songsterr처럼 따라 들으며 연습하는 데스크톱 앱입니다.

읽을 수 있는 건 **벡터 PDF** — Guitar Pro·Finale·MuseScore에서 "PDF로 내보내기"한
파일입니다. 스캔본이나 사진은 지원하지 않습니다.

## 설치

### [⬇ 최신 버전 받기](https://github.com/yiyeop/score2gp/releases/latest)

| 운영체제 | 받을 파일 |
|---|---|
| macOS (Apple Silicon) | `.dmg` |
| Windows | `-setup.exe` (또는 `.msi`) |
| Linux | `.AppImage` (또는 `.deb`, `.rpm`) |

운영체제마다 골라야 할 파일은 확장자로 하나씩 정해진다. 파일 이름에 붙는
아키텍처 표기(`x64` `aarch64` 등)는 빌드 도구가 정하는 것이라 여기 적지
않는다 — 적어 두면 도구가 표기를 바꿀 때 안내만 조용히 틀려진다.

PDF 변환기는 앱 안에 함께 담겨 있다. 파이썬을 따로 깔 필요가 없다.

> **macOS는 Apple Silicon(M1 이상) 전용이다.** Intel Mac에서는 Rosetta로도
> 실행되지 않는다. 애플 메뉴 →  이 Mac에 관하여 → 칩이 `Apple M…`인지 확인하면 된다.

### 처음 열 때 경고가 뜬다

서명하지 않은 빌드라 운영체제가 막아선다. 한 번만 허용하면 그다음부터는 그냥 열린다.

**macOS**

1. 받은 `.dmg`를 열고 `score2gp`를 `Applications` 폴더로 끌어다 놓는다
2. 앱을 실행하면 "열 수 없습니다"가 뜬다 — 일단 닫는다
3. **시스템 설정 → 개인정보 보호 및 보안**을 열고 아래로 내려가면
   `score2gp`이(가) 차단되었다는 줄이 있다. **그래도 열기**를 누른다
4. 다시 실행하고 **열기**를 누른다

터미널이 편하면 한 줄로도 된다.

```bash
xattr -dr com.apple.quarantine /Applications/score2gp.app
```

**Windows**

SmartScreen이 "Windows의 PC 보호"를 띄우면 **추가 정보** → **실행**을 누른다.

## 실행

```bash
npm install
npm run tauri dev     # 데스크톱 앱
npm run dev           # 브라우저에서 프론트만 (파일 열기는 <input> 폴백)
```

PDF 변환까지 쓰려면 추출기의 파이썬 환경이 필요하다.

```bash
cd tools/pdfextract
python3 -m venv .venv && .venv/bin/pip install pymupdf pyguitarpro pyinstaller
```

## 배포

```bash
npm run tauri build   # .app과 .dmg가 src-tauri/target/release/bundle/ 에 생긴다
```

변환기는 PyInstaller로 실행 파일 하나(33MB)로 묶어 앱과 함께 담는다. 그래야
사용자 기계에 파이썬이나 PyMuPDF가 없어도 변환이 돌아간다. 묶는 일은
`tools/pdfextract/build-sidecar.sh`가 하고, 위 빌드 명령이 알아서 부른다
(추출기 소스가 그대로면 건너뛴다).

Rust 쪽은 저장소의 `convert.py`를 **먼저** 본다. 추출 로직을 고치는 동안
매번 33MB를 다시 묶지 않아도 되게 하기 위해서다. 저장소 밖에서 실행되는
배포본에서는 이게 없으므로 함께 담긴 실행 파일을 쓴다.

사이드카는 플랫폼마다 달라서(파일 이름에 대상 트리플이 붙는다) 커밋하지
않는다. 다른 플랫폼용 배포본을 만들려면 그 플랫폼에서 위 명령을 돌려야 한다.

**배포 대상은 macOS(Apple Silicon)·Windows·Linux 셋이다.** Intel Mac은
지원하지 않는다 — arm64 바이너리는 Rosetta로도 안 돌아가므로 릴리스
노트에 전용임을 밝힌다. 태그(`v*`)를 밀면 GitHub Actions가 세 플랫폼을
빌드해 초안 릴리스에 붙인다 (`.github/workflows/release.yml`).

사이드카 이름은 **rustc의** 트리플로 붙는데 알맹이는 **파이썬의**
아키텍처로 묶이므로, 둘이 어긋나면 빌드 스크립트가 미리 막는다. 이름만
arm64인 x86_64 바이너리는 빌드도 번들링도 성공한 뒤 사용자 기계에서야
실패해서, 안 막으면 알아채기 어렵다.

## 현재 상태 — Phase 0 (플레이어)

- **읽기 모드**: .gp/.gp3~.gpx/MusicXML 열기, 재생/일시정지, 트랙 선택(악보에 표시할 트랙),
  트랙별 볼륨·뮤트·솔로,
  마디 단위 이동, 조옮김(반음, 재생 음정), 재생 속도(25~200%), 전체 반복, 메트로놈, 카운트인
- **톤/구간 타임라인**: 곡 전체를 한 줄로 보여주는 탐색 바. 구간(Intro/Verse/Chorus…)은
  블록으로, 톤 변화는 아래 마커로 표시하고 누르면 그 마디로 이동한다.
  톤 마커는 지금 악보에 표시 중인 트랙 것만 보여준다 (`src/lib/markers.ts`)
- **PDF 변환**: 악보 PDF를 넣으면 Guitar Pro 파일로 바꿔 바로 연주할 수 있다.
  변환 알고리즘은 `tools/pdfextract`의 Python 구현이 갖고 있고 Rust가 이를
  프로세스로 부른다 (`src-tauri/src/convert.rs`). 휴리스틱을 아직 자주 고치는
  중이라 Rust로 옮기지 않았다 — 커맨드 모양은 그대로 두었으므로 나중에 구현만
  바꾸면 된다. 배포본에는 PyInstaller로 묶은 실행 파일을 함께 담으므로
  **사용자 기계에 파이썬이 없어도 동작한다** (아래 "배포" 참고).
  한 번 바꾼 악보는 결과를 남겨 두었다가 같은 PDF를 다시 열면 그대로 쓴다 —
  변환기가 바뀌면 열쇠가 달라져 다시 변환하므로, 추출을 개선하면 그 결과가
  바로 반영된다
- **트랙 이펙터**: 원곡에서 그 파트에 걸어 둔 코러스·리버브 등을 트랙 목록에
  "코러스 강하게"처럼 보여준다. alphaTab이 버리는 값이라 파일에서 직접
  읽는다 (`src/lib/gpEffects.ts`)
- **내보내기**: 열려 있는 악보를 Guitar Pro 7(.gp)·MIDI·alphaTex로 저장한다.
  PDF를 변환한 경우에는 변환기가 만든 .gp5 원본도 그대로 남길 수 있다
  (`src/lib/exportScore.ts`)
- **주법 툴팁**: 악보의 음에 마우스를 올리면 그 음에 쓰인 주법(슬라이드·태핑·피킹 하모닉스 등)을
  초보자용 설명으로 알려준다. 사이드바에는 지금 트랙에 나오는 주법 목록이 표시되고,
  누르면 처음 나오는 마디로 이동한다 (`src/lib/techniques.ts`)
- **단축키**: `?` 키로 전체 목록 확인 (Space 재생, ←→ 마디 이동, [ ] 조옮김, +- 속도 등)
- **한글 인코딩**: 구형 Guitar Pro(gp3~gp5)는 문자열이 UTF-8이 아닌 로컬 인코딩(한국판 CP949)으로
  저장돼 제목·트랙명이 깨진다. 로드 전에 후보 인코딩으로 파싱해보고 깨지지 않는 것을 자동 선택하며,
  자동 판별이 틀렸을 때는 사이드바에서 직접 고를 수 있다 (`src/lib/detectEncoding.ts`)
- **편집 모드**: 변환이 잘못 읽은 곳을 고친다. 악보에서 음을 누르면 그 자리가
  네모로 표시되고, 프렛·줄·길이를 바꾸거나 쉼표로 지울 수 있다. **마디별 톤**도
  넣거나 바꿀 수 있다(클린·디스토션 등) — 변환이 톤 지시를 놓쳤을 때 채워
  넣는 용도이고, 타임라인에 바로 반영된다. 되돌리기/다시하기가 항상 하단에
  있고, 숫자 키로 프렛을 바로 칠 수 있다 (`src/modes/edit/`)
- 내장 데모 곡(alphaTex)으로 파일 없이 바로 체험 가능

## 구조

```
src/
├── player/useAlphaTab.ts      # alphaTab 인스턴스·재생 상태 관리 (App이 소유, 모드 간 공유)
├── shortcuts/useShortcuts.ts  # 모드별 키보드 단축키 등록 훅
├── modes/
│   ├── registry.ts            # 모드 목록 (새 모드는 여기 등록)
│   ├── read/                  # 읽기 모드: TrackList, TransportBar, readShortcuts, ShortcutHelp
│   └── edit/                  # 편집 모드: useScoreEditor(고치기+되돌리기), EditMode, EditMarker
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
| 1 | **벡터 PDF 직접 추출** → 음표 데이터 | ✅ |
| 1b | 스캔 PDF용 OMR (Audiveris 사이드카) | 보류 |
| 2 | 추출 결과 → .gp 파일 생성, GP 파일 직접 파싱 | ✅ |
| 3 | 편집 모드 (오인식 보정) | ✅ |

### 설계 기록

방향을 크게 바꾼 결정들은 왜 그렇게 정했는지까지 [`adr/`](adr/)에 남겨 두었다.

- [ADR 0001 — OMR 대신 벡터 PDF를 직접 읽는다](adr/0001-vector-pdf-instead-of-omr.md)
- [ADR 0002 — GP 파일의 트랙 이펙터를 직접 파싱한다](adr/0002-read-gp-effects-directly.md)

## 요구 사항

- Node 20+, Rust 1.88+ (Tauri 의존성 요구)
- Python 3.11+ (PDF 변환. 배포본 사용자에게는 필요 없다)
