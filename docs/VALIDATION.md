# Validation record

Validated 2026-10-28 with Node 24 and a Vite production build.

- 17 automated tests pass: Fourier synthesis/analysis, phase interpolation, Hermite frame spacing, spline projection, bank normalization, all frame counts, preset validation, WAV encoding/decoding/import and compiled C++ header output.
- Chromium browser checks: 64-partial editing controls, 16-frame selection, waveform preset, phase mode, undo/redo, WAV download and re-import, and nonzero Web Audio signal during Hold tone.
- Desktop (1440 px) and mobile (390 px) inspected; mobile has no document overflow. The Canvas waterfall fallback was exercised because WebGL is unavailable in this test environment. Three.js surface/lighting rendering requires a WebGL-capable browser.
- CDL home link checked. GitHub Actions tests and builds the site before Pages deployment.

Physical hardware and commercial wavetable plug-in imports were not tested.
