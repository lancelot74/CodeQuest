# Dungeon Crawl v2 — Rooms & Ancient Skin (R + A)

**Date:** 2026-06-18
**Status:** Approved design
**Scope:** Sub-project **R + A** of the "Challenge Mode v2" overhaul. Build order: **R+A → W → B** (user-chosen "foundation first").

## The v2 overhaul, decomposed

The Dungeon Crawl mode shipped 2026-06-18 (single open chamber: sneak to a sealed boss room, Emberhand the boss, descend). The follow-up request — "more ancient, room-based and Soul-Knight-like, with a map of where you've been; the ward becomes a physical attack with a Higgsfield animation; new animated bosses replacing the old ones" — splits into four sub-projects, each its own spec → plan → build:

- **R · Rooms & Map** — Soul-Knight room-by-room floors + an explored-area minimap. *(this spec, with A)*
- **A · Ancient Skin** — an "Obsidian Ruins" art direction replacing the procedural flagstones. *(this spec, with R — the rooms are built from these tiles, so they ship together)*
- **W · Wanderer's Weapon** — the lantern "ward" becomes a physical melee swing with a Higgsfield-made animation. *(later spec)*
- **B · New Bestiary** — new Higgsfield-animated floor bosses replacing the reused demon/mage/ooze stalkers. *(later spec)*

The Gargoyle Guardian (already built) stays as the campaign finale. R+A is built first as the structural foundation the others layer onto.

## What R+A is

The Challenge floor stops being one open chamber and becomes a **graph of discrete rooms** you move through door to door, Soul-Knight style, rendered in an **Obsidian Ruins** skin, with a **minimap** of the rooms you've explored.

### Locked decisions

| Question | Decision |
|---|---|
| Build order | **R+A first**, then W, then B (foundation first) |
| Room loop | **Hybrid** — most rooms are combat-clear (seal doors, defeat the enemies, doors open); some are stealth/ambush rooms where the lantern still matters; the boss room caps the floor |
| Floor shape | A **procedurally-generated branching graph** of ~5–8 rooms/floor: start → combat rooms → one optional treasure room → boss room → stairs down |
| Camera | **Follow-camera within a room**, panning through the door to the next room (not fixed screens — honors the standing "scrolling maps + follow-camera" preference) |
| Art direction | **Obsidian Ruins** — black volcanic flagstone laced with glowing molten cracks, dark obsidian walls, broken obelisks/braziers/statues. Ties directly to the Gargoyle (stone-and-iron, molten cracks) |
| Tiles vs props | Procedural obsidian floor/walls **dressed with Higgsfield-generated ancient props** (no dependency on finding a perfect top-down tileset) |
| The map | **Corner room-grid minimap** (current / cleared / treasure / boss / adjacent-unexplored) **+ a TAB / M full-floor overlay** |
| Clearing rooms | Combat rooms are cleared with a **functional basic melee** shipped in R+A (a simple swing-arc hitbox); **W** later swaps in the Higgsfield swing animation + tuning. Stealth-kills and the Emberhand (for bosses) carry over |

## Floor structure (procedural)

- Each floor is a small **branching graph of rooms** laid out on a grid. Room kinds: **start**, **combat** (most), **treasure** (one, optional branch), **boss** (caps the floor).
- **~5–8 rooms/floor**, count/enemy-density scaling with depth. The authored campaign floors keep their fixed boss + theme; endless floors are fully procedural.
- Rooms connect by doors on the N/E/S/W edges. A door **seals** (molten bars) while a combat room is active and **opens** when the room is cleared. Already-cleared rooms stay open (free backtracking).
- The Wanderer enters a floor at the start room; the goal is to reach and clear the boss room, then take the stairs to the next floor.

## Room types

- **Combat room** — on first entry the doors seal and a group of hunters spawns; defeat them all (basic melee + stealth-kills + the lantern ward) to unlock the doors. Re-entering a cleared room is safe.
- **Stealth / ambush room** — an occasional darker room where hunters patrol *unaware*; sneak through or stealth-kill them. Detection wakes them. Preserves the Wanderer's stealth identity inside the new structure.
- **Treasure room** — a small reward on an optional branch (a heal or a brief buff). Tunable.
- **Boss room** — the floor's boss (existing stalkers/Gargoyle for now; **B** replaces the stalkers with new animated bosses). Felling it spawns the stairs down.

## Ancient skin — Obsidian Ruins

- **Floor:** procedurally-drawn black volcanic flagstone with a few **animated glowing molten cracks** (slow pulse). Replaces the cool-grey flagstones.
- **Walls:** dark obsidian blocks (the room/door boundaries).
- **Props (Higgsfield):** ancient set pieces generated via the documented Higgsfield → grey-key → strip/still pipeline — broken obelisks, molten braziers, shattered statues, cracked altars, rubble. Used as cover and decoration, placed per room.
- **Lighting:** the Wanderer's lantern + molten-crack glow + brazier pools light the rooms (reuses `lights.js`/fog). One cohesive molten world with the Gargoyle finale.

## The map

- **Corner minimap** (top-right): a grid of the floor's rooms that fills in as you explore — **current** room highlighted, **cleared** rooms solid, **treasure** and **boss** marked, **adjacent-but-unentered** rooms hinted.
- **Full map:** press **TAB / M** for a larger overlay of the whole floor explored so far. Closes on release/toggle.

## Combat & the melee (sequencing)

Hybrid combat rooms need a clear mechanic, but the polished Higgsfield swing is sub-project **W**. So **R+A ships a functional placeholder melee** — a short-range swing-arc hitbox (programmer-art / simple effect) bound to the attack input — so combat rooms are fully playable. **W** later replaces the visuals with the Higgsfield swing animation and tunes damage/range/feel. The Emberhand stays as the boss-damage mechanic; stealth-kills carry over.

## Architecture & file structure

The current `DungeonCrawl.js` (~760 lines) grows too large for a room system, so R+A breaks the dungeon into focused modules:

| File | Responsibility |
|---|---|
| `src/scenes/DungeonCrawl.js` | Scene orchestration: player, input, camera, phase flow, boss fight, retry/depth (trimmed) |
| `src/dungeon/FloorGen.js` | Procedurally generate the room graph for a floor (kinds, doors, layout) |
| `src/dungeon/Room.js` | A room: bounds, doors, type, enemy spawns, sealed/cleared state, prop placement |
| `src/dungeon/Minimap.js` | The corner minimap + TAB full-floor overlay |
| `public/assets/game/dungeon/` | Higgsfield-generated obsidian props (obelisk, brazier, statue, altar, rubble) |

**Reuse:** `Hunter.js` (room-scoped patrols + the existing scene contract), `lights.js`/fog, the Emberhand catch/throw, the boss controller + HP pips, `widgets.js`/`setUiMood`, `SaveSystem` (depth/won), the retry overlay. The Wanderer, sprint/stamina, ward, and stealth-kills carry over.

## Build phases (each playable)

- **R+A1 — room skeleton:** FloorGen + Room + camera door-transitions + sealed/cleared combat rooms (existing hunters, basic melee) + the boss room + stairs, on the current art. One floor, playable end to end.
- **R+A2 — the map:** corner minimap + TAB full-floor overlay, driven by the room graph + explored state.
- **R+A3 — Obsidian skin:** the molten-stone floor/walls + Higgsfield ancient props + brazier/molten lighting; stealth/ambush + treasure room variants.

## Verification

- `npm run build` passes (only the pre-existing chunk-size warning).
- Programmatic (Playwright, robust to the headless-WebGL glitch): a floor generates a connected room graph; entering a combat room seals its doors and spawns enemies; clearing it opens them; the boss room → stairs → next floor; the minimap reflects explored/cleared/boss rooms; retry-floor and the depth record still work; 0 console errors.
- Screenshots confirm the Obsidian skin, room transitions, the corner minimap, and the TAB map render cleanly.
- A real-keyboard playthrough moves room to room and clears a combat room.

## Out of scope (this spec)

- **W** — the Higgsfield melee swing animation + combat tuning (R+A ships only a basic placeholder melee).
- **B** — new animated bosses (R+A keeps the existing stalkers/Gargoyle).
- Forest / Night Hunt — untouched; Challenge is the only mode reworked.
- New senses, items, or multiplayer.
