//! PDF 악보를 Guitar Pro 파일로 변환한다.
//!
//! 변환 알고리즘은 `tools/pdfextract`의 Python 프로토타입이 갖고 있다.
//! 아직 휴리스틱을 자주 고치는 중이라 Rust로 옮기지 않고 그대로 호출한다.
//! 여기서는 프로세스 실행과 경로 관리만 맡으므로, 나중에 Rust 구현으로
//! 바꿔도 프론트엔드가 쓰는 커맨드 모양은 그대로 둘 수 있다.

use std::path::{Path, PathBuf};
use std::process::Command;

/// 변환 결과. 프론트엔드는 `output`을 read_score로 읽어 재생한다.
#[derive(serde::Serialize)]
pub struct ConvertResult {
    pub output: String,
    pub log: String,
}

/// 변환기(Python)와 스크립트를 찾는다.
///
/// 개발 중에는 저장소의 `tools/pdfextract`를 쓴다. 배포본에서는 파이썬을
/// 함께 담거나 Rust 구현으로 대체해야 하므로, 못 찾으면 그 사실을 분명히
/// 알려 사용자가 원인을 알 수 있게 한다.
fn locate_tool() -> Result<(PathBuf, PathBuf), String> {
    let mut dir = std::env::current_dir()
        .map_err(|e| format!("현재 경로를 알 수 없습니다: {e}"))?;

    // src-tauri에서 실행되므로 위로 올라가며 찾는다
    for _ in 0..4 {
        let script = dir.join("tools/pdfextract/convert.py");
        if script.exists() {
            let python = find_python(&dir)?;
            return Ok((python, script));
        }
        if !dir.pop() {
            break;
        }
    }
    Err("변환기를 찾지 못했습니다 (tools/pdfextract/convert.py)".into())
}

fn find_python(root: &Path) -> Result<PathBuf, String> {
    // 프로젝트 안의 가상환경을 먼저 본다
    for candidate in [
        root.join("tools/pdfextract/.venv/bin/python3"),
        root.join(".venv/bin/python3"),
    ] {
        if candidate.exists() {
            return Ok(candidate);
        }
    }
    // 없으면 시스템 파이썬에 맡긴다 (PyMuPDF가 필요하다)
    Ok(PathBuf::from("python3"))
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

    let (python, script) = locate_tool()?;
    let work_dir = script
        .parent()
        .ok_or("변환기 경로가 이상합니다")?
        .to_path_buf();

    // 결과는 임시 폴더에 둔다. 원본 옆에 쓰면 사용자 폴더를 어지럽힌다.
    let stem = source
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("score");
    let output = std::env::temp_dir().join(format!("{stem}.gp5"));

    let result = Command::new(&python)
        .current_dir(&work_dir)
        .arg(&script)
        .arg(&source)
        .arg(&output)
        .output()
        .map_err(|e| format!("변환기를 실행하지 못했습니다 ({}): {e}", python.display()))?;

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
