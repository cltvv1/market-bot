# Synthetic file fixtures

These files contain only a white 16x16 image, silence, or a short white video.
There are no customer documents, recordings, tokens, or provider downloads.
`files.cjs` creates a complete one-page PDF with objects/xref/trailer and a stored
ZIP with local/central directory and CRC. Labels keep independently created test
documents distinguishable; business assertions are retained.

Committed media were produced once by `generate-files.mjs` using a development-only
FFmpeg binary outside the repository. FFmpeg is NOT a dependency, upload processor,
CI requirement or runtime converter. Fixtures are read directly in tests.
Optional regeneration needs `FFMPEG_FIXTURE_BINARY` pointing to an existing local
executable. The generator uses only synthetic lavfi sources, never user uploads.

Formats: JPEG, PNG, WebP, GIF; MPEG Layer III with/without ID3; Opus/Ogg,
AAC/M4A, Opus/WebM; H.264/MP4, H.264/MOV, VP9/WebM.
