# Zcloud FileFlow — Phase 1 Changelog

All notable changes, enhancements, bug fixes, and architectural decisions for Phase 1 of Zcloud FileFlow are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0-phase1] - 2026-10-20

### Added
- **Core Native Image Engine (`crates/image_engine`)**:
  - Independent, high-performance Rust library for image transformation and format conversion.
  - Multi-format support: PNG, JPEG/JPG, WebP, and BMP.
  - High-fidelity resampling filter support: `Lanczos3` (best quality), `Gaussian`, `CatmullRom`, `Triangle`, and `Nearest`.
  - Aspect ratio locking logic preserving proportions with 64-bit integer calculations.
  - Format-specific compression tuning:
    - JPEG: variable DCT quality (1–100%).
    - WebP: variable quality (1–100%) or lossless flag.
    - PNG: compression mode parameters.
  - RGBA-to-RGB alpha transparency compositing on `#FFFFFF` background for JPEG conversion, avoiding encoder panics.
  - Atomic temporary file generation (`<target>.tmp.<timestamp>`) and rename to protect against partial outputs.
  - Post-write file decode verification to guarantee valid output files.
  - Overwrite safety checks with configurable `allow_overwrite` flag.
  - Parallel multi-file batch execution powered by `rayon`.
  - Image metadata inspector extracting dimensions, format, and byte size.
- **Tauri IPC Command Integration (`src-tauri/src/lib.rs`)**:
  - Exported commands: `process_image`, `convert_image`, `batch_process_images`, `get_image_metadata`, and `check_file_exists`.
  - Error translation to user-readable strings across the IPC boundary.
  - Reconfigured Tauri crate type to `["rlib"]` for clean integration.
- **Desktop UI Redesign (`src/App.tsx`)**:
  - Windows 11 inspired deep navy and black aesthetic with subtle blue accents (`#080c14`, `#0c121e`, `#77a9ff`).
  - **Workspace Dashboard**: Quick metrics, system status indicator, quick action cards, and recent work view.
  - **Single Image Studio**:
    - Native file picker and drag-and-drop ingestion.
    - Live dimension and file size badges.
    - Format selector (PNG, JPG, WebP, BMP).
    - Resize controls with width, height, aspect ratio lock toggle, and resampling algorithm selector.
    - Compression quality sliders and format-specific settings.
    - Native destination save dialog.
    - Output validation and size delta calculation (`X% smaller / larger`).
  - **Batch Processing Queue**:
    - Multi-file selection and drag-and-drop queue.
    - Per-item status tracking (`pending`, `processing`, `done`, `error`, `cancelled`).
    - Overall queue progress bar and statistics summary.
    - Batch destination directory selection.
    - Safe batch cancellation mechanism.
    - Independent file continuation if an individual image fails.
  - **Local Recent Projects**:
    - Persistent list stored in device-local storage.
    - Live search filter by filename or path.
    - Individual item deletion.
    - Global non-destructive "Clear History" control.
    - Missing/deleted file inspection badge.
  - **Settings & Privacy**:
    - Explicit local-first privacy disclosure.
    - Status badge for Google Sign-In ("Not configured in this build").
    - Storage usage and cache inspection.
- **Styling & Design System (`src/index.css`)**:
  - High-contrast, accessibility-focused styling.
  - Fluid responsive grid layouts, custom scrollbars, and card micro-interactions.
  - Offline-first system font stack (no CDN font requests).
- **Automated Testing Suite**:
  - **Rust**: 8 comprehensive unit tests in `crates/image_engine/src/lib.rs` verifying conversion between all 4 formats, aspect ratio preservation, dimension clamping, overwrite protection, corrupt file rejection, and batch error continuation.
  - **Frontend**: 9 Vitest + `@testing-library/react` tests in `src/App.test.tsx` verifying tab navigation, dropzone rendering, batch controls, recent projects search, clear history dialog, and privacy disclosures.
- **Continuous Integration (`.github/workflows/windows-build.yml`)**:
  - Updated GitHub Actions workflow with Node.js setup, frontend testing, Rust engine testing, Tauri NSIS installer build, and artifact publishing.
- **Comprehensive Documentation Suite (`docs/phase-1/`)**:
  - `README.md`: Architecture overview, scope, and local build instructions.
  - `IMPLEMENTATION_REPORT.md`: Baseline audit, design decisions, files modified, and implementation details.
  - `TEST_REPORT.md`: Environment versions, exact test execution logs, offline verification matrix, and CI status.
  - `PRIVACY_SECURITY_REPORT.md`: Data flow, storage boundaries, network audit, and threat mitigations.
  - `CHANGELOG.md`: Chronological log of Phase 1 deliverables.

### Changed
- Replaced initial template landing page with full-featured desktop productivity workspace.
- Updated Tauri configuration (`tauri.conf.json`) with official application metadata, identifiers, Windows window configurations, and icon paths.
- Replaced basic npm scripts in `package.json` with unified build, test, and preview scripts.

### Fixed
- Fixed JPEG encoding failures on images with transparent alpha channels by blending onto a pure white background.
- Fixed potential output corruption by introducing atomic temporary file writes and post-write verification checks.
- Fixed UI text query ambiguity in frontend test assertions.
- Fixed missing desktop icon assets by generating a complete Windows icon set (`.ico`, `.png`, Store logos).

### Security & Privacy
- Zero telemetry or analytics tracking.
- Zero outbound network requests during image conversion or resizing.
- All core processing guaranteed 100% offline.
- Explicit user disclosure of device-local metadata storage.
