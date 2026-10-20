# Zcloud FileFlow

> **Windows-First, Local-First, Offline-Capable Desktop Productivity Tool**  
> Inspired by the fast, tactile workflow of Tangerine for Mac. Built with **Tauri 2**, **Rust**, **React 19**, **TypeScript**, and **Vite**.

[![Windows Build](https://github.com/Shameer28tm/zcloud-fileflow/actions/workflows/windows-build.yml/badge.svg)](https://github.com/Shameer28tm/zcloud-fileflow/actions/workflows/windows-build.yml)
[![Phase 1 Status](https://img.shields.io/badge/Phase%201-Complete-brightgreen)](docs/phase-1/IMPLEMENTATION_REPORT.md)
[![Privacy](https://img.shields.io/badge/Privacy-100%25%20Local%20Offline-blue)](docs/phase-1/PRIVACY_SECURITY_REPORT.md)

---

## 🌟 Key Features (Phase 1)

- 🔒 **100% Offline Core Operations**: Image conversion, resizing, and compression run entirely on your local CPU. No cloud servers, no remote APIs, and zero file telemetry.
- 🖼️ **Multi-Format Image Studio**: Convert seamlessly between **PNG**, **JPG/JPEG**, **WebP**, and **BMP**.
- 📐 **Precision Resizing**: Set custom dimensions, lock aspect ratios with integer precision, and select from professional resampling filters (`Lanczos3`, `Gaussian`, `CatmullRom`, `Triangle`, `Nearest`).
- 🗜️ **Format-Aware Compression**: Dial in JPEG quality (1–100%), pure-Rust lossless WebP encoding (VP8L), and PNG compression strategies (`default`, `fast`, `best`) with live byte-size delta reporting.
- ⚡ **Multi-File Batch Queue**: Sequential batch processing on the local CPU with cooperative per-file cancellation, per-item status indicators, aggregate progress tracking, and error continuation.
- 🛡️ **Atomic Output & Rollback-Safe Replacement**: Pre-decodes image headers before memory allocation to block oversized images (max 16,384×16,384 px, 100 MP). Writes outputs to atomic temporary files and re-decodes format headers before committing to disk. Uses rollback-safe staging to guarantee pre-existing destination files are never deleted or wiped on failure.
- 📜 **Local Recent Projects**: Fast access to recent work with search filtering, status verification, individual removal, and non-destructive "Clear History".
- 🎨 **Windows 11 Fluid Workspace**: Professional deep navy/black dark mode with responsive controls, keyboard navigation, and zero remote asset dependencies.

---

## 📁 Phase 1 Documentation Suite

For detailed technical analysis, testing logs, and security audits, refer to the Phase 1 reports in `docs/phase-1/`:

| Report | Description |
|:---|:---|
| [**Architecture & Overview**](docs/phase-1/README.md) | Scope, architecture diagram, component structure, and prerequisites. |
| [**Implementation Report**](docs/phase-1/IMPLEMENTATION_REPORT.md) | Initial baseline audit, design decisions, files created/modified, and feature details. |
| [**Test Report**](docs/phase-1/TEST_REPORT.md) | Exact commands and verified execution logs for Rust (12/12 passed) and Frontend (11/11 passed). |
| [**Privacy & Security Report**](docs/phase-1/PRIVACY_SECURITY_REPORT.md) | Local storage schema, zero-telemetry network audit, CSP, and threat mitigations. |
| [**Changelog**](docs/phase-1/CHANGELOG.md) | Chronological log of Phase 1 features, enhancements, and bug fixes. |

---

## 🔒 Privacy & Data Storage Model

1. **Zero Data Uploads**: Your images, file paths, and metadata never leave your computer.
2. **Local Storage Disclosure**: Recent project references are persisted exclusively in device-local storage (`window.localStorage` under `%LOCALAPPDATA%\com.zclouddigitech.fileflow\EBWebView\Default\Local Storage\` for application identifier `com.zclouddigitech.fileflow`).
3. **Non-Destructive Actions**:
   - Clearing history removes local references only; it **never deletes** your original or processed files on disk.
   - Source files are never modified in-place or deleted.
4. **Google Sign-In Status**:
   - Authentication is **optional and currently unconfigured** in Phase 1 builds.
   - Core file tools do not require an account, internet access, or cloud synchronization.

---

## 🛠️ Development & Build Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+ LTS recommended)
- [Rust](https://rustup.rs/) (Stable toolchain)
- Visual Studio C++ Build Tools (for native Windows MSI/NSIS installer generation)

### Quick Start

```powershell
# 1. Install dependencies reproducibly
npm ci

# 2. Run unit and UI tests
npm run test

# 3. Run native image engine tests
cargo test --manifest-path crates/image_engine/Cargo.toml

# 4. Start frontend development server
npm run dev

# 5. Launch Tauri desktop application
npm run tauri dev
```

### Production Build

```powershell
# Build web bundle
npm run build

# Package Windows desktop application (.exe / .msi / NSIS)
npm run tauri build
```

The production installer will be output to:
`src-tauri/target/release/bundle/nsis/`

---

## 🧪 Verification Matrix

| Test Suite | Scope | Result | Status |
|:---|:---|:---:|:---:|
| **`cargo test (image_engine)`** | Formats, Resize, Compress, Overwrite, Batch, Rollback, Dimensions | 12 / 12 Passed (0.04s) | ✅ Verified |
| **`npm run test (Vitest)`** | UI Tabs, Dropzone, Batch Queue, History, Settings, Cancellation | 11 / 11 Passed (0.73s) | ✅ Verified |
| **`npm run build (Vite)`** | TypeScript typechecking and production bundling | 0 Errors / 0 Warnings | ✅ Verified |
| **Offline Verification** | Core image operations with network disconnected | Functional | ✅ Verified |

---

## 🚀 Future Roadmap (Phase 2+)

- **PDF Utilities**: Merge, split, page reordering, compression, and text extraction.
- **Media Engine**: Audio/video conversion, trimming, and extraction via local FFmpeg.
- **Archive Studio**: Offline ZIP, 7z, and TAR extraction and packaging.
- **Global Quick Actions**: Windows system tray integration and configurable radial menu.
- **Secure Google Sync**: Optional PKCE loopback authentication with explicit user consent.
