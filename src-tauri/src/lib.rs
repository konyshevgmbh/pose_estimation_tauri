mod model;

use std::sync::{Arc, RwLock};
use serde::Serialize;
use tauri::State;

#[derive(Serialize, Clone)]
pub struct Keypoint {
    pub x: f32,
    pub y: f32,
    pub score: f32,
}

pub struct ModelState(pub Arc<RwLock<Option<model::Model>>>);

#[tauri::command]
fn init_model(
    _app: tauri::AppHandle,
    state: State<ModelState>,
    _path: String,
) -> Result<(), String> {
    let m = model::Model::new()?;
    *state.0.write().unwrap() = Some(m);
    Ok(())
}

#[tauri::command]
fn init_model_bytes(
    state: State<ModelState>,
    _bytes: Vec<u8>,
) -> Result<(), String> {
    let m = model::Model::new()?;
    *state.0.write().unwrap() = Some(m);
    Ok(())
}

#[tauri::command]
fn run_inference(
    state: State<ModelState>,
    jpeg_b64: String,
    orig_w: u32,
    orig_h: u32,
) -> Result<Vec<Keypoint>, String> {
    let guard = state.0.read().unwrap();
    let m = guard.as_ref().ok_or("model not loaded")?;
    model::run_pose(m, &jpeg_b64, orig_w, orig_h)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ModelState(Arc::new(RwLock::new(None))))
        .invoke_handler(tauri::generate_handler![init_model, init_model_bytes, run_inference])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
