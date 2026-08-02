//! PDF 악보를 Guitar Pro 파일로 변환한다.
//!
//! 변환 알고리즘은 `tools/pdfextract`의 Python 구현이 갖고 있다. 아직
//! 휴리스틱을 자주 고치는 중이라 Rust로 옮기지 않고 프로세스로 부른다.
//! 여기서는 실행과 경로 관리만 맡으므로, 나중에 Rust 구현으로 바꿔도
//! 프론트엔드가 쓰는 커맨드 모양은 그대로 둘 수 있다.
//!
//! 부르는 대상은 둘 중 하나다.
//!
//! - **배포본**: 앱과 함께 담긴 사이드카 실행 파일. 사용자 기계에 파이썬이
//!   없어도 돌아간다 (`tools/pdfextract/build-sidecar.sh`로 만든다).
//! - **개발 중**: 저장소의 `convert.py`. 고칠 때마다 다시 묶지 않아도 되도록
//!   사이드카보다 먼저 본다.

use std::path::PathBuf;
use std::process::Command;

/// 변환 결과. 프론트엔드는 `output`을 read_score로 읽어 재생한다.
#[derive(serde::Serialize)]
pub struct ConvertResult {
    pub output: String,
    pub log: String,
}

/// 변환기를 실행할 명령. 작업 폴더는 스크립트를 쓸 때만 의미가 있다.
struct Tool {
    program: PathBuf,
    args: Vec<PathBuf>,
    work_dir: Option<PathBuf>,
}

fn locate_tool() -> Result<Tool, String> {
    if let Some(tool) = locate_source() {
        return Ok(tool);
    }
    if let Some(program) = locate_sidecar() {
        return Ok(Tool { program, args: vec![], work_dir: None });
    }
    Err("변환기를 찾지 못했습니다. 앱을 다시 설치해 주세요.".into())
}

/// 저장소의 파이썬 구현. 개발 중에만 존재한다.
///
/// 사이드카보다 먼저 보는 이유는, 추출 로직을 고치는 동안 매번 33MB짜리
/// 실행 파일을 다시 묶지 않아도 되게 하기 위해서다.
fn locate_source() -> Option<Tool> {
    let mut dir = std::env::current_dir().ok()?;
    // src-tauri에서 실행되므로 위로 올라가며 찾는다
    for _ in 0..4 {
        let script = dir.join("tools/pdfextract/convert.py");
        if script.exists() {
            let python = [
                dir.join("tools/pdfextract/.venv/bin/python3"),
                dir.join(".venv/bin/python3"),
            ]
            .into_iter()
            .find(|p| p.exists())
            // 가상환경이 없으면 시스템 파이썬에 맡긴다 (PyMuPDF가 필요하다)
            .unwrap_or_else(|| PathBuf::from("python3"));
            let work_dir = script.parent().map(|p| p.to_path_buf());
            return Some(Tool { program: python, args: vec![script], work_dir });
        }
        if !dir.pop() {
            break;
        }
    }
    None
}

/// 앱과 함께 담긴 사이드카 실행 파일.
///
/// Tauri는 사이드카를 앱 실행 파일과 같은 폴더에 넣는다(macOS라면
/// `Contents/MacOS/`). 이름에서 대상 트리플은 떼고 담기므로 그대로 찾는다.
fn locate_sidecar() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let name = if cfg!(windows) {
        "score2gp-convert.exe"
    } else {
        "score2gp-convert"
    };
    let path = exe.parent()?.join(name);
    path.exists().then_some(path)
}

/// 변환 결과를 사용자가 고른 자리에 저장한다.
///
/// 변환물은 임시 폴더에 있어서 앱을 끄면 사라진다. Guitar Pro나 TuxGuitar로
/// 이어서 쓰려면 남길 수 있어야 한다.
#[tauri::command]
pub fn save_score(source: String, target: String) -> Result<(), String> {
    std::fs::copy(&source, &target)
        .map(|_| ())
        .map_err(|e| format!("저장하지 못했습니다: {e}"))
}

/// 변환기가 남긴 오류를 사용자에게 보여줄 문장으로 다듬는다.
///
/// 변환기는 '왜 안 되는지'를 아는 실패라면 그 이유만 짧게 적고 끝낸다.
/// 그 경우 그대로 보여주고, 예상 못 한 오류(트레이스백)라면 마지막 줄만
/// 추려 보여준다 — 전체를 쏟아내면 사용자가 읽을 수 없다.
fn explain_failure(stderr: &str) -> String {
    let text = stderr.trim();
    if text.is_empty() {
        return "변환에 실패했습니다 (원인을 알 수 없습니다)".into();
    }
    if text.contains("Traceback") {
        let last = text.lines().last().unwrap_or(text);
        return format!("변환 중 문제가 생겼습니다\n{last}");
    }
    text.to_string()
}

#[tauri::command]
pub fn convert_pdf(path: String) -> Result<ConvertResult, String> {
    let source = PathBuf::from(&path);
    if !source.exists() {
        return Err(format!("PDF를 찾을 수 없습니다: {path}"));
    }

    let tool = locate_tool()?;

    // 결과는 임시 폴더에 둔다. 원본 옆에 쓰면 사용자 폴더를 어지럽힌다.
    let stem = source
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("score");
    let output = std::env::temp_dir().join(format!("{stem}.gp5"));

    let mut command = Command::new(&tool.program);
    if let Some(dir) = &tool.work_dir {
        command.current_dir(dir);
    }
    let result = command
        .args(&tool.args)
        .arg(&source)
        .arg(&output)
        .output()
        .map_err(|e| {
            format!("변환기를 실행하지 못했습니다 ({}): {e}", tool.program.display())
        })?;

    let log = String::from_utf8_lossy(&result.stdout).to_string();
    if !result.status.success() {
        let err = String::from_utf8_lossy(&result.stderr);
        return Err(explain_failure(&err));
    }

    if !output.exists() {
        return Err("변환은 끝났지만 결과 파일이 없습니다".into());
    }

    Ok(ConvertResult {
        output: output.to_string_lossy().to_string(),
        log,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    /// 변환기를 찾고 실제로 돌려 결과 파일이 나오는지 확인한다.
    /// 샘플 PDF가 없는 환경에서는 건너뛴다.
    #[test]
    fn converts_a_real_pdf() {
        let sample = std::env::var("SCORE2GP_TEST_PDF").unwrap_or_default();
        if sample.is_empty() || !Path::new(&sample).exists() {
            eprintln!("샘플 PDF가 없어 건너뜁니다 (SCORE2GP_TEST_PDF)");
            return;
        }

        let result = convert_pdf(sample).expect("변환 실패");
        let out = Path::new(&result.output);
        assert!(out.exists(), "결과 파일이 없습니다");
        let size = std::fs::metadata(out).unwrap().len();
        assert!(size > 1000, "결과 파일이 너무 작습니다: {size} 바이트");
        assert!(result.log.contains("저장"), "로그가 이상합니다: {}", result.log);
    }

    /// 배포본에서 쓰는 경로다. 사이드카는 앱 실행 파일과 같은 폴더에 담기므로,
    /// 테스트 실행 파일 옆에 같은 이름을 놓아 찾는지 확인한다.
    ///
    /// 개발 중에는 저장소의 파이썬 구현이 먼저 잡혀 이 길이 안 쓰이는데,
    /// 그래서 조용히 망가지기 쉽다 — 배포해서 열어보기 전까지 아무도 모른다.
    #[test]
    fn finds_the_bundled_sidecar() {
        let exe = std::env::current_exe().expect("실행 파일 경로");
        let name = if cfg!(windows) {
            "score2gp-convert.exe"
        } else {
            "score2gp-convert"
        };
        let planted = exe.parent().expect("상위 폴더").join(name);

        let existed = planted.exists();
        if !existed {
            std::fs::write(&planted, b"#!/bin/sh\nexit 0\n").expect("가짜 사이드카 생성");
        }
        let found = locate_sidecar();
        if !existed {
            let _ = std::fs::remove_file(&planted);
        }

        assert_eq!(found.as_deref(), Some(planted.as_path()));
    }

    #[test]
    fn explains_failures_readably() {
        // 변환기가 이유를 아는 실패는 그대로 전한다
        let known = "악보를 찾지 못했습니다.\n스캔본은 지원하지 않습니다.";
        assert_eq!(explain_failure(known), known);

        // 예상 못 한 오류는 마지막 줄만 추린다
        let trace = "Traceback (most recent call last):\n  File \"x.py\"\nValueError: 무언가";
        let shown = explain_failure(trace);
        assert!(shown.contains("ValueError: 무언가"));
        assert!(!shown.contains("Traceback"));

        assert!(!explain_failure("   ").is_empty());
    }
}
