# The Wanderer — Animated Lantern Hero for Night Hunt

**Date:** 2026-06-15
**Status:** Approved design
**Mode scope:** Night Hunt only

## Summary

Add a new, fully-animated hero — a cloaked **lantern wanderer** — selectable in
Night Hunt. Unlike the four 32px platformer heroes (Frog/Pink/Mask/Virtual) and
the single-frame static hunt skins (Knight/Golem), the Wanderer is a
**higher-fidelity, distinct-looking** hero with its own animation set, **including
a death animation** — a first for the engine, which until now only played `hit`
on damage and snapped to a static overlay on death.

Frames are generated with **Higgsfield** (connected via MCP) and converted into
the project's horizontal-strip spritesheet format.

## Decisions (locked)

| Question | Decision |
|---|---|
| Visual style | Higher-fidelity / distinct look (NOT pixelated down to 32px) |
| Mode scope | **Night Hunt only** |
| Generation approach | **2D image-to-video** (Higgsfield), self-contained with `ffmpeg` |
| Character | Cloaked **lantern wanderer** — fits the torch/light mechanic, reads in the dark |
| Frame size | **64×64** source frames, displayed at ~0.55 scale |
| Animations | `idle`, `run`, `hit`, `death` |
| Workflow | Claude generates via Higgsfield MCP **and** converts **and** wires it in |

### Why 2D image-to-video over 3D rigged
The 3D path (`generate_3d` + mocap `animation_actions` + `enable_animation`)
gives the most consistent motion, but outputs a **GLB mesh** — extracting sprite
frames would require standing up a headless Blender/three.js renderer. The 2D
image-to-video path is fully self-contained with the tools already in hand plus
`ffmpeg` (already used in this project for the dragon/cloud strips). The one
weakness of 2D — loop seams on `idle`/`run` — is neutralized by authoring those
two as **yoyo/palindrome** strips (seamless by construction). 3D remains the
fallback if 2D loop quality disappoints.

## Hero spec

- **Key:** `hunt-lantern` · **Label:** `WANDERER`
- **Asset dir:** `public/assets/game/players/hunt-lantern/{idle,run,hit,death}.png`
  (matches the animated-hero convention; loaded outside the 32px `CHARACTERS` loop).
- **Frame size:** 64×64 (2× the roster's detail). On-screen scale ~0.55 so the
  footprint matches the other heroes but reads crisper. Final scale/origin/body
  tuned during integration.
- **Animations:**
  - `idle` — ~8 frames, gentle breathing + lantern sway, **loop** (yoyo).
  - `run` — ~8 frames, walk cycle at hunt pace, **loop**.
  - `hit` — ~6 frames, flinch/stagger, **one-shot**.
  - `death` — ~10 frames, collapse + lantern goes out, **one-shot, holds last frame**.
- **`huntOnly: true`** flag — appears in the Night Hunt roster but NOT in Story's
  hero carousel, and never overwrites the saved campaign character.

## Conversion pipeline (scripted, deterministic)

1. `generate_image` → one clean lantern-wanderer **still** (full body, side/¾ view,
   lantern lit, neutral background, consistent lighting). Model: a character model
   (e.g. `nano_banana_pro` / `soul_2`).
2. `remove_background` (image) → clean cutout reference.
3. **Per action**, `generate_video` image-to-video, `start_image` = the same still,
   short duration (~3–4s), action-specific prompt → identity stays locked across
   clips.
4. `remove_background` (video) per clip → transparent action footage.
5. `ffmpeg` — extract N evenly-spaced frames per clip; trim to the
   loopable/meaningful range.
6. **PIL** — trim each frame's transparent bbox, center on a 64×64 canvas with a
   consistent **feet-at-bottom** anchor.
7. `ffmpeg tile=Nx1` → one horizontal strip per action → the asset dir.

Loop handling: `idle` and `run` strips are built as palindromes (or the anim is
defined with yoyo) so they loop without a visible seam.

## Game integration

- **`src/scenes/Preload.js`** — load the four 64px strips with
  `{ frameWidth: 64, frameHeight: 64 }`, separate from the 32px `CHARACTERS` loop.
- **`src/utils/anims.js`** — define `hunt-lantern-{idle,run,hit,death}`: idle/run
  loop (`repeat: -1`), hit/death one-shot hold (`repeat: 0`).
- **`src/scenes/NightHunt.js`** `HEROES` — add
  `{ key:'hunt-lantern', label:'WANDERER', kind:'anim', scale, origin, body, off }`.
  The existing locomotion code (idle↔run swap, `restPose()`) drives idle/run
  automatically for `kind:'anim'` heroes.
- **Death hookup** — `playerDeath()`: if the active hero has a `death` anim, play
  it and **delay the CAUGHT overlay** until `animationcomplete`; heroes without a
  death anim keep today's instant overlay. Implemented generically so future
  heroes can opt in. (Optional second hookup: the finale's burn-death `die()`.)
- **`hit`** — wired to a non-lethal damage/struggle moment if a clean trigger
  exists; otherwise generated and available. Death is the guaranteed new hookup.
- **`src/scenes/GameSelect.js`** `HERO_CARDS` — add
  `{ key:'hunt-lantern', label:'WANDERER', anim:true, huntOnly:true, scale }`.
- **`src/scenes/ModePage.js`** — Story's carousel filter becomes
  `HERO_CARDS.filter(h => h.anim && !h.huntOnly)`; the `cycle()` campaign-character
  guard becomes `if (h.anim && !h.huntOnly)`. Hunt (`hero:'all'`) shows everyone.

## Cost & de-risking

- **Vertical slice first:** generate the base still + **only the `idle`** action,
  run it through the full pipeline and into the game at 64px, and review quality
  **before** spending credits on `run`/`hit`/`death`.
- `get_cost`-preflight each generation.
- Balance at design time: **1419 credits, Max plan**. Rough budget for the full
  hero: ~5 images + ~4 videos + background removals — comfortably affordable.

## Out of scope

- Pixel-art (32px) styling — explicitly rejected in favor of the distinct look.
- Story / Age of War availability.
- A death animation for the existing heroes (the hookup is generic, but only the
  Wanderer ships a death asset).
