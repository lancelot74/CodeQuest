# Clear the Deck — Night Hunt becomes the whole game

**Date:** 2026-06-17
**Status:** Approved design
**Scope:** Sub-project **A** of the dungeon overhaul. First to build (recommended order A → B → C → D).

## Goal

Remove Story Mode and Age of War (and the now-dead Codex), leaving **Night Hunt as the entire game**, and turn the old "CHOOSE A GAME" hub into a **Night Hunt mode picker: FOREST / CHALLENGE**. This unblocks and simplifies everything downstream.

## Why Codex goes too

Codex is not independent — it's a viewer for Story's lessons (`ContentLoader.lessons()` + `SaveSystem.isLessonUnlocked`), and lessons only unlock by **clearing Story levels**. With Story deleted it would be permanently empty. Confirmed with the user: delete it.

## Remove

**Scenes** (delete files + unregister from `main.js`):
`Game.js`, `WorldSelect.js`, `LevelSelect.js`, `HUD.js`, `GameOver.js` (Story), `AgeOfWar.js` (War), `Codex.js`.

**Content systems / data** (delete once nothing live references them — verify during planning):
`src/systems/ContentLoader.js`, `data/worlds.json`, `data/lessons.json`, `data/questions.json`, and the lesson/level-progress logic in `SaveSystem.js` (`isLessonUnlocked`, lesson/level save fields). **Keep** `SaveSystem` character + `hunt` state (used by Night Hunt/Finale).

**Assets** (delete only those exclusively used by the removed scenes — verify each isn't shared with Night Hunt/Finale/menus):
Story/War-only art such as the platformer `terrain` (`kenney-platformer.png`) and `bg-green/blue/gray/purple`, and any War-only sprites. **Keep** everything Night Hunt uses: the four hero sheets (`ninja/pink/mask/virtual`), the hunt enemies (`ooze/demon/mage/eyeball`), `hunt-lantern`, dragons, clouds, hunt tiles, UI, audio.

**Orphaned helpers:** if `widgets.js` `addBackdrop` (and its `bg-*` use) is Story/War-only, remove it with the assets. Verify it isn't used by any surviving scene.

## Keep

`Boot`, `Preload`, `MainMenu`, `GameSelect` (repurposed), `ModePage`, `Settings`, `NightHunt`, `Finale`, and all their shared deps.

## The new flow

- **MainMenu:** remove the **CODEX** button; keep **GAME** (→ GameSelect) and **SETTINGS**. (Optional: rename GAME → PLAY — minor, decide in plan.)
- **GameSelect repurposed** from "CHOOSE A GAME" (3 game cards) into the **Night Hunt mode picker** — two cards:
  - **FOREST** → `ModePage{mode:'hunt'}` → `NightHunt` (today's flow, unchanged).
  - **CHALLENGE** → the Dungeon Crawl. Until sub-project D lands, a **"coming soon"** card (visible but inert, or a dev-only entry). D replaces the stub with the real dungeon entry.
- `ModePage` keeps `mode:'hunt'`; its `story`/`war` branches and the `MODE_INFO` entries for them are removed.

## Verification

- `npm run build` passes (only the pre-existing chunk-size warning); **no unresolved imports** from deleted modules.
- Playwright smoke: MainMenu shows GAME + SETTINGS (no CODEX); GAME → GameSelect shows **FOREST + CHALLENGE**; FOREST → the hunt still loads and plays (hero renders, 0 console errors); CHALLENGE shows the "coming soon" stub.
- `grep` confirms no remaining references to deleted scenes/JSON/`ContentLoader` anywhere in `src/`.

## Out of scope

- The actual Dungeon Crawl (sub-project D) — CHALLENGE is just a stub here.
- Dungeon UI (B) and advanced bosses (C).
- Any Night Hunt / Forest gameplay change.
