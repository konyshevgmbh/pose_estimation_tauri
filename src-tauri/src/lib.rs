mod model;

use std::sync::Mutex;
use serde::Serialize;
use tauri::{Manager, State};

#[derive(Serialize, Clone)]
pub struct Keypoint {
    pub x: f32,
    pub y: f32,
    pub score: f32,
}

pub struct ModelState(pub Mutex<Option<model::Model>>);

/// Load the RTMPose ONNX model from `path`.
#[tauri::command]
fn init_model(
    app: tauri::AppHandle,
    state: State<ModelState>,
    path: String,
) -> Result<(), String> {
    // resolve relative paths against the app resource directory
    let resolved = if std::path::Path::new(&path).is_absolute() {
        path
    } else {
        app.path()
            .resource_dir()
            .map_err(|e| e.to_string())?
            .join(&path)
            .to_string_lossy()
            .into_owned()
    };

    let session = model::load_session(&resolved)
        .map_err(|e| format!("path='{}' err={}", resolved, e))?;
    *state.0.lock().unwrap() = Some(session);
    Ok(())
}

/// Load model from raw bytes (fallback for Android dev where resource_dir may not have the file).
#[tauri::command]
fn init_model_bytes(
    state: State<ModelState>,
    bytes: Vec<u8>,
) -> Result<(), String> {
    let session = model::load_session_from_bytes(&bytes)?;
    *state.0.lock().unwrap() = Some(session);
    Ok(())
}

/// Run RTMPose inference on a base64-encoded JPEG frame.
/// Returns 17 COCO keypoints with (x, y) in original frame coordinates.
#[tauri::command]
fn run_inference(
    state: State<ModelState>,
    jpeg_b64: String,
    orig_w: u32,
    orig_h: u32,
) -> Result<Vec<Keypoint>, String> {
    let guard = state.0.lock().unwrap();
    let session = guard.as_ref().ok_or("model not loaded — call init_model first")?;
    model::run_pose(session, &jpeg_b64, orig_w, orig_h)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ModelState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![init_model, init_model_bytes, run_inference])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
