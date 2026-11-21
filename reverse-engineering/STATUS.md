# Super Probotector (Europe) reverse engineering

## Verified ROM

The supplied ZIP remains at `E:\Downloads\Super Probotector - The Alien Rebels (E).zip`. It contains a 1,049,088-byte `.fig` image with a 512-byte copier header. The 1,048,576-byte payload has SHA-256 `2b1ca521975c3010650fd2055be8c6b964ea4eff765ad03198ac71995285fee7`, internal title `SUPER PROBOTECTOR`, and LoROM mapping. The original archive is unmodified.

## Confirmed routines

* `$00:8000` reset entry: initializes CPU and SNES state.
* `$00:9474-$00:95FE` streaming graphics decompressor. Its command set includes absolute 1 KiB ring-buffer copies, literals, alternating zero/value pairs, repeated bytes, and zero runs. The translation is `tools/extract.py`.
* `$00:9304` copies decompressed streams to the SNES audio ports. `$00:9353` initializes the audio driver; `$00:9384-$00:93A1` issues commands; `$00:93A2-$00:9400` sends data.
* `$00:9401-$00:9451` services graphics stream directory records. `$00:9474` sets the 1 KiB output block size; `$00:9481` advances output chunks.
* `$00:CA8F-$00:CB82` transforms stage metatiles into the two SNES tilemap layers. `$00:CB9D` expands metatile descriptors into tile data.
* `$00:EA80-$00:EB1F` expands animated map events into OAM/tile updates.
* `$00:C0D5-$00:C0FA` performs common per-frame graphics, scroll, player, and object updates.
* Player physics observed in the first stage: horizontal running speed 1.5 px/frame, jump initial velocity about -6 px/frame, gravity about 0.1875 px/frame², standard bullet speed 4.5 px/frame.

## Asset work and validation

`tools/extract.py` translates the ROM decompressor. It decodes 43 observed streams and validates 252,891 output bytes against reference-emulator work RAM. It also extracts candidate BRR samples and WAV previews from SPC RAM; music sequence and pitch reconstruction are not done.

`tools/build_assets.py` extracts first-stage maps using ROM metatile structures and constructs 228 player frame definitions from the European robot metasprite tables. The stage map output has been visually checked. Its current layout/order is still being reconciled against the live PPU tilemap capture.

The player frame table at `$05:B2AF` is indexed in 16-byte records. The extracted records show explicit facing pairs rather than one frame that should always be mirrored: frame IDs 0/1 point to metasprites `$06:8510`/`$06:8529`; 2/3 point to `$06:8542`; 4/5 to `$06:8557`; 6/7 to `$06:8570`. Browser IDs 8/9 and 10/11 are additional poses and 14/15 form another pair. The browser now selects the paired frame ID from facing state, with no Canvas mirroring. This was visually checked after moving right then left; Playwright state reported `frameData: "06:8529"` for left-facing frame 1. This confirms selection of table-backed directional records, but not yet which full temporal sequences correspond to each player action.

## Current browser build status

The browser code is a native Canvas/JavaScript prototype. It is not an emulator wrapper. It currently has a title screen, first-stage scenery, one robot animation atlas, basic move/jump/fire inputs, basic spawned placeholder enemies, score/lives and a placeholder stage progression. The browser prototype does not reproduce the ROM routines or full game behavior yet.

## Major remaining work

* Capture all six stage setups, maps, palettes, scrolling behavior, special top-down/Mode 7 stages, and ending scenes.
* Identify and implement all enemy and boss state machines and stage object scripts.
* Implement the weapon power-up system, spread directions, rotation, bombs, screen transitions, death/respawn, two-player modes, options, continue flow, and complete menus.
* Reconstruct audio driver protocol, song sequences, samples, envelopes, loops, and sound effects; extracted samples are only candidates.
* Correct metatile/map ordering from reference snapshots and add automated visual/state comparisons.
* Publish source in a public GitHub repository and deploy the playable build with GitHub Pages.

## Publishing status

The incomplete milestone is public at `https://github.com/mysticalg/super-probotector-native-js`; GitHub Pages workflow deployment succeeded at `https://mysticalg.github.io/super-probotector-native-js/` (HTTP 200). The web code and extracted assets are published; no ROM image is included. Continue labeling it as an incomplete prototype until the remaining stages and systems are implemented and checked.
