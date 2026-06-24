# Dungeon Crawl — Molten Floor, Stone Doors & Sealed Statue (design)

Date: 2026-06-24 · Mode: Challenge / `DungeonCrawl.js` · Status: approved, implementing

## Goal
Three additions to the Obsidian-Ruins Challenge mode:
- **A. Molten floor** — replace the procedurally-drawn floor + "drawn-by-a-kid" orange
  cracks with a generated molten-plates texture, tiled large so the lava grid is sparse.
- **B. Heavy stone doors** — each doorway becomes a carved stone door that grinds open as
  you approach (dust + grind SFX) and grinds shut + shows a glowing rune bar when a room
  seals (combat/boss). Replaces the plain seal rectangles.
- **C. Sealed statue + hidden keystone + lore** — an *optional* side-track: a dormant
  warden statue in each floor's start room, awoken by a single hidden "Sigil Shard"
  keystone, revealing one chapter of the ruins' story (in-run panel + permanent Chronicle)
  and granting a charm. Never gates descent — the boss→stairs loop is untouched.

## Decisions (from brainstorming)
- Floor: original **molten-plates** texture, **large tile scale** (sparse lava grid).
- Gate relationship: **statue is optional lore** (boss-clear still spawns the stairs).
- Keystone: **one per floor**, hidden in the room farthest from start (never the boss room).
- Lore delivery: **in-run panel + Codex**. (No Codex menu exists → in-run panel reuses the
  DOM overlay; "Codex" becomes a small **Chronicle** viewer on the challenge card.)
- Doors: **heavy stone doors** (drawn in Phaser to match existing walls; not a sprite).
- Reward: adapted from "heal to full + charm" → **a lantern charm** only, because this mode
  has no HP (death is one-hit, mitigated by `consumeShield()`/`charm`). Charm = the carrot.

## A. Molten floor
- Asset: `public/assets/game/dungeon/floor-molten.png` (256², derived from the approved
  `v4-molten.png`, verified to tile without hard seams).
- `Preload.js`: `this.load.image('dungeon-floor', 'assets/game/dungeon/floor-molten.png')`.
- `DungeonCrawl.drawRoomFloor()`: replace the `graphics` fill/grid/speckle with a per-room
  `this.add.tileSprite(b.x, b.y, b.width, b.height, 'dungeon-floor').setOrigin(0,0)
  .setDepth(0).setTileScale(FLOOR_TILE_SCALE)` (`FLOOR_TILE_SCALE ≈ 1.1` → big plates).
  Keep a subtle dark vignette rect for depth.
- Remove `addMoltenCracks()` (function + its loop in `buildFloor`). The texture carries the
  lava now. `floorG` graphics object is no longer needed.

## B. Heavy stone doors
- After walls are built, create one **deduped** door per physical doorway (gaps are created
  twice — once per adjacent room — at the same world pos; key by `cx,cy`). Store in
  `this.doors` (Map by `cx|cy`) and `room.doorObjs` (per-room list for seal/unseal).
- Each door: two stone **leaf** rectangles (`0x2a2030` fill, `0x3a2c38` stroke, matching
  `addWall`), oriented by gap shape (horizontal gap → leaves slide left/right; vertical →
  up/down). A static **collider body** added once to `wallZones`; `body.enable` toggled
  (open = disabled). A **rune bar** graphic (amber `0xff5a2a`, pulsing) shown only when sealed.
- `setDoorOpen(door, open, animate)`: tween leaves apart/together (~260 ms, grind ease);
  on a real change play `SFX.heavy` (rate ~0.7) + a small **dust** puff; toggle the body.
- Proximity (in `update`, explore + cleared phases): for each non-sealed door, open within
  `DOOR_OPEN_DIST`, close beyond `DOOR_CLOSE_DIST` (hysteresis so it doesn't flap); animate
  on change only. Sealed doors ignore proximity (stay shut).
- Refactor `sealRoom()`/`unsealRoom()` to drive the doors (`sealed=true`, force shut + rune
  on / `sealed=false`, rune off, proximity resumes) instead of creating separate seal rects.

## C. Sealed statue + keystone + lore
Only on floors **1–4** (where chapters exist); skipped on endless floors (>4).
- **Statue**: placed deterministically in the start room (prominent spot, off the spawn
  centre) with a faint marker glow. `this.statue = {img, x, y, room, awakened}`. Eyes/cracks
  dark until awoken. Random décor statues elsewhere are unaffected.
- **Keystone (Sigil Shard)**: a drawn glowing shard pickup (amber/violet) in the room
  farthest (grid distance) from start, excluding start + boss rooms. `this.keystone =
  {orb, x, y, room, held}`. Walk-over pickup → `keystoneHeld=true`, banner + `SFX.levelUp`.
- **Interaction** (`checkStatue()` in the explore/cleared branch, key **E** — free outside
  the boss phase): near the statue +
  - have shard, not awoken → **awaken**: consume shard, awaken FX, lore panel, record to
    save, grant charm.
  - no shard, not awoken → hint banner "*the warden is sealed — a keystone lies in the deep*".
  - already awoken → replay this floor's chapter panel.
- **Awaken FX**: over the existing `dprop-statue` — igniting eye glows (two ellipses),
  pulsing amber crack overlay, rising ember puffs (`CombatSystem.puff`), brief camera
  flash/shake. No new sprite.
- **Lore panel**: new `showLorePanel({title, body}, onClose, badge)` in `domOverlay.js`
  (title + prose, no code block); the scene gates `update` while open (`this.loreOpen`,
  player velocity zeroed) and resumes on close.
- **Reward**: `this.charm = true` (lantern charm — survives one blow).
- **Persistence**: `SaveSystem` `challenge.loreUnlocked: []` (floor numbers). On awaken push
  the floor + `save()`.
- **Chronicle viewer**: `showChronicle(chapters, unlocked)` in `domOverlay.js` lists all 4
  chapters; locked ones show "??? — awaken the warden on floor N". A **CHRONICLE** button on
  the GameSelect challenge card opens it.

### Lore (4 chapters → the Gargoyle)
1. **I · The Forge That Fell** (F1) — Emberhold, a forge-temple; smiths carved wardens to
   keep the deep gate shut, each cradling a sigil. The first warden still waits.
2. **II · The Pact of Ash** (F2) — they feared a caged heart of living fire; poured their own
   souls into the wardens to hold the seal one more age.
3. **III · The Seal Weakens** (F3) — age by age the fire presses up, sigils dim; each
   returned keystone rekindles a warden for a moment. The heat is rising.
4. **IV · The Last Warden** (F4) — the greatest warden, the **Gargoyle**, the final lock;
   waited so long it knows neither friend nor thief. Beyond it, the fire; beyond the fire,
   the way down. (Ties to the existing Gargoyle boss + endless descent.)

## Files
- **NEW** `public/assets/game/dungeon/floor-molten.png`
- **EDIT** `src/scenes/Preload.js` — load `dungeon-floor`
- **EDIT** `src/scenes/DungeonCrawl.js` — floor tilesprite; remove cracks; doors; statue +
  keystone + lore; lore data
- **EDIT** `src/systems/SaveSystem.js` — `challenge.loreUnlocked`
- **EDIT** `src/ui/domOverlay.js` — `showLorePanel`, `showChronicle`
- **EDIT** `src/scenes/GameSelect.js` — Chronicle button + load lore for the viewer

## Verification
- `npm run build` passes (only the pre-existing chunk-size warning).
- Floor renders as large sparse molten plates; no orange scribble cracks remain.
- Doors grind open near the player and shut/rune when a combat or boss room seals; you can't
  pass a sealed door.
- Start room shows a dormant statue; pressing E without the shard hints; the shard is in a
  far room; returning + E awakens the statue (FX + lore panel + charm) and records the
  chapter; the Chronicle button lists unlocked chapters.
- Boss→stairs descent is unchanged; a run cannot soft-lock on the statue.

## Out of scope
- Generated door/statue sprites (drawn / FX instead).
- Endless-floor (>4) lore.
- Audio for the lore panel beyond existing SFX.
