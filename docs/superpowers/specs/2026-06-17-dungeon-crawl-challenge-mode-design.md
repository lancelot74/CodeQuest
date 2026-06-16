# Dungeon Crawl — Night Hunt Challenge Mode

**Date:** 2026-06-17
**Status:** Approved design
**Scope:** Sub-project **D** of the "dungeon overhaul." Designed first because it drives the UI and boss choices.

## The overhaul, decomposed

The user's request ("dungeon UI, advanced bosses, a new mode within Night Hunt, remove Story + Age of War") is one cohesive overhaul, too big for a single spec. It splits into four sub-projects, each with its own spec → plan → build:

- **A · Clear the deck** — remove Story + Age of War; Night Hunt becomes the whole game; add a **FOREST / CHALLENGE** mode select. *(own spec)*
- **B · Dungeon UI reskin** — swap the Kenney Pixel-Adventure chrome for a dungeon UI pack via `widgets.js`; reuse an existing pack. *(own spec)*
- **C · Advanced bosses** — regenerate the stalkers (and a new final boss) at Wanderer fidelity via Higgsfield. *(own spec)*
- **D · Dungeon Crawl mode** — **this spec.** Consumes B + C; can be built first with placeholders and have B/C folded in as they land.

Standing design prefs honored throughout: **scrolling maps + follow-camera** (not fixed screens), **reuse existing tilesets/UI packs** over procedural drawing, **Higgsfield** for advanced character sprites.

## What the Dungeon Crawl is

A **hybrid stealth + combat** challenge mode reached from Night Hunt's mode select. You descend a dungeon **floor by floor**. Each floor is:

1. **Stealth rooms** — a short run of connected, scrolling dungeon rooms (follow-camera, fog/torch) patrolled by advanced hunters. Sneak through.
2. **Boss arena** — a fight against the floor's boss that caps the floor.
3. **Stairs down** — appear when the boss falls; take them to the next floor.

### Locked decisions

| Question | Decision |
|---|---|
| Relation to Forest | A **separate selectable mode** ("Challenge"), not an endgame layer of Forest |
| Core loop | **Hybrid** — stealth rooms, then a boss arena per floor |
| Combat kit | **Stealth-kill** + **Wanderer weapon** + **Emberhand** (all three) |
| Wanderer weapon | The **lantern as a light-weapon** — short-range light-blast/ward that staggers/banishes dungeon creatures (light vs. dungeon dark) |
| Progression | Authored **~4-floor campaign** (fixed boss + theme each) + **final boss**, then **loops into endless** escalating descent with a saved depth record |
| On death | **Retry the current floor** (fair checkpoint), tunable |
| Hero | **Wanderer-only** in Challenge; Forest keeps the full roster |
| Layout | Procedural room layouts within each floor; campaign floors keep fixed bosses/themes; endless floors fully procedural |

## Player kit

- **Stealth-kill** — approach an *unaware* hunter from behind and execute it silently (instant kill, no alarm). Awareness/sense state from `Hunter.js` decides "unaware." Needs a Wanderer takedown animation (Higgsfield).
- **Lantern light-weapon** — a short-range light-blast/ward (cone or burst in front of the Wanderer) that staggers or banishes dungeon creatures and can break a boss's guard. Needs a Wanderer "raise lantern / blast" animation (Higgsfield).
- **Emberhand** — reused from the Finale: catch a boss's incoming projectile, wear it as a one-hit shield, hurl it back as the only thing that damages the boss. Generalized so any boss that throws something works.

## Bosses (from sub-project C)

Advanced, Higgsfield-generated, Wanderer-fidelity. The campaign uses a handful of **distinct floor bosses** + one **final boss**. The existing stalkers (demon/mage/ooze/eyeball) regenerated at high fidelity are natural floor-boss candidates; the final boss is new. Each boss needs at least: an idle/move loop, a telegraph, a projectile to catch (for Emberhand), and a death. Endless-descent floors reuse campaign bosses with escalated stats.

## Progression & meta

- **Campaign:** ~4 themed floors, each a fixed boss + theme, ending in the final boss. Beating the final boss = the challenge is "won" (a saved flag, like `hunt.dawn`).
- **Endless:** after the campaign, floors keep coming, escalating (more/faster hunters, tougher boss stats), tracked by a **depth record** saved like `hunt.bestRound` (new `SaveSystem` key, e.g. `hunt.bestDepth`).
- **Death:** retry the **current floor** from its start (checkpoint), not from floor 1. Tunable later.

## Reuse map

- **Night Hunt** → stealth rooms: senses/awareness AI (`Hunter.js`), fog-of-war + lights (`utils/lights.js`), follow-camera, torch, throw-stone lure, trap-holes, the HUD.
- **Finale** → boss arenas: Emberhand catch-throw, boss pattern-flight, arena confinement, difficulty modes, the death/retry overlay.
- **Wanderer pipeline** → all advanced sprites (hero combat frames + bosses), via the documented Higgsfield → grey-key → strip flow.

## Assets needed

- **Dungeon tileset** — walls / floor / doors / stairs. Reuse an existing dungeon pack (e.g. a Kenney dungeon tileset); not procedural. *(Sourced in D, shared with B.)*
- **Dungeon UI** — from sub-project B; D uses placeholders until B lands.
- **Wanderer combat frames** — light-blast and stealth-kill takedown (Higgsfield).
- **Advanced bosses** — from sub-project C; D uses placeholder (current) enemies until C lands.

## Build phases (D itself, each playable)

- **D1 — vertical slice:** one floor — stealth rooms (existing hunter AI + fog) → one boss arena (Emberhand) → stairs down → next-floor stub. Placeholder UI + placeholder (current) bosses. A dungeon tileset for the rooms.
- **D2 — combat kit:** the lantern light-weapon + stealth-kills (with their Higgsfield animations).
- **D3 — full mode:** the ~4-floor authored campaign + final boss + endless descent + depth record + retry-floor checkpoints.

## Dependencies & sequencing

- D depends on **A** (the mode select / Night Hunt being the hub) for its entry point — but D1 can be reached via a dev hash (like `#wanderer`/`#finale`) before A lands.
- D **integrates** B (real dungeon UI) and C (advanced bosses) as they complete; built against placeholders first so it isn't blocked.

## Out of scope (this spec)

- A, B, C — each gets its own spec.
- Forest mode changes — Challenge is additive; Forest is untouched.
- Multiplayer, new senses, or items beyond the listed kit.
