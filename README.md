# Zcloud FileFlow

A Windows-first, local-first desktop productivity app for file conversion and quick file actions.

## Product principles

- **Offline-first:** core file operations must work without an internet connection after installation.
- **User-controlled files:** processed files are saved only to a destination chosen by the user. Never upload file contents.
- **No telemetry:** no analytics, tracking pixels, crash upload, usage reporting, or automatic cloud backup.
- **Google sign-in is optional and online-only:** authentication cannot be required to use local tools. Signing in does not upload files or project history.
- **Project history:** recent/old project list is local to the current Windows user and stores only the metadata needed to reopen user-selected workspace files. Make clear that this local index is stored; users can clear it at any time. Never silently copy project contents into app storage.
- **Transparent networking:** no outbound requests except user-initiated Google OAuth and explicitly consented update checks. All network features are disabled when offline.

## Initial technology direction

- Tauri 2 + Rust for the Windows desktop shell and native integration
- React + TypeScript + Vite + Tailwind CSS for the UI
- Local file processing libraries selected per format and reviewed for license compatibility
- SQLite or a small local index for recent projects, with a clear-history control

## MVP milestones

1. Scaffold Tauri + React + TypeScript; provide the dark/navy UI shell and local workspace selection.
2. Add file-type detection, drag-and-drop, image conversion, output validation, and progress/error states.
3. Add a local recent-project list with reopen/remove/clear actions.
4. Add optional Google sign-in via the system browser and secure OAuth flow; no sign-in gate for core local functionality.
5. Add global shortcut/radial action menu and expand supported format modules.
6. Build and test a Windows installer, including offline acceptance tests.

## Privacy and security acceptance criteria

- Airplane-mode test: local workspace, recent-projects list, and installed file tools remain usable offline.
- No file content or filename is transmitted by default.
- No hidden telemetry or cloud sync.
- OAuth tokens, if needed, are kept in OS-protected storage and never committed.
- Do not request Google Drive scopes unless Drive integration is deliberately added in a separate, explicit feature.
- Show clear copy explaining that Google sign-in needs internet and cannot authenticate for the first time offline.
- Users can sign out, clear local history, and choose where project files are saved.
- Never claim 'nothing is stored': explain that local files remain wherever users save them and the recent list stores local metadata until cleared.

## Development

Toolchain and build instructions will be added with the first application scaffold. Keep secrets, tokens, local environment files, build artifacts, user files, and local databases out of Git.

## Licensing

Audit each bundled converter/library and its redistribution terms before shipping a public installer.
