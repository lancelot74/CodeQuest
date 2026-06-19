# Challenge Mode — Flat-2D Pixel Pass + Camera Zoom

**Date:** 2026-06-20
**Status:** ✅ **Shipped 2026-06-20.** Props regenerated flat (Higgsfield image-to-image), flat nine-slice UI panels hand-drawn, camera zoomed 1.5× with screen-space UI counter-transformed (`fixUI`) + fog light offset; also fixed a shared Music fade null-sound race. Verified via build + Playwright (room flow, boss, death overlay, HUD/minimap/boss-bar under zoom) + a real-keyboard playthrough, 0 errors.
**Scope:** A polish pass on the Dungeon Crawl (Challenge mode): make the Higgsfield assets read as **flat 2D top-down** instead of 3D renders, and **zoom the camera in** so the art shows bigger. Not part of the R+A → W → B feature sequence; a visual-fidelity fix on what's already shipped.

## Problem

The Challenge mode's Higgsfield-generated assets (the obsidian **dungeon props** and the gothic **UI panels**) are lit and shaded like 3D renders — cast shadows, perspective, realistic highlights — which clashes with the top-down pixel game. The user likes the *designs* but wants them to sit flat as 2D game art, and wants the camera zoomed in so the detail reads.

## Locked decisions

| Question | Decision |
|---|---|
| Scope | Challenge-mode **props + UI panels** only. Characters (Gargoyle, Wanderer) and other scenes untouched. |
| Look | **Flat top-down 2D** — orthographic, flat cel-shading, one light, thin dark outline, no cast shadow, no perspective. |
| Fidelity | **Keep the designs** the user likes — regenerate via **image-to-image** from the current assets (same subject/colors, flattened), not from scratch. |
| Props | Regenerate the 5 props (obelisk/brazier/statue/altar/rubble) via Higgsfield image-to-image off their original job IDs, key, drop in at the same filenames. |
| UI panels | Same flatten for `ui-stone` / `ui-stone-danger`, **but** these are nine-slice (need a uniform border + tileable centre). If an AI panel won't nine-slice cleanly, **hand-draw a flat gothic-stone nine-slice** in PIL keeping the same colors/molten accents (reliable, perfectly tileable). |
| Camera | Zoom the world camera in **~1.5×** (tunable), keeping HUD / fog / minimap / banners screen-correct. |

## Approach

### Props (flat regen)
For each of the 5 props, `generate_image` (nano_banana_pro) **image-to-image** with the original prop's job ID as the `image` reference + a flat-2D prompt ("keep the same design/shapes/colors, redraw orthographic + flat, no cast shadow, no perspective"). Then key the grey background (existing `key_prop.py`), trim, and overwrite the **same files** in `public/assets/game/dungeon/` — zero code change; the rooms just look flat. Re-eyeball each against the original to confirm it's "the same but flat"; re-roll any that drift.

### UI panels (flat)
Attempt the same image-to-image flatten for `ui-stone` and `ui-stone-danger`. Validate the result tiles as a 12px-inset nine-slice (uniform border, plain centre). If it doesn't, **hand-draw** flat nine-slice panels in PIL: a dark volcanic-stone fill, a flat 2-tone border (calm = iron/gold edge; danger = blood-red edge), subtle flat molten flecks — matching the current palette but flat and guaranteed tileable. Overwrite the same `ui-stone.png` / `ui-stone-danger.png`.

### Camera zoom
`this.cameras.main.setZoom(1.5)` in `DungeonCrawl.create()`. The fog (`renderTexture` at `scrollFactor(0)`, screen-sized), HUD, minimap, and banners are screen-space and **must not** be scaled/clipped by the zoom. Implementation: render the world on the (zoomed) main camera and the screen-space UI on a **dedicated un-zoomed UI camera** (`this.cameras.add(...)`, `ignore` lists splitting world vs UI objects) — or, if simpler and correct, keep one camera and re-derive the fog/HUD sizing from the zoom. The plan picks whichever verifies clean. Rooms/props may need a small scale tweak so the zoomed view still has breathing room.

## Out of scope

- Characters (Gargoyle, Wanderer), Night Hunt / Finale / menus.
- The procedural floor/walls/molten-cracks (already flat 2D).
- Gameplay — purely visual.
- W (melee swing) and B (new bosses) — separate future sub-projects.

## Verification

- `npm run build` passes.
- Playwright screenshots at the new zoom: props read **flat** (no 3D cast shadows), panels are **crisp** at multiple sizes (nine-slice intact), and the **HUD / fog / minimap** render correctly (not clipped or doubled) under zoom.
- Side-by-side of each new prop vs its original confirms "same design, flattened."
- A real-keyboard playthrough still plays cleanly (0 console errors).
