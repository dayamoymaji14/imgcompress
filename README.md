# ImgCompress

Browser-only image compression, inspired by TinyPNG but built entirely in TypeScript + Vite with no backend. Drag or browse PNG, JPEG, and WebP files, watch the queue update, tune quality, and download optimized assets individually or as a ZIP.

## Getting started

```
npm install
npm run dev
```

## Build & test

```
npx tsc --noEmit
npm run build
```

## Features

- Drag & drop or click-to-upload (max 20 files, 10 MB each)
- PNG quantization via `upng-js`, JPEG/WebP compression via Canvas, batch processing with non-blocking yield points
- Quality slider with debounce and recompression, plus live summary/progress meters
- Download single files or ZIP batches via `jszip`; duplicate filenames are renamed
- Dark/light theme toggle (persisted in `localStorage`) with accessible status messaging

## Troubleshooting

- If the dev server already binds to `127.0.0.1:5173`, pass `npm run dev -- --host 0.0.0.0` or set another port.
- Compression happens on the main thread; for very large PNGs expect short pauses while `upng-js` encodes.
