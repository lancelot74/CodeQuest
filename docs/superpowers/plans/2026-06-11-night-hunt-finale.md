# Night Hunt Finale "The Descent" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A linear dragon-lair finale after round 5 — corridors teach the Emberhand (catch/shield/throw fireballs), then the Green and Red dragons fall to their own returned fire, ending in dawn and an endless-mode unlock.

**Architecture:** One new self-contained scene `src/scenes/Finale.js` (stage state machine: walkway → corridor1 → gift → corridor2 → arena1 → arena2 → rage → dawn) reusing the shared Audio/Music, CombatSystem, widgets, touch-controls and SaveSystem modules. Two tiny extractions so Finale can run standalone: `HEROES` exported from NightHunt.js, and the light-texture builder moved to `src/utils/lights.js`. Dragons are pattern-driven sprites (no physics bodies); fireballs use the proven NightHunt manual-projectile pattern.

**Tech Stack:** Phaser 3.90, Vite 5, vanilla JS ES modules. No test framework exists in this repo — verification is `npm run build`, Playwright headless screenshots via the `#finale` dev hash, and manual playtest steps (this is the project's established pattern).

**Spec:** `docs/superpowers/specs/2026-06-11-night-hunt-finale-design.md`

**House rules:** terse commit subjects, trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`, never stage `public/assets/game/hunt/artdump-chars.png` or `public/assets/game/hunt/mockup.gal`, pushes are done by the user.

---

### Task 1: Convert dragon + music assets

**Files:**
- Create: `public/assets/game/dragons/{green1,green2,red1,red2,fireball}.png`
- Create: `public/assets/audio/music/{final-kill,roll-credits}.ogg`

- [ ] **Step 1: Convert the five dragon GIFs to horizontal strip PNGs**

Source GIFs are in `/mnt/c/Users/garhy/Downloads/` (dragons are 48×48 × 6 frames, fireball 32×32 × 7 frames).

```bash
cd /home/yurin/.claude/GameDevelopment
mkdir -p public/assets/game/dragons
ffmpeg -y -v error -i "/mnt/c/Users/garhy/Downloads/green_dragon1.gif" -vf "tile=6x1" -frames:v 1 public/assets/game/dragons/green1.png
ffmpeg -y -v error -i "/mnt/c/Users/garhy/Downloads/green_dragon2.gif" -vf "tile=6x1" -frames:v 1 public/assets/game/dragons/green2.png
ffmpeg -y -v error -i "/mnt/c/Users/garhy/Downloads/red_dragon1.gif"   -vf "tile=6x1" -frames:v 1 public/assets/game/dragons/red1.png
ffmpeg -y -v error -i "/mnt/c/Users/garhy/Downloads/red_dragon2.gif"   -vf "tile=6x1" -frames:v 1 public/assets/game/dragons/red2.png
ffmpeg -y -v error -i "/mnt/c/Users/garhy/Downloads/dragon_fireball.gif" -vf "tile=7x1" -frames:v 1 public/assets/game/dragons/fireball.png
```

- [ ] **Step 2: Verify strip dimensions**

Run: `for f in public/assets/game/dragons/*.png; do echo -n "$f: "; ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$f"; done`
Expected: dragons `288,48` each; fireball `224,32`.

- [ ] **Step 3: Convert the two OST tracks**

```bash
unzip -o "/mnt/c/Users/garhy/Downloads/Misc. OST.zip" "Final Kill.m4a" "Roll Credits.m4a" -d /tmp/misc-ost
ffmpeg -y -v error -i "/tmp/misc-ost/Final Kill.m4a"   -c:a libvorbis -q:a 5 public/assets/audio/music/final-kill.ogg
ffmpeg -y -v error -i "/tmp/misc-ost/Roll Credits.m4a" -c:a libvorbis -q:a 5 public/assets/audio/music/roll-credits.ogg
```

- [ ] **Step 4: Verify audio**

Run: `ffprobe -v error -show_entries format=duration -of csv=p=0 public/assets/audio/music/final-kill.ogg public/assets/audio/music/roll-credits.ogg 2>/dev/null; ls -la public/assets/audio/music/*.ogg`
Expected: both files exist with nonzero durations (Final Kill ≈ 49s, Roll Credits ≈ 33s — exact lengths may differ; any sane duration is fine).

- [ ] **Step 5: Commit**

```bash
git add public/assets/game/dragons public/assets/audio/music/final-kill.ogg public/assets/audio/music/roll-credits.ogg
git commit -m "$(cat <<'EOF'
Add dragon sprites and finale music assets

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Load assets and register animations

**Files:**
- Modify: `src/scenes/Preload.js` (after the cloud spritesheet block, ~line 70; and after the `mus('bgm-trap', ...)` line, ~line 105)
- Modify: `src/utils/anims.js` (inside `createEnemyAnimations`, after the cloud defines)

- [ ] **Step 1: Add spritesheet + music loads to Preload.js**

After the cloud spritesheet block, add:

```js
    // Finale dragons (48px strips: fly + glide per color) and their fireball.
    const DRG = { frameWidth: 48, frameHeight: 48 }
    this.load.spritesheet('green-fly', 'assets/game/dragons/green1.png', DRG)
    this.load.spritesheet('green-glide', 'assets/game/dragons/green2.png', DRG)
    this.load.spritesheet('red-fly', 'assets/game/dragons/red1.png', DRG)
    this.load.spritesheet('red-glide', 'assets/game/dragons/red2.png', DRG)
    this.load.spritesheet('fireball', 'assets/game/dragons/fireball.png', { frameWidth: 32, frameHeight: 32 })
```

After `mus('bgm-trap', 'insanity.ogg')`, add:

```js
    mus('bgm-boss', 'final-kill.ogg') // finale arena loop
    mus('cue-dawn', 'roll-credits.ogg') // one-shot over the dawn screen
```

- [ ] **Step 2: Register animations in anims.js**

After the cloud `define(...)` lines inside `createEnemyAnimations`, add:

```js
  // finale dragons: two loops per color, plus the tumbling fireball
  define(scene, 'green-fly', 'green-fly', 8, -1)
  define(scene, 'green-glide', 'green-glide', 8, -1)
  define(scene, 'red-fly', 'red-fly', 8, -1)
  define(scene, 'red-glide', 'red-glide', 8, -1)
  define(scene, 'fireball', 'fireball', 12, -1)
```

- [ ] **Step 3: Build**

Run: `npm run build 2>&1 | tail -2`
Expected: `✓ built in …` (only the pre-existing chunk-size warning).

- [ ] **Step 4: Commit**

```bash
git add src/scenes/Preload.js src/utils/anims.js
git commit -m "$(cat <<'EOF'
Load dragon sheets, fireball and finale music

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Extract shared light textures to utils/lights.js

**Files:**
- Create: `src/utils/lights.js`
- Modify: `src/scenes/NightHunt.js` (delete the `LIGHT_RADIUS`/`SMALL_LIGHT`/`TORCH_LIGHT` consts near the top, delete the `makeLights()`/`makeLight()` methods, add the import, replace the `this.makeLights()` call)

- [ ] **Step 1: Create src/utils/lights.js**

The function bodies are moved verbatim from `NightHunt.makeLight` — the texture keys must not change (`hunt-light`, `hunt-light-sm`, `hunt-torch-light`), because cached textures are global and both scenes share them.

```js
// Shared night-lighting constants and cached radial light textures, used by the
// NIGHT HUNT forest and the finale lair. Textures are created once per game.
export const LIGHT_RADIUS = 104 // player light WITH a torch
export const SMALL_LIGHT = 30 // player light without a torch (immediate surroundings only)
export const TORCH_LIGHT = 80 // ambient pool cast by a map torch

function makeLight(scene, key, radius, peak) {
  if (scene.textures.exists(key)) return
  const d = radius * 2
  const c = scene.textures.createCanvas(key, d, d)
  const ctx = c.getContext()
  const g = ctx.createRadialGradient(radius, radius, radius * 0.12, radius, radius, radius)
  g.addColorStop(0, `rgba(255,255,255,${peak})`)
  g.addColorStop(0.62, `rgba(255,255,255,${peak * 0.82})`)
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, d, d)
  c.refresh()
}

export function ensureHuntLights(scene) {
  makeLight(scene, 'hunt-light', LIGHT_RADIUS, 1)
  makeLight(scene, 'hunt-light-sm', SMALL_LIGHT, 0.85)
  makeLight(scene, 'hunt-torch-light', TORCH_LIGHT, 0.9)
}
```

- [ ] **Step 2: Refactor NightHunt.js to use it**

1. Add to the imports: `import { ensureHuntLights, LIGHT_RADIUS, SMALL_LIGHT, TORCH_LIGHT } from '../utils/lights.js'`
2. Delete the three module consts `LIGHT_RADIUS`, `SMALL_LIGHT`, `TORCH_LIGHT` (keep every usage — the imported names are identical).
3. In `create()`, replace `this.makeLights()` with `ensureHuntLights(this)`.
4. Delete the whole `makeLights()` and `makeLight()` methods.

- [ ] **Step 3: Build (no behavior change expected)**

Run: `npm run build 2>&1 | tail -2`
Expected: `✓ built` with no errors. Then `grep -n "makeLight" src/scenes/NightHunt.js` → no matches.

- [ ] **Step 4: Commit**

```bash
git add src/utils/lights.js src/scenes/NightHunt.js
git commit -m "$(cat <<'EOF'
Extract shared light textures to utils/lights

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Export HEROES and add hunt.dawn to the save

**Files:**
- Modify: `src/scenes/NightHunt.js` (the `const HEROES = [` declaration, ~line 66)
- Modify: `src/systems/SaveSystem.js` (`defaultSave()`, the `hunt:` line)

- [ ] **Step 1: Export HEROES**

Change `const HEROES = [` to `export const HEROES = [` in NightHunt.js. (Finale imports it for hero sprite config; NightHunt never imports from Finale, so there is no cycle.)

- [ ] **Step 2: Add dawn flag to the save defaults**

In `defaultSave()` change:

```js
    hunt: { bestRound: 1 },
```

to:

```js
    hunt: { bestRound: 1, dawn: false },
```

(Shallow merge `{ ...defaultSave(), ...data }` gives existing saves the whole default `hunt` object only if they lack it; saves that already have `hunt` keep `dawn` undefined, which is falsy — equivalent to `false` everywhere it is read. No version bump needed.)

- [ ] **Step 3: Build**

Run: `npm run build 2>&1 | tail -2`
Expected: `✓ built`.

- [ ] **Step 4: Commit**

```bash
git add src/scenes/NightHunt.js src/systems/SaveSystem.js
git commit -m "$(cat <<'EOF'
Export HEROES and add hunt.dawn save flag

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Finale scene skeleton — world, player, fog, registration, dev hash

**Files:**
- Create: `src/scenes/Finale.js`
- Modify: `src/main.js` (import + scene list, after NightHuntScene)
- Modify: `src/scenes/MainMenu.js` (top of `create()`)

- [ ] **Step 1: Create src/scenes/Finale.js with the skeleton**

This is the complete file at this stage. Later tasks add methods to it; the stage machine, dragons and fireballs are stubs here but everything below compiles and runs: a dark walkable lair strip with fog.

```js
import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../config.js'
import { pixelText, panelButton } from '../ui/widgets.js'
import { Audio, SFX, Music } from '../systems/AudioSystem.js'
import { CombatSystem } from '../systems/CombatSystem.js'
import { SaveSystem } from '../systems/SaveSystem.js'
import { TouchState } from '../systems/TouchState.js'
import { showTouchControls, hideTouchControls } from '../ui/touchControls.js'
import { ensureHuntLights, SMALL_LIGHT, TORCH_LIGHT } from '../utils/lights.js'
import { HEROES } from './NightHunt.js'

const TILE = 24
const COLS = 58
const ROWS = 15
const WORLD_W = COLS * TILE // 1392
const WORLD_H = ROWS * TILE // 360
const LANE_TOP = 48 // playable lane between the wall bands
const LANE_BOT = WORLD_H - 48

const WALK_SPEED = 96
const SPRINT_SPEED = 168
const STAM_MAX = 1
const STAM_DRAIN = 0.55
const STAM_REGEN = 0.4
const STAM_FLOOR = 0.25

// stage boundaries (player x, px) — doors seal behind the hero at each one
const DOOR_X = [240, 600, 960]
const GIFT_X = 560 // the first-catch beat triggers here
const BRAMBLE_X = 900

const CATCH_RADIUS = 28
const EMBER_ORBIT = 24
const THROW_SPEED = 280
const LOB_SPEED = 150
const FAN_SPEED = 180
const GREEN_HP = 3
const RED_HP = 4

const TOUCH_LABELS = { jump: 'RUN', attack: 'CATCH', heavy: null }

// THE DESCENT — Night Hunt's finale. A linear lair: dark walkway, two teaching
// corridors, then the twin dragons in a sealed arena. The hero's only weapon is
// the Emberhand: catch a fireball, wear it as a one-hit shield, throw it back.
export default class FinaleScene extends Phaser.Scene {
  constructor() {
    super('Finale')
  }

  init(data) {
    const wanted = data?.hero || this.registry.get('huntHero') || SaveSystem.data.character
    this.heroKey = HEROES.some((h) => h.key === wanted) ? wanted : 'ninja'
    this.hero = HEROES.find((h) => h.key === this.heroKey)
    this.fromArena = !!data?.fromArena
  }

  create() {
    this.gameOver = false
    this.stage = 'walkway'
    this.reachedArena = false
    this.canCatch = false
    this.ember = null
    this.fireballs = []
    this.dragon = null
    this.torches = []
    this._prevE = false
    this.stamina = STAM_MAX
    this.exhausted = false
    this.faceX = 1

    this.physics.world.setBounds(0, LANE_TOP, WORLD_W, LANE_BOT - LANE_TOP)
    ensureHuntLights(this)
    this.buildWorld()
    this.buildPlayer()
    this.buildFog()
    this.buildHud()

    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H)
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12)

    this.keys = this.input.keyboard.addKeys('W,A,S,D,SHIFT,E,UP,DOWN,LEFT,RIGHT')
    showTouchControls(TOUCH_LABELS)
    this.events.once('shutdown', () => hideTouchControls())

    Music.play(this, 'bgm-trap', { fade: 800 })
    if (this.fromArena) this.jumpToArena() // stub until the arena task
  }

  buildWorld() {
    const floor = this.add.renderTexture(0, 0, WORLD_W, WORLD_H).setOrigin(0, 0).setDepth(0)
    floor.beginDraw()
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        floor.batchDrawFrame('hunt-tiles', Phaser.Utils.Array.GetRandom([0, 1, 2, 3, 4, 5]), c * TILE, r * TILE)
      }
    }
    floor.endDraw()
    // lair wash: darker and colder than the forest
    this.add.rectangle(0, 0, WORLD_W, WORLD_H, 0x0a0c1c, 0.55).setOrigin(0, 0).setDepth(1)

    // wall bands above and below the lane, dressed with trees/stones
    for (let x = 14; x < WORLD_W; x += 34) {
      this.add.image(x, LANE_TOP - 4, 'hunt-tree').setOrigin(0.5, 1).setDepth(LANE_TOP).setTint(0x5a6488)
      this.add.image(x + 10, WORLD_H + 2, 'hunt-tree').setOrigin(0.5, 1).setDepth(WORLD_H).setTint(0x5a6488)
    }
  }

  buildPlayer() {
    const h = this.hero
    const sx = this.fromArena ? DOOR_X[2] + 30 : TILE * 2
    const sy = (LANE_TOP + LANE_BOT) / 2
    this.playerShadow = this.add.ellipse(sx, sy, 20, 7, 0x000000, 0.32)
    const tex = h.kind === 'anim' ? `${h.key}-idle` : h.key
    this.player = this.physics.add.sprite(sx, sy, tex).setOrigin(0.5, h.origin).setScale(h.scale)
    if (h.kind === 'anim') this.player.play(`${h.key}-idle`)
    this.player.body.setAllowGravity(false)
    this.player.setCollideWorldBounds(true)
    this.player.body.setSize(h.body[0], h.body[1])
    if (h.off) this.player.body.setOffset(h.off[0], h.off[1])
  }

  buildFog() {
    this.fogColor = 0x04050c
    this.fog = this.add.renderTexture(0, 0, GAME_WIDTH, GAME_HEIGHT).setOrigin(0, 0).setScrollFactor(0).setDepth(900)
    if (this.textures.exists('vignette')) {
      this.add.image(0, 0, 'vignette').setOrigin(0, 0).setDisplaySize(GAME_WIDTH, GAME_HEIGHT).setScrollFactor(0).setDepth(905).setAlpha(0.7)
    }
  }

  updateFog() {
    const cam = this.cameras.main
    this.fog.clear()
    this.fog.fill(this.fogColor, 1)
    const sx = this.player.x - cam.scrollX
    const sy = this.player.y - cam.scrollY
    this.fog.erase('hunt-light-sm', sx - SMALL_LIGHT, sy - SMALL_LIGHT)
    for (const t of this.torches) {
      if (t.lit) this.fog.erase('hunt-torch-light', t.x - cam.scrollX - TORCH_LIGHT, t.y - cam.scrollY - TORCH_LIGHT)
    }
    // fireballs carry their own light — in the rage dark they are the only light
    for (const f of this.fireballs) {
      this.fog.erase('hunt-light-sm', f.spr.x - cam.scrollX - SMALL_LIGHT, f.spr.y - cam.scrollY - SMALL_LIGHT)
    }
    if (this.ember) this.fog.erase('hunt-light-sm', this.ember.x - cam.scrollX - SMALL_LIGHT, this.ember.y - cam.scrollY - SMALL_LIGHT)
  }

  buildHud() {
    pixelText(this, 12, 14, 'THE DESCENT', 10, '#ffe066').setOrigin(0, 0.5).setScrollFactor(0).setDepth(9500)
    this.staminaBar = this.add.graphics().setScrollFactor(0).setDepth(9500)
    this.pips = []
    pixelText(this, 12, GAME_HEIGHT - 14, 'WASD move  SHIFT run  E catch/throw', 7, '#7e8aa8').setOrigin(0, 0.5).setScrollFactor(0).setDepth(9500)
    const menu = panelButton(this, GAME_WIDTH - 40, GAME_HEIGHT - 16, 'MENU', () => this.scene.start('MainMenu'), { size: 8, width: 60, depth: 9500 })
    menu.bg.setScrollFactor(0)
    menu.text.setScrollFactor(0)
    // world-space prompt used by the gift beat and the bramble
    this.prompt = pixelText(this, 0, 0, '', 8, '#ffe066').setOrigin(0.5, 1).setDepth(9400).setVisible(false)
  }

  drawStamina() {
    const g = this.staminaBar
    g.clear()
    g.fillStyle(0x0a0c14, 0.7).fillRect(95, 10, 70, 8)
    g.fillStyle(this.exhausted ? 0xe06a6a : 0x7cfc98, 1).fillRect(96, 11, 68 * this.stamina, 6)
  }

  flashBanner(text, color) {
    const t = pixelText(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60, text, 18, color).setScrollFactor(0).setDepth(11002)
    this.tweens.add({ targets: t, alpha: 0, y: GAME_HEIGHT / 2 - 90, duration: 1100, onComplete: () => t.destroy() })
  }

  jumpToArena() {} // replaced in the arena task

  handlePlayer(dt) {
    const k = this.keys
    const t = TouchState
    let ax = (k.D.isDown || k.RIGHT.isDown || t.right ? 1 : 0) - (k.A.isDown || k.LEFT.isDown || t.left ? 1 : 0)
    let ay = (k.S.isDown || k.DOWN.isDown || t.down ? 1 : 0) - (k.W.isDown || k.UP.isDown || t.up ? 1 : 0)
    const moving = ax !== 0 || ay !== 0
    const wantSprint = (k.SHIFT.isDown || t.jump) && moving
    const sprint = wantSprint && this.stamina > 0 && !this.exhausted
    if (sprint) {
      this.stamina = Math.max(0, this.stamina - STAM_DRAIN * dt)
      if (this.stamina === 0) this.exhausted = true
    } else {
      this.stamina = Math.min(STAM_MAX, this.stamina + STAM_REGEN * dt)
      if (this.exhausted && this.stamina >= STAM_FLOOR) this.exhausted = false
    }
    const speed = sprint ? SPRINT_SPEED : WALK_SPEED
    if (moving) {
      const l = Math.hypot(ax, ay)
      ax /= l
      ay /= l
      this.faceX = ax || this.faceX
      if (Math.abs(ax) > 0.02) this.player.flipX = ax < 0
    }
    this.player.body.setVelocity(ax * speed, ay * speed)
    if (this.hero.kind === 'anim') {
      const want = moving ? `${this.hero.key}-run` : `${this.hero.key}-idle`
      if (this.player.anims.getName() !== want) this.player.play(want)
    }
    this.player.setDepth(this.player.y)
    this.playerShadow.setPosition(this.player.x, this.player.y + this.player.displayHeight * 0.22).setDepth(this.player.y - 1)
  }

  update(time, delta) {
    if (this.gameOver) {
      this.updateFog()
      return
    }
    const dt = delta / 1000
    this.handlePlayer(dt)
    this.drawStamina()
    this.updateFog()
  }
}
```

- [ ] **Step 2: Register the scene in main.js**

Add `import FinaleScene from './scenes/Finale.js'` after the NightHuntScene import, and `FinaleScene,` after `NightHuntScene,` in the scene array.

- [ ] **Step 3: Add the dev hash to MainMenu.js**

At the very top of `MainMenuScene.create()` (before `addBackdrop`):

```js
    // dev shortcut: localhost:5173/#finale jumps straight to the lair
    if (window.location.hash === '#finale') {
      this.scene.start('Finale')
      return
    }
```

- [ ] **Step 4: Build and screenshot**

Run: `npm run build 2>&1 | tail -2` → `✓ built`.
Then with the dev server running, write `/tmp/pwtest/finale-shot.mjs` (copy of `/tmp/pwtest/menu-shot.mjs` with `goto('http://localhost:5173/#finale')` and output `/tmp/pwtest/finale.png`) and run `cd /tmp/pwtest && node finale-shot.mjs`.
Expected: a dark strip world — hero's small light pool in blackness, THE DESCENT top-left, stamina bar, MENU button. Player walks with WASD (manual check).

- [ ] **Step 5: Commit**

```bash
git add src/scenes/Finale.js src/main.js src/scenes/MainMenu.js
git commit -m "$(cat <<'EOF'
Add Finale scene skeleton with lair world and dev hash

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Stage machine and sealing doors

**Files:**
- Modify: `src/scenes/Finale.js`

- [ ] **Step 1: Add door construction**

Add to `create()` after `this.buildHud()`:

```js
    this.buildDoors()
```

Add the methods after `buildPlayer()`:

```js
  // Dark slabs at each stage boundary. They start passable; once the hero is
  // through, the body enables and the way back is sealed.
  buildDoors() {
    this.doors = DOOR_X.map((x) => {
      const slab = this.add.rectangle(x, (LANE_TOP + LANE_BOT) / 2, 12, LANE_BOT - LANE_TOP, 0x05060d, 0.95).setDepth(800).setVisible(false)
      this.physics.add.existing(slab, true)
      slab.body.enable = false
      this.physics.add.collider(this.player, slab)
      return { x, slab, sealed: false }
    })
  }

  sealDoorsBehind() {
    for (const d of this.doors) {
      if (!d.sealed && this.player.x > d.x + 24) {
        d.sealed = true
        d.slab.setVisible(true)
        d.slab.body.enable = true
        Audio.play(this, SFX.heavy, { volume: 0.5, rate: 0.6 })
      }
    }
  }
```

- [ ] **Step 2: Add the stage machine**

Add after `sealDoorsBehind()`:

```js
  // walkway -> corridor1 -> gift -> corridor2 -> arena1 -> arena2 -> rage -> dawn.
  // Transitions up to the arena are driven by player x; the fights drive the rest.
  updateStages() {
    if (this.stage === 'walkway' && this.player.x > DOOR_X[0]) {
      this.startStage('corridor1')
    } else if (this.stage === 'corridor1' && this.player.x > GIFT_X) {
      this.startStage('gift')
    } else if (this.stage === 'corridor2' && this.player.x > DOOR_X[2]) {
      this.startStage('arena1')
    }
  }

  startStage(name) {
    this.stage = name
    if (name === 'corridor1') this.flashBanner('something flies above', '#8ea0c0')
    // 'gift', 'corridor2', 'arena1', 'arena2', 'rage' and 'dawn' get their
    // entry logic in later tasks
  }
```

- [ ] **Step 3: Wire into update()**

In `update()`, after `this.handlePlayer(dt)` add:

```js
    this.sealDoorsBehind()
    this.updateStages()
```

- [ ] **Step 4: Build + manual check**

Run: `npm run build 2>&1 | tail -2` → `✓ built`.
Manual (`#finale`): walk right; past x≈264 a dark slab appears behind you and blocks walking back; the banner fires once entering corridor 1.

- [ ] **Step 5: Commit**

```bash
git add src/scenes/Finale.js
git commit -m "$(cat <<'EOF'
Add finale stage machine and sealing doors

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Fireballs, the Emberhand, and death

**Files:**
- Modify: `src/scenes/Finale.js`

- [ ] **Step 1: Add the fireball system**

Add after `updateStages()`:

```js
  // kinds: 'lob' (catchable), 'fan' (catchable only when opts.catchable),
  // 'gift' (the scripted first catch — harmless), 'thrown' (the hero's shot)
  spawnFireball(x, y, vx, vy, kind, catchable) {
    const spr = this.add.sprite(x, y, 'fireball').setDepth(950).setScale(1.2)
    spr.play('fireball')
    if (!catchable && kind !== 'thrown') spr.setTint(0x9a4040) // dark fire can't be caught
    const f = { spr, vx, vy, kind, catchable, t: 0, ttl: 4 }
    this.fireballs.push(f)
    return f
  }

  killFireball(f) {
    const i = this.fireballs.indexOf(f)
    if (i >= 0) this.fireballs.splice(i, 1)
    this.tweens.killTweensOf(f.spr)
    f.spr.destroy()
  }

  updateFireballs(dt) {
    for (const f of [...this.fireballs]) {
      f.t += dt
      f.spr.x += f.vx * dt
      f.spr.y += f.vy * dt
      if (f.kind === 'thrown') {
        if (this.dragon && !this.dragon.dead && Phaser.Math.Distance.Between(f.spr.x, f.spr.y, this.dragon.x, this.dragon.y) < 30) {
          CombatSystem.puff(this, f.spr.x, f.spr.y, 0xffa64a, 950)
          this.killFireball(f)
          this.dragon.hurtByEmber()
          continue
        }
      } else if (f.kind !== 'gift') {
        const d = Phaser.Math.Distance.Between(f.spr.x, f.spr.y, this.player.x, this.player.y)
        if (d < 16) {
          CombatSystem.puff(this, f.spr.x, f.spr.y, 0xffa64a, 950)
          this.killFireball(f)
          this.playerHit()
          continue
        }
      }
      if (f.t > f.ttl || f.spr.x < -40 || f.spr.x > WORLD_W + 40 || f.spr.y < -40 || f.spr.y > WORLD_H + 40) {
        this.killFireball(f)
      }
    }
  }
```

- [ ] **Step 2: Add the Emberhand (catch / orbit / throw)**

Add after `updateFireballs()`:

```js
  // One button, three decisions: E catches a near catchable fireball; held, the
  // ember orbits as a one-hit shield; E again throws it — the only damage source.
  handleEmber(dt) {
    const pressed = this.keys.E.isDown || TouchState.attackL
    const edge = pressed && !this._prevE
    this._prevE = pressed
    if (this.ember) {
      this._orbitA = (this._orbitA || 0) + dt * 5
      this.ember.setPosition(this.player.x + Math.cos(this._orbitA) * EMBER_ORBIT, this.player.y - 8 + Math.sin(this._orbitA) * EMBER_ORBIT)
      this.ember.setDepth(this.player.y + 1)
      if (edge) this.throwEmber()
      return
    }
    if (!edge || !this.canCatch) return
    let best = null
    let bd = CATCH_RADIUS
    for (const f of this.fireballs) {
      if (!f.catchable || f.kind === 'thrown') continue
      const d = Phaser.Math.Distance.Between(f.spr.x, f.spr.y, this.player.x, this.player.y)
      if (d < bd) {
        bd = d
        best = f
      }
    }
    if (!best) return
    this.killFireball(best)
    this.ember = this.add.sprite(this.player.x, this.player.y - 8, 'fireball').setDepth(this.player.y + 1).setScale(1.2)
    this.ember.play('fireball')
    Audio.play(this, SFX.clear, { volume: 0.5, rate: 1.3 })
    CombatSystem.puff(this, this.player.x, this.player.y - 8, 0xffd24a, 950)
  }

  throwEmber() {
    const e = this.ember
    this.ember = null
    let vx = this.faceX * THROW_SPEED
    let vy = 0
    if (this.dragon && !this.dragon.dead) {
      const ang = Math.atan2(this.dragon.y - e.y, this.dragon.x - e.x)
      vx = Math.cos(ang) * THROW_SPEED
      vy = Math.sin(ang) * THROW_SPEED
    }
    const f = this.spawnFireball(e.x, e.y, vx, vy, 'thrown', false)
    f.ttl = 2
    e.destroy()
    Audio.play(this, SFX.slash, { rate: 0.8 })
  }

  // The held ember eats exactly one killing blow.
  consumeShield() {
    if (!this.ember) return false
    CombatSystem.puff(this, this.ember.x, this.ember.y, 0xffd24a, 950)
    this.ember.destroy()
    this.ember = null
    Audio.play(this, SFX.crit, { volume: 0.6 })
    this.flashBanner('shield spent!', '#ffd24a')
    return true
  }

  playerHit() {
    if (this.gameOver) return
    if (this.consumeShield()) return
    this.die()
  }
```

- [ ] **Step 3: Add death + retry**

Add after `playerHit()`:

```js
  die() {
    this.gameOver = true
    this.player.body.setVelocity(0, 0)
    if (this.hero.kind === 'anim') this.player.play(`${this.heroKey}-idle`)
    Audio.play(this, SFX.playerDie)
    Music.play(this, 'bgm-trap', { fade: 400 })
    CombatSystem.shake(this, 0.012, 320)
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0b0d1a, 0.72).setOrigin(0, 0).setScrollFactor(0).setDepth(11000)
    pixelText(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 34, 'BURNED', 26, '#ff8a3c').setScrollFactor(0).setDepth(11001)
    pixelText(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 4, this.reachedArena ? 'retry from the arena door' : 'retry the descent', 8, '#cdd7ee').setScrollFactor(0).setDepth(11001)
    const retry = panelButton(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 28, 'RETRY', () => this.scene.restart({ hero: this.heroKey, fromArena: this.reachedArena }), { width: 150, depth: 11001 })
    const menu = panelButton(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 64, 'MAIN MENU', () => this.scene.start('MainMenu'), { width: 150, depth: 11001 })
    for (const b of [retry, menu]) {
      b.bg.setScrollFactor(0)
      b.text.setScrollFactor(0)
    }
  }
```

- [ ] **Step 4: Wire into update()**

In `update()`, after `this.updateStages()` add:

```js
    this.handleEmber(dt)
    this.updateFireballs(dt)
```

- [ ] **Step 5: Build + manual check**

Run: `npm run build 2>&1 | tail -2` → `✓ built`. (Fireballs aren't spawned by anything yet; the death path is verified in Task 8 when the corridor strafes exist.)

- [ ] **Step 6: Commit**

```bash
git add src/scenes/Finale.js
git commit -m "$(cat <<'EOF'
Add fireballs, Emberhand catch/shield/throw and BURNED death

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Dragon class, corridor 1 strafes, and the gift beat

**Files:**
- Modify: `src/scenes/Finale.js`

- [ ] **Step 1: Add the Dragon class**

Add at the bottom of the file, after the scene class:

```js
// A lair dragon: pattern-driven flight (the scene moves it), no physics body.
// hurtByEmber() is the only damage path; hp is measured in returned embers.
class Dragon extends Phaser.GameObjects.Sprite {
  constructor(scene, color, x, y, hp) {
    super(scene, x, y, `${color}-fly`)
    scene.add.existing(this)
    this.color = color
    this.hp = hp
    this.dead = false
    this.setScale(2.4).setDepth(940)
    this.play(`${color}-fly`)
  }

  hurtByEmber() {
    if (this.dead) return
    this.hp--
    this.setTintFill(0xffffff)
    this.scene.time.delayedCall(80, () => {
      if (this.active && !this.dead) this.clearTint()
    })
    Audio.play(this.scene, SFX.enemyHit, { volume: 0.9 })
    CombatSystem.shake(this.scene, 0.005, 100)
    this.scene.updatePips()
    if (this.hp <= 0) this.scene.onDragonDown(this)
    else this.scene.onDragonHurt(this)
  }
}
```

- [ ] **Step 2: Corridor 1 strafe runs + the gift beat**

Replace the `startStage(name)` method with:

```js
  startStage(name) {
    this.stage = name
    if (name === 'corridor1') {
      this.flashBanner('something flies above', '#8ea0c0')
      this._strafeT = 1.5
    } else if (name === 'gift') {
      // the scripted first catch: one slow, harmless fireball that waits for E
      this.canCatch = true
      const f = this.spawnFireball(this.player.x + 220, this.player.y, -LOB_SPEED * 0.25, 0, 'gift', true)
      f.ttl = 999
      this._giftBall = f
      this.prompt.setText('PRESS E').setVisible(true)
    } else if (name === 'corridor2') {
      this.flashBanner('hero.catch = true', '#ffd24a')
      this.buildBramble()
      this._strafeT = 3
    }
  }
```

Add after `updateStages()`:

```js
  // The green strafes along the top wall and lobs a fireball at the hero as it
  // passes. In corridor 1 the hero can only dodge; in corridor 2 (post-gift)
  // the same fireballs are practice ammunition.
  runStrafe() {
    const fromLeft = Math.random() < 0.5
    const startX = this.cameras.main.scrollX + (fromLeft ? -50 : GAME_WIDTH + 50)
    const d = this.add.sprite(startX, LANE_TOP - 14, 'green-glide').setScale(2).setDepth(945).setFlipX(fromLeft)
    d.play('green-glide')
    Audio.play(this, SFX.spit, { rate: 0.5, volume: 0.7 })
    this.tweens.add({
      targets: d,
      x: startX + (fromLeft ? 1 : -1) * (GAME_WIDTH + 100),
      duration: 2400,
      onUpdate: () => {
        if (!d._fired && Math.abs(d.x - this.player.x) < 30) {
          d._fired = true
          const ang = Math.atan2(this.player.y - d.y, this.player.x - d.x)
          this.spawnFireball(d.x, d.y + 10, Math.cos(ang) * LOB_SPEED, Math.sin(ang) * LOB_SPEED, 'lob', true)
        }
      },
      onComplete: () => d.destroy(),
    })
  }

  updateGift() {
    const f = this._giftBall
    if (!f) return
    // close in, then hover and wait for the catch
    if (Phaser.Math.Distance.Between(f.spr.x, f.spr.y, this.player.x, this.player.y) < 60) {
      f.vx = 0
      f.spr.y += Math.sin(this.time.now / 200) * 0.3
    }
    this.prompt.setPosition(this.player.x, this.player.y - 30)
    if (!this.fireballs.includes(f)) {
      // it was caught — the Emberhand is awake
      this._giftBall = null
      this.prompt.setVisible(false)
      this.startStage('corridor2')
    }
  }
```

- [ ] **Step 3: Tick strafes and the gift from update()**

In `update()`, after `this.updateStages()` add:

```js
    if ((this.stage === 'corridor1' || this.stage === 'corridor2') && (this._strafeT -= dt) <= 0) {
      this._strafeT = this.stage === 'corridor1' ? 3.5 : 4.5
      this.runStrafe()
    }
    if (this.stage === 'gift') this.updateGift()
```

(`updatePips`, `onDragonDown`, `onDragonHurt`, `buildBramble` arrive in Tasks 9–10; add empty stubs now so this builds: `updatePips() {}`, `onDragonDown() {}`, `onDragonHurt() {}`, `buildBramble() {}` after `buildDoors()`.)

- [ ] **Step 4: Build + manual check**

Run: `npm run build 2>&1 | tail -2` → `✓ built`.
Manual (`#finale`): in corridor 1 the green glides past overhead lobbing fireballs; getting hit shows BURNED + RETRY (restarts at the walkway). At x≈560 the slow gift fireball drifts in with PRESS E; catching it orbits an ember and banners `hero.catch = true`; E again hurls it.

- [ ] **Step 5: Commit**

```bash
git add src/scenes/Finale.js
git commit -m "$(cat <<'EOF'
Add dragon strafes and the Emberhand gift beat

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Corridor 2 — the burning bramble

**Files:**
- Modify: `src/scenes/Finale.js`

- [ ] **Step 1: Replace the buildBramble stub**

```js
  // A burning barrier across the lane: the throw lesson. One ember burns it away.
  buildBramble() {
    const x = BRAMBLE_X
    this.brambleBits = []
    for (let y = LANE_TOP + 14; y < LANE_BOT; y += 26) {
      const bit = this.add.image(x, y, 'hunt-tree').setScale(0.8).setOrigin(0.5, 0.7).setDepth(y).setTint(0xb3543a)
      this.tweens.add({ targets: bit, alpha: 0.75, yoyo: true, repeat: -1, duration: 420 })
      this.brambleBits.push(bit)
    }
    const wall = this.add.rectangle(x, (LANE_TOP + LANE_BOT) / 2, 16, LANE_BOT - LANE_TOP, 0x000000, 0)
    this.physics.add.existing(wall, true)
    this.physics.add.collider(this.player, wall)
    this.bramble = { x, wall }
  }

  burnBramble() {
    for (const bit of this.brambleBits) {
      this.tweens.killTweensOf(bit)
      this.tweens.add({ targets: bit, alpha: 0, duration: 500, onComplete: () => bit.destroy() })
    }
    CombatSystem.puff(this, this.bramble.x, this.player.y, 0xff8a3c, 950)
    Audio.play(this, SFX.heavy, { volume: 0.7 })
    this.bramble.wall.body.enable = false
    this.bramble = null
    this.flashBanner('the way is open', '#7cfc98')
  }
```

- [ ] **Step 2: Let thrown embers hit the bramble**

In `updateFireballs()`, inside the `if (f.kind === 'thrown')` branch, BEFORE the dragon check, add:

```js
        if (this.bramble && Math.abs(f.spr.x - this.bramble.x) < 18) {
          this.killFireball(f)
          this.burnBramble()
          continue
        }
```

- [ ] **Step 3: Build + manual check**

Run: `npm run build 2>&1 | tail -2` → `✓ built`.
Manual: in corridor 2 the flickering bramble blocks the lane; catch a strafe fireball, face the bramble and press E — it burns away and the lane opens. Walking past x≈984 seals the last door (arena entry logs `arena1` stage; the arena itself is next).

- [ ] **Step 4: Commit**

```bash
git add src/scenes/Finale.js
git commit -m "$(cat <<'EOF'
Add burning bramble throw lesson to corridor 2

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: The arena — torches, ember pips, and the Green fight

**Files:**
- Modify: `src/scenes/Finale.js`

- [ ] **Step 1: Arena entry — torches, music, pips, Green spawn**

Extend `startStage()` with two new branches (after the `corridor2` branch):

```js
    } else if (name === 'arena1') {
      this.reachedArena = true
      this.buildTorches()
      Music.play(this, 'bgm-boss', { fade: 1200 })
      this.flashBanner('THE GREEN', '#6fcf5a')
      this.dragon = new Dragon(this, 'green', DOOR_X[2] + 220, LANE_TOP + 40, GREEN_HP)
      this.dragon.mode = 'hover'
      this._atkT = 2.5
      this._swoopT = 7
      this.buildPips(GREEN_HP, 0x6fcf5a)
    } else if (name === 'arena2') {
      this.flashBanner('THE RED', '#e05a4a')
      this.dragon = new Dragon(this, 'red', DOOR_X[2] + 220, LANE_TOP + 40, RED_HP)
      this.dragon.mode = 'hover'
      this._atkT = 2.2
      this._swoopT = 9
      this.buildPips(RED_HP, 0xe05a4a)
    }
```

Replace the `jumpToArena()` stub with:

```js
  // Retry-from-arena: skip the corridors, gift granted, doors sealed.
  jumpToArena() {
    this.canCatch = true
    for (const d of this.doors) {
      d.sealed = true
      d.slab.setVisible(true)
      d.slab.body.enable = true
    }
    this.startStage('arena1')
  }
```

Add the torch + pip builders after `buildDoors()` (replacing the `updatePips() {}` stub):

```js
  // Standing torch ring: the first fully lit space in the game — until the rage.
  buildTorches() {
    const cx = (DOOR_X[2] + WORLD_W) / 2
    const positions = [
      [cx - 170, LANE_TOP + 16], [cx, LANE_TOP + 10], [cx + 170, LANE_TOP + 16],
      [cx - 170, LANE_BOT - 16], [cx, LANE_BOT - 10], [cx + 170, LANE_BOT - 16],
    ]
    for (const [x, y] of positions) {
      const glow = this.add.ellipse(x, y - 10, 14, 10, 0xffb24a, 0.85).setDepth(y)
      const flame = this.add.ellipse(x, y - 16, 7, 13, 0xffd86b, 1).setDepth(y + 1)
      this.tweens.add({ targets: flame, scaleY: 1.3, scaleX: 0.78, yoyo: true, repeat: -1, duration: 300, ease: 'Sine.easeInOut' })
      this.torches.push({ x, y: y - 12, glow, flame, lit: true })
    }
  }

  buildPips(count, tint) {
    for (const p of this.pips) p.destroy()
    this.pips = []
    const x0 = GAME_WIDTH / 2 - ((count - 1) * 22) / 2
    for (let i = 0; i < count; i++) {
      const p = this.add.sprite(x0 + i * 22, 18, 'fireball').setScrollFactor(0).setDepth(9500).setScale(0.9).setTint(tint)
      p.play('fireball')
      this.pips.push(p)
    }
  }

  updatePips() {
    this.pips.forEach((p, i) => p.setAlpha(i < (this.dragon?.hp ?? 0) ? 1 : 0.18))
  }
```

- [ ] **Step 2: Dragon flight + attacks**

Replace the `onDragonHurt() {}` and `onDragonDown() {}` stubs and add the per-frame brain:

```js
  // Hover drift + attack timers. Green lobs singles; Red fans three (center
  // catchable) — rage speeds the fans up. Swoops/dives telegraph with a floor
  // line, then cross it; contact kills unless the shield eats it.
  updateDragon(dt) {
    const d = this.dragon
    if (!d || d.dead || d.swooping) return
    const cx = (DOOR_X[2] + WORLD_W) / 2
    d.x = cx + Math.sin(this.time.now / 1700) * 180
    d.y = LANE_TOP + 42 + Math.sin(this.time.now / 900) * 16
    d.setFlipX(this.player.x > d.x)
    d.setDepth(940)

    this._atkT -= dt
    if (this._atkT <= 0) {
      this._atkT = d.color === 'green' ? 2.4 : this.stage === 'rage' ? 1.6 : 2.8
      const ang = Math.atan2(this.player.y - d.y, this.player.x - d.x)
      Audio.play(this, SFX.spit, { rate: 0.7 })
      if (d.color === 'green') {
        this.spawnFireball(d.x, d.y + 12, Math.cos(ang) * LOB_SPEED, Math.sin(ang) * LOB_SPEED, 'lob', true)
      } else {
        for (const off of [-0.35, 0, 0.35]) {
          this.spawnFireball(d.x, d.y + 12, Math.cos(ang + off) * FAN_SPEED, Math.sin(ang + off) * FAN_SPEED, 'fan', off === 0)
        }
      }
    }

    this._swoopT -= dt
    if (this._swoopT <= 0) {
      this._swoopT = d.color === 'green' ? 7 : 9
      this.runSwoop(d)
    }
  }

  runSwoop(d) {
    d.swooping = true
    const y = this.player.y
    const tele = this.add.rectangle(this.cameras.main.scrollX + GAME_WIDTH / 2, y, GAME_WIDTH, 4, 0xff6a4a, 0.5).setDepth(930)
    this.tweens.add({ targets: tele, alpha: 0.1, yoyo: true, repeat: 3, duration: 100 })
    Audio.play(this, SFX.crit, { volume: 0.4, rate: 0.7 })
    this.time.delayedCall(800, () => {
      tele.destroy()
      if (this.gameOver || !d.active || d.dead) return
      const fromLeft = d.x < this.player.x
      d.play(`${d.color}-glide`)
      d.setPosition(this.cameras.main.scrollX + (fromLeft ? -40 : GAME_WIDTH + 40), y - 6)
      d.setFlipX(fromLeft)
      this.tweens.add({
        targets: d,
        x: d.x + (fromLeft ? 1 : -1) * (GAME_WIDTH + 120),
        duration: 900,
        onUpdate: () => {
          if (!this.gameOver && Math.abs(d.x - this.player.x) < 26 && Math.abs(y - this.player.y) < 22) this.playerHit()
        },
        onComplete: () => {
          d.swooping = false
          d.play(`${d.color}-fly`)
        },
      })
    })
  }

  onDragonHurt(d) {
    // the Red's last ember snuffs the lights: the rage
    if (d.color === 'red' && d.hp === 1 && this.stage !== 'rage') {
      this.stage = 'rage'
      this.flashBanner('dragon.rage = true', '#ff3b3b')
      Audio.play(this, SFX.crit, { volume: 0.8, rate: 0.6 })
      for (const t of this.torches) {
        t.lit = false
        this.tweens.add({ targets: [t.glow, t.flame], alpha: 0, duration: 600 })
      }
    }
  }

  onDragonDown(d) {
    d.dead = true
    this.tweens.killTweensOf(d)
    Audio.play(this, SFX.enemyDie, { volume: 0.9, rate: 0.7 })
    CombatSystem.puff(this, d.x, d.y, d.color === 'green' ? 0x6fcf5a : 0xe05a4a, 950)
    this.tweens.add({ targets: d, y: d.y + 60, alpha: 0, angle: 30, duration: 900, ease: 'Quad.easeIn', onComplete: () => d.destroy() })
    this.dragon = null
    for (const f of [...this.fireballs]) if (f.kind !== 'thrown') this.killFireball(f)
    if (d.color === 'green') {
      this.flashBanner('dragon.green = down', '#6fcf5a')
      this.time.delayedCall(2000, () => {
        if (!this.gameOver) this.startStage('arena2')
      })
    } else {
      this.startDawn() // Task 11
    }
  }
```

Add a temporary `startDawn() {}` stub after `onDragonDown()` (replaced in Task 11).

- [ ] **Step 3: Tick the dragon from update()**

In `update()`, after the strafe/gift block add:

```js
    this.updateDragon(dt)
```

- [ ] **Step 4: Build + manual check**

Run: `npm run build 2>&1 | tail -2` → `✓ built`.
Manual (`#finale`, walk to the arena — or temporarily retry from a death past the door to use `fromArena`): torch ring lights the arena, THE GREEN hovers and lobs; pips top-center dim as embers land; swoop telegraphs a red line then crosses it; 3 hits → green falls, THE RED enters with fans (only the center ball uncatchably-tinted-free) and faster pressure; at 1 hp the lights die and `dragon.rage = true`.

- [ ] **Step 5: Commit**

```bash
git add src/scenes/Finale.js
git commit -m "$(cat <<'EOF'
Add arena fights: Green and Red dragons with rage darkness

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Dawn, persistence, and the entry hooks

**Files:**
- Modify: `src/scenes/Finale.js` (replace the `startDawn` stub)
- Modify: `src/scenes/NightHunt.js` (`handleExit`, the `if (e.isFinal)` branch)
- Modify: `src/scenes/ModePage.js` (hunt branch of `create()`)

- [ ] **Step 1: Replace the startDawn stub**

```js
  // The night ends. Fog warms from black to morning, Roll Credits plays, and
  // the save remembers: dawn unlocks the Endless Night and the FINALE button.
  startDawn() {
    this.stage = 'dawn'
    this.gameOver = true // freezes update(); updateFog still runs each frame
    this.player.body.setVelocity(0, 0)
    if (this.hero.kind === 'anim') this.player.play(`${this.heroKey}-idle`)
    const hunt = SaveSystem.data.hunt
    hunt.dawn = true
    SaveSystem.save()
    Music.stop(this, { fade: 800 })
    if (this.cache.audio.exists('cue-dawn')) {
      const cue = this.sound.add('cue-dawn', { volume: 0.8 })
      cue.play()
      this.events.once('shutdown', () => cue.destroy())
    }
    // fog warms to morning
    const c0 = Phaser.Display.Color.ValueToColor(this.fogColor)
    const c1 = Phaser.Display.Color.ValueToColor(0x8a93c8)
    const mix = { t: 0 }
    this.tweens.add({
      targets: mix,
      t: 100,
      duration: 4000,
      onUpdate: () => {
        const c = Phaser.Display.Color.Interpolate.ColorWithColor(c0, c1, 100, mix.t)
        this.fogColor = Phaser.Display.Color.GetColor(c.r, c.g, c.b)
      },
    })
    this.time.delayedCall(3000, () => {
      this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x10142a, 0.55).setOrigin(0, 0).setScrollFactor(0).setDepth(11000)
      pixelText(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 44, 'DAWN', 28, '#ffe066').setScrollFactor(0).setDepth(11001)
      pixelText(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 12, 'save.dawn = true', 9, '#7ab8ff').setScrollFactor(0).setDepth(11001)
      pixelText(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 6, 'the ENDLESS NIGHT is open', 8, '#8ea0c0').setScrollFactor(0).setDepth(11001)
      const menu = panelButton(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 44, 'MAIN MENU', () => this.scene.start('MainMenu'), { width: 170, depth: 11001 })
      menu.bg.setScrollFactor(0)
      menu.text.setScrollFactor(0)
    })
  }
```

- [ ] **Step 2: Route round 5's final exit into the lair (NightHunt.js)**

In `handleExit()`, change the final-exit branch from:

```js
        if (e.isFinal) {
          this.roundCleared()
          return
        }
```

to:

```js
        if (e.isFinal) {
          // clearing round 5 leads down into the lair — until dawn is earned;
          // afterwards the rounds run on into the Endless Night
          if (this.round === 5 && !SaveSystem.data.hunt.dawn) {
            const hunt = SaveSystem.data.hunt
            hunt.bestRound = Math.max(hunt.bestRound, 6)
            SaveSystem.save()
            this.scene.start('Finale', { hero: this.heroKey })
            return
          }
          this.roundCleared()
          return
        }
```

- [ ] **Step 3: FINALE replay button on the hunt briefing (ModePage.js)**

In the `if (this.mode === 'hunt')` block of `create()`, after the RULES button line, add:

```js
      // dawn earned: the lair stays open for refights
      if (SaveSystem.data.hunt.dawn) {
        panelButton(this, GAME_WIDTH / 2 - 164, 306, 'FINALE', () => this.scene.start('Finale'), { size: 9, width: 104 })
      }
```

- [ ] **Step 4: Build + full manual pass**

Run: `npm run build 2>&1 | tail -2` → `✓ built`.
Manual: beat the Red via `#finale` → fog warms, DAWN screen, `save.dawn = true`; back at the menu the briefing now shows FINALE; in a real run, clearing round 5 post-dawn rolls into round 6.

- [ ] **Step 5: Playwright screenshot sweep**

With the dev server up, reuse `/tmp/pwtest/finale-shot.mjs` (Task 5) to capture the walkway, and visually confirm screenshots at: corridor 1 (strafe + fireball), arena (torch ring + green + pips). Drive with `page.keyboard.down('D')` + waits between captures.

- [ ] **Step 6: Commit**

```bash
git add src/scenes/Finale.js src/scenes/NightHunt.js src/scenes/ModePage.js
git commit -m "$(cat <<'EOF'
Add dawn ending, endless unlock and finale entry hooks

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Tuning + polish pass (playtest-driven)

**Files:**
- Modify: `src/scenes/Finale.js` (constants only, unless a playtest reveals a bug)

- [ ] **Step 1: User playtest checklist**

Hand the user this list (they play via `#finale`):
1. Walkway feels dark and safe; corridor 1 fireballs dodgeable at walk speed.
2. The gift beat can't kill you and waits indefinitely.
3. Bramble: a missed throw isn't a softlock (the next strafe brings more ammo).
4. Green fight: catch windows feel generous; swoop telegraph readable.
5. Red fight: the catchable center ball reads clearly against the dark outer pair; the dive is dodgeable by sprint alone.
6. Rage in the dark is scary but fair (fireballs light themselves).
7. BURNED → RETRY from arena door keeps the gift; full retry re-teaches.
8. Dawn sequence and the ENDLESS NIGHT unlock both land.

- [ ] **Step 2: Apply tuning feedback by editing the named constants** (`CATCH_RADIUS`, `LOB_SPEED`, `FAN_SPEED`, `GREEN_HP`, `RED_HP`, swoop/fan timers in `updateDragon`/`runSwoop`).

- [ ] **Step 3: Build + commit whatever changed**

```bash
npm run build 2>&1 | tail -2
git add src/scenes/Finale.js
git commit -m "$(cat <<'EOF'
Tune finale fight from playtest feedback

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-review notes

- **Spec coverage:** entry trigger (T11), bestRound bump (T11), walkway/corridors/gift/bramble (T6, T8, T9), Emberhand rules incl. no-penalty empty press and one-ember cap (T7), green 3 / red 4 embers (T10), center-only catchable fans + dark tint (T7 `spawnFireball` + T10), swoop/dive telegraph (T10), rage darkness with fireball light (T5 `updateFog` + T10), BURNED + fromArena retry (T7, T10 `jumpToArena`), dawn + `hunt.dawn` + endless + FINALE button (T11), dropped survival systems (never built — only sprint/stamina exist in T5), touch labels (T5), `#finale` dev hash (T5), assets/music (T1–2), shared extractions (T3–4).
- **Spec deviation (intentional):** the spec's separate dive-bomb for the Red is implemented as the shared swoop pattern at a different cadence — same telegraph-line mechanic, less duplicate code. Functionally identical to the player ("a marked line you sprint clear of").
- **Type consistency:** `spawnFireball(x, y, vx, vy, kind, catchable)` used identically in T7/T8/T10; `Dragon.hurtByEmber()` called from T7's thrown-hit branch; scene callbacks `updatePips/onDragonHurt/onDragonDown/startDawn/buildBramble` are stubbed where first referenced and replaced in their tasks.
