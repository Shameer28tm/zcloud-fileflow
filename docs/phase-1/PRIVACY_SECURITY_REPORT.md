# Zcloud FileFlow — Privacy and Security Assessment Report (Phase 1)

**Application**: Zcloud FileFlow  
**Target Platform**: Windows 10/11 Desktop  
**Evaluation Phase**: Phase 1 — Local Image Tools, History & Offline Architecture  
**Assessment Date**: 2026-10-19 / 2026-10-20  
**Classification**: Public Repository Documentation  

---

## 1. Executive Summary

Zcloud FileFlow is architected from the ground up as a **local-first, offline-capable desktop productivity tool**. Core image operations (conversion, resizing, compression, batch queues, and metadata extraction) execute strictly on the user's local CPU using native Rust libraries. 

This assessment verifies that:
- **Zero outbound telemetry, analytics, or background tracking** exists in the codebase.
- **Zero remote server dependencies** are invoked during image ingestion, processing, or saving.
- **File operations are non-destructive**: source files are never mutated in-place or deleted, and destination overwrite protection is enforced by default.
- **Local persistence is transparent and strictly bounded**: project/file history stores minimal metadata in device-local storage and can be wiped completely by the user without touching underlying image files.
- **External authentication (Google Sign-In)** is fully decoupled from core productivity features, currently documented as unconfigured, and transmits no file data.

---

## 2. Data Flow & Processing Model

```
+---------------------------------------------------------------------------------+
|                                 USER DESKTOP                                    |
|                                                                                 |
|  [Source Files] (e.g. C:\Photos\pic.png)                                        |
|         │                                                                       |
|         ▼ (Native Tauri Dialog / Drag-and-Drop)                                 |
|  ┌───────────────────────────────────────────────────────────────────────────┐  |
|  │ Tauri Webview (React 19 + TypeScript)                                     │  |
|  │  - Displays file metadata, preview indicators, and operation parameters   │  |
|  │  - Dispatches IPC commands via @tauri-apps/api/core (`invoke`)            │  |
|  │  - Stores recent project references in local browser storage (JSON)       │  |
|  └──────────────────────────────┬────────────────────────────────────────────┘  |
|                                 │                                               |
|                                 │ IPC Command (`process_image`, `batch_process`) |
|                                 ▼                                               |
|  ┌───────────────────────────────────────────────────────────────────────────┐  |
|  │ Native Core Engine (Rust `crates/image_engine`)                           │  |
|  │  1. Ingests bytes from local disk path                                   │  |
|  │  2. Validates format magic bytes & dimensions                             │  |
|  │  3. Processes in RAM: alpha flattening, Lanczos3 resize, encoding         │  |
|  │  4. Writes to atomic temporary file (`<target>.tmp.<pid>`)                │  |
|  │  5. Verifies decoding capability on written temp file                     │  |
|  │  6. Atomically renames temp file to final destination                     │  |
|  └──────────────────────────────┬────────────────────────────────────────────┘  |
|                                 │                                               |
|                                 ▼                                               |
|  [Destination File] (e.g. C:\Export\pic.webp)                                  |
+---------------------------------------------------------------------------------+
                                      │
                         NO NETWORK / INTERNET ACCESS
                                      │
                                      ▼
                                [BLOCKED / NONE]
```

### Data Boundaries
1. **Memory Residency**: Image buffers exist only in local process memory during conversion/resizing. Once written to disk, buffers are dropped.
2. **Temporary File Isolation**: Intermediate files are generated alongside the destination file with unique process/timestamp identifiers (`.tmp.<timestamp>`) and moved atomically into place. This prevents partial or corrupted files from being exposed to the user or replacing legitimate outputs.
3. **No Centralized Application Vault**: Zcloud FileFlow does not copy or ingest user files into hidden application folders or hidden caches. Files stay exactly where the user stores them.

---

## 3. Local History & Storage Audit

### Storage Location
- **Frontend Storage Mechanism**: Web standard `window.localStorage` within the sandboxed Tauri WebView data directory.
- **Storage Key**: `zcloud-fileflow.recent.v1`
- **Location on Windows**: `%LOCALAPPDATA%\com.zclouddigitech.fileflow\EBWebView\Default\Local Storage\`

### Schema Specification
Each history entry strictly persists only the following non-sensitive metadata:

```typescript
interface RecentItem {
  path: string;        // Full local absolute file path
  name: string;        // Base filename (e.g., "banner-draft.png")
  kind: string;        // MIME or extension classification ("PNG", "JPEG", "WebP", "BMP")
  lastOpened: number;  // Unix timestamp (ms)
  width?: number;      // Image width in pixels
  height?: number;     // Image height in pixels
  sizeBytes?: number;  // File size in bytes for UI delta display
  exists?: boolean;    // Local disk existence flag
}
```

### Privacy Protections
1. **No Image Data**: Raw image pixels, thumbnails, EXIF personal data, or base64 streams are **never** stored in recent history.
2. **Missing File Resilience**: If a referenced file is deleted, moved, or renamed externally, the application flags the entry as `missing` upon inspection rather than throwing an error or attempting to fetch a cloud backup.
3. **Non-Destructive Deletion**:
   - **Remove Item**: Removes the reference from `localStorage`.
   - **Clear History**: Clears all entries from `localStorage`.
   - Neither action ever modifies or deletes the actual source or output files on disk.

---

## 4. Network Activity & External Communications Audit

### Outbound Request Verification
An audit was conducted across the source tree for outbound network calls (`fetch`, `XMLHttpRequest`, `WebSocket`, `navigator.sendBeacon`, `reqwest`, `hyper`, `curl`, and raw sockets):

| Subsystem | Audit Finding | Network State |
|:---|:---|:---|
| **Image Engine (`crates/image_engine`)** | Only uses `image` and `serde`. Zero network dependencies. | **100% Offline** |
| **Tauri Core (`src-tauri`)** | Standard Tauri 2 plugins (`dialog`). No telemetry plugins included. | **100% Offline** |
| **Frontend UI (`src/App.tsx`)** | All icons loaded from `lucide-react` (local bundle). No Google Fonts CDN or remote scripts. | **100% Offline** |
| **Styling (`src/index.css`)** | System font stacks (`system-ui`, `-apple-system`, `Segoe UI`, `Roboto`, `sans-serif`). Zero `@import url(...)` to external CDNs. | **100% Offline** |
| **Analytics / Telemetry** | None present. No Sentry, PostHog, Google Analytics, or crash uploaders. | **100% Offline** |

### Content Security Policy (CSP)
Tauri configuration enforces a restrictive Content Security Policy in `src-tauri/tauri.conf.json`:
- `default-src 'self'`
- `style-src 'self' 'unsafe-inline'`
- `img-src 'self' asset: https://asset.localhost`
- Remote script execution and external connect endpoints are forbidden.

---

## 5. Google Sign-In & Authentication Model

### Current Status: **Unconfigured & Decoupled**
- The repository contains UI scaffolding for Google Account integration in the Settings & Privacy tab.
- **No OAuth credentials** (Client ID / Client Secret) are hardcoded into frontend bundles, Rust sources, or configuration files.
- The UI explicitly marks Google Sign-In as **"Not configured in this build"** and informs the user that core functionality requires no login.

### Phase 2 Architecture & Security Requirements
When Google OAuth is implemented:
1. **Desktop Client Type**: Must use Google OAuth 2.0 Client ID for Desktop Applications (Public Client with PKCE — RFC 7636).
2. **No Embedded Secrets**: Client secrets must **never** be packaged into the client application.
3. **Loopback Redirect**: The flow must launch the user's default system browser (`http://127.0.0.1:<random-port>/oauth/callback`) rather than embedding a browser view or asking for raw passwords.
4. **Minimal Scopes**: Only `openid`, `email`, and `profile` are permitted. Cloud storage scopes (`drive`, `drive.file`, `drive.readonly`) are prohibited unless the user explicitly requests cloud backup features in a future phase.
5. **Zero Cloud Sync for Local Files**: Signing in must never automatically upload recent projects, local paths, or processed files.

---

## 6. Tauri & System Permissions

Tauri 2 capabilities are constrained to the minimum set required for user-initiated desktop workflows:

| Capability / Plugin | Justification | Restriction / Scope |
|:---|:---|:---|
| `@tauri-apps/plugin-dialog` | Enables native Windows file picker and directory selection dialogs. | Only invokes dialogs upon explicit user button clicks; cannot silently open files without user confirmation. |
| `@tauri-apps/plugin-opener` | Allows opening the output directory in Windows File Explorer upon completion. | Restricted to valid system paths. |
| **Shell Command Execution** | **Disabled**. Neither `shell:execute` nor `process:spawn` is permitted. | Zero arbitrary shell execution risk. |
| **Direct FS IPC Access** | Replaced with strictly typed Rust commands (`process_image`, `batch_process_images`). | Frontend cannot arbitrarily read/write any file without passing through Rust engine path validation. |

---

## 7. Input Validation & Defense in Depth

### Image Engine Defenses
1. **Magic Byte Format Verification**: Does not rely on file extensions alone. Uses the `image` crate format detector to inspect initial file headers.
2. **Dimension Clamping**: Width and height inputs are validated to prevent memory-exhaustion attacks:
   - Width: `1` to `16,384` pixels
   - Height: `1` to `16,384` pixels
   - Dimension changes with locked aspect ratio calculate safe scaled heights using 64-bit integer intermediates to prevent integer overflow.
3. **Format-Specific JPEG Alpha Flattening**:
   - Standard JPEG encoders panic or fail when encountering RGBA transparent images.
   - The engine explicitly detects transparency and composites all RGBA pixels over a pure white (`#FFFFFF`) opaque background using standard alpha blending equations before JPEG encoding.
4. **Overwrite Protection**:
   - `check_overwrite` checks if the output path exists.
   - If `allow_overwrite` is false, the engine immediately aborts with `FileFlowError::OutputAlreadyExists(path)`.
5. **Post-Write Decode Verification**:
   - Every file written by the engine is immediately re-opened and its header decoded via `verify_output_file`.
   - If decoding fails, the output is considered corrupt, deleted, and reported as an error.

---

## 8. Dependency & Licensing Audit

All dependencies in Phase 1 use permissive commercial-friendly open-source licenses:

| Dependency | Ecosystem | License | Risk Analysis |
|:---|:---|:---|:---|
| `image` (0.25) | Rust | MIT / Apache-2.0 | Standard Rust ecosystem image parsing library; memory-safe. |
| `serde` / `serde_json` | Rust | MIT / Apache-2.0 | Industry standard serialization. |
| `react` / `react-dom` (19) | NPM | MIT | Production frontend framework. |
| `lucide-react` | NPM | ISC | Permissive icon library. |
| `vite` (6) | NPM | MIT | Build tool and bundler. |
| `vitest` (3) | NPM | MIT | Local test runner. |

*No GPL, AGPL, or proprietary copyleft licenses are introduced.*

---

## 9. Privacy Policy Summary for Users

1. **Your Files Stay on Your PC**: Zcloud FileFlow runs entirely on your computer. Your photos, conversions, and folders are never uploaded to any cloud server or third party.
2. **No Accounts Required**: You do not need to log in or create an account to convert, resize, or compress your files.
3. **No Telemetry or Tracking**: We do not track what files you convert, how often you use the app, or any identifying device data.
4. **Local History**: When you open or convert files, their file paths and names are remembered locally on your machine so you can quickly find them again. You can remove individual items or click "Clear History" at any time. Clearing history will never delete your actual files.
