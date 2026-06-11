# Night Hunt Finale — "The Descent" (design spec)

Date: 2026-06-11
Status: approved design, pending implementation plan

## Summary

Night Hunt gets an ending. Clearing round 5 leads into a linear dragon lair — the
opposite of the open forest — where the hero unlocks the **Emberhand** (catch a
dragon fireball, wear it as a one-hit shield, throw it back as the only weapon)
and fights the lair's twin masters: the **Green** and the **Red** dragon. Victory
brings dawn, records `hunt.dawn = true`, and unlocks the **Endless Night**
(rounds continue past 5) plus a FINALE replay button on the hunt briefing.

## Player experience

### Entry
- Trigger: entering round 5's final exit. Instead of `roundCleared()`,
  NightHunt starts the `Finale` scene with the current hero key.
  `hunt.bestRound` bumps to at least 6 on entry (round 5 was cleared).
- After dawn has been earned once, round-5 exits proceed to round 6+ as normal
  (endless); the finale remains replayable from the briefing button.

### The Descent (stages, in one linear world)
1. **Walkway** — pitch dark, small player light only, distant shrieks
   (pitched-down SFX). No threats. Music: existing Insanity loop (`bgm-trap`), low.
2. **Corridor 1 (dodge)** — the Green strafes past gaps in the corridor wall
   lobbing fireballs through them; the hero can only dodge. Scripted beat at the
   end: one fireball comes straight in at quarter speed with a "PRESS E" prompt;
   it cannot kill during this beat and waits (hovering) until the player catches
   it themselves. Banner: `hero.catch = true`.
3. **Corridor 2 (practice)** — a burning bramble blocks the path: throw an ember
   to burn through (teaches throw). Survive one strafe pass with a shield block
   (teaches shield). The arena door unseals.
4. **Arena phase 1 — the Green** — torch ring lights the arena (first fully lit
   space in the game). Slow single lobs aimed at the hero; occasional swoop with
   a floor shadow-line telegraph (dodge or spend shield). Dies to **3** returned
   embers.
5. **Arena phase 2 — the Red** — fan barrages of three (only the glowing CENTER
   fireball is catchable; outer two are tinted dark), plus a dive-bomb along a
   marked line (sprint clear, or a shield guarantees safety). Dies to **4**
   returned embers.
6. **Rage** — at the Red's last ember: `dragon.rage = true`, it snuffs the torch
   ring, the arena goes black, and fireballs become the only light (fog erase at
   each fireball). One final catch-and-throw in the dark.
7. **Dawn** — fog tweens from black to warm morning, *Roll Credits* plays, DAWN
   screen with run stats, `hunt.dawn = true` saved.

### The Emberhand (E key / CATCH touch button)
- **Catch**: press E while a catchable fireball is within ~28px — it becomes the
  held ember, orbiting the hero (radius ~24, spinning).
- **Shield**: while held, the next hit that would kill the hero consumes the
  ember instead (puff, no death). No timer, no charge count: one ember at most.
- **Throw**: press E while holding — the ember streaks at the nearest dragon
  (auto-aimed, ~280 px/s). A returned ember is the only thing that damages a
  dragon (1 ember of damage). A miss is gone; wait for the next fireball.
- Pressing E with nothing catchable in range does nothing (no penalty).

### Death and retry
- Any unshielded fireball/swoop/dive contact kills (one-hit, consistent with the
  mode). Death screen reads **BURNED** (same layout as CAUGHT).
- RETRY restarts the Finale scene; if the hero had reached the arena, restart at
  the arena door with the gift already granted (`fromArena` flag). MENU returns
  to MainMenu.

### Survival systems in the lair
- Kept: walking/sprinting + stamina, fog/lighting, touch controls.
- Dropped: hunger, warmth/freeze, items (stones/torches/food), holes, hunters,
  night events, weather clouds, objectives/exits/pips.

## Technical design

### New scene: `src/scenes/Finale.js` (~550 lines, self-contained)
- Registered in `main.js`. NightHunt stays untouched apart from the round-5 exit
  hook and exporting `HEROES`.
- Reuses shared modules as-is: `Audio/Music/SFX`, `CombatSystem`,
  `widgets` (pixelText/panelButton), `touchControls`
  (labels `{ jump: 'RUN', attack: 'CATCH', heavy: null }`), `SaveSystem`.
- Internal `Dragon` class (sprite, no arcade body): pattern-driven flight (sine
  hover, strafe runs across corridor gaps, tweened swoops and dives), modes per
  stage, `hurt(1)` ember damage with hurt flash, death tween.
- Fireballs: manual projectile array in the Night Hunt orb style (per-frame
  movement, `killTweensOf` on destroy). Kinds: `lob` (catchable), `fan` (center
  catchable, outers dark-tinted and uncatchable), `thrown` (friendly). The held
  ember is hero state, not a projectile.
- Stage state machine: `walkway → corridor1 → gift → corridor2 → arena1 →
  arena2 → rage → dawn`, advanced by player-x thresholds and scripted beats;
  invisible static doors seal behind the hero.
- World: ~58×14 tiles horizontal strip, batched render-texture floor (same
  pattern as NightHunt.buildArena), corridor walls from tree/stone props,
  camera follow with bounds.

### Shared extractions (small, no behavior change)
- `export const HEROES` from NightHunt.js; Finale imports it for hero sprite
  config (anim vs static, scale, body).
- `makeLight/makeLights` extracted to `ensureHuntLights(scene)` in
  `src/utils/lights.js` (texture keys unchanged: `hunt-light`, `hunt-light-sm`,
  `hunt-torch-light`); NightHunt calls the shared helper; Finale can therefore
  be launched directly (briefing button / `#finale` dev hash) without NightHunt
  having run first.

### Assets
- GIF → horizontal strip PNG via the established ffmpeg tile pipeline, into
  `public/assets/game/dragons/`:
  - `green1.png`, `green2.png`, `red1.png`, `red2.png` — 48×48 × 6 frames each
    (fly + glide per color)
  - `fireball.png` — 32×32 × 7 frames
- Preload spritesheets + anims: `green-fly`, `green-glide`, `red-fly`,
  `red-glide` (8 fps loop), `fireball` (12 fps loop).
- Music conversions (m4a → ogg, libvorbis q5, like prior tracks):
  - `Final Kill.m4a` → `final-kill.ogg`, key `bgm-boss` (arena loop)
  - `Roll Credits.m4a` → `roll-credits.ogg`, key `cue-dawn` (one-shot)
  - Corridors reuse the existing `bgm-trap` (Insanity).

### HUD / presentation
- Boss health: ember pips top-center (fireball icons, dragon-colored), rebuilt
  per phase.
- Code-speak banners: `hero.catch = true`, `dragon.rage = true`, phase
  announcements, `save.dawn = true` on the dawn screen.
- Dawn: fog fill color tweened from night black to warm morning; victory screen
  with stats and MAIN MENU.

### Persistence
- `SaveSystem` defaults gain `hunt.dawn: false` (shallow-merge safe for existing
  saves, same as `hunt.bestRound`).
- Menu surfaces: MainMenu best-round tag unchanged; hunt briefing gains a
  FINALE button once `hunt.dawn` is true (replay), and the round-5 exit routes
  to Finale only while `hunt.dawn` is false.

### Dev/verification aids
- `location.hash === '#finale'` at MainMenu create jumps straight to the Finale
  (manual playtesting + Playwright screenshots of each stage without clearing
  five rounds).
- `npm run build` must pass; fight tuning by playtest. Tunables are named
  constants (catch radius, fireball speeds, ember counts, telegraph durations).

## Out of scope
- No changes to Story mode, Age of War, or the regular Night Hunt rounds beyond
  the round-5 exit hook.
- No new art/audio beyond the five dragon GIFs and the two OST conversions.
- No difficulty settings; tuning happens through the named constants.
