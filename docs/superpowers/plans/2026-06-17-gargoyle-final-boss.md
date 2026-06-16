# Gargoyle Guardian — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Generation note:** Tasks that call Higgsfield MCP tools run in the main session that has Higgsfield connected. Verify visually via PIL composites + programmatic anim checks; headless screenshots may be unreliable (software-WebGL) — a fresh session often restores them.

**Goal:** Produce the Gargoyle Guardian dungeon final boss as reusable sprite assets — `idle/smash/hurl/hurt/death` sheets (96px) + a `rubble` projectile — generated via Higgsfield and wired into Preload + anims. The fight itself is sub-project D.

**Architecture:** Same pipeline as the Wanderer/dragons — one base still, then image-to-video per action with anti-zoom framing, key the grey background ourselves, composite to feet-anchored 96×96 strips. The rubble chunk is one generated image spun into a strip in PIL. C only adds assets + anim defs + Preload loads; no scene/gameplay code.

**Tech Stack:** Phaser 3.90 anims, Vite 5; Higgsfield (nano_banana_pro + seedance) + ffmpeg + Python/Pillow (scripts already in `/tmp/wanderer/`); Playwright for programmatic anim verification.

---

## File Structure

| File | Change |
|---|---|
| `public/assets/game/bosses/gargoyle-{idle,smash,hurl,hurt,death}.png` | Create (96×96 strips) |
| `public/assets/game/bosses/gargoyle-rubble.png` | Create (32×32 spin strip) |
| `src/scenes/Preload.js` | Load the gargoyle sheets (96px) + rubble (32px) |
| `src/utils/anims.js` | Define `gargoyle-{idle,smash,hurl,hurt,death}` + `gargoyle-rubble` |
| `/tmp/wanderer/*.py` | Reuse existing `make_strip.py`, `vid_to_alpha.py` (recreate if a reboot cleared them) |

**Convention match:** the dragons live in `assets/game/dragons/` loaded at 48px; the Wanderer's anims are defined in `anims.js` `createEnemyAnimations`/`createCharacterAnimations`. The gargoyle is an enemy/boss → define in `createEnemyAnimations` (where the dragons are). New `bosses/` dir keeps final-boss art separate from the dragons.

**If the scratch scripts are gone (reboot):** recreate `make_strip.py` and `vid_to_alpha.py` from the [[reference-higgsfield-sprite-pipeline]] memory before Task 2.

---

## Task 1: Generate the base gargoyle still

**Files:** none in repo (scratch `/tmp/wanderer/garg_base.png`).

- [ ] **Step 1: Preflight + generate**

`get_cost` then `generate_image`:

```json
{ "params": {
  "model": "nano_banana_pro",
  "aspect_ratio": "1:1",
  "prompt": "Full-body game boss sprite of a colossal stone-and-iron gargoyle, hulking winged demon statue carved from dark weathered granite with iron rivets and chains, crouched menacing stance, glowing molten cracks, side three-quarter view, full body head to clawed feet centered with empty space around it, lit against a flat neutral grey background, dark-fantasy painterly game art, crisp clean edges, single creature, no text, no border",
  "count": 2
} }
```

Poll `job_status`; pick the cleanest full-body, clearly-gargoyle one. Download to `/tmp/wanderer/garg_base.png`.

- [ ] **Step 2: Eyeball it**

Read `/tmp/wanderer/garg_base.png`. Confirm: full body, clawed feet included, reads as a massive stone gargoyle, clean grey background. Re-roll if poor (this still is the `start_image` for every action clip, so it must be good).

- [ ] **Step 3: No commit** (scratch).

---

## Task 2: idle clip → `gargoyle-idle.png`  (C1)

**Files:** Create `public/assets/game/bosses/gargoyle-idle.png`

- [ ] **Step 1: Generate** — `get_cost` then `generate_video`:

```json
{ "params": {
  "model": "seedance_2_0", "aspect_ratio": "1:1", "resolution": "480p", "duration": 4,
  "medias": [{ "role": "start_image", "value": "<garg_base job_id>" }],
  "prompt": "Wide static full-body shot, locked camera, the colossal stone gargoyle breathes slowly in a menacing crouch, wings shifting slightly, molten cracks pulsing, staying the exact same size and distance, fully visible head to feet, no camera zoom, no walking, flat neutral grey background"
} }
```

- [ ] **Step 2: Convert**

```bash
mkdir -p /home/yurin/.claude/GameDevelopment/public/assets/game/bosses
cd /tmp/wanderer && curl -sL -o garg_idle.mp4 "<video result URL>"
rm -rf gi_rgb gi_rgba && mkdir -p gi_rgb
ffmpeg -y -i garg_idle.mp4 -vf fps=12 gi_rgb/%03d.png >/dev/null 2>&1
python3 vid_to_alpha.py gi_rgb gi_rgba
python3 make_strip.py gi_rgba 8 \
  /home/yurin/.claude/GameDevelopment/public/assets/game/bosses/gargoyle-idle.png --flip --size 96
```

- [ ] **Step 3: Verify** — build a 3× NEAREST preview of the strip on a dark bg and Read it. Confirm 8 frames, consistent size/ground, recognizable gargoyle, transparent bg. Re-roll/re-trim if it morphs or zooms. No commit yet.

---

## Task 3: death clip → `gargoyle-death.png`  (C1)

**Files:** Create `public/assets/game/bosses/gargoyle-death.png`

- [ ] **Step 1: Generate** — `generate_video`:

```json
{ "params": {
  "model": "seedance_2_0", "aspect_ratio": "1:1", "resolution": "480p", "duration": 4,
  "medias": [{ "role": "start_image", "value": "<garg_base job_id>" }],
  "prompt": "Wide static locked-camera shot, the colossal stone gargoyle is destroyed and crumbles apart into rubble, cracking and collapsing into a pile of broken stone, molten cracks dimming to dead grey, ending as a heap of rubble, the camera stays fixed and the subject stays the same size, flat neutral grey background"
} }
```

- [ ] **Step 2: Convert** — as Task 2 Step 2 into `gd_rgb`/`gd_rgba`, then:

```bash
python3 make_strip.py gd_rgba 10 \
  /home/yurin/.claude/GameDevelopment/public/assets/game/bosses/gargoyle-death.png --flip --size 96
```

Keep the full stand→crumble range; the last frame (rubble heap) holds. Trim leading static frames if present.

- [ ] **Step 3: Verify** — Read the strip; confirm a readable collapse ending in rubble. No commit yet.

---

## Task 4: rubble projectile → `gargoyle-rubble.png`  (C1)

**Files:** Create `public/assets/game/bosses/gargoyle-rubble.png`

- [ ] **Step 1: Generate the chunk** — `generate_image`:

```json
{ "params": {
  "model": "nano_banana_pro", "aspect_ratio": "1:1",
  "prompt": "A single jagged chunk of dark stone rubble with glowing molten orange cracks, broken masonry fragment, centered, flat neutral grey background, dark-fantasy game projectile sprite, no text",
  "count": 1
} }
```

Download to `/tmp/wanderer/rubble_raw.png`.

- [ ] **Step 2: Key + spin into a strip**

```bash
cd /tmp/wanderer && python3 -c "
import numpy as np
from PIL import Image
from scipy import ndimage
im = np.asarray(Image.open('rubble_raw.png').convert('RGB')).astype(np.int16)
corners = np.stack([im[0,0], im[0,-1], im[-1,0], im[-1,-1]])
bg = np.median(corners, 0)
dist = np.sqrt(((im - bg) ** 2).sum(2))
mask = dist > 45
lbl, _ = ndimage.label(mask); 
keep = np.argmax(np.bincount(lbl.ravel())[1:]) + 1 if lbl.max() else 0
mask = (lbl == keep)
a = (mask * 255).astype('uint8')
rgba = np.dstack([im.astype('uint8'), a])
chunk = Image.fromarray(rgba, 'RGBA')
bb = chunk.getbbox(); chunk = chunk.crop(bb)
# fit into 28px, spin 8 frames into a 32x32 cell strip
chunk.thumbnail((26, 26), Image.LANCZOS)
strip = Image.new('RGBA', (32 * 8, 32), (0, 0, 0, 0))
for i in range(8):
    r = chunk.rotate(i * 45, expand=True, resample=Image.BICUBIC)
    r.thumbnail((30, 30), Image.LANCZOS)
    strip.alpha_composite(r, (i * 32 + (32 - r.width) // 2, (32 - r.height) // 2))
strip.save('/home/yurin/.claude/GameDevelopment/public/assets/game/bosses/gargoyle-rubble.png')
print('rubble spin strip 8x32 written')
"
```

- [ ] **Step 3: Verify** — Read the strip (3× NEAREST on dark bg); confirm a clean rotating rubble chunk. No commit yet.

---

## Task 5: Integrate C1 + verify — GATE

**Files:** Modify `src/scenes/Preload.js`, `src/utils/anims.js`

- [ ] **Step 1: Load the C1 sheets**

In `src/scenes/Preload.js`, after the dragons/fireball block, add:

```js
    // Dungeon final boss — the Gargoyle Guardian (96px strips) + its rubble projectile.
    const GARG = { frameWidth: 96, frameHeight: 96 }
    this.load.spritesheet('gargoyle-idle', 'assets/game/bosses/gargoyle-idle.png', GARG)
    this.load.spritesheet('gargoyle-death', 'assets/game/bosses/gargoyle-death.png', GARG)
    this.load.spritesheet('gargoyle-rubble', 'assets/game/bosses/gargoyle-rubble.png', { frameWidth: 32, frameHeight: 32 })
```

- [ ] **Step 2: Define the C1 anims**

In `src/utils/anims.js` `createEnemyAnimations`, after the dragon/fireball block, add:

```js
  // Gargoyle Guardian: idle loops slow + heavy; death holds on the rubble heap; rubble spins.
  if (scene.textures.exists('gargoyle-idle')) {
    define(scene, 'gargoyle-idle', 'gargoyle-idle', 6, -1)
    define(scene, 'gargoyle-death', 'gargoyle-death', 10, 0)
    define(scene, 'gargoyle-rubble', 'gargoyle-rubble', 12, -1)
  }
```

(`define` is the existing local helper in `anims.js`; it guards `anims.exists`.)

- [ ] **Step 3: Build**

Run: `npm run build` → `✓ built` (only the pre-existing chunk-size warning).

- [ ] **Step 4: Programmatic anim check + screenshot**

Start `npm run dev` (background). Create `/tmp/wanderer/garg.mjs`:

```js
import { chromium } from 'playwright'
const b = await chromium.launch(); const p = await b.newPage()
p.setDefaultTimeout(120000)
const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => m.type()==='error' && errs.push(m.text()))
await p.goto('http://localhost:5173/', { waitUntil: 'commit', timeout: 120000 })
await p.waitForFunction(() => window.__game && window.__game.scene.getScene('MainMenu'), null, { timeout: 120000 })
const ok = await p.evaluate(() => {
  const s = window.__game.scene.getScene('MainMenu')
  const g = s.add.sprite(s.scale.width/2, s.scale.height/2, 'gargoyle-idle').setDepth(99999).setScale(2)
  g.play('gargoyle-idle')
  window.__garg = g
  return s.anims.exists('gargoyle-idle') && s.anims.exists('gargoyle-death') && s.anims.exists('gargoyle-rubble')
})
await p.waitForTimeout(800)
const playing = await p.evaluate(() => window.__garg.anims.getName())
await p.screenshot({ path: '/tmp/wanderer/garg_ingame.png' })
await b.close()
console.log('anims exist =', ok, '| playing =', playing, '| errors =', errs.length, errs.slice(0,2))
if (!ok || playing !== 'gargoyle-idle' || errs.length) process.exit(1)
```

Run: `cd /tmp/wanderer && npm i playwright >/dev/null 2>&1; node garg.mjs`
Expected: `anims exist = true | playing = gargoyle-idle | errors = 0`. Read `garg_ingame.png` (if GL renders cleanly, the gargoyle shows centered on the menu).

- [ ] **Step 5: Commit C1**

```bash
cd /home/yurin/.claude/GameDevelopment
git add public/assets/game/bosses/gargoyle-idle.png public/assets/game/bosses/gargoyle-death.png \
  public/assets/game/bosses/gargoyle-rubble.png src/scenes/Preload.js src/utils/anims.js
git commit -m "$(printf 'Add Gargoyle boss idle, death, rubble (C1)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

- [ ] **Step 6: GATE** — show the user the idle/death/rubble previews (+ screenshot if clean) before spending credits on the combat anims.

---

## Task 6: smash clip → `gargoyle-smash.png`  (C2)

**Files:** Create `public/assets/game/bosses/gargoyle-smash.png`

- [ ] **Step 1: Generate** — `generate_video`:

```json
{ "params": {
  "model": "seedance_2_0", "aspect_ratio": "1:1", "resolution": "480p", "duration": 4,
  "medias": [{ "role": "start_image", "value": "<garg_base job_id>" }],
  "prompt": "Wide static locked-camera shot, the colossal stone gargoyle rears up raising both massive arms overhead then slams them down onto the ground in a heavy ground-pound smash, then back to stance, staying the exact same size and distance, fully visible, no camera zoom, flat neutral grey background"
} }
```

- [ ] **Step 2: Convert** (into `gs_rgb`/`gs_rgba`) → 8 frames:

```bash
python3 make_strip.py gs_rgba 8 \
  /home/yurin/.claude/GameDevelopment/public/assets/game/bosses/gargoyle-smash.png --flip --size 96
```

Trim to the rear-up→slam range.

- [ ] **Step 3: Verify** — Read the strip; confirm a clear overhead slam. No commit yet.

---

## Task 7: hurl clip → `gargoyle-hurl.png`  (C2)

**Files:** Create `public/assets/game/bosses/gargoyle-hurl.png`

- [ ] **Step 1: Generate** — `generate_video`:

```json
{ "params": {
  "model": "seedance_2_0", "aspect_ratio": "1:1", "resolution": "480p", "duration": 4,
  "medias": [{ "role": "start_image", "value": "<garg_base job_id>" }],
  "prompt": "Wide static locked-camera shot, the colossal stone gargoyle wrenches a chunk of rock from the ground, winds back one arm and hurls it forward like throwing a boulder, then back to stance, staying the exact same size and distance, fully visible, no camera zoom, flat neutral grey background"
} }
```

- [ ] **Step 2: Convert** (into `gh_rgb`/`gh_rgba`) → 8 frames:

```bash
python3 make_strip.py gh_rgba 8 \
  /home/yurin/.claude/GameDevelopment/public/assets/game/bosses/gargoyle-hurl.png --flip --size 96
```

Trim to the wind-up→throw range (release near the last frame).

- [ ] **Step 3: Verify** — Read the strip; confirm a clear throwing motion. No commit yet.

---

## Task 8: hurt clip → `gargoyle-hurt.png`  (C2)

**Files:** Create `public/assets/game/bosses/gargoyle-hurt.png`

- [ ] **Step 1: Generate** — `generate_video`:

```json
{ "params": {
  "model": "seedance_2_0", "aspect_ratio": "1:1", "resolution": "480p", "duration": 3,
  "medias": [{ "role": "start_image", "value": "<garg_base job_id>" }],
  "prompt": "Wide static locked-camera shot, the colossal stone gargoyle recoils and flinches from a hard hit, head and torso jerking back briefly then steadying, chips of stone flying, staying the exact same size and distance, fully visible, no camera zoom, flat neutral grey background"
} }
```

- [ ] **Step 2: Convert** (into `gu_rgb`/`gu_rgba`) → 5 frames (trim to the flinch):

```bash
python3 make_strip.py gu_rgba 5 \
  /home/yurin/.claude/GameDevelopment/public/assets/game/bosses/gargoyle-hurt.png --flip --size 96
```

- [ ] **Step 3: Verify** — Read the strip; confirm a clear flinch. No commit yet.

---

## Task 9: Define C2 anims + load + verify

**Files:** Modify `src/scenes/Preload.js`, `src/utils/anims.js`

- [ ] **Step 1: Load the three combat sheets**

In `src/scenes/Preload.js`, extend the gargoyle block:

```js
    this.load.spritesheet('gargoyle-smash', 'assets/game/bosses/gargoyle-smash.png', GARG)
    this.load.spritesheet('gargoyle-hurl', 'assets/game/bosses/gargoyle-hurl.png', GARG)
    this.load.spritesheet('gargoyle-hurt', 'assets/game/bosses/gargoyle-hurt.png', GARG)
```

- [ ] **Step 2: Define the combat anims**

In `src/utils/anims.js`, inside the `if (scene.textures.exists('gargoyle-idle'))` block, add:

```js
    define(scene, 'gargoyle-smash', 'gargoyle-smash', 12, 0)
    define(scene, 'gargoyle-hurl', 'gargoyle-hurl', 12, 0)
    define(scene, 'gargoyle-hurt', 'gargoyle-hurt', 12, 0)
```

- [ ] **Step 3: Build** — `npm run build` → `✓ built`.

- [ ] **Step 4: Programmatic check** — extend `/tmp/wanderer/garg.mjs` (or a copy) to assert all six anims exist:

```js
const all = await p.evaluate(() => ['idle','smash','hurl','hurt','death','rubble'].every(k => window.__game.scene.getScene('MainMenu').anims.exists('gargoyle-'+k)))
```
Expect `all = true`, 0 errors.

- [ ] **Step 5: Commit**

```bash
git add public/assets/game/bosses/gargoyle-smash.png public/assets/game/bosses/gargoyle-hurl.png \
  public/assets/game/bosses/gargoyle-hurt.png src/scenes/Preload.js src/utils/anims.js
git commit -m "$(printf 'Add Gargoyle boss smash, hurl, hurt anims (C2)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

- [ ] **Step 6: Hand off the push** — `! git -C /home/yurin/.claude/GameDevelopment push`

---

## Self-Review (against the spec)

- **Gargoyle, grounded, stone-and-iron, ~96px** → Task 1 prompt, `--size 96` throughout. ✓
- **idle/smash/hurl/hurt/death + rubble** → Tasks 2,6,7,8,3 + Task 4; anim defs Tasks 5,9. ✓
- **Higgsfield → grey-key → strip, anti-zoom framing** → every action clip prompt says "wide static, locked camera, same size"; `vid_to_alpha` grey-key. ✓
- **C = assets + anim defs + Preload only; fight is D** → no scene/gameplay edits; only Preload + anims. ✓
- **Phasing C1 (idle/death/rubble) then C2 (smash/hurl/hurt)** → Tasks 2–5 (C1, with a GATE) then 6–9 (C2). ✓
- **Verify via composites + programmatic anim checks** → Read previews each task; `garg.mjs` asserts `anims.exists` + `play` + 0 errors. ✓

No placeholders — every step has exact prompts/commands. Names consistent: `gargoyle-{idle,smash,hurl,hurt,death,rubble}`, `GARG` frame config, `bosses/` dir, the `if (scene.textures.exists('gargoyle-idle'))` guard block reused in Tasks 5 + 9.
