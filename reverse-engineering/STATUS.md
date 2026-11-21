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

This lookup was exercised against the supplied ROM. Setting `$7E:0086=2` during the game-start transition reaches the "CHOOSE YOUR STARTING POINT" map; pressing Start then enters Stage 2 overhead gameplay. The point-select reference path executes at `$03:E6BB`. Captures are in `work/captures/stage2-point-select/` and `work/captures/stage2-play-entry/`. The browser now decodes the captured Mode 7 VRAM into a 1024x1024 world texture and applies the captured matrix for the five-point selector. Selecting a point enters a partial overhead view. Playwright checked selector navigation, entry, movement and firing without console errors. Player pose, movement, camera and shots remain provisional; stage collision, enemies, rotation and completion are absent.

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

The incomplete milestone is public at `https://github.com/mysticalg/super-probotector-native-js`; GitHub Pages deployment is at `https://mysticalg.github.io/super-probotector-native-js/`. The existing Page workflow previously returned HTTP 200; the weapon/table milestone was deployed successfully; the Stage 2 slice follows it. The web code and extracted assets are published; no ROM image is included. Keep labeling it as incomplete until the remaining stages and systems are implemented and checked.

## Additional input and projectile routine evidence

The European trace at $00:8B2E reads $4218,X, stores held controller words at $20,X and newly pressed bits at $28,X. Holding Y produces $4000 in $20. The firing-only execution path reaches $00:D642 (LDA $22,X; BIT $88), weapon selection through $1D84,X and $05:A021,Y, then $00:D6D1. The base spawn writes $3E0C at object offset $14 and loads velocity components from $05:8E33/$8D93/$8E13/$8D73. $00:E153-$00:E169 integrates the fractional and integer position words. Further table semantics remain under investigation.

The Stage 2 deployment for 1290b12 succeeded; public game.js contains renderMode7 and the Stage 2 config returns HTTP 200. Extracted weapon cadence words at $05:A021 are 3,4,5,4,1,1. The browser base weapon now reads entry zero from weapon-tables.json. Raw velocity words from the four spawn lookups are preserved there for analysis; direction-index mapping is unresolved and these arrays are not yet used to drive aiming. Prototype alternate weapon numbers have not been equated with ROM IDs.

Spawn register captures confirm direction byte offsets 0 (up), 16 (up-right), 32 (right), 96 (left). Object words at +18/+1A and +1C/+1E hold fractional/integer X and Y velocity. Right is 7+0x6666/65536; left is -8+0x999A/65536. Up-right uses X=5+0x3B8B/65536, Y=-6+0xC475/65536. These confirmed offsets now drive the base browser shot. Remaining directions and weapon modes are unresolved; aimed muzzle offsets remain provisional.

Additional live spawn captures confirm up-left offset 112 and down-right offset 48. Down without horizontal input stays horizontal (offset 32 in the right-facing test). Browser base-shot indexing now represents these cases. Scratch words $14/$16 contain spawn displacement; up-left capture records (-24,-56), down-right (10,-16), crouched horizontal (24,-14). Integration with browser player-anchor coordinates remains unresolved, so these displacement values are documented rather than treated as verified browser muzzle positions. Pages run 44880957165 initially failed to locate its artifact; a full rerun was requested.

## Stage 2 encounter investigation checkpoint

Deployment 44881059509 for 875c100 completed successfully and the public game.js contains the new direction mapping. A fresh European ROM run entered Stage 2, waited 500 frames after selecting its start point, and held Y for 180 frames. It captured 721 distinct bank-03 instructions, preserved in stage2-execution.json. Executed rendering dispatch reads $8806,Y and $8828,Y at $03:EBB9/$03:EBBE and $03:EC99/$03:EC9E. Those reads are rendering evidence only; they have not yet been identified as target encounter records. Capture state is saved locally under work/captures/stage2-target-trace. No target HP, objective count, or completion predicate is yet verified, and no invented objective behavior was added. Next: trace initialization writes to active object slots and compare a target before/after damage.

Controlled Stage 2 experiment: captured RAM before and after 360 Up+Y frames, including CPU write provenance. Bank 02 executes object logic: $02:9D48 decrements object+$22 (X=$0D40), while $02:9F80/$02:9F0A decrement object+$24. These are candidate state fields, not confirmed health. The earlier bank-03-only trace omitted this logic. No destruction or remaining-target decrement was confirmed. Full raw writes and before/after captures remain local; compact candidate evidence is stage2-damage-candidates.json. Next controlled comparison must distinguish a successful hit from a missed shot and identify the bank-02 target dispatcher.

## Candidate-field correction

Inspection of $02:9D44-$02:9D6E establishes object+$22 as a sequence timer, not health: load pointer from +$28, decrement +$22, on expiration advance the pointer by six bytes, load a duration, and update the sequence record. European ROM bytes at $02:9D44: b4 28 f0 26 d6 22 30 23 d0 20 98 18 69 06 00 a8 b9 00 00 30 fa f0 19 94 28 95 22 b9 02 00 95 20 b5 02 29 00 30 19 04 00 95 02 6b b9 00 00 d0 e9. Object $0D40 in the before snapshot has type word 6, coordinate words +$0A=880/+ $0E=80, +$04=120 and +$28=$D4FF. Type and +$04 semantics are not established. A second experiment changed $020A/$020E before firing but reproduced identical observed writes; these addresses are not established as authoritative overhead player coordinates. Do not treat that attempt as an aligned hit or infer target HP from 120. Next step is to trace the world-position operands used by the bank-02 collision handler, rather than modify side-view player fields.

Natural movement experiment confirms player world X/Y at $1510/$1512, screen anchor $150C/$150E=(128,160), and 24-pixel movement over a 12-frame input burst including frame/input latency. Default start settles at (896,160). Mode 7 camera follows with a two-pixel trailing sample during movement. Browser overhead speed is now 2, default spawn and screen anchor corrected. Camera lag and proper overhead player graphics remain unresolved. This is movement coverage only, not target/objective coverage. Later stage setups 3-6 are being captured locally for graphics analysis.

Later-stage capture decoding now produces research background previews for stages 3, 4, 6 (Mode 1) and the Stage 5 Mode 7 map. These are captured viewport/VRAM data, not complete level traversal reconstructions. Stage 5 config was generated using the Stage 2 helper and its marker/default-selection assumptions are unverified; do not wire that metadata into gameplay yet. The world-position experiment now changes object writes, but $02:9C79 subtracts $FA with an eight-bit wrap and paired addition branch, so it is not evidence of health damage. Target/objective semantics remain unresolved.

Stage layout inspection: Stage 3 setup index 2 selects $05:8A5E through $05:8A1C, Stage 4 index 4 selects $05:8A78, Stage 6 index 6 selects $05:8A92. Routine $00:C098 copies twelve words into direct-page $C8-$DE. Values are preserved in stage-layout-candidates.json alongside captured PPU/WRAM state. These are configuration/stream identifiers, not established collision pointers. Stage 3 entry anchor is (56,176), Stage 6 (56,152); Stage 4 capture is already scrolled and cannot be assumed to be its initial entry. Full Stage 3 layout and collision remain unverified, so no playable Stage 3 was added.

Stage 3 decompression verification: a fresh setup run confirms graphics streams $0C:8000/$98A2/$AFBF/$C65E match VRAM bytes $0000/$2000/$4000/$6000 exactly (8192 bytes each). Candidate layout/metatile streams $0D:8000, $0D:8CC4, $0D:9C9E, $0D:A5E5 match WRAM $B000, $5000, $7000, $F000 respectively. Matches and verified output lengths are recorded in stage3-stream-matches.json. Their map/collision roles still require pointer-consumer tracing; no playable Stage 3 is claimed.
