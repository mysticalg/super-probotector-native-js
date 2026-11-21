# Super Probotector — Native JavaScript Reconstruction

An ongoing reverse-engineering project for the European SNES release. The browser build uses native Canvas and JavaScript game logic; it does not load or execute a ROM. This is an incomplete first-stage prototype, not a full port.

## Current build

Open `web/index.html` locally or use the GitHub Pages deployment. Controls: arrows move/aim, Z fires (B is a testing alias), X jumps, Shift changes the prototype weapon, Escape pauses, F toggles fullscreen.

Current work includes extracted first-stage scenery, 228 decoded player metasprite/frame definitions, a translated ROM graphics decompressor with byte-for-byte RAM-output checks, and a prototype encounter loop. The base straight shot is now checked against the ROM OAM trace (speed, cadence, sprite, muzzle, facing); alternate weapons and aimed fire remain placeholders. The browser currently represents only Stage 1. Stage 2 has been reached in the reference capture and its selector data is documented, but it is not yet implemented in the browser. Later stages, bosses, verified enemy scripts, options/two-player modes and original music remain outstanding.

## Reverse-engineering evidence

See `reverse-engineering/STATUS.md` and `web/assets/manifest.json`. The working ROM remains local and is not included in this repository. The original ZIP is not modified.

## Run locally

Serve the `web/` folder with any static HTTP server. The build has no runtime packages or build step.

## Rights

Game trademarks, original game design, and any extracted visual/audio assets belong to their respective rights holders. This repository contains no ROM image and is an unofficial, non-commercial research project.
