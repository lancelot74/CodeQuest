# Dungeon UI Reskin — carved stone + reactive runes

**Date:** 2026-06-17
**Status:** Approved design
**Scope:** Sub-project **B** of the dungeon overhaul. Build order A → **B** → C → D (A done).

## Goal

Reskin the whole game's UI chrome from the Kenney Pixel-Adventure blue-grey panel to a **carved grey stone** look with **arcane runes** etched along the panel borders — and make those runes **mood-reactive**: cold and arcane normally, ominous **blood-red when things turn bad**. One coherent art direction with the Wanderer (and the coming bosses).

## Locked decisions

| Question | Decision |
|---|---|
| Art source | **Higgsfield-generated** at Wanderer fidelity, sliced into a nine-slice |
| Style | **Carved grey stone** panels, **arcane runes** along the borders |
| Panel structure | **Two layers** — neutral stone base + a separately-**tintable runes-glow overlay** |
| Calm rune color | **Cold blue-purple** arcane glow |
| Danger rune color | **Blood-red** ("things turn bad") |
| Danger triggers | Hunter giving chase (reuse the tension signal), the CAUGHT death screen, and (later, in the dungeon) a boss enraging |
| Hover | Button brightens its **current** mood color (no separate hover color) |
| Font / backdrop | Keep Press Start 2P; keep `nightBackdrop` (a dungeon *scene* backdrop belongs to D) |
| Scope | **Global** — menus + HUD + hunt; Forest too (runes stay calm-blue unless a chase reddens them) |

## Architecture

Everything routes through **`src/ui/widgets.js`** (`uiPanel`, `panelButton`, `button` all draw the same nine-slice). The reskin lives there.

**Two-layer panel.** Replace the single `ui-panel` nine-slice with two stacked nine-slices of identical geometry:
1. `ui-stone` — the carved stone base (neutral, no tint).
2. `ui-runes` — the glowing runes on the borders, on transparent; this layer is **tinted** by the current UI mood.

Both are generated so the **8–16px border insets** slice cleanly (corners fixed, edges stretch). Runes live in the border/edge region so nine-slice stretching reads as a continuous glow.

**UI mood (the reactive bit).** Module-level state in `widgets.js`:
- `let uiMood = 'calm'` and a color map `{ calm: <cold blue-purple>, danger: <blood-red> }`.
- Every panel/button pushes its `ui-runes` layer into a per-scene registry (e.g. `scene._uiRunes`) and tints it to the current mood color on creation.
- `setUiMood(scene, mood)` updates `uiMood`, then tints every registered rune layer in that scene (a quick tween for the calm↔danger shift). Newly-created panels pick up the current mood.

**Triggers (B2).** Call `setUiMood(scene, 'danger')` when a hunter enters CHASE (NightHunt already detects this for the tension music — reuse that edge) and on `playerDeath()`; `setUiMood(scene, 'calm')` when the chase clears. Dungeon boss-enrage wiring lands with D.

**Palette.** Shift the accent constants toward **stone-grey + cold-blue + blood-red** (in `utils/constants.js` `COLORS` and the widget hover tints), retiring the old blue-white `0xe2ecff` hover in favor of a mood-aware brighten.

## Asset pipeline (Higgsfield → nine-slice)

Reuse the documented Higgsfield → grey-key → strip flow, adapted for UI:
1. `generate_image` (nano_banana_pro) → a square **carved-stone panel** with a clear raised border and runes etched around the inner edge, flat background, even lighting.
2. Generate (or derive) the matching **runes-only** layer: either a second prompt for the glowing runes on black, or isolate the rune glow from the panel; key to transparency.
3. Slice/trim to a clean nine-slice tile (consistent corner size), export `ui-stone.png` + `ui-runes.png` to `public/assets/game/ui/`.
4. Tune border insets in `uiPanel`/`panelButton`/`button` to match the generated corner size.

Verify the panel renders crisp at button scale (small) and big-panel scale (menus) — nine-slice corners must not smear.

## Files

- **NEW** `public/assets/game/ui/ui-stone.png`, `public/assets/game/ui/ui-runes.png`
- **EDIT** `src/ui/widgets.js` — two-layer panels, `uiMood` + `setUiMood`, per-scene rune registry, hover brighten
- **EDIT** `src/utils/constants.js` — `COLORS` palette shift
- **EDIT** `src/scenes/NightHunt.js` — call `setUiMood('danger'|'calm')` on chase edge + `playerDeath()`

## Phasing

- **B1 — static reskin:** generate + integrate the stone-rune nine-slice (runes a fixed calm blue). Game looks dungeon; every panel/button swapped; build + Playwright + screenshots.
- **B2 — reactive runes:** `uiMood`/`setUiMood` + the rune-layer registry + wire the chase/death triggers in NightHunt. Verify the calm↔blood-red shift in-game.

## Verification

- `npm run build` passes (only the pre-existing chunk-size warning).
- Playwright: menus + hunt render with the stone panels, **0 console errors**; screenshots confirm crisp nine-slice at button and panel scale.
- B2: a forced chase (or `setUiMood(scene,'danger')` via the dev handle) flips the runes blood-red; clearing returns them to calm blue.

## Out of scope

- A dungeon **scene** backdrop / tileset (that's D).
- New fonts or a full HUD layout redesign — chrome texture + palette only.
- Bosses (C) and the dungeon mode (D).
