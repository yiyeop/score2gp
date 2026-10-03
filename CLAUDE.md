# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 명령

```bash
pnpm install
pnpm run tauri dev          # 데스크톱 앱 (Tauri가 vite dev를 띄운다)
pnpm run dev                # 브라우저에서 프런트만 — 파일 열기는 <input> 폴백, Tauri 커맨드는 빠진다
pnpm run build              # tsc + vite build (타입 오류가 곧 빌드 실패다)
pnpm test                   # vitest run
pnpm exec vitest run src/lib/loopRange.test.ts   # 한 파일만
pnpm exec tsc --noEmit      # 타입만 확인
pnpm run format             # prettier --write . (커밋 전에 돌린다)
pnpm run format:check       # 고치지 않고 확인만
pnpm run tauri build        # .app/.dmg → src-tauri/target/release/bundle/
```

패키지 매니저는 **pnpm**이다(`package.json`의 `packageManager`가 버전을 고정한다).
`npm install`로 받으면 `pnpm-lock.yaml`과 어긋난 트리가 생기므로 쓰지 않는다.

DOM이 필요한 테스트는 파일 첫 줄에 `// @vitest-environment jsdom`을 적는다(전역 설정이 없다).

추출기(파이썬)는 별도 환경에서 돈다.

```bash
cd tools/pdfextract
python3 -m venv .venv && .venv/bin/pip install pymupdf pyguitarpro pyinstaller
.venv/bin/python -m unittest test_structure      # 한 모듈만
.venv/bin/python convert.py 악보.pdf out.gp5      # 앱의 'PDF 변환'이 부르는 것과 같은 경로
.venv/bin/python overlay.py 악보.pdf              # 인식 결과를 원본 위에 겹쳐 그린다(가장 확실한 검증)
.venv/bin/python verify.py 악보.pdf               # 마디 길이 합이 박자와 맞는지 전 페이지 검사
```

실제 악보에 의존하는 테스트는 환경 변수가 있을 때만 돈다 — `SCORE2GP_SAMPLE_PDF`(추출기),
`SCORE2GP_SAMPLE_WAV`(박 감지, `feat/mic-follow` 브랜치). 없으면 건너뛴다.

배포는 태그로 한다. `v*` 태그를 밀면 `.github/workflows/release.yml`이 macOS(Apple Silicon)·
Windows·Linux를 빌드해 **초안** 릴리스에 붙인다. 버전은 `package.json`,
`pnpm-lock.yaml`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`
다섯 곳을 함께 올려야 한다.

## 프로젝트 구조

```
src/                  프런트엔드 (React 19 + TypeScript)
├── player/           alphaTab 인스턴스와 재생 상태 — 앱에서 하나뿐인 플레이어
├── modes/            모드별 UI. registry.ts에 등록하고 read/·edit/에 레이아웃을 둔다
├── lib/              순수 로직 (구간·마커·주법·인코딩·내보내기) — 테스트가 붙는 자리
├── shortcuts/        모드별 키보드 단축키 등록 훅
└── demo/             파일 없이 바로 열어 보는 내장 데모 곡 (alphaTex)
src-tauri/            Rust 셸. src/lib.rs(파일 읽기)·src/convert.rs(변환기 호출)
├── capabilities/     Tauri 권한. 새 플러그인을 쓰면 여기에 추가해야 동작한다
├── binaries/         PyInstaller 사이드카 자리 (생성물, 커밋하지 않는다)
└── Info.plist, Entitlements.plist   macOS 권한·서명 설정
tools/pdfextract/     PDF → .gp5 추출기 (Python). 앱과 CLI가 같은 convert.py를 쓴다
adr/                  방향을 바꾼 결정과 그 이유
.github/workflows/    release.yml — v* 태그를 밀면 3개 플랫폼 빌드
```

## 구조에서 먼저 알아야 할 것

**alphaTab 인스턴스는 App 레벨에 하나뿐이다** (`src/player/useAlphaTab.ts`). 모드(읽기/편집)는
그 주위의 사이드바·하단 바·단축키만 교체하므로, 모드를 오가도 로드된 악보와 재생 상태가
그대로 이어진다. 새 모드는 `src/modes/registry.ts`에 등록하고 `App.tsx`의 분기에 레이아웃을 잇는다.
플레이어를 건드리는 기능은 `useAlphaTab`이 돌려주는 핸들(`PlayerHandle`)을 통해서만 접근한다.

**PDF 변환은 파이썬 프로세스다.** Rust(`src-tauri/src/convert.rs`)가 추출기를 프로세스로 부르는데,
**저장소의 `tools/pdfextract/convert.py`를 먼저** 찾고 없을 때만 함께 담긴 PyInstaller 사이드카를
쓴다. 덕분에 추출 로직을 고치는 동안 33MB를 다시 묶지 않아도 된다. 휴리스틱을 아직 자주 고치는
중이라 Rust로 옮기지 않았고, 커맨드 모양은 그대로여서 나중에 구현만 바꾸면 된다.
변환 결과는 캐시되며 변환기가 바뀌면 열쇠가 달라져 다시 변환한다.

**추출 파이프라인**(`tools/pdfextract/`)은 PDF의 벡터 그림을 직접 읽는다(OMR 아님, ADR 0001).
`structure.py`(보표·글리프·TAB 숫자) → `rhythm.py`(빔·꼬리·점·잇단음표) → `shapes.py`(그림으로
그려진 쉼표·꼬리를 마디 길이 방정식으로 역산) → `notes.py`(박 합치기·타이) → `assemble.py`(2패스
조립) → `gpwrite.py`(.gp5). 품질은 `verify.py`(마디 길이)와 `overlay.py`(눈으로 확인) 두 가지로 잰다.

**alphaTab이 버리는 정보는 파일에서 직접 읽는다** — 트랙 이펙터(`src/lib/gpEffects.ts`, ADR 0002),
구형 GP의 CP949 인코딩 추정(`src/lib/detectEncoding.ts`).

**계산과 입출력을 분리한다.** 순수 로직은 `src/lib/`에 두고 테스트로 못 박는다
(`loopRange`, `markers`, `techniques`, `beatFit` 등). 오디오·DOM·Tauri에 닿는 부분은 `src/player/`,
`src/lib/openScore.ts`에 모은다 — 소리나 파일 대화상자로는 회귀를 확인할 수 없기 때문이다.

## 함정

- **사이드카 아키텍처**: 파일 이름은 rustc의 트리플로 붙는데 알맹이는 파이썬의 아키텍처로 묶인다.
  어긋나면 빌드와 번들링은 성공하고 사용자 기계에서야 실패하므로 `build-sidecar.sh`가 미리 막는다.
  사이드카는 플랫폼마다 달라서 커밋하지 않는다.
- **macOS는 Apple Silicon 전용**이다(Rosetta로도 안 돌아간다). Intel Mac 지원을 되살리려면
  지원 범위부터 다시 정해야 한다 — `release.yml` 주석 참고.
- `public/font/`·`public/soundfont/`는 alphaTab vite 플러그인이 빌드마다 다시 만드는 생성물이다.
  추적하지 않으며, 앱이 쓰지 않는 `sonivox.sf2`는 `vite.config.ts`의 후처리가 결과물에서 지운다.
- 배포본은 무서명이라 첫 실행이 한 번 막힌다. README의 설치 안내가 그 우회법이다.

## 코드 스타일

형식은 Prettier가 정한다(80칸, 큰따옴표, 세미콜론, 후행 쉼표). 손으로 맞추지 말고
**커밋 전에 `pnpm run format`을 돌린다.** 설정은 `.prettierrc.json`에 있다.

Prettier가 정해 주지 않는 것들:

- **TypeScript**: `strict`가 켜져 있고 `pnpm run build`가 `tsc`를 먼저 돌리므로 타입 오류는
  곧 빌드 실패다. 타입만 가져올 때는 `import type`을 쓴다. `any`로 덮지 말고, 외부 라이브러리가
  타입을 주지 않으면 그 한 줄만 `@ts-expect-error`로 막고 이유를 적는다.
- **React**: 함수 컴포넌트와 훅만 쓴다. 상태를 다루는 로직은 `use*` 훅으로 빼고, 컴포넌트는
  그 훅이 돌려준 핸들을 받아 그리기만 한다(`PlayerHandle`이 그 예다). props 타입은 인자 자리에
  인라인으로 적는 것이 이 저장소의 관행이다.
- **이름**: 파일은 `camelCase.ts`, 컴포넌트 파일만 `PascalCase.tsx`. 내보내기는 이름 있는
  export만 쓴다(default export 없음).
- **주석과 문서는 한국어**로 쓰고 **'왜'를 적는다.** 무엇을 하는지는 코드가 말한다. 모듈 맨 위
  블록 주석에 그 파일이 존재하는 이유를, 상수 옆에는 그 값이 그 값인 근거(측정값·실패 사례)를
  남긴다. 포기한 대안도 적어 둔다 — 다음 사람이 같은 길을 다시 가지 않도록.
- **테스트**: 계산 로직은 순수 함수로 떼어 `*.test.ts`를 붙인다. 테스트 이름은 규칙을 문장으로
  적고(영문), 왜 그 규칙이 필요한지는 한국어 주석으로 남긴다. DOM이 필요하면 파일 첫 줄에
  `// @vitest-environment jsdom`.
- **파이썬(추출기)**: `from __future__ import annotations`를 쓰고 타입 힌트를 붙인다.
  테스트는 표준 `unittest`다.

## 이 저장소의 약속

- **주석은 '왜'를 적는다.** 무엇을 하는지는 코드가 말한다. 측정값·실패 사례·포기한 대안처럼
  다음 사람이 같은 함정을 다시 밟지 않게 하는 내용을 남긴다. 주석과 문서는 한국어다.
- **공개 저장소에 실제 곡명을 넣지 않는다.** 샘플은 `악보 A`, `악보 B`처럼 부르고, 경로는
  환경 변수로 받는다.
- 커밋 전에 `pnpm run format`을 돌린다. 저장소 전체가 아직 포맷되어 있지 않으므로, 고친 파일이
  함께 정리되는 정도는 자연스럽다.
- **커밋 메시지 접두사**: `feat`(기능) / `fix`(버그) / `style`(형식·문구) / `refact`(리팩터링) /
  `chore`(빌드·의존성·설정) / `docs`(문서) / `test`(테스트). 파일명 변경은 `git mv`로 하고
  `rename:`으로 적는다.
- 방향을 크게 바꾼 결정은 `adr/`에 **왜 그렇게 정했는지**까지 남긴다. 일상적인 구현 요령은
  코드 옆 주석이나 `tools/pdfextract/README.md`의 '구현 메모'가 제자리다.
