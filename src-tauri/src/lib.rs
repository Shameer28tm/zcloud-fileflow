use image::ImageFormat;
use std::path::Path;
use tauri::Manager;

#[tauri::command]
fn convert_image(
    input_path: String,
    output_path: String,
    output_format: String,
) -> Result<String, String> {
    let input = Path::new(&input_path);
    let output = Path::new(&output_path);

    if !input.is_file() {
        return Err("The source file no longer exists. Choose it again.".to_string());
    }
    if input == output {
        return Err("Choose a different output path so the original file is preserved.".to_string());
    }
    if output.exists() {
        return Err("That output file already exists. Choose a new name to avoid overwriting it.".to_string());
    }

    let format = match output_format.to_lowercase().as_str() {
        "png" => ImageFormat::Png,
        "jpg" | "jpeg" => ImageFormat::Jpeg,
        "webp" => ImageFormat::WebP,
        "bmp" => ImageFormat::Bmp,
        _ => return Err("Unsupported output format. Choose PNG, JPG, WebP or BMP.".to_string()),
    };

    let image = image::open(input)
        .map_err(|error| format!("Could not read this image: {error}"))?;

    image
        .save_with_format(output, format)
        .map_err(|error| format!("Could not write the converted image: {error}"))?;

    Ok(output.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![convert_image])
        .run(tauri::generate_context!())
        .expect("error while running Zcloud FileFlow");
}
