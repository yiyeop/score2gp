#!/usr/bin/env bash
# 변환기를 실행 파일 하나로 묶어 Tauri 사이드카 자리에 놓는다.
#
# 앱을 배포하려면 사용자 기계에 파이썬이 없어도 변환이 돌아야 한다.
# PyInstaller로 인터프리터와 PyMuPDF까지 한 파일에 담는다.
#
#     tools/pdfextract/build-sidecar.sh
#
# Tauri는 사이드카 파일 이름 끝에 대상 트리플이 붙어 있기를 요구한다
# (score2gp-convert-x86_64-apple-darwin 같은 식). 그래야 여러 플랫폼의
# 바이너리를 한 폴더에 두고 빌드할 때 알맞은 것을 골라 담는다.
set -euo pipefail

cd "$(dirname "$0")"

NAME=score2gp-convert
OUT=../../src-tauri/binaries

# venv 레이아웃과 실행 파일 이름이 OS마다 다르다 — Windows는 .venv/Scripts/에
# python.exe로 들어가고, 사이드카 이름에도 .exe가 붙어야 한다(Tauri가 대상
# 트리플을 뗀 뒤 실행 시 찾는 이름은 convert.rs의 locate_sidecar 참고).
if [ -d .venv/Scripts ]; then
    VENV=.venv/Scripts
    PY=python.exe
    EXT=.exe
else
    VENV=.venv/bin
    PY=python3
    EXT=
fi

TRIPLE=$(rustc -vV | sed -n 's/^host: //p')
if [ -z "$TRIPLE" ]; then
    echo "대상 트리플을 알 수 없습니다 (rustc가 필요합니다)" >&2
    exit 1
fi
TARGET="$OUT/$NAME-$TRIPLE$EXT"

# 앱 빌드 때마다 불리므로, 소스가 그대로면 그냥 넘어간다.
if [ -x "$TARGET" ] && [ -z "$(find ./*.py -newer "$TARGET" 2>/dev/null)" ]; then
    echo "사이드카가 최신입니다 — 건너뜁니다"
    exit 0
fi

if [ ! -f "$VENV/$PY" ]; then
    echo "변환기를 묶으려면 파이썬 가상환경이 필요합니다:" >&2
    echo "  cd tools/pdfextract" >&2
    echo "  python3 -m venv .venv && .venv/bin/pip install pymupdf pyguitarpro pyinstaller" >&2
    exit 1
fi

# 파일 이름은 **rustc의** 트리플로 붙는데, 알맹이는 **파이썬 인터프리터의**
# 아키텍처로 묶인다(PyInstaller가 그 인터프리터를 통째로 담기 때문이다).
# 둘이 어긋나면 이름만 arm64인 x86_64 바이너리가 배포판에 담기고, 앱은
# 사용자 기계에서 조용히 실패한다 — 빌드도 번들링도 성공하므로 알아채기
# 어렵다. 몇 분짜리 PyInstaller를 돌리기 전에 여기서 막는다.
#
# 이건 가상의 위험이 아니다. 개발기가 Apple Silicon인데 툴체인이 전부
# Intel(Rosetta) 경로에 있는 상태라, rustup만 arm64로 새로 깔면 곧바로
# rustc는 aarch64 · 파이썬은 x86_64가 되어 이 상황이 만들어진다.
WANT_ARCH=${TRIPLE%%-*}
HAVE_ARCH=$("$VENV/$PY" -c 'import platform; print(platform.machine())')
case "$(printf '%s' "$HAVE_ARCH" | tr '[:upper:]' '[:lower:]')" in
    arm64 | aarch64) HAVE_ARCH=aarch64 ;;
    amd64 | x86_64)  HAVE_ARCH=x86_64 ;;
esac

if [ "$WANT_ARCH" != "$HAVE_ARCH" ]; then
    echo "아키텍처가 어긋납니다 — 사이드카를 만들지 않습니다." >&2
    echo "  rustc  : $TRIPLE ($WANT_ARCH)" >&2
    echo "  python : $HAVE_ARCH  ($VENV/$PY)" >&2
    echo >&2
    echo "이대로 묶으면 $WANT_ARCH 이름이 붙은 $HAVE_ARCH 바이너리가 나옵니다." >&2
    echo "둘 중 하나를 맞춰 주세요 — 보통 파이썬 쪽을 rustc에 맞춥니다:" >&2
    echo "  cd tools/pdfextract && rm -rf .venv" >&2
    echo "  <$WANT_ARCH 파이썬> -m venv .venv" >&2
    echo "  .venv/bin/pip install pymupdf pyguitarpro pyinstaller" >&2
    exit 1
fi

echo "빌드 중… (몇 분 걸립니다)"
"$VENV/pyinstaller$EXT" --onefile --name "$NAME" \
    --distpath dist --workpath build --noconfirm \
    convert.py >/dev/null

mkdir -p "$OUT"
cp "dist/$NAME$EXT" "$TARGET"
chmod +x "$TARGET"

echo "완료: src-tauri/binaries/$NAME-$TRIPLE$EXT ($(du -h "$TARGET" | cut -f1), $HAVE_ARCH)"
