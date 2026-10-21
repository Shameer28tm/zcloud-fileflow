fn main() {
    let attributes =
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
            "convert_image",
            "process_image",
            "batch_process_images",
            "get_image_metadata",
            "check_file_exists",
        ]));

    tauri_build::try_build(attributes).expect("failed to run tauri-build");
}
