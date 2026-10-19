use image::{imageops::FilterType, DynamicImage, ImageFormat};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageMetadata {
    pub path: String,
    pub filename: String,
    pub format: String,
    pub width: u32,
    pub height: u32,
    pub file_size_bytes: u64,
    pub has_alpha: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResizeConfig {
    pub enabled: bool,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub preserve_aspect_ratio: bool,
    pub filter: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompressionConfig {
    pub quality: Option<u8>,
    pub png_compression: Option<String>,
    pub webp_lossless: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessOptions {
    pub input_path: String,
    pub output_path: String,
    pub output_format: String,
    pub resize: Option<ResizeConfig>,
    pub compression: Option<CompressionConfig>,
    pub overwrite: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessResult {
    pub input_path: String,
    pub output_path: String,
    pub original_size_bytes: u64,
    pub output_size_bytes: u64,
    pub original_width: u32,
    pub original_height: u32,
    pub output_width: u32,
    pub output_height: u32,
    pub output_format: String,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchItemResult {
    pub index: usize,
    pub input_path: String,
    pub output_path: String,
    pub status: String,
    pub error_message: Option<String>,
    pub result: Option<ProcessResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchSummary {
    pub total: usize,
    pub successful: usize,
    pub failed: usize,
    pub skipped: usize,
    pub items: Vec<BatchItemResult>,
}

pub fn parse_format(raw: &str) -> Result<ImageFormat, String> {
    match raw.trim().to_lowercase().as_str() {
        "png" => Ok(ImageFormat::Png),
        "jpg" | "jpeg" => Ok(ImageFormat::Jpeg),
        "webp" => Ok(ImageFormat::WebP),
        "bmp" => Ok(ImageFormat::Bmp),
        other => Err(format!(
            "Unsupported format '{other}'. Supported formats are PNG, JPG, WebP, and BMP."
        )),
    }
}

pub fn format_to_extension(format: ImageFormat) -> &'static str {
    match format {
        ImageFormat::Png => "png",
        ImageFormat::Jpeg => "jpg",
        ImageFormat::WebP => "webp",
        ImageFormat::Bmp => "bmp",
        _ => "bin",
    }
}

pub fn read_metadata(path: &Path) -> Result<ImageMetadata, String> {
    if !path.is_file() {
        return Err("Source file does not exist or is not a regular file.".to_string());
    }

    let file_size_bytes = fs::metadata(path)
        .map_err(|e| format!("Could not read file metadata: {e}"))?
        .len();

    let reader = image::ImageReader::open(path)
        .map_err(|e| format!("Could not open file: {e}"))?
        .with_guessed_format()
        .map_err(|e| format!("Could not detect image format: {e}"))?;

    let format_str = reader
        .format()
        .map(|f| format_to_extension(f).to_uppercase())
        .unwrap_or_else(|| {
            path.extension()
                .and_then(|s| s.to_str())
                .unwrap_or("UNKNOWN")
                .to_uppercase()
        });

    let (width, height) = reader
        .into_dimensions()
        .map_err(|e| format!("Could not read image dimensions: {e}"))?;

    // Determine alpha by sampling format or opening minimal reader
    let has_alpha = match format_str.as_str() {
        "PNG" | "WEBP" => true,
        _ => false,
    };

    let filename = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("image")
        .to_string();

    Ok(ImageMetadata {
        path: path.to_string_lossy().to_string(),
        filename,
        format: format_str,
        width,
        height,
        file_size_bytes,
        has_alpha,
    })
}

pub fn validate_dimensions(width: u32, height: u32) -> Result<(), String> {
    if width == 0 || height == 0 {
        return Err("Width and height must both be greater than zero.".to_string());
    }
    const MAX_DIMENSION: u32 = 16384;
    if width > MAX_DIMENSION || height > MAX_DIMENSION {
        return Err(format!(
            "Dimension {width}x{height} exceeds safe maximum of {MAX_DIMENSION}x{MAX_DIMENSION}."
        ));
    }
    let total_pixels = (width as u64) * (height as u64);
    const MAX_PIXELS: u64 = 100_000_000;
    if total_pixels > MAX_PIXELS {
        return Err("Target resolution exceeds maximum safe memory capacity.".to_string());
    }
    Ok(())
}

pub fn flatten_transparency_to_rgb(img: &DynamicImage) -> DynamicImage {
    let rgba = img.to_rgba8();
    let (w, h) = rgba.dimensions();
    let mut rgb = image::RgbImage::new(w, h);

    for (x, y, pixel) in rgba.enumerate_pixels() {
        let alpha = pixel[3] as f32 / 255.0;
        let r = ((pixel[0] as f32 * alpha) + (255.0 * (1.0 - alpha))).round().clamp(0.0, 255.0) as u8;
        let g = ((pixel[1] as f32 * alpha) + (255.0 * (1.0 - alpha))).round().clamp(0.0, 255.0) as u8;
        let b = ((pixel[2] as f32 * alpha) + (255.0 * (1.0 - alpha))).round().clamp(0.0, 255.0) as u8;
        rgb.put_pixel(x, y, image::Rgb([r, g, b]));
    }

    DynamicImage::ImageRgb8(rgb)
}

fn parse_filter(name: Option<&str>) -> FilterType {
    match name.unwrap_or("lanczos3").to_lowercase().as_str() {
        "nearest" => FilterType::Nearest,
        "triangle" | "bilinear" => FilterType::Triangle,
        "catmullrom" => FilterType::CatmullRom,
        "gaussian" => FilterType::Gaussian,
        _ => FilterType::Lanczos3,
    }
}

pub fn apply_resize(img: DynamicImage, config: &ResizeConfig) -> Result<DynamicImage, String> {
    if !config.enabled {
        return Ok(img);
    }

    let orig_w = img.width();
    let orig_h = img.height();

    let (target_w, target_h) = match (config.width, config.height) {
        (Some(w), Some(h)) => {
            validate_dimensions(w, h)?;
            if config.preserve_aspect_ratio {
                // Fit within target bounds while preserving ratio
                let ratio_w = w as f64 / orig_w as f64;
                let ratio_h = h as f64 / orig_h as f64;
                let scale = ratio_w.min(ratio_h);
                let nw = ((orig_w as f64 * scale).round() as u32).max(1);
                let nh = ((orig_h as f64 * scale).round() as u32).max(1);
                (nw, nh)
            } else {
                (w, h)
            }
        }
        (Some(w), None) => {
            if config.preserve_aspect_ratio {
                let scale = w as f64 / orig_w as f64;
                let nh = ((orig_h as f64 * scale).round() as u32).max(1);
                validate_dimensions(w, nh)?;
                (w, nh)
            } else {
                validate_dimensions(w, orig_h)?;
                (w, orig_h)
            }
        }
        (None, Some(h)) => {
            if config.preserve_aspect_ratio {
                let scale = h as f64 / orig_h as f64;
                let nw = ((orig_w as f64 * scale).round() as u32).max(1);
                validate_dimensions(nw, h)?;
                (nw, h)
            } else {
                validate_dimensions(orig_w, h)?;
                (orig_w, h)
            }
        }
        (None, None) => return Ok(img),
    };

    let filter = parse_filter(config.filter.as_deref());
    let resized = if config.preserve_aspect_ratio {
        img.resize(target_w, target_h, filter)
    } else {
        img.resize_exact(target_w, target_h, filter)
    };

    Ok(resized)
}

pub fn verify_output_file(path: &Path, expected_format: ImageFormat) -> Result<u64, String> {
    if !path.exists() {
        return Err("Output file does not exist after processing.".to_string());
    }
    let metadata = fs::metadata(path).map_err(|e| format!("Failed to read output file metadata: {e}"))?;
    let len = metadata.len();
    if len == 0 {
        return Err("Output file was written with zero bytes.".to_string());
    }

    // Verify decoder can open the written file
    let reader = image::ImageReader::open(path)
        .map_err(|e| format!("Output file cannot be read: {e}"))?
        .with_guessed_format()
        .map_err(|e| format!("Output file format unknown: {e}"))?;

    let decoded_format = reader.format().ok_or_else(|| "Could not determine format of output file.".to_string())?;
    if decoded_format != expected_format {
        return Err(format!(
            "Output file format mismatch: expected {:?}, got {:?}",
            expected_format, decoded_format
        ));
    }

    // Verify it actually decodes into dimensions
    let _ = reader
        .into_dimensions()
        .map_err(|e| format!("Output image is corrupted or incomplete: {e}"))?;

    Ok(len)
}

pub fn process_single_image(options: &ProcessOptions) -> Result<ProcessResult, String> {
    let start_time = Instant::now();
    let input = PathBuf::from(&options.input_path);
    let output = PathBuf::from(&options.output_path);

    if !input.is_file() {
        return Err(format!("Source file does not exist: {}", options.input_path));
    }

    if input == output {
        return Err("Output path must be different from the source path to prevent accidental file corruption.".to_string());
    }

    if output.exists() && !options.overwrite {
        return Err(format!(
            "Destination file '{}' already exists. Choose a different name or enable overwrite.",
            output.file_name().and_then(|s| s.to_str()).unwrap_or("output")
        ));
    }

    let target_format = parse_format(&options.output_format)?;

    let original_size_bytes = fs::metadata(&input)
        .map_err(|e| format!("Cannot read source file metadata: {e}"))?
        .len();

    // Decode source image
    let loaded_image = image::open(&input).map_err(|e| format!("Failed to decode source image: {e}"))?;
    let original_width = loaded_image.width();
    let original_height = loaded_image.height();

    // Apply resize if configured
    let mut processed_image = if let Some(ref resize_cfg) = options.resize {
        apply_resize(loaded_image, resize_cfg)?
    } else {
        loaded_image
    };

    // JPEG doesn't support alpha channel. Handle transparent images by compositing over white.
    if target_format == ImageFormat::Jpeg && processed_image.color().has_alpha() {
        processed_image = flatten_transparency_to_rgb(&processed_image);
    }

    let output_width = processed_image.width();
    let output_height = processed_image.height();

    // Prepare atomic output directory and temporary file
    let output_dir = output.parent().unwrap_or_else(|| Path::new("."));
    if !output_dir.exists() {
        fs::create_dir_all(output_dir)
            .map_err(|e| format!("Failed to create destination directory: {e}"))?;
    }

    let temp_filename = format!(
        ".tmp_{}_{}_{}.fileflow",
        std::process::id(),
        start_time.elapsed().as_nanos(),
        output.file_name().and_then(|s| s.to_str()).unwrap_or("file")
    );
    let temp_path = output_dir.join(temp_filename);

    // Save with format and compression/quality options
    let save_result = save_image_to_path(&processed_image, &temp_path, target_format, options.compression.as_ref());
    if let Err(err) = save_result {
        let _ = fs::remove_file(&temp_path);
        return Err(format!("Failed to encode and save image: {err}"));
    }

    // Verify temp file
    let verified_size = match verify_output_file(&temp_path, target_format) {
        Ok(sz) => sz,
        Err(verify_err) => {
            let _ = fs::remove_file(&temp_path);
            return Err(format!("Verification of written file failed: {verify_err}"));
        }
    };

    // Atomically replace destination
    if output.exists() && options.overwrite {
        let _ = fs::remove_file(&output);
    }

    if let Err(rename_err) = fs::rename(&temp_path, &output) {
        // Fallback for cross-device moves
        if let Err(copy_err) = fs::copy(&temp_path, &output) {
            let _ = fs::remove_file(&temp_path);
            return Err(format!("Failed to move temp output to destination: {rename_err}; copy error: {copy_err}"));
        }
        let _ = fs::remove_file(&temp_path);
    }

    let duration_ms = start_time.elapsed().as_millis() as u64;

    Ok(ProcessResult {
        input_path: options.input_path.clone(),
        output_path: options.output_path.clone(),
        original_size_bytes,
        output_size_bytes: verified_size,
        original_width,
        original_height,
        output_width,
        output_height,
        output_format: format_to_extension(target_format).to_uppercase(),
        duration_ms,
    })
}

fn save_image_to_path(
    img: &DynamicImage,
    path: &Path,
    format: ImageFormat,
    compression: Option<&CompressionConfig>,
) -> Result<(), String> {
    match format {
        ImageFormat::Jpeg => {
            let quality = compression
                .and_then(|c| c.quality)
                .unwrap_or(85)
                .clamp(1, 100);
            let mut file = fs::File::create(path).map_err(|e| e.to_string())?;
            let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut file, quality);
            let rgb = match img {
                DynamicImage::ImageRgb8(rgb) => rgb.clone(),
                other => other.to_rgb8(),
            };
            encoder
                .encode(rgb.as_raw(), rgb.width(), rgb.height(), image::ExtendedColorType::Rgb8)
                .map_err(|e| e.to_string())
        }
        ImageFormat::Png => {
            img.save_with_format(path, ImageFormat::Png)
                .map_err(|e| e.to_string())
        }
        ImageFormat::WebP => {
            img.save_with_format(path, ImageFormat::WebP)
                .map_err(|e| e.to_string())
        }
        ImageFormat::Bmp => {
            img.save_with_format(path, ImageFormat::Bmp)
                .map_err(|e| e.to_string())
        }
        _ => Err("Unsupported output format.".to_string()),
    }
}

pub fn process_batch(items: &[ProcessOptions]) -> BatchSummary {
    let mut item_results = Vec::with_capacity(items.len());
    let mut successful = 0;
    let mut failed = 0;
    let mut skipped = 0;

    for (index, options) in items.iter().enumerate() {
        match process_single_image(options) {
            Ok(res) => {
                successful += 1;
                item_results.push(BatchItemResult {
                    index,
                    input_path: options.input_path.clone(),
                    output_path: options.output_path.clone(),
                    status: "success".to_string(),
                    error_message: None,
                    result: Some(res),
                });
            }
            Err(err) => {
                if err.contains("already exists") {
                    skipped += 1;
                    item_results.push(BatchItemResult {
                        index,
                        input_path: options.input_path.clone(),
                        output_path: options.output_path.clone(),
                        status: "skipped".to_string(),
                        error_message: Some(err),
                        result: None,
                    });
                } else {
                    failed += 1;
                    item_results.push(BatchItemResult {
                        index,
                        input_path: options.input_path.clone(),
                        output_path: options.output_path.clone(),
                        status: "failed".to_string(),
                        error_message: Some(err),
                        result: None,
                    });
                }
            }
        }
    }

    BatchSummary {
        total: items.len(),
        successful,
        failed,
        skipped,
        items: item_results,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use std::io::Write;

    fn create_test_image(path: &Path, width: u32, height: u32, with_alpha: bool) {
        if with_alpha {
            let mut img = image::RgbaImage::new(width, height);
            for (x, y, pixel) in img.enumerate_pixels_mut() {
                let alpha = if (x + y) % 2 == 0 { 255 } else { 0 };
                *pixel = image::Rgba([120, 180, 240, alpha]);
            }
            img.save(path).expect("Failed to save test rgba image");
        } else {
            let mut img = image::RgbImage::new(width, height);
            for (x, y, pixel) in img.enumerate_pixels_mut() {
                *pixel = image::Rgb([(x % 256) as u8, (y % 256) as u8, 200]);
            }
            img.save(path).expect("Failed to save test rgb image");
        }
    }

    #[test]
    fn test_format_parser() {
        assert_eq!(parse_format("png").unwrap(), ImageFormat::Png);
        assert_eq!(parse_format("PNG").unwrap(), ImageFormat::Png);
        assert_eq!(parse_format("jpg").unwrap(), ImageFormat::Jpeg);
        assert_eq!(parse_format("jpeg").unwrap(), ImageFormat::Jpeg);
        assert_eq!(parse_format("webp").unwrap(), ImageFormat::WebP);
        assert_eq!(parse_format("bmp").unwrap(), ImageFormat::Bmp);
        assert!(parse_format("gif").is_err());
        assert!(parse_format("exe").is_err());
    }

    #[test]
    fn test_dimension_validation() {
        assert!(validate_dimensions(100, 100).is_ok());
        assert!(validate_dimensions(0, 100).is_err());
        assert!(validate_dimensions(100, 0).is_err());
        assert!(validate_dimensions(20000, 100).is_err());
        assert!(validate_dimensions(10000, 10001).is_err());
    }

    #[test]
    fn test_png_to_jpeg_with_transparency_flattening() {
        let temp_dir = std::env::temp_dir().join(format!("fileflow_test_{}", std::process::id()));
        let _ = fs::create_dir_all(&temp_dir);

        let input_path = temp_dir.join("transparent.png");
        let output_path = temp_dir.join("converted.jpg");

        create_test_image(&input_path, 64, 64, true);

        let options = ProcessOptions {
            input_path: input_path.to_string_lossy().to_string(),
            output_path: output_path.to_string_lossy().to_string(),
            output_format: "jpg".to_string(),
            resize: None,
            compression: Some(CompressionConfig {
                quality: Some(90),
                png_compression: None,
                webp_lossless: None,
            }),
            overwrite: true,
        };

        let result = process_single_image(&options).expect("Processing must succeed");
        assert_eq!(result.output_format, "JPG");
        assert_eq!(result.output_width, 64);
        assert_eq!(result.output_height, 64);
        assert!(output_path.exists());
        assert!(result.output_size_bytes > 0);

        let decoded = image::open(&output_path).expect("Decoded output must be valid");
        assert_eq!((decoded.width(), decoded.height()), (64, 64));

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_resize_preserving_aspect_ratio() {
        let temp_dir = std::env::temp_dir().join(format!("fileflow_resize_test_{}", std::process::id()));
        let _ = fs::create_dir_all(&temp_dir);

        let input_path = temp_dir.join("input.png");
        let output_path = temp_dir.join("resized.webp");

        create_test_image(&input_path, 200, 100, false);

        let options = ProcessOptions {
            input_path: input_path.to_string_lossy().to_string(),
            output_path: output_path.to_string_lossy().to_string(),
            output_format: "webp".to_string(),
            resize: Some(ResizeConfig {
                enabled: true,
                width: Some(100),
                height: None,
                preserve_aspect_ratio: true,
                filter: Some("triangle".to_string()),
            }),
            compression: None,
            overwrite: true,
        };

        let result = process_single_image(&options).expect("Resize must succeed");
        assert_eq!(result.output_width, 100);
        assert_eq!(result.output_height, 50);

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_reject_same_input_and_output() {
        let temp_dir = std::env::temp_dir().join(format!("fileflow_same_path_{}", std::process::id()));
        let _ = fs::create_dir_all(&temp_dir);

        let path = temp_dir.join("same.png");
        create_test_image(&path, 32, 32, false);

        let options = ProcessOptions {
            input_path: path.to_string_lossy().to_string(),
            output_path: path.to_string_lossy().to_string(),
            output_format: "png".to_string(),
            resize: None,
            compression: None,
            overwrite: false,
        };

        let err = process_single_image(&options).unwrap_err();
        assert!(err.contains("Output path must be different"));

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_prevent_accidental_overwrite() {
        let temp_dir = std::env::temp_dir().join(format!("fileflow_overwrite_test_{}", std::process::id()));
        let _ = fs::create_dir_all(&temp_dir);

        let input_path = temp_dir.join("src.png");
        let output_path = temp_dir.join("dst.png");

        create_test_image(&input_path, 32, 32, false);
        create_test_image(&output_path, 32, 32, false);

        let options = ProcessOptions {
            input_path: input_path.to_string_lossy().to_string(),
            output_path: output_path.to_string_lossy().to_string(),
            output_format: "png".to_string(),
            resize: None,
            compression: None,
            overwrite: false,
        };

        let err = process_single_image(&options).unwrap_err();
        assert!(err.contains("already exists"));

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_handle_corrupted_file() {
        let temp_dir = std::env::temp_dir().join(format!("fileflow_corrupt_test_{}", std::process::id()));
        let _ = fs::create_dir_all(&temp_dir);

        let input_path = temp_dir.join("corrupt.png");
        let output_path = temp_dir.join("out.jpg");

        let mut f = File::create(&input_path).unwrap();
        f.write_all(b"NOT A VALID IMAGE DATA").unwrap();

        let options = ProcessOptions {
            input_path: input_path.to_string_lossy().to_string(),
            output_path: output_path.to_string_lossy().to_string(),
            output_format: "jpg".to_string(),
            resize: None,
            compression: None,
            overwrite: true,
        };

        let err = process_single_image(&options).unwrap_err();
        assert!(err.contains("Failed to decode"));
        assert!(!output_path.exists());

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_batch_processing_continues_on_failure() {
        let temp_dir = std::env::temp_dir().join(format!("fileflow_batch_test_{}", std::process::id()));
        let _ = fs::create_dir_all(&temp_dir);

        let valid_input = temp_dir.join("valid.png");
        let valid_output = temp_dir.join("valid.webp");
        create_test_image(&valid_input, 32, 32, false);

        let corrupt_input = temp_dir.join("bad.png");
        let corrupt_output = temp_dir.join("bad.webp");
        let mut f = File::create(&corrupt_input).unwrap();
        f.write_all(b"CORRUPT").unwrap();

        let items = vec![
            ProcessOptions {
                input_path: corrupt_input.to_string_lossy().to_string(),
                output_path: corrupt_output.to_string_lossy().to_string(),
                output_format: "webp".to_string(),
                resize: None,
                compression: None,
                overwrite: true,
            },
            ProcessOptions {
                input_path: valid_input.to_string_lossy().to_string(),
                output_path: valid_output.to_string_lossy().to_string(),
                output_format: "webp".to_string(),
                resize: None,
                compression: None,
                overwrite: true,
            },
        ];

        let summary = process_batch(&items);
        assert_eq!(summary.total, 2);
        assert_eq!(summary.failed, 1);
        assert_eq!(summary.successful, 1);
        assert!(valid_output.exists());
        assert!(!corrupt_output.exists());

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
