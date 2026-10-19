use fileflow_engine::{BatchSummary, ImageMetadata, ProcessOptions, ProcessResult};
use std::path::Path;

#[tauri::command]
fn get_image_metadata(path: String) -> Result<ImageMetadata, String> {
    fileflow_engine::read_metadata(Path::new(&path))
}

#[tauri::command]
fn check_file_exists(path: String) -> bool {
    Path::new(&path).is_file()
}

#[tauri::command]
fn convert_image(
    input_path: String,
    output_path: String,
    output_format: String,
) -> Result<String, String> {
    let options = ProcessOptions {
        input_path,
        output_path: output_path.clone(),
        output_format,
        resize: None,
        compression: None,
        overwrite: false,
    };
    fileflow_engine::process_single_image(&options)?;
    Ok(output_path)
}

#[tauri::command]
fn process_image(options: ProcessOptions) -> Result<ProcessResult, String> {
    fileflow_engine::process_single_image(&options)
}

#[tauri::command]
fn batch_process_images(items: Vec<ProcessOptions>) -> BatchSummary {
    fileflow_engine::process_batch(&items)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            convert_image,
            process_image,
            batch_process_images,
            get_image_metadata,
            check_file_exists,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Zcloud FileFlow");
}
