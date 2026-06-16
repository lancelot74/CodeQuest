# The Gargoyle Guardian — Dungeon Final Boss

**Date:** 2026-06-17
**Status:** Approved design
**Scope:** Sub-project **C** of the dungeon overhaul. Build order A → B → **C** → D (A, B done).

## Goal

Design and produce a brand-new climactic boss for the Dungeon Crawl's campaign finale — a **colossal stone-and-iron gargoyle** at Wanderer fidelity — as reusable sprite assets. **C ships the boss's art + animations + the rubble projectile**; **D** wires the actual fight (HP, cadence, Emberhand catch, telegraphs, phases) into the dungeon's final arena.

The existing stalkers (demon/mage/ooze/eyeball) and the Finale dragons are left as-is for now; C is net-new content, not a regeneration of those.

## Locked decisions

| Question | Decision |
|---|---|
| What | A **Gargoyle Guardian** — a colossal stone-and-iron gargoyle, dormant in the dungeon wall, that wakes for the final fight |
| Form | **Grounded** (no flight) — a heavy guardian that smashes and hurls rubble |
| Fidelity / source | **Higgsfield**-generated at Wanderer fidelity |
| Frame size | **~96×96** (vs the dragons' 48px) for an imposing final-boss presence; tunable |
| Animations | `idle`, `smash`, `hurl`, `hurt`, `death` + a **rubble-chunk projectile** |
| Boundary | C = assets + anim defs + Preload load; the fight logic is D |

## Animations (the C deliverable)

| Key | Type | Notes |
|---|---|---|
| `gargoyle-idle` | loop | active, menacing stance; heavy and slow |
| `gargoyle-smash` | one-shot | rears up and slams the ground — the melee/telegraph attack |
| `gargoyle-hurl` | one-shot | wrenches a chunk loose and throws it — feeds the Emberhand (the catchable projectile) |
| `gargoyle-hurt` | one-shot | flinch when struck |
| `gargoyle-death` | one-shot, holds | crumbles back into rubble |
| `gargoyle-rubble` | spin/loop | the thrown rubble chunk — what the player catches and hurls back |

(An optional `wake` intro — dormant statue cracking to life — is a nice-to-have deferred to D's fight intro, not required for C.)

## Asset pipeline (Higgsfield → strip)

Same documented flow as the Wanderer/dragons (see the Higgsfield sprite-pipeline reference):
1. `generate_image` (nano_banana_pro) → one clean **gargoyle still** — colossal stone-and-iron gargoyle, side/¾ view, full body, lit, flat neutral grey background.
2. Per action, `generate_video` (seedance image-to-video, `start_image` = the still) with an action prompt; **anti-zoom framing** ("wide static, locked camera, stays the same size") to keep scale consistent — the lesson learned on the hit/sprint clips.
3. Key the **grey** background ourselves (the AI video bg-remover eats glowing detail), erode, drop specks.
4. Compositor: union-bbox, feet-anchored, `--flip` to face right, into 96×96 horizontal-strip sheets per action.
5. The rubble chunk: a small `generate_image` (a glowing-edged stone shard) → keyed → a short spin strip (or a single image + a tween-spin, like the existing projectiles).

## Integration (C scope)

- **`public/assets/game/dragons/`** (or a new `bosses/` dir) — `gargoyle-{idle,smash,hurl,hurt,death}.png` (96px) + `gargoyle-rubble.png`.
- **`src/scenes/Preload.js`** — load the gargoyle sheets (96×96) + rubble.
- **`src/utils/anims.js`** — define `gargoyle-{idle,smash,hurl,hurt,death}` (idle loop; smash/hurl/hurt one-shot; death one-shot hold) + `gargoyle-rubble`.
- A small **dev harness** to view the boss in isolation (a dev hash or a throwaway arena) so it can be eyeballed at 96px before D's fight exists — since headless screenshots are unreliable this session, verify via the asset composites + a programmatic anim-exists/anim-plays check.

## Phasing

- **C1 — vertical slice:** base still → `idle` + `death` + the **rubble projectile**. Enough to drop the gargoyle into a test view and confirm the look/scale.
- **C2 — combat anims:** `smash` + `hurl` + `hurt`.

## Verification

- `npm run build` passes.
- The anim keys exist and play (programmatic `anims.exists` / `play` checks — robust to the session's headless-WebGL glitch).
- Asset composites (PIL previews) confirm a clean, consistent-scale gargoyle and a readable rubble chunk before committing each clip.

## Out of scope

- The fight itself — HP, attack timing, Emberhand catch of the rubble, telegraphs, phases, the final arena (all **D**).
- Regenerating the existing stalkers or dragons.
- A `wake` intro animation (deferred to D if wanted).
