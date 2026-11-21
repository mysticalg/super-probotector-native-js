# Super Probotector — Native JavaScript Reconstruction

An ongoing reverse-engineering project for the European SNES release. The browser build uses native Canvas and JavaScript game logic; it does not load or execute a ROM. This is an incomplete first-stage prototype, not a full port.

## Current build

Open `web/index.html` locally or use the GitHub Pages deployment. Controls: arrows move/aim, Z fires, X jumps, Shift changes the prototype weapon, Escape pauses, F toggles fullscreen.

Current work includes extracted first-stage scenery, 228 decoded player metasprite/frame definitions, a translated ROM graphics decompressor with byte-for-byte RAM-output checks, and a prototype encounter loop. Only stage one is represented. Later stages, bosses, verified enemy scripts, accurate weapon behavior, options/two-player modes and original music are still outstanding.

## Reverse-engineering evidence

See `reverse-engineering/STATUS.md` and `web/assets/manifest.json`. The working ROM remains local and is not included in this repository. The original ZIP is not modified.

## Run locally

Serve the `web/` folder with any static HTTP server. The build has no runtime packages or build step.

## Rights

Game trademarks, original game design, and any extracted visual/audio assets belong to their respective rights holders. This repository contains no ROM image and is an unofficial, non-commercial research project.
