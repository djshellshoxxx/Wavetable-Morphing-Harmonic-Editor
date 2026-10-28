# Research notes and implementation decisions

Research date: 2026-10-28. Sources below are primary documentation, original research, and upstream source code. This is an engineering implementation log, not a certification of commercial instrument interoperability.

## 1. Additive synthesis and alias control

The editable model is `x(t) = Σ a[k] sin(2π k t + φ[k])`, k = 1…64. Each base cycle contains 2048 samples; no DC coefficient is stored. Synthesis removes residual numerical mean. Drawing uses a periodic Catmull–Rom (cubic Hermite) spline through 32 equally spaced handles, samples one period, then Fourier-projects it onto 64 harmonics. The periodic construction joins the cycle and its derivative at the boundary.

Stilson and Smith explain both BLIT and why additive synthesis can be bandlimited by excluding harmonics above Nyquist. The implementation uses finite additive synthesis rather than claiming a separate BLIT oscillator: base-table partials end at harmonic 64; preview additionally discards harmonics at or above 0.49 × AudioContext sample rate. The latter margin keeps audible partials below Nyquist at each played note. Exported base cycles still require anti-aliasing in the destination oscillator at higher playback pitches.

The optional Gibbs control applies Lanczos sigma factors `sin(πk/65)/(πk/65)`. This smoothly tapers the upper partials, reducing ringing at the cost of some brightness. It is a rendering option and leaves stored amplitudes intact. Smoothing is applied to imported/drawn cycles on subsequent synthesis; re-importing a rendered WAV is therefore not a lossless project round trip. JSON is the lossless editable route.

Source: Tim Stilson and Julius O. Smith, *Alias-Free Digital Synthesis of Classic Analog Waveforms*, ICMC 1996, pp. 332–335. [Original paper archive](https://quod.lib.umich.edu/cgi/p/pod/dod-idx/alias-free-digital-synthesis-of-classic-analog-waveforms.pdf?c=icmc;idno=bbp2372.1996.101;format=pdf). [Author-hosted paper](https://ccrma.stanford.edu/~stilti/papers/blit.pdf).

## 2. Morph curves and gain

Interpolate Cartesian sine and cosine coefficients, not wrapped phase angles. Thus 179° and −179° approach each other without an artificial full-cycle spin. Opposing phases can cancel: that is intentional coherent waveform morphing, rather than amplitude/phase spectral morphing. The editor converts the result back to nonnegative amplitudes and atan2 phases.

Linear uses `t`; cosine uses `(1 − cos(πt))/2`; Hermite uses cubic basis functions and tangents scaled by the actual distances between surrounding keyframe indices. Endpoint tangents are one-sided. Hermite can overshoot between keys, so normalization is performed after rendering the bank. A single gain is applied to all frames to preserve relative levels. Silence uses unity gain and stays finite. Shrinking a bank rounds indices; if keys collide, the later key wins.

These choices are implementation decisions. Tests cover endpoints, a wrapped-phase case, uneven Hermite spacing, finite output, and gain relationships.

## 3. Float WAV and `clm ` metadata

WAV uses little-endian RIFF chunks, each with a four-byte ID and byte count, padded to even boundaries. IEEE float is format tag **3**, distinct from integer PCM tag 1. The exporter writes an 18-byte WAVEFORMATEX `fmt ` payload (cbSize = 0), a `fact` sample count, `clm ` metadata, and sequential frame samples in `data`. Mono float32 block alignment is 4 bytes; the 44,100 Hz header is descriptive, not the oscillator's eventual note pitch.

Sources: [Microsoft WAVEFORMATEX](https://learn.microsoft.com/en-us/windows/win32/api/mmreg/ns-mmreg-waveformatex); [McGill MMSP WAVE format reference and original specification links](https://www.mmsp.ece.mcgill.ca/Documents/AudioFormats/WAVE/WAVE.html).

For Serum-style metadata, the inspected upstream Vital source explicitly reads `clm ` and exports a payload beginning with `<!>2048`. Vital's `getFadeStyleFromWavetableString` interprets the first character of the next token as 0 = no interpolation, 1 = time interpolation, otherwise frequency interpolation. Morph Lab writes `<!>2048 10000000 Morph Lab`: 2048-sample frames plus time interpolation. The morph curve is already baked into the frame samples; this token requests blending between those frames. It does not encode the project's cosine/Hermite algorithm.

Primary source inspected through GitHub: [Vital wavetable_edit_section.cpp](https://github.com/mtytel/vital/blob/636ca0ef517a4db087a6a08a6a8a5e704e21f836/src/interface/editor_sections/wavetable_edit_section.cpp), notably `getFadeStyleFromWavetableString`, `getWavetableDataString`, and `exportWav`. Only format behavior was studied; no Vital implementation code was copied. [Xfer Serum 2 manual](https://xferrecords.com/manual/serum-2) also documents 2048-sample import workflows. Exact proprietary loader behavior remains subject to a manual instrument check.

## 4. Korg modwave's frame limit

Korg documents packed 2048-sample float32 waves and up to 64 waves per table. For longer float tables, the loader assumes generated crossfades and reduces intermediate waves. The explicit modwave destination exports at most 64 evenly spaced samples of the morph bank instead of relying on opaque loader selection. Tables of 16 or 64 frames are retained. The UI describes use of Editor/Librarian.

Sources: [Korg modwave native manual, “Importing Wavetables”](https://storage.korg.com/korgms/support/modwave_native/modwave_native_OM_E.pdf); [Korg modwave native official product page](https://www.korg.com/us/products/software/modwave_native/index.php); [Korg modwave owner’s manual](https://cdn.korg.com/us/support/download/files/4c5b4cf935de8ffb984306c737c7f8eb.pdf).

## 5. Visual and audio engine

Three.js uses X = sample/time, Y = amplitude, Z = frame position. Up to 48 representative lines and 193 points per line are drawn for responsive viewing; DSP/export always retain all frames and 2048 samples. The highlighted line corresponds to the nearest whole frame; the 2D waveform and audio can use a fractional position. OrbitControls supports orbit, pan, zoom, damping and reset. Surface and wireframe modes share the same sampled geometry; lighting affects the surface material.

Sources: [Three.js OrbitControls](https://threejs.org/docs/pages/OrbitControls.html), [Web Audio createPeriodicWave](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/createPeriodicWave). MDN defines real as cosine coefficients, imaginary as sine coefficients, and the normalization option. The app disables implicit per-note normalization to apply the table's common gain instead. Notes use short gain ramps; morph coefficients update periodically, so this audition path is not advertised as a studio-grade audio renderer.

The test browser exposes no WebGL context. An interactive Canvas projection fallback was added using Three.js camera math. It supports orbit/pan/zoom but only the waterfall appearance; the UI marks it “CANVAS 3D” and disables unavailable surface/lighting controls. Native WebGL rendering needs verification in a GPU-enabled browser.

## 6. Two extra features

1. Playable keyboard and morph scan: listening while editing is necessary to judge phase cancellation, timbral transitions and gain. Includes polyphony, octave, hold tone, volume and 2/4/8/16-second scan.
2. WAV import and harmonic analysis: known single cycles or fixed-length packed tables become editable keyframes. Stereo/multichannel inputs are averaged to mono. The importer checks RIFF chunk bounds and formats, ignores a trailing partial cycle, and evenly selects at most the bank's frame count from a longer source. It does not provide automatic pitch/cycle detection for ordinary recordings.

## 7. Deployment and persistence

The application is static Vite output with relative asset URLs, suitable for a GitHub project Pages subpath. GitHub Actions runs tests/build before uploading a Pages artifact; PRs run tests/build without deploying. A Pages deploy job has only the Pages and identity-token privileges needed for deployment. Initial Pages enablement is an account setting: configure-pages documents that automatic enablement requires a token beyond the default GITHUB_TOKEN. No token is requested or stored in this repository.

Sources: [GitHub custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [configure-pages action definition](https://github.com/actions/configure-pages/blob/main/action.yml), [Vite deployment guide](https://vite.dev/guide/static-deploy).

Local storage is convenience autosave; JSON is the portable project format. No app backend, analytics, secret keys, or uploaded audio storage is involved.
