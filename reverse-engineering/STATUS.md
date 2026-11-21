# Super Probotector (Europe) reverse engineering

## Verified ROM

The supplied ZIP remains at `E:\Downloads\Super Probotector - The Alien Rebels (E).zip`. It contains a 1,049,088-byte `.fig` image with a 512-byte copier header. The 1,048,576-byte payload has SHA-256 `2b1ca521975c3010650fd2055be8c6b964ea4eff765ad03198ac71995285fee7`, internal title `SUPER PROBOTECTOR`, and LoROM mapping. The original archive is unmodified.

## Confirmed routines

* `$00:8000` reset entry initializes CPU and SNES state.
* `$00:9474-$00:95FE` is the streaming graphics decompressor. Its command set includes absolute 1 KiB ring-buffer copies, literals, alternating zero/value pairs, repeated bytes, and zero runs; translation: `tools/extract.py`.
* `$00:9304` copies decompressed streams to SNES audio ports. `$00:9353` initializes the audio driver; `$00:9384-$00:93A1` issues commands; `$00:93A2-$00:9400` sends data.
* `$00:9401-$00:9451` services graphics stream directory records. `$00:9474` sets the 1 KiB output block size; `$00:9481` advances output chunks.
* `$00:CA8F-$00:CB82` transforms stage metatiles into the two SNES tilemap layers. `$00:CB9D` expands metatile descriptors into tile data.
* `$00:EA80-$00:EB1F` expands animated map events into OAM/tile updates.
* `$00:C0D5-$00:C0FA` performs common per-frame graphics, scroll, player, and object updates.
* Stage 1 player physics observed in the reference: horizontal running speed 1.5 native pixels/frame, jump initial velocity about -6 px/frame, gravity about 0.1875 px/frame^2.

## Weapon trace: confirmed base weapon

A frame-by-frame reference run in the supplied European ROM enters Stage 1, then holds SNES Y (pad bit 1). The first projectile sprite with OAM tile `$00C`, sprite palette 7 (`attr=$3E`), appears on firing frame 3 at `(83,169)`. Its subsequent horizontal positions are 90, 98, 105, 112, 120, 127, 135, and 142: about 7.5 native pixels/frame. New projectiles appear on frames 6, 9, 12, and 15, so the observed base shot is a single horizontal projectile every three frames, without spread in this straight-fire state.

With the player stationary around `(56,199)`, the muzzle is approximately 27 px ahead of the player anchor and 30 px above it. Holding left plus Y produces leftward shots (x=24, 17, 9 on frames 3-5), confirming that horizontal direction follows facing. Holding SNES B (bit 0) produces no such projectile. The browser accepts B as an additional fire alias for repeatable keyboard testing; Z remains the displayed fire key.

`tools/build_assets.py` now extracts the 8x8 tile `$00C` from the verified `pad-2` capture's VRAM and palette-7 CGRAM. Browser Playwright capture `work/browser-weapon-final/state-1.json` reports a projectile at y=169 with velocity `[7.5,0]`; its screenshot shows the matching cross-shaped projectile. A left-input browser capture selected paired frame `06:8529`, but the shot left the playfield before the state snapshot, so leftward browser projectile velocity still needs a slower capture.

Only the base straight shot is verified. Other weapon IDs, aimed variants, pickups, first-shot latency, hitboxes, and weapon sound remain unverified placeholders.

## Stage selector and Stage 2 capture

The supplied European ROM stores the current stage ID in WRAM `$7E:0086`; ordinary start records 1. In the traced Stage 1 setup path, CPU `$00:BCDC` (DBR `$05`) loads this value with `LDX $86`; `$00:BCDE` then reads byte `$05:89E5,X` and stores it at `$7E:1670` and `$7E:1698`. The table is at file offset `$289E5` (LoROM `$05:89E5`). Stage IDs 1-6 select index bytes `00, 02, 02, 04, 04, 06`. Later reads in the same path use bank-$05 tables `$89EC`, `$8A00`, `$8A14`, and `$8A1C`. Their meanings and the complete transition script are still being decoded; this is not yet a complete all-stage content table.

This lookup was exercised against the supplied ROM. Setting `$7E:0086=2` during the game-start transition reaches the "CHOOSE YOUR STARTING POINT" map; pressing Start then enters Stage 2 overhead gameplay. The point-select reference path executes at `$03:E6BB`. Captures are in `work/captures/stage2-point-select/` and `work/captures/stage2-play-entry/`. This verifies a ROM path to Stage 2, but Stage 2 has not yet been reconstructed in the browser.

Read the stage-index table from the hash-checked ROM with `python tools/stage_selector.py --rom <headerless-european-rom>`.

## Asset work and validation

`tools/extract.py` translates the ROM decompressor. It decodes 43 observed streams and validates 252,891 output bytes against reference-emulator work RAM. It also extracts candidate BRR samples and WAV previews from SPC RAM; music sequence and pitch reconstruction are not done.

`tools/build_assets.py` extracts first-stage maps using ROM metatile structures and constructs 228 player frame definitions from the European robot metasprite tables. The stage map output has been visually checked. Its current layout/order is still being reconciled against the live PPU tilemap capture.

The player frame table at `$05:B2AF` is indexed in 16-byte records. Extracted records show explicit facing pairs rather than one frame that should always be mirrored: frames 0/1 reference metasprites `$06:8510`/`$06:8529`; 2/3 reference `$06:8542`; 4/5 `$06:8557`; 6/7 `$06:8570`. The browser selects the paired frame ID from facing state, with no Canvas mirroring. Playwright state after moving left reports `frameData: "06:8529"`. This confirms table-backed directional records, but not the full temporal sequences for each player action.

## Current browser build status

This is a native Canvas/JavaScript prototype, not an emulator wrapper. It has a title screen, first-stage scenery, one robot animation atlas, basic move/jump/fire input, placeholder enemies, score/lives, and placeholder stage progression. The browser prototype does not yet reproduce the ROM routines or full game behavior.

## Major remaining work

* Capture and reconstruct all six stage setups, maps, palettes, scrolling behavior, special Mode 7 stages, and ending scenes.
* Identify and implement all enemy and boss state machines and stage object scripts.
* Decode the remaining stage-index configuration and transition data. Implement all weapon power-ups, spread/rotation patterns, bombs, transitions, death/respawn, two-player modes, options, continue flow, and full menus.
* Reconstruct audio driver protocol, song sequences, samples, envelopes, loops, and effects; extracted samples are candidates only.
* Reconcile metatile/map ordering against reference snapshots and add automated visual/state comparisons.

## Publishing status

The incomplete milestone is public at `https://github.com/mysticalg/super-probotector-native-js`; GitHub Pages deployment is at `https://mysticalg.github.io/super-probotector-native-js/`. The existing Page workflow previously returned HTTP 200; the latest weapon/table milestone is pending push and a fresh deployment check. The web code and extracted assets are published; no ROM image is included. Keep labeling it as incomplete until the remaining stages and systems are implemented and checked.
