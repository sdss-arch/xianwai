# Tests

Automated checks used during development: browser end-to-end tests driven by
Playwright, and Android emulator tests driven by `adb` + `uiautomator`.

```bash
npm install            # once, at the repository root (installs Playwright)
npx playwright install chromium   # if you do not point CHROME_PATH at an installed browser
```

## Environment variables

| Variable | Used by | Meaning |
| --- | --- | --- |
| `CHROME_PATH` | browser tests | Absolute path to Chrome/Chromium. When unset, Playwright's own browser is used. |
| `EDGE_PATH` | `edge-acceptance.mjs` | Absolute path to Microsoft Edge. |
| `APP_URL` | `audio-flow.mjs`, `audio-current.mjs` | Base URL of the app under test (default `http://127.0.0.1:8789`). |
| `XIANWAI_BASE_URL` | `audio-mobile-smoke.mjs` | HTTPS base URL for the microphone test (default `https://127.0.0.1:8788`). |
| `XIANWAI_TLS_CERT` | `audio-mobile-smoke.mjs` | Path to the `server.pem` of that HTTPS test server (for certificate pinning). |
| `ADB` | Android tests | Path to `adb`. Falls back to `adb` on `PATH`. |
| `XIANWAI_ADB_SERIAL` | Android tests | Device serial (default `emulator-5556`). |
| `XIANWAI_APK` | `emulator-smoke.py`, `qa_native_061.py` | APK to install. |
| `XIANWAI_SHOT_DIR` | `qa_device.py` | Where screenshots are written (default `tests/android/shots`). |
| `XIANWAI_QA_NOTES` | `qa_native_061.py` | Stage notes file (default `tests/android/notes-061.json`). |

Most browser scripts expect the app on a fixed port, e.g.
`PORT=8790 node server.mjs`. Check the `const base = ...` line at the top of a
script to see which port it wants.

## tests/browser

- `check.mjs` — home, profile creation, responsive layout on a phone viewport (port 8787).
- `browser-redesign.mjs` — full flow with the real local model: example, analysis, copy, review, profiles, settings (port 8793).
- `workspace-upgrade.mjs` — draft restore, analysis payload, editable replies, due dates, search, pin (port 8790).
- `edge-acceptance.mjs` — Edge profile CRUD, backup/restore/dedup, offline retry (port 8790, needs `EDGE_PATH`).
- `native-current.mjs` — Android/iOS JS-bridge mock, offline ASR, settings, profile feedback (port 8790; `--ios` for the iOS alias).
- `android-flows.mjs`, `casebook-current.mjs`, `casebook-v05.mjs` — Android page flows and profile casebook reuse (port 8790).
- `audio-flow.mjs`, `audio-current.mjs` — recording and import/transcription flows (`APP_URL`).
- `audio-negative.mjs` — microphone denial and broken-file handling.
- `audio-mobile-smoke.mjs` — HTTPS microphone capture and M4A transcription; `--webkit` runs the WAV variant over plain HTTP.
- `subtext-workspace.mjs`, `subtext-actions-check.mjs` — analysis module checks against recorded cases.
- `run-subtext-bench.mjs BASE OUTPUT [IDS…]` — benchmark runner over `subtext-cases.mjs`.

Fixture servers (both take a directory containing `server.key` / `server.pem`):

```bash
node tests/browser/mock-model.mjs <tls-dir>       # fake model on 127.0.0.1:8791
node tests/browser/android-real-model.mjs <tls-dir>  # HTTPS passthrough to local llama.cpp (18182)
```

Generate a local TLS pair for them with `node phone-https.mjs 127.0.0.1`
(reuses `.runtime/tls` afterwards).

## tests/android

Requires an Android emulator (the scripts check for the `Xianwai_QA` AVD) or a
connected device, with the APK built first (`android/build.ps1`).

- `emulator-smoke.py [--v05|--v051|--upgrade|--offline…]` — install, record, offline transcription, upgrade checks.
- `qa_device.py` — shared helpers (`locate`, `tap`, `screenshot`…); running it directly dumps the current UI tree.
- `qa_settings.py`, `qa_case.py`, `qa_audio.py`, `qa_profiles.py`, `qa_review.py`, `qa_reuse.py` — per-screen flows.
- `qa_native_061.py <stage>` — staged acceptance run (`upgrade`, `configure`, `personal`, `audio`, `select`, `interpret`, `record`, `review`, `persist`); expects the `android-real-model.mjs` passthrough on port 8791.
- `qa_gallery.py` — builds the screenshot contact sheet from `tests/android/shots` (needs Pillow and a CJK font; `XIANWAI_FONT` overrides the font path).

## tests/fixtures

- `mandarin.wav`, `mandarin.m4a`, `delegation-native.wav` — Mandarin test recordings (transcription must contain expected keywords).
- `qa-profile.json` — exported manager profile for import tests.
- `coordinator-personal.json`, `owner-personal.json` — personal-information files for import/export tests.
