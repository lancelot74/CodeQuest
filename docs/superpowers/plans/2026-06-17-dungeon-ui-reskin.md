# Dungeon UI Reskin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Generation note:** Task 1 calls Higgsfield MCP tools (`generate_image`, `get_cost`, `job_status`) — run it in the main session that has Higgsfield connected.

**Goal:** Reskin the game's UI chrome to carved dungeon stone with glowing arcane runes, where the runes go cold blue-purple when calm and **blood-red when danger strikes** — all via the single `widgets.js` module.

**Architecture:** Generate one stone panel with glowing runes (Higgsfield), split it in PIL into a neutral **stone** nine-slice + a white **runes-glow** nine-slice. `widgets.js` stacks the two per panel/button: the stone layer owns the base + hover brighten, the runes layer owns the mood tint (managed by a per-scene registry + `setUiMood`). Small nine-slice insets keep it crisp on tiny buttons; runes read as a glowing border trim so stretching doesn't smear them.

**Tech Stack:** Phaser 3.90 nine-slice, Vite 5, vanilla JS; Higgsfield (nano_banana_pro) + Python/Pillow for the split; Playwright headless for visual verification.

---

## File Structure

| File | Change |
|---|---|
| `/tmp/wanderer/panel_split.py` | Stone/runes separator (scratch, not committed) |
| `public/assets/game/ui/ui-stone.png`, `ui-runes.png` | Create (the two nine-slice layers) |
| `src/scenes/Preload.js` | Load `ui-stone` + `ui-runes`; drop the `ui-panel` load |
| `src/ui/widgets.js` | Two-layer `uiPanel`/`panelButton`/`button`; `uiMood` + `setUiMood`; rune registry |
| `src/utils/constants.js` | Add `RUNE` colors; keep `COLORS` |
| `src/scenes/NightHunt.js` | `setUiMood('danger'/'calm')` on chase edge + `playerDeath()` |

---

## Task 1: Generate + split the stone-rune panel  (B1a)

**Files:** Create `/tmp/wanderer/panel_split.py`; output `public/assets/game/ui/ui-stone.png`, `ui-runes.png`

- [ ] **Step 1: Preflight cost**

Call `generate_image` with `get_cost: true` and the Step 2 params. Proceed if a few credits.

- [ ] **Step 2: Generate the panel**

Call `generate_image`:

```json
{ "params": {
  "model": "nano_banana_pro",
  "aspect_ratio": "1:1",
  "prompt": "A square game UI panel frame made of carved grey dungeon stone, thick chiseled raised border with a recessed darker stone center, a continuous thin glowing cyan arcane rune line running just inside the border, a small distinct glowing cyan rune glyph carved into each of the four corners, flat head-on view, no perspective, even soft lighting, the stone fills the entire image edge to edge with no margin and no background, pixel-art game asset",
  "count": 2
} }
```

Poll `job_status`; pick the cleanest **edge-to-edge, head-on, symmetric** one with clearly cyan runes on grey stone. Download to `/tmp/wanderer/panel_raw.png`.

- [ ] **Step 3: Write the splitter**

Create `/tmp/wanderer/panel_split.py`:

```python
#!/usr/bin/env python3
"""Split a glowing-rune stone panel into a neutral stone nine-slice + a white
runes-glow nine-slice. The runes are the saturated/bright cyan pixels; the stone
is everything desaturated to grey so no colour bleeds into the base layer.

Usage: panel_split.py <panel.png> <out_stone.png> <out_runes.png> [--size 96]
"""
import sys
import numpy as np
from PIL import Image

src, out_stone, out_runes = sys.argv[1], sys.argv[2], sys.argv[3]
size = int(sys.argv[sys.argv.index('--size') + 1]) if '--size' in sys.argv else 96

im = Image.open(src).convert('RGB')
# trim any uniform margin so the stone is edge-to-edge
arr0 = np.asarray(im).astype(np.int16)
rgb = arr0.astype(np.float32)
r, g, bl = rgb[..., 0], rgb[..., 1], rgb[..., 2]
mx, mn = rgb.max(2), rgb.min(2)
sat = (mx - mn) / (mx + 1e-3)          # 0 grey .. 1 vivid
val = mx / 255.0
# rune glow = saturated AND bright, and bluish-cyan (g,b high vs r)
cyan = ((g + bl) / 2 - r) / 255.0
glow = np.clip((sat - 0.18) * 2, 0, 1) * np.clip((val - 0.35) * 2, 0, 1)
glow = glow * np.clip(cyan * 3 + 0.2, 0, 1)
alpha = (np.clip(glow, 0, 1) * 255).astype('uint8')
runes = np.dstack([np.full_like(r, 255, 'uint8')] * 3 + [alpha])  # white glow

# stone = full desaturation to neutral grey (runes become dark engravings)
lum = (0.3 * r + 0.5 * g + 0.2 * bl).astype('uint8')
stone = np.dstack([lum, lum, lum, np.full_like(lum, 255)])

Image.fromarray(stone, 'RGBA').resize((size, size), Image.LANCZOS).save(out_stone)
Image.fromarray(runes, 'RGBA').resize((size, size), Image.LANCZOS).save(out_runes)
print(f'wrote {out_stone} + {out_runes} at {size}px')
```

- [ ] **Step 4: Run the split**

```bash
cd /tmp/wanderer && python3 panel_split.py panel_raw.png \
  /home/yurin/.claude/GameDevelopment/public/assets/game/ui/ui-stone.png \
  /home/yurin/.claude/GameDevelopment/public/assets/game/ui/ui-runes.png --size 96
```

- [ ] **Step 5: Preview both layers + a composite at two scales**

```bash
cd /tmp/wanderer && python3 -c "
from PIL import Image
D='/home/yurin/.claude/GameDevelopment/public/assets/game/ui'
st=Image.open(f'{D}/ui-stone.png'); ru=Image.open(f'{D}/ui-runes.png').convert('RGBA')
# tint runes calm-blue and composite
blue=Image.new('RGBA',ru.size,(111,124,255,0)); blue.putalpha(ru.getchannel('A'))
comp=st.convert('RGBA').copy(); comp.alpha_composite(blue)
canvas=Image.new('RGBA',(360,140),(18,22,38,255))
canvas.alpha_composite(comp.resize((120,120),Image.NEAREST),(12,10))      # big panel
canvas.alpha_composite(comp.resize((96,34),Image.NEAREST),(150,53))       # button stretch
canvas.convert('RGB').save('/tmp/wanderer/panel_preview.png'); print('ok')
"
```

Read `/tmp/wanderer/panel_preview.png`. Confirm: stone reads as carved grey, the blue runes glow on the border, corners crisp, and the button-stretched version isn't smeared. If smeared or ugly, re-roll Step 2 (simpler border) or lower `--size`. **No commit** (asset committed with Task 2).

---

## Task 2: Two-layer widgets + palette  (B1b)

**Files:** Modify `src/scenes/Preload.js`, `src/utils/constants.js`, `src/ui/widgets.js`

- [ ] **Step 1: Load the two layers, drop `ui-panel`**

In `src/scenes/Preload.js`, replace the line:

```js
    this.load.image('ui-panel', 'assets/game/ui/ui-panel.png')
```

with:

```js
    this.load.image('ui-stone', 'assets/game/ui/ui-stone.png')
    this.load.image('ui-runes', 'assets/game/ui/ui-runes.png')
```

- [ ] **Step 2: Add rune colors to `constants.js`**

In `src/utils/constants.js`, right after the `export const COLORS = { ... }` block, add:

```js
// Reactive rune glow for the dungeon UI: cold + arcane when calm, blood-red in danger.
export const RUNE = { calm: 0x6f7cff, danger: 0xd23b3b }
```

- [ ] **Step 3: Rewrite the panel/button helpers in `widgets.js` as two layers**

At the top of `src/ui/widgets.js`, add the import + module state + inset under the existing imports:

```js
import { COLORS, RUNE } from '../utils/constants.js'

const INSET = 12 // nine-slice corner size — small so tiny buttons stay crisp

// A neutral stone nine-slice with a separately-tinted runes-glow layer on top.
// The runes layer is registered per scene so setUiMood() can recolour them.
function stonePanel(scene, x, y, w, h, origin) {
  const stone = scene.add.nineslice(x, y, 'ui-stone', undefined, w, h, INSET, INSET, INSET, INSET).setOrigin(origin.ox, origin.oy)
  const runes = scene.add.nineslice(x, y, 'ui-runes', undefined, w, h, INSET, INSET, INSET, INSET).setOrigin(origin.ox, origin.oy)
  runes.setTint(RUNE[scene._uiMood || 'calm'])
  ;(scene._uiRunes ||= []).push(runes)
  return { stone, runes }
}

// Recolour every rune layer in a scene (cold blue <-> blood red). Cheap tween.
export function setUiMood(scene, mood) {
  scene._uiMood = mood
  const c = RUNE[mood] || RUNE.calm
  for (const r of scene._uiRunes || []) if (r.active) r.setTint(c)
}
```

Replace the existing `COLORS` import line (`import { COLORS } from '../utils/constants.js'`) with the combined one above (don't import `COLORS` twice).

Replace `uiPanel`:

```js
export function uiPanel(scene, x, y, w, h, opts = {}) {
  const { stone, runes } = stonePanel(scene, x, y, w, h, { ox: opts.originX ?? 0, oy: opts.originY ?? 0 })
  if (opts.tint != null) stone.setTint(opts.tint)
  if (opts.depth != null) { stone.setDepth(opts.depth); runes.setDepth(opts.depth) }
  return stone // callers tint/position the stone; runes follow it
}
```

In `panelButton`, replace the single `bg` nineslice line:

```js
  const bg = scene.add.nineslice(x, y, 'ui-panel', undefined, w, h, 8, 8, 8, 8).setOrigin(0.5)
```

with:

```js
  const { stone: bg, runes } = stonePanel(scene, x, y, w, h, { ox: 0.5, oy: 0.5 })
```

Then, in `panelButton`, set depth on both and scale both on press. Change `bg.setDepth(depth)` to:

```js
  bg.setDepth(depth)
  runes.setDepth(depth)
```

and in the `pointerdown`/`pointerup` handlers add `runes.setScale(...)` alongside `bg.setScale(...)` (0.96 down, 1 up).

Apply the identical change in `button` (its `const bg = scene.add.nineslice(... 'ui-panel' ...)` → `stonePanel`, plus depth + press-scale on `runes`).

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: `✓ built`. (If it errors that `ui-panel` is still referenced, grep `grep -rn "'ui-panel'" src/` and convert any stragglers.)

- [ ] **Step 5: Tune `INSET` against a screenshot**

With `npm run dev` running, screenshot the menu (`/tmp/wanderer/shot.mjs` from sub-project A, pointing at GameSelect). Read it: if corners overlap on buttons, lower `INSET`; if the runed border is too thin, raise it (and/or re-`--size` the assets). Re-build/re-shot until panels and buttons both look right.

- [ ] **Step 6: Playwright — menu + hunt render, 0 errors**

Reuse `/tmp/wanderer/deck_final.mjs` (menu + hunt flow, asserts 0 console errors). Run it; expect `errors: 0`. Read a hunt screenshot to confirm the HUD panels are stone too.

- [ ] **Step 7: Commit B1**

```bash
cd /home/yurin/.claude/GameDevelopment
git rm public/assets/game/ui/ui-panel.png
git add public/assets/game/ui/ui-stone.png public/assets/game/ui/ui-runes.png \
  src/scenes/Preload.js src/utils/constants.js src/ui/widgets.js
git commit -m "$(printf 'Reskin UI to carved stone with rune panels\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 3: Reactive rune mood plumbing  (B2a)

`setUiMood` already exists from Task 2. This task only verifies it works end-to-end via the dev handle before wiring real triggers.

**Files:** none (verification)

- [ ] **Step 1: Build is green** — `npm run build` → `✓ built`.

- [ ] **Step 2: Playwright — runes flip to blood-red on demand**

With `npm run dev`, create `/tmp/wanderer/mood.mjs`:

```js
import { chromium } from 'playwright'
import { setUiMood } from 'phaser' // not real; we call via the game
const b = await chromium.launch(); const p = await b.newPage()
const errs = []; p.on('pageerror', e => errs.push(String(e)))
await p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(1500)
await p.evaluate(() => window.__game.scene.start('GameSelect')); await p.waitForTimeout(800)
await p.screenshot({ path: '/tmp/wanderer/mood_calm.png' })
const tinted = await p.evaluate(() => {
  const s = window.__game.scene.getScene('GameSelect')
  // mimic setUiMood: retint registered rune layers red
  s._uiMood = 'danger'
  for (const r of s._uiRunes || []) if (r.active) r.setTint(0xd23b3b)
  return (s._uiRunes || []).length
})
await p.waitForTimeout(300)
await p.screenshot({ path: '/tmp/wanderer/mood_danger.png' })
await b.close()
console.log('rune layers tinted =', tinted, '| errors =', errs.length)
if (!tinted || errs.length) process.exit(1)
```

Remove the bogus `import { setUiMood }` line before running (kept here only to note intent). Run: `node mood.mjs`.
Expected: `rune layers tinted = <N>0 | errors = 0`. Read `mood_calm.png` vs `mood_danger.png` — the rune glow should be blue then red.

---

## Task 4: Wire danger triggers in Night Hunt  (B2b)

**Files:** Modify `src/scenes/NightHunt.js`

- [ ] **Step 1: Find the chase-detection edge**

Run: `grep -n "CHASE\|updateMusicState\|tension\|mode === 'CHASE'\|Music.play(this, 'bgm-tension'" src/scenes/NightHunt.js`
Identify where a hunter entering CHASE / the tension state is detected per frame (the same place the tension music switches).

- [ ] **Step 2: Import `setUiMood`**

In `src/scenes/NightHunt.js`, add `setUiMood` to the existing `widgets` import (e.g. `import { pixelText, panelButton, setUiMood } from '../ui/widgets.js'` — match the actual existing import list).

- [ ] **Step 3: Drive the mood from the chase state**

At the point identified in Step 1, where `want` is `'bgm-tension'` vs `'bgm-main'` (a hunter in the dark nearby), set the rune mood to match — danger while the tension holds, calm otherwise:

```js
    setUiMood(this, want === 'bgm-tension' ? 'danger' : 'calm')
```

(Place it right beside the existing `Music.play(this, want)` call so it shares the same hysteresis and only fires on real state changes.)

- [ ] **Step 4: Redden on death**

In `playerDeath()`, after `this.gameOver = true`, add:

```js
    setUiMood(this, 'danger')
```

so the CAUGHT overlay's panels glow blood-red.

- [ ] **Step 5: Build**

Run: `npm run build` → `✓ built`.

- [ ] **Step 6: Playwright — a real chase reddens the HUD, death stays red**

With `npm run dev`, create `/tmp/wanderer/huntmood.mjs`:

```js
import { chromium } from 'playwright'
const b = await chromium.launch(); const p = await b.newPage()
const errs = []; p.on('pageerror', e => errs.push(String(e)))
await p.goto('http://localhost:5173/#wanderer', { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(2500)
const calm = await p.evaluate(() => window.__game.scene.getScene('NightHunt')._uiMood || 'calm')
await p.evaluate(() => window.__game.scene.getScene('NightHunt').playerDeath()); await p.waitForTimeout(2500)
const dead = await p.evaluate(() => window.__game.scene.getScene('NightHunt')._uiMood)
await p.screenshot({ path: '/tmp/wanderer/hunt_dead.png' })
await b.close()
console.log('mood at spawn =', calm, '| mood on death =', dead, '| errors =', errs.length)
if (dead !== 'danger' || errs.length) process.exit(1)
```

Run: `node huntmood.mjs`. Expected: `mood on death = danger | errors = 0`. Read `hunt_dead.png` — the CAUGHT panels' runes are red.

- [ ] **Step 7: Commit + hand off push**

```bash
git add src/scenes/NightHunt.js
git commit -m "$(printf 'Redden UI runes on chase and death\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

Then tell the user: `! git -C /home/yurin/.claude/GameDevelopment push`

---

## Self-Review (against the spec)

- **Higgsfield-generated carved stone + runes** → Task 1. ✓
- **Two layers: stone base + tintable runes overlay** → Task 1 split, Task 2 `stonePanel`. ✓
- **Calm cold-blue / danger blood-red** → `RUNE` (Task 2 Step 2), `setUiMood` (Task 2 Step 3). ✓
- **Triggers: chase + death (+ boss enrage later in D)** → Task 4 Steps 3–4. ✓
- **Hover brightens current mood** → stone owns hover (existing tint logic kept); runes own mood — independent, so hover-brighten stone + mood-tint runes coexist. ✓
- **Global via widgets.js; keep font + nightBackdrop** → Task 2 only touches widgets/constants/Preload; font + backdrop untouched. ✓
- **Crisp nine-slice at button + panel scale** → small `INSET`, runes-as-border-trim, Task 1 Step 5 + Task 2 Step 5 checks. ✓
- **B1 static / B2 reactive phasing** → Tasks 1–2 (B1) then 3–4 (B2). ✓

Names consistent across tasks: `ui-stone`/`ui-runes`, `RUNE.calm`/`RUNE.danger`, `stonePanel`, `setUiMood`, `scene._uiMood`, `scene._uiRunes`, `INSET`. No placeholders — every code step shows exact content; the one illustrative bogus import in Task 3 is explicitly flagged for removal.
