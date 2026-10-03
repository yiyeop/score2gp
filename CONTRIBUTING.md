# 개발 문서

사용자용 안내는 [README](README.md)에 있다. 여기에는 저장소를 받아 직접 고치고
배포할 때 필요한 것만 둔다.

## 요구 사항

- Node 20+ · pnpm 10 (`package.json`의 `packageManager`가 버전을 고정한다)
- Rust 1.88+ (Tauri 의존성 요구)
- Python 3.11+ — PDF 변환기를 돌리거나 다시 묶을 때만 필요하다. 배포본 사용자에게는 필요 없다

## 실행

```bash
pnpm install
pnpm run tauri dev     # 데스크톱 앱
pnpm run dev           # 브라우저에서 프런트만 (파일 열기는 <input> 폴백)
```

PDF 변환까지 쓰려면 추출기의 파이썬 환경이 필요하다.

```bash
cd tools/pdfextract
python3 -m venv .venv && .venv/bin/pip install pymupdf pyguitarpro pyinstaller
```

앱은 `tools/pdfextract/.venv`를 먼저 찾고 없으면 시스템 `python3`을 쓴다.

## 테스트와 형식

```bash
pnpm test                                        # vitest
pnpm exec vitest run src/lib/loopRange.test.ts   # 한 파일만
pnpm exec tsc --noEmit                           # 타입만 확인
pnpm run format                                  # 커밋 전에 돌린다
```

추출기 쪽은 표준 `unittest`를 쓴다.

```bash
cd tools/pdfextract
.venv/bin/python -m unittest test_structure
.venv/bin/python overlay.py 악보.pdf    # 인식 결과를 원본 위에 겹쳐 그린다 (가장 확실한 검증)
.venv/bin/python verify.py 악보.pdf     # 마디 길이 합이 박자와 맞는지 전 페이지 검사
```

실제 악보에 기대는 테스트는 경로를 환경 변수로 받는다(`SCORE2GP_SAMPLE_PDF`). 저장소에는
곡명을 남기지 않는다.

## 구조

```
src/
├── player/useAlphaTab.ts      # alphaTab 인스턴스·재생 상태 (App이 소유, 모드 간 공유)
├── shortcuts/useShortcuts.ts  # 모드별 키보드 단축키 등록 훅
├── modes/
│   ├── registry.ts            # 모드 목록 (새 모드는 여기 등록)
│   ├── read/                  # 읽기 모드: TrackList, TransportBar, readShortcuts, ShortcutHelp
│   └── edit/                  # 편집 모드: useScoreEditor(고치기+되돌리기), EditMode, EditMarker
├── lib/                       # 순수 로직 (구간·마커·주법·인코딩·내보내기) — 테스트가 붙는 자리
└── demo/demoSong.ts           # 내장 데모 곡
src-tauri/src/lib.rs           # read_score 커맨드 (파일 → 바이트)
src-tauri/src/convert.rs       # 변환기 호출
tools/pdfextract/              # PDF → .gp5 추출기 (Python)
```

핵심 설계: **alphaTab 인스턴스는 모드와 무관하게 App 레벨에 하나만 존재한다.** 모드는 그 주변
UI(사이드바·하단 바·단축키)만 교체하므로, 편집 모드로 가도 로드된 악보와 재생 상태를 그대로
이어받는다.

변환 알고리즘은 `tools/pdfextract`의 Python 구현이 갖고 있고 Rust가 이를 프로세스로 부른다.
휴리스틱을 아직 자주 고치는 중이라 Rust로 옮기지 않았다 — 커맨드 모양은 그대로 두었으므로
나중에 구현만 바꾸면 된다. 한 번 바꾼 악보는 결과를 남겨 두었다가 같은 PDF를 다시 열면 그대로
쓴다. 변환기가 바뀌면 열쇠가 달라져 다시 변환하므로, 추출을 개선하면 그 결과가 바로 반영된다.

alphaTab이 버리는 값은 파일에서 직접 읽는다 — 트랙 이펙터(`src/lib/gpEffects.ts`),
구형 Guitar Pro의 CP949 인코딩 추정(`src/lib/detectEncoding.ts`).

## 배포

```bash
pnpm run tauri build   # .app과 .dmg가 src-tauri/target/release/bundle/ 에 생긴다
```

변환기는 PyInstaller로 실행 파일 하나(33MB)로 묶어 앱과 함께 담는다. 그래야 사용자 기계에
파이썬이나 PyMuPDF가 없어도 변환이 돌아간다. 묶는 일은 `tools/pdfextract/build-sidecar.sh`가
하고 위 빌드 명령이 알아서 부른다(추출기 소스가 그대로면 건너뛴다).

Rust 쪽은 저장소의 `convert.py`를 **먼저** 본다. 추출 로직을 고치는 동안 매번 33MB를 다시
묶지 않아도 되게 하기 위해서다. 저장소 밖에서 실행되는 배포본에는 이것이 없으므로 함께 담긴
실행 파일을 쓴다.

사이드카는 플랫폼마다 달라서(파일 이름에 대상 트리플이 붙는다) 커밋하지 않는다. 다른
플랫폼용 배포본을 만들려면 그 플랫폼에서 빌드해야 한다.

**배포 대상은 macOS(Apple Silicon)·Windows·Linux 셋이다.** Intel Mac은 지원하지 않는다 —
arm64 바이너리는 Rosetta로도 안 돌아가므로 릴리스 노트에 전용임을 밝힌다. 태그(`v*`)를 밀면
GitHub Actions가 세 플랫폼을 빌드해 초안 릴리스에 붙인다(`.github/workflows/release.yml`).
버전은 `package.json`, `pnpm-lock.yaml`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`,
`src-tauri/tauri.conf.json`을 함께 올린다.

사이드카 이름은 **rustc의** 트리플로 붙는데 알맹이는 **파이썬의** 아키텍처로 묶이므로, 둘이
어긋나면 빌드 스크립트가 미리 막는다. 이름만 arm64인 x86_64 바이너리는 빌드도 번들링도
성공한 뒤 사용자 기계에서야 실패해서, 안 막으면 알아채기 어렵다.

## 진행 상황

| Phase | 내용                                | 상태 |
| ----- | ----------------------------------- | ---- |
| 0     | GP 플레이어 (읽기 모드)             | ✅   |
| 1     | 벡터 PDF 직접 추출 → 음표 데이터    | ✅   |
| 1b    | 스캔 PDF용 OMR (Audiveris 사이드카) | 보류 |
| 2     | 추출 결과 → .gp 파일 생성           | ✅   |
| 3     | 편집 모드 (오인식 보정)             | ✅   |

## 쓰는 규칙

주석과 문서는 한국어로 쓰고 **'왜'를 적는다.** 무엇을 하는지는 코드가 말한다. 형식은
Prettier가 정하므로 커밋 전에 `pnpm run format`을 돌린다. 커밋 메시지 접두사와 그 밖의
관행은 [CLAUDE.md](CLAUDE.md)에 정리해 두었다.

방향을 크게 바꾼 결정은 왜 그렇게 정했는지까지 [`adr/`](adr/)에 남긴다.

- [ADR 0001 — OMR 대신 벡터 PDF를 직접 읽는다](adr/0001-vector-pdf-instead-of-omr.md)
- [ADR 0002 — GP 파일의 트랙 이펙터를 직접 파싱한다](adr/0002-read-gp-effects-directly.md)

추출기 휴리스틱의 구현 메모는 [`tools/pdfextract/README.md`](tools/pdfextract/README.md)에 있다.
