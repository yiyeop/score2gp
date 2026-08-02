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

VENV=.venv/bin
NAME=score2gp-convert
OUT=../../src-tauri/binaries

TRIPLE=$(rustc -vV | sed -n 's/^host: //p')
if [ -z "$TRIPLE" ]; then
    echo "대상 트리플을 알 수 없습니다 (rustc가 필요합니다)" >&2
    exit 1
fi
TARGET="$OUT/$NAME-$TRIPLE"

# 앱 빌드 때마다 불리므로, 소스가 그대로면 그냥 넘어간다.
if [ -x "$TARGET" ] && [ -z "$(find ./*.py -newer "$TARGET" 2>/dev/null)" ]; then
    echo "사이드카가 최신입니다 — 건너뜁니다"
    exit 0
fi

if [ ! -x "$VENV/python3" ]; then
    echo "변환기를 묶으려면 파이썬 가상환경이 필요합니다:" >&2
    echo "  cd tools/pdfextract" >&2
    echo "  python3 -m venv .venv && .venv/bin/pip install pymupdf pyguitarpro pyinstaller" >&2
    exit 1
fi

echo "빌드 중… (몇 분 걸립니다)"
"$VENV/pyinstaller" --onefile --name "$NAME" \
    --distpath dist --workpath build --noconfirm \
    convert.py >/dev/null

mkdir -p "$OUT"
cp "dist/$NAME" "$TARGET"
chmod +x "$TARGET"

echo "완료: src-tauri/binaries/$NAME-$TRIPLE ($(du -h "$TARGET" | cut -f1))"
