# Zcloud FileFlow

**Windows-first, local-first desktop file utilities.** The initial MVP is built with Tauri 2, Rust, React, TypeScript and Vite.

## What's implemented in this first build

- Desktop shell and dark navy workspace UI.
- Native file picker.
- On-device image conversion between PNG, JPG, WebP and BMP.
- Native save dialog; the output path is selected by the user.
- Local recent list storing file path, filename, format and last-opened timestamp.
- A clear-history action.
- No file upload, analytics, telemetry or cloud backup is implemented.

## Privacy model

File contents are not sent to a server by this app. Image conversion runs locally in the Rust process. Recent history is intentionally persisted in this Windows user's local WebView storage so recent entries survive app restarts; this stores file metadata and paths, not copies of the files. Users can clear that list at any time. The app never silently copies source files into an app-managed folder.

Recent history and source/output files cannot both be retained across restarts while also storing absolutely nothing. FileFlow therefore saves only the minimum local recent-list metadata required for the recent-project feature. The actual files remain wherever you saved them.

Google sign-in is **not enabled yet** in this scaffold. It will require a Google OAuth client ID, secure native OAuth flow and explicit consent. Sign-in must remain optional and must not upload file contents or recent history. First-time Google authentication requires internet; local conversion must still work with the network disconnected.

## Current scope

Image conversion is the only processing module implemented so far. PDF, audio/video, archive tools, global shortcuts and radial menu are not implemented yet. The Connect Google button currently explains that OAuth configuration is pending; it does not perform a login.

## Windows development setup

Install:

- Node.js LTS
- Rust stable with the MSVC toolchain
- Microsoft C++ Build Tools (Desktop development with C++)
- WebView2 runtime / Tauri's Windows prerequisites

Official Tauri setup guide: https://v2.tauri.app/start/prerequisites/

From the repository folder, in PowerShell:

```powershell
npm install
npm run tauri dev
```

To build the front-end and desktop installer:

```powershell
npm run build
npm run tauri build
```

Tauri produces Windows installer artifacts in `src-tauri/target/release/bundle/` when the full Windows toolchain is installed.

## Offline acceptance test

1. Install/build the app while internet and development dependencies are available.
2. Launch the desktop app and select an image.
3. Convert it to another supported format and confirm the output opens correctly.
4. Confirm the recent-list entry remains after closing and reopening the app.
5. Use **Clear history** and confirm the list empties without deleting the original or converted file.
6. Disconnect the network and repeat local image conversion.
7. Monitor network traffic to confirm core file processing generates no outbound requests.

## Repository hygiene

Do not commit OAuth tokens, client secrets, private images, local databases, user files or build artifacts. Review all native dependencies and converter licensing before distributing a public installer.

## License

No project license has been selected yet. Do not assume this repository is open-source licensed until a LICENSE file is added.
