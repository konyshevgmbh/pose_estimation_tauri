use base64::{engine::general_purpose::STANDARD, Engine};
use image::imageops::FilterType;
use serde::Serialize;
use std::cell::RefCell;
use std::io::Cursor;
use tract_onnx::prelude::*;
use wasm_bindgen::prelude::*;

const INPUT_W: usize = 192;
const INPUT_H: usize = 256;
const NUM_KPS: usize = 17;
const SIMCC_SPLIT: f32 = 2.0;
const MEAN: [f32; 3] = [123.675, 116.28, 103.53];
const STD: [f32; 3] = [58.395, 57.12, 57.375];

type Model = SimplePlan<TypedFact, Box<dyn TypedOp>, Graph<TypedFact, Box<dyn TypedOp>>>;

#[derive(Serialize)]
struct Keypoint {
    x: f32,
    y: f32,
    score: f32,
}

thread_local! {
    static MODEL: RefCell<Option<Model>> = RefCell::new(None);
}

#[wasm_bindgen]
pub fn load_model(bytes: &[u8]) -> Result<(), JsError> {
    let model = tract_onnx::onnx()
        .model_for_read(&mut Cursor::new(bytes))
        .map_err(|e| JsError::new(&e.to_string()))?
        .into_optimized()
        .map_err(|e| JsError::new(&e.to_string()))?
        .into_runnable()
        .map_err(|e| JsError::new(&e.to_string()))?;
    MODEL.with(|m| *m.borrow_mut() = Some(model));
    Ok(())
}

#[wasm_bindgen]
pub fn run_inference(jpeg_b64: &str, orig_w: u32, orig_h: u32) -> Result<JsValue, JsError> {
    MODEL.with(|cell| {
        let guard = cell.borrow();
        let model = guard.as_ref().ok_or_else(|| JsError::new("model not loaded"))?;

        let bytes = STANDARD.decode(jpeg_b64).map_err(|e| JsError::new(&e.to_string()))?;
        let img = image::load_from_memory(&bytes)
            .map_err(|e| JsError::new(&e.to_string()))?
            .resize_exact(INPUT_W as u32, INPUT_H as u32, FilterType::Triangle)
            .to_rgb8();

        let input: Tensor = tract_ndarray::Array4::from_shape_fn(
            (1, 3, INPUT_H, INPUT_W),
            |(_, c, y, x)| (img.get_pixel(x as u32, y as u32)[c] as f32 - MEAN[c]) / STD[c],
        )
        .into();

        let outputs = model
            .run(tvec!(input.into()))
            .map_err(|e| JsError::new(&e.to_string()))?;

        let x_view = outputs[0].to_array_view::<f32>().map_err(|e| JsError::new(&e.to_string()))?;
        let y_view = outputs[1].to_array_view::<f32>().map_err(|e| JsError::new(&e.to_string()))?;
        let x_flat = x_view.as_slice().ok_or_else(|| JsError::new("x not contiguous"))?;
        let y_flat = y_view.as_slice().ok_or_else(|| JsError::new("y not contiguous"))?;

        let sim_w = (INPUT_W as f32 * SIMCC_SPLIT) as usize;
        let sim_h = (INPUT_H as f32 * SIMCC_SPLIT) as usize;

        let mut kps = Vec::with_capacity(NUM_KPS);
        for k in 0..NUM_KPS {
            let xs = &x_flat[k * sim_w..(k + 1) * sim_w];
            let ys = &y_flat[k * sim_h..(k + 1) * sim_h];
            let (xi, xv) = argmax(xs);
            let (yi, yv) = argmax(ys);
            kps.push(Keypoint {
                x: (xi as f32 / SIMCC_SPLIT) * orig_w as f32 / INPUT_W as f32,
                y: (yi as f32 / SIMCC_SPLIT) * orig_h as f32 / INPUT_H as f32,
                score: (xv + yv) / 2.0,
            });
        }

        serde_wasm_bindgen::to_value(&kps).map_err(|e| JsError::new(&e.to_string()))
    })
}

fn argmax(slice: &[f32]) -> (usize, f32) {
    slice
        .iter()
        .enumerate()
        .max_by(|a, b| a.1.partial_cmp(b.1).unwrap_or(std::cmp::Ordering::Less))
        .map(|(i, &v)| (i, v))
        .unwrap_or((0, 0.0))
}
