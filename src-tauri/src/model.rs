use base64::{engine::general_purpose::STANDARD, Engine};
use image::imageops::FilterType;
use std::io::Cursor;
use tract_onnx::prelude::*;

use crate::Keypoint;

const INPUT_W: usize = 192;
const INPUT_H: usize = 256;
const NUM_KPS: usize = 17;
const SIMCC_SPLIT: f32 = 2.0;

const MEAN: [f32; 3] = [123.675, 116.28, 103.53];
const STD: [f32; 3] = [58.395, 57.12, 57.375];

pub type Model = SimplePlan<TypedFact, Box<dyn TypedOp>, Graph<TypedFact, Box<dyn TypedOp>>>;

pub fn load_session(path: &str) -> Result<Model, String> {
    tract_onnx::onnx()
        .model_for_path(path)
        .map_err(|e| e.to_string())?
        .into_optimized()
        .map_err(|e| e.to_string())?
        .into_runnable()
        .map_err(|e| e.to_string())
}

pub fn load_session_from_bytes(bytes: &[u8]) -> Result<Model, String> {
    tract_onnx::onnx()
        .model_for_read(&mut Cursor::new(bytes))
        .map_err(|e| e.to_string())?
        .into_optimized()
        .map_err(|e| e.to_string())?
        .into_runnable()
        .map_err(|e| e.to_string())
}

pub fn run_pose(
    session: &Model,
    jpeg_b64: &str,
    orig_w: u32,
    orig_h: u32,
) -> Result<Vec<Keypoint>, String> {
    // 1. decode JPEG → resize 192×256 → RGB
    let bytes = STANDARD.decode(jpeg_b64).map_err(|e| e.to_string())?;
    let img = image::load_from_memory(&bytes)
        .map_err(|e| e.to_string())?
        .resize_exact(INPUT_W as u32, INPUT_H as u32, FilterType::Triangle)
        .to_rgb8();

    // 2. build NCHW tensor
    let input: Tensor = tract_ndarray::Array4::from_shape_fn(
        (1, 3, INPUT_H, INPUT_W),
        |(_, c, y, x)| (img.get_pixel(x as u32, y as u32)[c] as f32 - MEAN[c]) / STD[c],
    )
    .into();

    // 3. run inference
    let outputs = session
        .run(tvec!(input.into()))
        .map_err(|e| e.to_string())?;

    // 4. extract SimCC outputs: x=[1,N,W*split], y=[1,N,H*split]
    let x_view = outputs[0].to_array_view::<f32>().map_err(|e| e.to_string())?;
    let y_view = outputs[1].to_array_view::<f32>().map_err(|e| e.to_string())?;

    let x_flat = x_view.as_slice().ok_or("x tensor not contiguous")?;
    let y_flat = y_view.as_slice().ok_or("y tensor not contiguous")?;

    let sim_w = (INPUT_W as f32 * SIMCC_SPLIT) as usize;
    let sim_h = (INPUT_H as f32 * SIMCC_SPLIT) as usize;

    let mut kps = Vec::with_capacity(NUM_KPS);
    for k in 0..NUM_KPS {
        let xs = &x_flat[k * sim_w..(k + 1) * sim_w];
        let ys = &y_flat[k * sim_h..(k + 1) * sim_h];

        let (xi, xv) = argmax(xs);
        let (yi, yv) = argmax(ys);

        let px = (xi as f32 / SIMCC_SPLIT) * orig_w as f32 / INPUT_W as f32;
        let py = (yi as f32 / SIMCC_SPLIT) * orig_h as f32 / INPUT_H as f32;

        kps.push(Keypoint { x: px, y: py, score: (xv + yv) / 2.0 });
    }

    Ok(kps)
}

fn argmax(slice: &[f32]) -> (usize, f32) {
    slice
        .iter()
        .enumerate()
        .max_by(|a, b| a.1.partial_cmp(b.1).unwrap_or(std::cmp::Ordering::Less))
        .map(|(i, &v)| (i, v))
        .unwrap_or((0, 0.0))
}
