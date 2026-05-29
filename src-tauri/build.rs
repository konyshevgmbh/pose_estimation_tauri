fn main() {
    burn_onnx::ModelGen::new()
        .input("../models/rtmpose.onnx")
        .out_dir("src/model/")
        .load_strategy(burn_onnx::LoadStrategy::Embedded)
        .development(false)
        .run_from_script();
    tauri_build::build()
}
