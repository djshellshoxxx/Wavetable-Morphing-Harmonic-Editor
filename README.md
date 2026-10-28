# Morph Lab — Wavetable Morphing & Harmonic Editor

> **Status: specification only.** The default branch currently contains only this README. The source files (`src/`, `package.json`, tests, workflow) and the `docs/` files referenced below are **not present in this repository** and no other branches or pull requests hold them. Everything below describes the intended design; the commands and links have not been verified and the UI cannot be run or screenshotted yet. See [TODO.md](TODO.md).

A browser-local wavetable design instrument with 64 amplitude/phase partials, periodic spline drawing, Three.js waterfall/surface visualization, and portable exports.

## Run locally

Requires Node.js 22 and npm. The header compilation test additionally requires `g++` (available on GitHub's Ubuntu runner).

```sh
npm ci
npm run dev
npm test
npm run build
```

## Publish with GitHub Pages

In this repository, open **Settings → Pages → Build and deployment → Source → GitHub Actions**. The `Test and deploy GitHub Pages` workflow tests, builds, and deploys every push to `main`. If enabling Pages after a workflow ran, use **Actions → Test and deploy GitHub Pages → Run workflow**. Vite uses relative asset URLs, including for the repository subpath.

## Design a table

1. Select a keyframe or move the morph position to any frame.
2. Edit amplitude or phase for any of 64 partials. An edit inserts a keyframe if necessary. Waveform presets include sine, triangle, saw, square, formant, and organ.
3. Choose 16, 64, or 256 frames and linear, cosine, or Hermite interpolation.
4. Optionally enable **Draw waveform**, sketch a periodic spline, then **Apply drawing**. Precise handle controls also support keyboard-only drawing.
5. Audition with the piano, the A–K computer keyboard, or **Hold tone**. Enable morph scan to hear the table change. Output starts after a user gesture.
6. Export packed float WAV, C/C++ header, or a full JSON preset. Open JSON to resume work. Undo/redo and local autosave are included; save JSON for a portable backup.

## Two additional features

- **Playable audition and morph scanner:** one-octave polyphonic keyboard, selectable octave, sustained preview, adjustable scan speed, output level, Nyquist-limited harmonics, and note attack/release envelopes.
- **WAV-to-harmonics import:** PCM 8/16/24/32-bit and float 32/64-bit input, channel downmixing, configurable source cycle length, periodic resampling, and 64-partial analysis into editable keyframes. It slices known fixed cycles; it does not infer pitch from arbitrary recordings. Partial final cycles are ignored.

## Export formats

| Format | Output |
| --- | --- |
| Wavetable WAV | Mono, 2048 samples per frame, IEEE float32 (format tag 3), 44.1 kHz header, `fmt `, `fact`, `clm ` and `data` RIFF chunks |
| C/C++ header | `static const float wavetable[NUM_FRAMES][2048]`, include guard, frame and sample constants |
| JSON preset | Versioned project with amplitudes, phases in radians, indexed keyframes, frame count, morph algorithm, Gibbs suppression, and normalization settings |

Standard export retains all bank frames. modwave export samples at most 64 evenly spaced frames. Single-cycle export uses the current position. C/C++ follows the same destination/frame selection as WAV. JSON always saves the complete editable project.

The full 256-frame float array occupies **2 MiB** before executable overhead, so embedded targets need sufficient flash/storage. Exported base cycles contain up to 64 harmonics; a target oscillator must still handle pitch-dependent anti-aliasing. Compatibility follows the documented file layout; physical hardware and commercial plug-in import have not been tested here.

## Architecture and research

- `src/dsp.js`: Fourier synthesis/analysis, complex-coefficient morphing, nonuniform Hermite tangents, periodic spline, bank normalization and preset validation.
- `src/view.js`: Three.js, OrbitControls, waterfall, surface, wireframe, lighting and highlighted playback frame.
- `src/fallback-view.js`: interactive Canvas waterfall with Three.js perspective math when WebGL is unavailable. Surface and lighting controls require WebGL.
- `src/audio.js`: Web Audio PeriodicWave audition with pitch-dependent harmonic limits.
- `src/formats.js`: RIFF/WAV encode/decode, C header, cycle import and downloads.
- `src/main.js`: UI, keyframe editing, file actions, undo/redo and local persistence.

Read [research and design decisions](docs/RESEARCH.md), [validation notes](docs/VALIDATION.md), and the [JSON preset schema](docs/preset.schema.json).

The app processes imported files locally. No account, backend, microphone, or cloud file upload is required. Google Fonts is used for typography; system fonts provide a fallback.
