# The Wanderer — Lantern Hero Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Generation note:** Tasks that call Higgsfield MCP tools (`generate_image`, `generate_video`, `remove_background`, `get_cost`, `job_status`) must run in the **main session** that has the Higgsfield MCP connected — they spend credits and need a human glance at each result. The pure-code integration tasks can be subagent-dispatched.

**Goal:** Add a fully-animated, higher-fidelity "lantern wanderer" hero (`hunt-lantern`) selectable in Night Hunt only, with idle/run/hit/death animations — including the engine's first real death animation.

**Architecture:** Generate frames with Higgsfield (one character still → image-to-video per action), convert each clip into a 64×64 horizontal-strip spritesheet with `ffmpeg` + a small Python compositor, then wire the hero into the existing `kind:'anim'` code paths plus a new generic death hookup in `playerDeath()`.

**Tech Stack:** Phaser 3.90, Vite 5, vanilla JS ES modules; Higgsfield MCP (Seedance/Nano Banana); `ffmpeg` + Python/Pillow for frame conversion; Playwright (headless chromium) for in-game verification.

---

## File Structure

| File | Role | Change |
|---|---|---|
| `/tmp/wanderer/make_strip.py` | Frame-dir → horizontal strip compositor (scratch tool, not committed) | Create |
| `/tmp/wanderer/*` | Scratch: downloaded media, extracted frames (not committed) | Create |
| `public/assets/game/players/hunt-lantern/{idle,run,hit,death}.png` | The four 64px strips | Create |
| `src/scenes/Preload.js` | Load the four strips at 64px | Modify |
| `src/utils/anims.js` | Define `hunt-lantern-{idle,run,hit,death}` | Modify |
| `src/scenes/NightHunt.js` | `HEROES` entry + generic death hookup in `playerDeath()` | Modify |
| `src/scenes/GameSelect.js` | `HERO_CARDS` entry | Modify |
| `src/scenes/ModePage.js` | `huntOnly` filter + campaign-guard + `cardScale` | Modify |
| `src/scenes/MainMenu.js` | dev `#wanderer` hash (jump into hunt as the wanderer) | Modify |
| `src/main.js` | dev-only `window.__game` handle for tests | Modify |

**Conventions to match:** animated heroes live in `players/<key>/<action>.png`; static hunt heroes (`hunt-hero`, `hunt-golem`) are single images. The existing `kind:'anim'` locomotion code (`NightHunt.js:383-387`, `restPose()` `:415-419`) auto-plays `${key}-idle`/`-run`, so idle/run need no new scene code. Dev hashes `#finale`/`#arena` already live in `MainMenu.create()` — `#wanderer` follows the same pattern.

---

## Task 1: Build & self-test the strip compositor

No generation yet — get the deterministic converter working first so later tasks just feed it frames.

**Files:**
- Create: `/tmp/wanderer/make_strip.py`

- [ ] **Step 1: Create the scratch workspace and the compositor**

```bash
mkdir -p /tmp/wanderer
```

Create `/tmp/wanderer/make_strip.py`:

```python
#!/usr/bin/env python3
"""Build a horizontal sprite strip from a directory of extracted RGBA frames.

Usage: make_strip.py <frames_dir> <N> <out.png> [--size 64]

Picks N evenly-spaced frames from the sorted PNGs in frames_dir, computes ONE
union alpha bounding box across them (so the character keeps a consistent size
and ground position — no per-frame "breathing"), uniformly scales that box to
fit the cell, and pastes each frame bottom-centered (feet anchored) onto an
N*SIZE x SIZE strip.
"""
import sys, glob, os
from PIL import Image


def main():
    frames_dir, n, out = sys.argv[1], int(sys.argv[2]), sys.argv[3]
    size = int(sys.argv[sys.argv.index('--size') + 1]) if '--size' in sys.argv else 64

    files = sorted(glob.glob(os.path.join(frames_dir, '*.png')))
    if not files:
        sys.exit(f'no PNG frames in {frames_dir}')
    idxs = [0] if n == 1 else [round(i * (len(files) - 1) / (n - 1)) for i in range(n)]
    picked = [Image.open(files[i]).convert('RGBA') for i in idxs]

    union = None
    for im in picked:
        bb = im.getbbox()  # tight box of non-transparent pixels
        if bb is None:
            continue
        union = bb if union is None else (
            min(union[0], bb[0]), min(union[1], bb[1]),
            max(union[2], bb[2]), max(union[3], bb[3]))
    if union is None:
        sys.exit('all picked frames are fully transparent')

    uw, uh = union[2] - union[0], union[3] - union[1]
    scale = min(size / uw, size / uh)
    sw, sh = max(1, round(uw * scale)), max(1, round(uh * scale))

    strip = Image.new('RGBA', (n * size, size), (0, 0, 0, 0))
    for k, im in enumerate(picked):
        crop = im.crop(union).resize((sw, sh), Image.LANCZOS)
        x = k * size + (size - sw) // 2  # horizontal center
        y = size - sh                    # bottom (feet) anchor
        strip.paste(crop, (x, y), crop)
    strip.save(out)
    print(f'wrote {out}  ({n} frames, cell {size}px, char {sw}x{sh})')


if __name__ == '__main__':
    main()
```

- [ ] **Step 2: Write a self-test that fabricates frames and runs the compositor**

Create `/tmp/wanderer/selftest.py`:

```python
import os, subprocess, sys
from PIL import Image, ImageDraw

d = '/tmp/wanderer/_t'
os.makedirs(d, exist_ok=True)
# 6 frames: a white blob that moves so union-bbox spans all positions
for i in range(6):
    im = Image.new('RGBA', (200, 300), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    dr.ellipse([60 + i * 8, 120, 140 + i * 8, 280], fill=(255, 255, 255, 255))
    im.save(f'{d}/{i:03d}.png')

subprocess.check_call([sys.executable, '/tmp/wanderer/make_strip.py', d, '4', '/tmp/wanderer/_t.png'])
out = Image.open('/tmp/wanderer/_t.png')
assert out.size == (4 * 64, 64), out.size
# every cell must contain opaque pixels (blob landed in each)
for c in range(4):
    cell = out.crop((c * 64, 0, c * 64 + 64, 64))
    assert cell.getbbox() is not None, f'cell {c} empty'
print('SELFTEST OK', out.size)
```

- [ ] **Step 3: Run the self-test**

Run: `cd /tmp/wanderer && python3 selftest.py`
Expected: prints `wrote ...` then `SELFTEST OK (256, 64)`. (If Pillow is missing: `pip install --user Pillow` or `python3 -m pip install Pillow`.)

- [ ] **Step 4: No commit** — `/tmp/wanderer/` is scratch, never committed.

---

## Task 2: Generate the base wanderer still

**Files:** none in repo (output is scratch `/tmp/wanderer/base.png`).

- [ ] **Step 1: Confirm valid image aspect ratios & cost**

Call `models_explore` with `{ type: 'image' }` and note the `aspect_ratios` accepted by `nano_banana_pro`. Pick the closest to **portrait 3:4** (full standing figure).

Call `generate_image` with `get_cost: true` (same params as Step 2) to preflight credits. Proceed only if the cost is reasonable (≈ tens of credits).

- [ ] **Step 2: Generate the still**

Call `generate_image`:

```json
{ "params": {
  "model": "nano_banana_pro",
  "aspect_ratio": "<portrait ratio from Step 1>",
  "prompt": "Full-body game character concept of a lone cloaked wanderer holding a glowing lantern in one hand, hooded traveler in a tattered dark-teal cloak, side-on three-quarter view, standing upright, full body head-to-feet centered with empty space around it, warm lantern rim-light against a flat neutral grey background, painterly fantasy game art, crisp clean edges, single character, no text, no border",
  "count": 2
} }
```

Poll `job_status` until complete; `reveal_generation` / `job_display` to view both candidates. Pick the cleanest full-body, clearly-lantern-lit one.

- [ ] **Step 3: Download the chosen still and cut out the background**

`curl -L -o /tmp/wanderer/base_raw.png "<asset URL from the chosen result>"`

Call `remove_background` `{ params: { media_id: "<chosen image job_id>", media_type: "image" } }`. Poll, then `curl -L -o /tmp/wanderer/base.png "<transparent result URL>"`.

- [ ] **Step 4: Eyeball the cutout**

Open `/tmp/wanderer/base.png` (Read tool renders it). Confirm: full body visible, feet included, lantern lit, clean transparent edges. If poor, re-roll Step 2 with a tweaked prompt before spending credits on video.

- [ ] **Step 5: No commit** (scratch only).

---

## Task 3: Generate the IDLE clip → `idle.png` (vertical slice asset)

**Files:**
- Create: `public/assets/game/players/hunt-lantern/idle.png`

- [ ] **Step 1: Preflight + generate the idle video**

`get_cost` first (same params, `get_cost:true`). Then call `generate_video`:

```json
{ "params": {
  "model": "seedance_2_0",
  "medias": [{ "role": "start_image", "value": "<base still job_id>" }],
  "duration": 4,
  "prompt": "The hooded lantern wanderer stands still and breathes gently, lantern swaying slightly, cloak shifting in a faint breeze, feet planted, camera locked, no walking, no camera movement, neutral background",
  "count": 1
} }
```

Poll `job_status` to completion.

- [ ] **Step 2: Strip the background from the clip**

`remove_background` `{ params: { media_id: "<video job_id>", media_type: "video" } }`. Poll, then download:
`curl -L -o /tmp/wanderer/idle.webm "<transparent video URL>"` (output is alpha webm/mov).

- [ ] **Step 3: Extract frames**

```bash
mkdir -p /tmp/wanderer/idle_frames && rm -f /tmp/wanderer/idle_frames/*.png
ffmpeg -y -i /tmp/wanderer/idle.webm -vf fps=24 /tmp/wanderer/idle_frames/%03d.png
ls /tmp/wanderer/idle_frames | head
```

If the first few frames are a static hold (common with image-to-video), delete them so the loop starts in motion:
`rm /tmp/wanderer/idle_frames/00{1,2,3}.png` (adjust by eyeballing).

- [ ] **Step 4: Composite the strip (8 frames)**

```bash
python3 /tmp/wanderer/make_strip.py /tmp/wanderer/idle_frames 8 \
  public/assets/game/players/hunt-lantern/idle.png
```

Expected: `wrote .../idle.png  (8 frames, cell 64px, char WxH)`.

- [ ] **Step 5: Verify the strip visually**

Read `public/assets/game/players/hunt-lantern/idle.png`. Confirm 8 side-by-side frames, consistent size/ground line, transparent background, recognizable wanderer. Re-roll the clip or adjust frame trimming if it morphs badly. (`idle` loops via **yoyo** in the anim def, so a perfect forward-loop isn't required — gentle motion is enough.)

- [ ] **Step 6: No commit yet** — committed together with the integration in Task 4.

---

## Task 4: Wire idle-only into the game — REVIEW GATE

Make the wanderer fully selectable and idling in Night Hunt with just the idle asset, before spending credits on the other three animations.

**Files:**
- Modify: `src/scenes/Preload.js`
- Modify: `src/utils/anims.js`
- Modify: `src/scenes/NightHunt.js:77-83` (HEROES)
- Modify: `src/scenes/GameSelect.js:9-16` (HERO_CARDS)
- Modify: `src/scenes/ModePage.js:80,95-104,106-117`
- Modify: `src/scenes/MainMenu.js` (dev hash)
- Modify: `src/main.js` (dev game handle)

- [ ] **Step 1: Load the strip in Preload**

In `src/scenes/Preload.js`, after the dragons/fireball block (`:64`), add:

```js
    // NIGHT HUNT — the Wanderer (animated lantern hero, 64px strips, hunt-only).
    const LANT = { frameWidth: 64, frameHeight: 64 }
    this.load.spritesheet('hunt-lantern-idle', 'assets/game/players/hunt-lantern/idle.png', LANT)
```

(Run/hit/death loads are added in Task 8.)

- [ ] **Step 2: Define the idle anim**

In `src/utils/anims.js`, inside `createCharacterAnimations`, after the `for (const c of CHARACTERS)` loop closes, add:

```js
  // The Wanderer (hunt-only, 64px). idle loops via yoyo; run/hit/death added later.
  if (scene.textures.exists('hunt-lantern-idle')) {
    if (!scene.anims.exists('hunt-lantern-idle')) {
      scene.anims.create({
        key: 'hunt-lantern-idle',
        frames: scene.anims.generateFrameNumbers('hunt-lantern-idle'),
        frameRate: 8,
        repeat: -1,
        yoyo: true,
      })
    }
  }
```

- [ ] **Step 3: Add the HEROES entry (NightHunt)**

In `src/scenes/NightHunt.js`, in the `HEROES` array (`:77-83`), after the `hunt-golem` line add:

```js
  { key: 'hunt-lantern', label: 'WANDERER', kind: 'anim', scale: 0.55, origin: 0.78, body: [18, 16], off: [23, 40] },
```

(`scale`/`origin`/`body`/`off` are starting values; tuned in Step 9 against the live view.)

- [ ] **Step 4: Add the roster card (GameSelect)**

In `src/scenes/GameSelect.js`, in `HERO_CARDS` (`:9-16`), after the `hunt-golem` line add:

```js
  { key: 'hunt-lantern', label: 'WANDERER', anim: true, huntOnly: true, cardScale: 1.1 },
```

- [ ] **Step 5: Respect `huntOnly` in ModePage**

In `src/scenes/ModePage.js`:

`buildHeroCarousel` (`:80`) — change the story branch so hunt-only heroes never show in Story:
```js
    this.roster = info.hero === 'all' ? HERO_CARDS : HERO_CARDS.filter((h) => h.anim && !h.huntOnly)
```

`cycle` (`:100-103`) — never overwrite the campaign character with a hunt-only hero:
```js
    if (h.anim && !h.huntOnly) {
      SaveSystem.setCharacter(h.key)
      this.registry.set('character', h.key)
    }
```

`showHero` (`:109-111`) — use the smaller carousel scale for big sprites:
```js
    if (h.anim) {
      this.heroSpr = this.add.sprite(this.heroX, this.heroY, `${h.key}-idle`).setScale(h.cardScale || 2.2)
      this.heroSpr.play(`${h.key}-idle`)
    } else {
```

- [ ] **Step 6: Add the dev `#wanderer` hash (MainMenu)**

In `src/scenes/MainMenu.js`, alongside the existing `#finale`/`#arena` hash block at the top of `create()`, add:

```js
    if (window.location.hash === '#wanderer') {
      this.registry.set('huntHero', 'hunt-lantern')
      this.scene.start('NightHunt')
      return
    }
```

- [ ] **Step 7: Expose the game in dev (main.js)**

In `src/main.js`, change `new Phaser.Game(` to capture the instance and add a dev handle for tests:

```js
const game = new Phaser.Game(
  createConfig([
    // ...unchanged scene list...
  ]),
)
if (import.meta.env.DEV) window.__game = game
```

- [ ] **Step 8: Build**

Run: `npm run build`
Expected: `✓ built` (only the pre-existing chunk-size warning; no errors).

- [ ] **Step 9: Playwright smoke — wanderer idles in the hunt, no console errors**

Start the dev server in the background: `npm run dev` (note the printed port; default `5173`).

Create `/tmp/wanderer/smoke.mjs`:

```js
import { chromium } from 'playwright'
const errs = []
const b = await chromium.launch()
const p = await b.newPage()
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
p.on('pageerror', (e) => errs.push(String(e)))
await p.goto('http://localhost:5173/#wanderer', { waitUntil: 'networkidle' })
await p.waitForTimeout(2500)
const anim = await p.evaluate(() =>
  window.__game?.scene?.getScene('NightHunt')?.player?.anims?.getName())
await p.screenshot({ path: '/tmp/wanderer/smoke.png' })
await b.close()
console.log('anim =', anim, '| errors =', errs.length, errs.slice(0, 3))
if (anim !== 'hunt-lantern-idle' || errs.length) process.exit(1)
```

Run:
```bash
cd /tmp/wanderer && npm i playwright >/dev/null 2>&1; node smoke.mjs
```
(If chromium is missing: `npx playwright install chromium`.)
Expected: `anim = hunt-lantern-idle | errors = 0`. Read `/tmp/wanderer/smoke.png` and confirm the wanderer is visible in the hunt scene.

- [ ] **Step 10: Tune scale/origin/body against the screenshot**

From the screenshot, adjust the `HEROES` entry (Step 3): if the hero is too big/small change `scale`; if it floats or sinks change `origin`; if the collision feels off change `body`/`off`. Re-run Step 8–9 until it sits correctly on the ground at a size comparable to the other heroes.

- [ ] **Step 11: Commit the vertical slice**

```bash
git add public/assets/game/players/hunt-lantern/idle.png \
  src/scenes/Preload.js src/utils/anims.js src/scenes/NightHunt.js \
  src/scenes/GameSelect.js src/scenes/ModePage.js src/scenes/MainMenu.js src/main.js
git commit -m "$(printf 'Add Wanderer hunt hero (idle)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

- [ ] **Step 12: GATE — show the user**

Report the screenshot + result and confirm the look is good before generating run/hit/death. **Do not proceed past this gate without approval** (it gates further credit spend).

---

## Task 5: Generate the RUN clip → `run.png`

**Files:** Create `public/assets/game/players/hunt-lantern/run.png`

- [ ] **Step 1: Generate** — `get_cost` then `generate_video`:

```json
{ "params": {
  "model": "seedance_2_0",
  "medias": [{ "role": "start_image", "value": "<base still job_id>" }],
  "duration": 4,
  "prompt": "Side view of the hooded lantern wanderer walking forward at a steady pace, full walk cycle, legs striding, lantern swinging with each step, cloak flowing, locked camera, character stays centered, neutral background",
  "count": 1
} }
```

- [ ] **Step 2: Background-strip + extract**

```bash
# remove_background (video) -> download to /tmp/wanderer/run.webm, then:
mkdir -p /tmp/wanderer/run_frames && rm -f /tmp/wanderer/run_frames/*.png
ffmpeg -y -i /tmp/wanderer/run.webm -vf fps=24 /tmp/wanderer/run_frames/%03d.png
```

- [ ] **Step 3: Select a loopable stride**

Eyeball `run_frames/`. Keep a contiguous range that is ~one clean stride where the first and last poses are similar (delete frames outside it). Run differs from idle: it must loop **forward** (no yoyo), so the start≈end pose matters.

- [ ] **Step 4: Composite (8 frames)**

```bash
python3 /tmp/wanderer/make_strip.py /tmp/wanderer/run_frames 8 \
  public/assets/game/players/hunt-lantern/run.png
```

- [ ] **Step 5: Verify** — Read the strip; confirm a readable forward walk cycle, consistent ground line. (In-game loop check happens in Task 8/9.) No commit yet.

---

## Task 6: Generate the HIT clip → `hit.png`

**Files:** Create `public/assets/game/players/hunt-lantern/hit.png`

- [ ] **Step 1: Generate** — `get_cost` then `generate_video`:

```json
{ "params": {
  "model": "seedance_2_0",
  "medias": [{ "role": "start_image", "value": "<base still job_id>" }],
  "duration": 3,
  "prompt": "The hooded lantern wanderer flinches and staggers backward from a sudden hit, recoiling briefly then steadying, lantern jolting, locked camera, character centered, neutral background",
  "count": 1
} }
```

- [ ] **Step 2: Strip + extract** (as Task 5 Step 2, into `/tmp/wanderer/hit_frames`).

- [ ] **Step 3: Trim to the recoil** — keep the flinch-and-return range (~the first second).

- [ ] **Step 4: Composite (6 frames)**

```bash
python3 /tmp/wanderer/make_strip.py /tmp/wanderer/hit_frames 6 \
  public/assets/game/players/hunt-lantern/hit.png
```

- [ ] **Step 5: Verify** — Read the strip; confirm a clear stagger. No commit yet.

---

## Task 7: Generate the DEATH clip → `death.png`

**Files:** Create `public/assets/game/players/hunt-lantern/death.png`

- [ ] **Step 1: Generate** — `get_cost` then `generate_video`:

```json
{ "params": {
  "model": "seedance_2_0",
  "medias": [{ "role": "start_image", "value": "<base still job_id>" }],
  "duration": 4,
  "prompt": "The hooded lantern wanderer collapses and falls to the ground defeated, sinking down, lantern dropping and its flame going out, ending crumpled on the floor, locked camera, character centered, neutral background",
  "count": 1
} }
```

- [ ] **Step 2: Strip + extract** (into `/tmp/wanderer/death_frames`).

- [ ] **Step 3: Trim** — keep from standing through fully-collapsed; the **last frame is the final resting pose** (it will hold).

- [ ] **Step 4: Composite (10 frames)**

```bash
python3 /tmp/wanderer/make_strip.py /tmp/wanderer/death_frames 10 \
  public/assets/game/players/hunt-lantern/death.png
```

- [ ] **Step 5: Verify** — Read the strip; confirm a readable stand → collapse, last frame settled. No commit yet.

---

## Task 8: Load + define run/hit/death anims

**Files:**
- Modify: `src/scenes/Preload.js`
- Modify: `src/utils/anims.js`

- [ ] **Step 1: Load the three new strips**

In `src/scenes/Preload.js`, extend the Wanderer block from Task 4 Step 1:

```js
    this.load.spritesheet('hunt-lantern-run', 'assets/game/players/hunt-lantern/run.png', LANT)
    this.load.spritesheet('hunt-lantern-hit', 'assets/game/players/hunt-lantern/hit.png', LANT)
    this.load.spritesheet('hunt-lantern-death', 'assets/game/players/hunt-lantern/death.png', LANT)
```

- [ ] **Step 2: Define run (loop), hit + death (one-shot hold)**

In `src/utils/anims.js`, inside the Wanderer block added in Task 4 Step 2, after the idle `create`, add:

```js
    if (scene.textures.exists('hunt-lantern-run') && !scene.anims.exists('hunt-lantern-run')) {
      scene.anims.create({ key: 'hunt-lantern-run', frames: scene.anims.generateFrameNumbers('hunt-lantern-run'), frameRate: 10, repeat: -1 })
    }
    if (scene.textures.exists('hunt-lantern-hit') && !scene.anims.exists('hunt-lantern-hit')) {
      scene.anims.create({ key: 'hunt-lantern-hit', frames: scene.anims.generateFrameNumbers('hunt-lantern-hit'), frameRate: 12, repeat: 0 })
    }
    if (scene.textures.exists('hunt-lantern-death') && !scene.anims.exists('hunt-lantern-death')) {
      scene.anims.create({ key: 'hunt-lantern-death', frames: scene.anims.generateFrameNumbers('hunt-lantern-death'), frameRate: 10, repeat: 0 })
    }
```

- [ ] **Step 3: Build** — `npm run build` → `✓ built`, no errors.

- [ ] **Step 4: Playwright — run cycle plays when moving**

With `npm run dev` running, create `/tmp/wanderer/run.mjs`:

```js
import { chromium } from 'playwright'
const b = await chromium.launch(); const p = await b.newPage()
await p.goto('http://localhost:5173/#wanderer', { waitUntil: 'networkidle' })
await p.waitForTimeout(2000)
await p.keyboard.down('d')          // walk right
await p.waitForTimeout(600)
const moving = await p.evaluate(() => window.__game.scene.getScene('NightHunt').player.anims.getName())
await p.keyboard.up('d')
await b.close()
console.log('moving anim =', moving)
if (moving !== 'hunt-lantern-run') process.exit(1)
```

Run: `cd /tmp/wanderer && node run.mjs` → expect `moving anim = hunt-lantern-run`.

- [ ] **Step 5: Commit**

```bash
git add public/assets/game/players/hunt-lantern/run.png \
  public/assets/game/players/hunt-lantern/hit.png \
  public/assets/game/players/hunt-lantern/death.png \
  src/scenes/Preload.js src/utils/anims.js
git commit -m "$(printf 'Add Wanderer run, hit, death strips\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 9: Generic death hookup in `playerDeath()`

Make `playerDeath()` play the hero's death animation (if it has one) and delay the CAUGHT overlay until the animation finishes. Heroes without a death anim keep today's instant behavior.

**Files:**
- Modify: `src/scenes/NightHunt.js:1587-1622`

- [ ] **Step 1: Refactor the overlay into its own method and gate it behind the death anim**

Replace the body of `playerDeath()` (`:1587-1622`). Keep all the lines through `CombatSystem.shake(...)` unchanged, then replace the best-round + overlay tail with a split:

```js
  playerDeath() {
    if (this.gameOver) return
    this.gameOver = true
    this.trapped = false
    if (this.trapText) this.trapText.setVisible(false)
    this.player.body.setVelocity(0, 0)
    this.killCloud() // no weather over the death overlay
    for (const h of this.hunters) h.body.setVelocity(0, 0)
    Audio.play(this, SFX.playerDie)
    Music.cueStop(this, { fade: 500 })
    Music.play(this, 'bgm-tension', { fade: 400 })
    this.time.delayedCall(DEATH_TENSION_HOLD * 1000, () => Music.play(this, 'bgm-main', { fade: 1400 }))
    CombatSystem.shake(this, 0.012, 320)
    // roguelite stakes: remember the deepest round reached across sessions
    const hunt = SaveSystem.data.hunt
    const newBest = this.round > hunt.bestRound
    if (newBest) {
      hunt.bestRound = this.round
      SaveSystem.save()
    }
    const sub = newBest ? `Reached round ${this.round} — NEW BEST!` : `Reached round ${this.round} — best ${hunt.bestRound}`

    // Heroes with a death animation play it out before the overlay; others snap to
    // a rest pose and show the overlay immediately (unchanged behavior).
    this._overlayShown = false
    const deathKey = `${this.heroKey}-death`
    if (this.anims.exists(deathKey)) {
      this.player.play(deathKey)
      this.player.once(`animationcomplete-${deathKey}`, () => this.showCaughtOverlay(sub, newBest))
      // safety net: never let a missed event soft-lock the death screen
      this.time.delayedCall(2000, () => this.showCaughtOverlay(sub, newBest))
    } else {
      this.restPose()
      this.showCaughtOverlay(sub, newBest)
    }
  }

  // The CAUGHT screen: dim, title, run reached, RETRY + MAIN MENU. Idempotent so the
  // death-anim path and its safety-net timer can't double-build it.
  showCaughtOverlay(sub, newBest) {
    if (this._overlayShown) return
    this._overlayShown = true
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0b0d1a, 0.72).setOrigin(0, 0).setScrollFactor(0).setDepth(11000)
    pixelText(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 34, 'CAUGHT', 26, '#e06a6a').setScrollFactor(0).setDepth(11001)
    pixelText(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 4, sub, 9, newBest ? '#ffe066' : '#cdd7ee').setScrollFactor(0).setDepth(11001)
    const retry = panelButton(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 28, 'RETRY', () => this.scene.restart({ round: this.round }), { width: 150, depth: 11001 })
    const menu = panelButton(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 64, 'MAIN MENU', () => this.scene.start('MainMenu'), { width: 150, depth: 11001 })
    for (const b of [retry, menu]) {
      b.bg.setScrollFactor(0)
      b.text.setScrollFactor(0)
    }
  }
```

Note: the original `this.restPose()` call near the top is intentionally removed — it's now only in the no-death-anim branch so it can't override the death animation.

- [ ] **Step 2: Build** — `npm run build` → `✓ built`, no errors.

- [ ] **Step 3: Playwright — death anim plays, overlay delayed**

With `npm run dev` running, create `/tmp/wanderer/death.mjs`:

```js
import { chromium } from 'playwright'
const b = await chromium.launch(); const p = await b.newPage()
await p.goto('http://localhost:5173/#wanderer', { waitUntil: 'networkidle' })
await p.waitForTimeout(2000)
await p.evaluate(() => window.__game.scene.getScene('NightHunt').playerDeath())
await p.waitForTimeout(150)
const duringAnim = await p.evaluate(() => {
  const s = window.__game.scene.getScene('NightHunt')
  return { anim: s.player.anims.getName(), overlay: !!s._overlayShown }
})
await p.waitForTimeout(2500)
const after = await p.evaluate(() => !!window.__game.scene.getScene('NightHunt')._overlayShown)
await p.screenshot({ path: '/tmp/wanderer/death.png' })
await b.close()
console.log('during =', duringAnim, '| overlayAfter =', after)
if (duringAnim.anim !== 'hunt-lantern-death' || duringAnim.overlay !== false || after !== true) process.exit(1)
```

Run: `cd /tmp/wanderer && node death.mjs`
Expected: `during = { anim: 'hunt-lantern-death', overlay: false } | overlayAfter = true`. Read `/tmp/wanderer/death.png` (should show the collapsed wanderer under the CAUGHT screen).

- [ ] **Step 4: Commit**

```bash
git add src/scenes/NightHunt.js
git commit -m "$(printf 'Play hero death animation before the CAUGHT screen\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 10: Wire `hit` (if a clean non-lethal trigger exists) + final review

In Night Hunt, being caught is fatal, so there may be no obvious non-lethal hit. Use the freeing-from-a-trap struggle as the natural `hit` moment if it reads well; otherwise leave `hit` generated-and-available (loaded + defined, just not triggered) and note it.

**Files:**
- Modify: `src/scenes/NightHunt.js` (only if wiring the trap-struggle hit)

- [ ] **Step 1: Locate the non-lethal moment**

Run: `grep -n "trapEscapes\|freeFromTrap\|puff(" src/scenes/NightHunt.js`
The trap-mash (`update()` `:1638-1642`) calls `CombatSystem.puff(...)` on each escape press — a non-lethal "struggle" beat.

- [ ] **Step 2: Play hit on a struggle press (anim heroes with a hit anim only)**

In `update()` where a successful escape press is handled (the `if (useBtn && !this._prevUseBtn)` trap branch, `:1638`), after the `puff` line add:

```js
        const hitKey = `${this.heroKey}-hit`
        if (this.anims.exists(hitKey) && !this.player.anims.isPlaying) {
          this.player.play(hitKey)
          this.player.once(`animationcomplete-${hitKey}`, () => { if (!this.gameOver) this.restPose() })
        }
```

(Guarded by `anims.exists`, so only the Wanderer reacts; other heroes are untouched. Skipped if an anim is already mid-play.)

- [ ] **Step 3: Build** — `npm run build` → `✓ built`, no errors.

- [ ] **Step 4: Final in-game review**

With `npm run dev`, reuse `/tmp/wanderer/smoke.mjs` and `/tmp/wanderer/run.mjs`/`death.mjs` to confirm idle, run, death still pass and no console errors. Read the screenshots. Re-tune the `HEROES` `scale`/`origin`/`body`/`off` if anything looks off.

- [ ] **Step 5: Commit (if Step 2 was applied)**

```bash
git add src/scenes/NightHunt.js
git commit -m "$(printf 'Play Wanderer hit animation on trap struggle\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

- [ ] **Step 6: Hand off the push**

`git push` to GitHub is blocked from Claude's side. Tell the user to push via the prompt:
`! git -C /home/yurin/.claude/GameDevelopment push`

---

## Self-Review (against the spec)

- **Visual style / distinct look** → Task 2 (painterly still), 64px frames throughout. ✓
- **Night Hunt only** → `huntOnly:true` (Task 4 Steps 4–5), Story filter excludes it. ✓
- **2D image-to-video + ffmpeg** → Tasks 2–7. ✓
- **Lantern wanderer character** → Task 2 prompt. ✓
- **64×64 @ ~0.55 scale** → Task 4 Step 3 + tuning Step 10. ✓
- **idle/run/hit/death** → Tasks 3,5,6,7 (assets) + Task 8 (anims). idle yoyo-loop, run forward-loop, hit/death one-shot hold. ✓
- **huntOnly flag (roster yes / Story no / no campaign overwrite / carousel scale)** → Task 4 Steps 4–5. ✓
- **Death hookup, generic, delays overlay** → Task 9 (`anims.exists` gate, `animationcomplete-<key>`, safety-net timer, idempotent overlay). ✓
- **hit hookup if clean trigger** → Task 10. ✓
- **Vertical slice first / get_cost preflight** → Task 3+4 gate; `get_cost` in Tasks 2,3,5,6,7. ✓
- **Pipeline determinism (union-bbox, feet anchor)** → Task 1 compositor. ✓

No placeholders remain (every code/command step is concrete). Type/name consistency checked: `hunt-lantern-{idle,run,hit,death}` keys, `huntOnly`, `cardScale`, `showCaughtOverlay(sub, newBest)`, `_overlayShown` used consistently across tasks.
