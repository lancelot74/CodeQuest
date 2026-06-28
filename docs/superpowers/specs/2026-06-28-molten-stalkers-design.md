# Dungeon Crawl — Molten Stalkers (unify the bestiary)

**Date:** 2026-06-28
**Status:** Approved (design), pending implementation plan

## Problem

Dungeon Crawl has two enemy classes:

- **Bosses** (1/floor): Ember Brute, Ashen Warlock, Magma Serpent, Gargoyle Guardian —
  these already use the Higgsfield molten clips.
- **Roaming stalkers** (several/floor): Horned Stalker (`demon`), Pale Mage (`mage`),
  Creeping Ooze (`ooze`) — green marsh creatures reused from Night Hunt. They clash with
  the molten/obsidian theme.

Goal: replace the three green stalkers with molten creatures so the whole dungeon is one
cohesive bestiary, and give them **real walk cycles** (the missing animation).

## Approach (chosen: ① Lesser-kin reuse + generated walk)

Stalkers become smaller, darker molten versions of three existing boss creatures. The
Gargoyle stays the unique final boss and is **not** used as a stalker. Only new assets
needed: **3 walk-cycle videos** — everything else reuses existing boss art.

### Roster mapping

| Current stalker | Becomes      | Boss art reused | Name                |
|-----------------|--------------|-----------------|---------------------|
| `demon`         | Brute-kin    | `brute-*`       | THE EMBER WHELP     |
| `mage`          | Warlock-kin  | `warlock-*`     | THE ASH ACOLYTE     |
| `ooze`          | Serpent-kin  | `serpent-*`     | THE MAGMA CRAWLER   |

- Rendered smaller than their boss and tinted darker, so they read as *lesser kin*, not
  the boss. Exact scale/tint tuned in implementation.
- `FLOORS` pairings stay structurally as-is (a boss guarded by its own kin reads as
  cohesive; mixed floors give variety).

## Assets

New (generate via Higgsfield, reuse existing pipeline):

- `brute-walk`, `warlock-walk`, `serpent-walk` — side-on molten creature walking in place,
  locked static camera, flat grey bg. Use each boss's existing still as `start_image` so
  the creature stays consistent. Seedance 2.0, 480p.
- Key with the numpy/scipy grey-keyer → **96px** feet-anchored strips (matching the boss
  sheets so the reused idle/death align), written to
  `public/assets/game/bosses/{brute,warlock,serpent}-walk.png`. Scratch in `~/cq-scratch/`.

Reused at zero cost: each stalker's `death` borrows the existing boss death strip; the walk
loop doubles as idle (exactly how the current `*-walk` stalkers work).

## Code wiring (surgical)

1. **`src/scenes/Preload.js`** — load the 3 new walk sheets at 96px (`GARG` frame size).
2. **`src/utils/anims.js`** — `define()` three `*-walk` loops alongside the boss anims.
3. **`src/systems/Hunter.js`** — the roaming-stalker skin map (`demon/mage/ooze`): repoint
   `walk` to the molten walk textures, retune `scale`/`body` for the 96px sheets. This is
   what changes the on-floor stalker appearance.
4. **`src/scenes/DungeonCrawl.js`** `BOSSES` — the `demon/mage/ooze` entries (used when a
   stalker appears as a deep-descent boss, floors 5+): repoint `tex`/`idle`/`death` to
   molten, update `name`/`verb`, retune `scale`/`body`. Rename the keys to molten ones and
   update the 4 `FLOORS` lines so the code reads honestly.
5. **Projectile theming** — stalker chase-attacks currently use green `venom`. Switch to the
   molten `gargoyle-rubble` (or a small molten mote) so projectiles match. Confirm exact
   projectile path in `Hunter.js` (`attack: 'wave'|'volley'|'homing'`) during planning.

## Out of scope

- Generating brand-new distinct minions (Approach ②).
- Changing boss behavior. (The new walk strips *could* later let bosses roam — not now.)
- The zoom/UI issue (tracked separately).

## Verification

- `npm run build` passes (only the pre-existing chunk-size warning).
- In-game: roaming stalkers render as small molten creatures with a true walk cycle; on
  melee kill they play the molten death; deep-descent (floor 5+) stalker-bosses are molten.
- No green marsh creature remains in Dungeon Crawl.
