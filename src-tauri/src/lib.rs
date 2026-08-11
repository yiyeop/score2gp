mod convert;

/// 악보 파일을 바이트로 읽어 프론트엔드(alphaTab)에 전달한다.
/// 파일 선택은 dialog 플러그인이 담당하므로 여기서는 경로만 신뢰한다.
#[tauri::command]
fn read_score(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| format!("파일을 읽을 수 없습니다: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_score,
            convert::convert_pdf,
            convert::save_score,
            convert::write_score
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
