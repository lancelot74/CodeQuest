# Dungeon Crawl — Night Hunt Challenge Mode

**Date:** 2026-06-17
**Status:** Approved design — refreshed 2026-06-17 after A + B shipped and C (the Gargoyle) was spec'd.
**Scope:** Sub-project **D** of the "dungeon overhaul." Designed first because it drives the UI and boss choices.

## The overhaul, decomposed

The user's request ("dungeon UI, advanced bosses, a new mode within Night Hunt, remove Story + Age of War") is one cohesive overhaul, too big for a single spec. It splits into four sub-projects, each with its own spec → plan → build:

- **A · Clear the deck** — ✅ **done.** Story + Age of War + Codex removed; Night Hunt is the whole game; GameSelect is a **FOREST / CHALLENGE** picker (Challenge = a "coming soon" stub that D replaces).
- **B · Dungeon UI reskin** — ✅ **done.** `widgets.js` draws a **gothic stone nine-slice** that swaps to a **blood-red variant on danger** via `setUiMood(scene, 'calm'|'danger')`.
- **C · Gargoyle Guardian** — spec'd. A net-new **dungeon final boss** at Wanderer fidelity; the existing stalkers/dragons are left as-is (not regenerated). *(spec: `2026-06-17-gargoyle-final-boss-design.md`)*
- **D · Dungeon Crawl mode** — **this spec.** Consumes B + C; built first with placeholders, folding C in as it lands.

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

## Bosses

- **Floor bosses (early campaign floors):** the **existing stalkers** (demon/mage/ooze/eyeball) used at boss scale — C deliberately did NOT regenerate them. Each already has a move loop + (mostly) a death; D adds a telegraph + a catchable projectile so the Emberhand works on them.
- **Final boss:** the **Gargoyle Guardian** (sub-project C) — a colossal stone-and-iron gargoyle that smashes and hurls rubble (the catchable projectile). C ships its `idle/smash/hurl/hurt/death` + `rubble` sheets; **D** wires HP, attack cadence, telegraphs, and phases.
- **Endless descent** reuses these with escalated stats.

Every boss needs at least an idle/move loop, a telegraph, a projectile to catch (Emberhand), and a death.

## Progression & meta

- **Campaign:** ~4 themed floors, each a fixed boss + theme, ending in the final boss. Beating the final boss = the challenge is "won" (a saved flag, like `hunt.dawn`).
- **Endless:** after the campaign, floors keep coming, escalating (more/faster hunters, tougher boss stats), tracked by a **depth record** saved like `hunt.bestRound` (new `SaveSystem` key, e.g. `hunt.bestDepth`).
- **Death:** retry the **current floor** from its start (checkpoint), not from floor 1. Tunable later.

## Reuse map

- **Night Hunt** → stealth rooms: senses/awareness AI (`Hunter.js`), fog-of-war + lights (`utils/lights.js`), follow-camera, torch, throw-stone lure, trap-holes, the HUD.
- **Finale** → boss arenas: Emberhand catch-throw, boss pattern-flight, arena confinement, difficulty modes, the death/retry overlay.
- **Wanderer pipeline** → all advanced sprites (hero combat frames + bosses), via the documented Higgsfield → grey-key → strip flow.

## Assets needed

- **Dungeon tileset** — walls / floor / doors / stairs. Reuse an existing dungeon pack (e.g. a Kenney dungeon tileset); not procedural. *(Sourced in D.)*
- **Dungeon UI** — ✅ done in B (gothic stone nine-slice + blood-red danger swap). D drives the **danger swap** from its chase/combat states via `setUiMood`.
- **Wanderer combat frames** — light-blast and stealth-kill takedown (Higgsfield). The SHIFT **sprint** already exists.
- **Final boss** — the **Gargoyle Guardian** sheets from C; floor bosses reuse the existing stalker art (no upgrade).

## Build phases (D itself, each playable)

- **D1 — vertical slice:** one floor — stealth rooms (existing hunter AI + fog) → one boss arena (Emberhand) → stairs down → next-floor stub. Uses the real **gothic UI** (B done) and existing-stalker bosses; needs a dungeon tileset for the rooms.
- **D2 — combat kit:** the lantern light-weapon + stealth-kills (Higgsfield anims).
- **D3 — full mode:** the ~4-floor authored campaign + the **Gargoyle Guardian** final boss (C) + endless descent + depth record + retry-floor checkpoints.

## Dependencies & sequencing

- A is done, so the **CHALLENGE** card already exists as the entry point (a "coming soon" stub D wires up). D1 can also be reached via a dev hash (like `#wanderer`/`#finale`).
- B is done (real gothic UI). D **integrates C** (the Gargoyle final boss) when it lands; floor bosses use existing stalker art meanwhile.

## Out of scope (this spec)

- A, B, C — each gets its own spec.
- Forest mode changes — Challenge is additive; Forest is untouched.
- Multiplayer, new senses, or items beyond the listed kit.
