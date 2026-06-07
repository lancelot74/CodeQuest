import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../config.js'
import { pixelText, panelButton, uiPanel } from '../ui/widgets.js'
import { Audio, SFX } from '../systems/AudioSystem.js'
import { CombatSystem } from '../systems/CombatSystem.js'
import { SaveSystem } from '../systems/SaveSystem.js'
import { TouchState } from '../systems/TouchState.js'
import { showTouchControls, hideTouchControls } from '../ui/touchControls.js'
import Hunter, { SENSES, SKINS } from '../systems/Hunter.js'

const TILE = 24
const WORLD_COLS = 50
const WORLD_ROWS = 34
const WORLD_W = WORLD_COLS * TILE // 1200
const WORLD_H = WORLD_ROWS * TILE // 816

const WALK_SPEED = 96
const SPRINT_SPEED = 168
const LIGHT_RADIUS = 104 // player light WITH a torch
const SMALL_LIGHT = 30 // player light without a torch (immediate surroundings only)
const TORCH_LIGHT = 80 // ambient pool cast by a map torch
const OBJ_RADIUS = 34
const OBJ_HOLD = 1.5 // seconds to channel an objective
const EXIT_RADIUS = 30
const CATCH_DIST = 22
const PICKUP_DIST = 26
const NUM_STONES = 5
const NUM_TORCHES = 5
const VOLLEY_SPEED = 200
const WAVE_SPEED = 180
const HOMING_SPEED = 210

// dash stamina: sprinting drains it; emptying it forces a walk until it recovers
// past STAM_FLOOR. Tuned so a sprint lasts a few seconds, not forever.
const STAM_MAX = 1
const STAM_DRAIN = 0.55
const STAM_REGEN = 0.4
const STAM_FLOOR = 0.25

// exposure / freeze (round 2+): standing in darkness with no torch drains warmth;
// at zero the hero freezes in place for a beat — easy prey. Torchlight (carried, or
// a map torch's glow) warms you; carrying a torch makes you immune.
const WARM_MAX = 1
const COLD_DRAIN = 0.22
const WARM_REGEN = 0.5
const FREEZE_TIME = 1.6
const FREEZE_THAW = 0.5 // warmth restored after a freeze ends
const WARM_RANGE = TORCH_LIGHT * 0.85 // how close a map torch must be to warm you

const GRASS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 13, 14, 16, 18, 21, 33]

// Pickable heroes. The four platformer heroes are animated 32px sheets; Knight and
// Golem are single-frame hunt-pack images (faked locomotion via a squash bob).
// 'anim' heroes play `${key}-run/-idle`; 'static' heroes just bob + flip.
const HEROES = [
  { key: 'ninja', label: 'FROG', kind: 'anim', scale: 1.05, origin: 0.72, body: [16, 14], off: [8, 15] },
  { key: 'pink', label: 'PINK', kind: 'anim', scale: 1.05, origin: 0.72, body: [16, 14], off: [8, 15] },
  { key: 'mask', label: 'MASK', kind: 'anim', scale: 1.05, origin: 0.72, body: [16, 14], off: [8, 15] },
  { key: 'virtual', label: 'VIRTUAL', kind: 'anim', scale: 1.05, origin: 0.72, body: [16, 14], off: [8, 15] },
  { key: 'hunt-hero', label: 'KNIGHT', kind: 'static', scale: 0.62, origin: 0.62, body: [20, 14] },
  { key: 'hunt-golem', label: 'GOLEM', kind: 'static', scale: 0.95, origin: 0.62, body: [16, 12] },
]
const TOUCH_LABELS = { jump: 'RUN', attack: 'USE', heavy: null }

// NIGHT HUNT — a top-down survival-horror roguelite (Cobb Can Move-style). Roam a
// dark forest doing 3 objectives and reach the exit while ONE stalker hunts you;
// each round randomizes its active sense + boss skin. See Hunter.js for the AI.
export default class NightHuntScene extends Phaser.Scene {
  constructor() {
    super('NightHunt')
  }

  create(data) {
    this.round = data?.round || 1
    // hero: NIGHT HUNT-local pick (registry) defaulting to the saved character
    const wanted = this.registry.get('huntHero') || SaveSystem.data.character
    this.heroKey = HEROES.some((h) => h.key === wanted) ? wanted : 'ninja'
    this.hero = HEROES.find((h) => h.key === this.heroKey)
    this._prevUseBtn = false
    this.interacting = false
    this.gameOver = false
    this.spawn = { x: WORLD_W / 2, y: WORLD_H / 2 }
    this.objectives = []
    this.projectiles = []
    this.scent = []
    this._burst = 0
    this._scentT = 0
    this._stepT = 0
    this.faceX = 1
    this.faceY = 0
    this.carried = null // single inventory slot: 'stone' | 'torch' | null
    this.stamina = STAM_MAX
    this.exhausted = false
    this.hasTorch = false
    this.warmth = WARM_MAX
    this.frozen = false
    this.freezeTimer = 0
    this._alarmT = 0
    this._noPickT = 0
    this.torches = []
    this.stones = []
    this.playerMoving = false
    this.playerLoudness = 0
    this.playerMoveFactor = 0
    this.exit = null
    this.hunters = []
    this.bannerEls = []

    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H)
    this.buildArena()
    this.buildPlayer()

    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H)
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12)

    this.makeLights()
    this.buildFog()
    this.buildHud()

    this.keys = this.input.keyboard.addKeys('W,A,S,D,SHIFT,E,UP,DOWN,LEFT,RIGHT')

    showTouchControls(TOUCH_LABELS)
    this.events.once('shutdown', () => hideTouchControls())

    this.startRound()
  }

  // ---- arena ----------------------------------------------------------------
  buildArena() {
    const floor = this.add.renderTexture(0, 0, WORLD_W, WORLD_H).setOrigin(0, 0).setDepth(0)
    for (let r = 0; r < WORLD_ROWS; r++) {
      for (let c = 0; c < WORLD_COLS; c++) {
        floor.drawFrame('hunt-tiles', Phaser.Utils.Array.GetRandom(GRASS), c * TILE, r * TILE)
      }
    }
    // night wash — dims the grass so the flashlight reads (robust vs. tint support)
    this.add.rectangle(0, 0, WORLD_W, WORLD_H, 0x0a1430, 0.5).setOrigin(0, 0).setDepth(1)

    this.wallZones = []
    this.wallRects = []

    // decorative border forest (world bounds keep the player in)
    for (let x = 16; x < WORLD_W; x += 40) {
      this.add.image(x, 26, 'hunt-tree').setOrigin(0.5, 1).setDepth(26)
      this.add.image(x, WORLD_H - 2, 'hunt-tree').setOrigin(0.5, 1).setDepth(WORLD_H - 2)
    }
    for (let y = 40; y < WORLD_H; y += 44) {
      this.add.image(14, y, 'hunt-tree').setOrigin(0.5, 1).setDepth(y)
      this.add.image(WORLD_W - 14, y, 'hunt-tree').setOrigin(0.5, 1).setDepth(y)
    }

    // interior obstacles (block movement AND line-of-sight), away from the spawn
    const props = ['hunt-tree', 'hunt-tree', 'hunt-big_stone', 'hunt-mid_stone', 'hunt-skull']
    for (let i = 0; i < 26; i++) {
      const x = Phaser.Math.Between(120, WORLD_W - 120)
      const y = Phaser.Math.Between(120, WORLD_H - 120)
      if (Phaser.Math.Distance.Between(x, y, this.spawn.x, this.spawn.y) < 150) continue
      this.addObstacle(x, y, Phaser.Utils.Array.GetRandom(props))
    }

    // sample open (non-wall) points for placement + hunter patrol
    this.openPoints = []
    for (let x = 90; x < WORLD_W - 90; x += 56) {
      for (let y = 90; y < WORLD_H - 90; y += 56) {
        if (!this.wallRects.some((rr) => rr.contains(x, y))) this.openPoints.push({ x, y })
      }
    }
  }

  addObstacle(x, y, key) {
    const img = this.add.image(x, y, key).setOrigin(0.5, 1).setDepth(y)
    const w = img.width
    const h = img.height
    // collider near the base; LOS footprint covers the body
    const rect = this.add.rectangle(x, y - 7, w * 0.5, 12, 0x000000, 0).setVisible(false)
    this.physics.add.existing(rect, true)
    this.wallZones.push(rect)
    this.wallRects.push(new Phaser.Geom.Rectangle(x - w * 0.32, y - h * 0.7, w * 0.64, h * 0.62))
  }

  // ---- player ---------------------------------------------------------------
  buildPlayer() {
    const h = this.hero
    this.playerShadow = this.add.ellipse(this.spawn.x, this.spawn.y, 20, 7, 0x000000, 0.32)
    const tex = h.kind === 'anim' ? `${h.key}-idle` : h.key
    this.player = this.physics.add.sprite(this.spawn.x, this.spawn.y, tex).setOrigin(0.5, h.origin).setScale(h.scale)
    if (h.kind === 'anim') this.player.play(`${h.key}-idle`)
    this.player.body.setAllowGravity(false)
    this.player.setCollideWorldBounds(true)
    this.player.body.setSize(h.body[0], h.body[1])
    if (h.off) this.player.body.setOffset(h.off[0], h.off[1])
    this.physics.add.collider(this.player, this.wallZones)

    // little flame the hero holds once they pick up a torch
    this.carryFlame = this.add.ellipse(this.spawn.x, this.spawn.y, 7, 12, 0xffd86b, 1).setVisible(false)
  }

  handlePlayer(dt, time) {
    const k = this.keys
    const t = TouchState
    this.interacting = k.E.isDown || t.attackL

    // exposure/freeze (round 2+): refill near torchlight, drain in the dark
    this.updateWarmth(dt)
    if (this.frozen) {
      this.freezeTimer -= dt
      this.player.body.setVelocity(0, 0)
      this.player.x += Math.sin(time / 20) * 0.6 // shiver
      this.playerMoving = false
      this.playerMoveFactor = 0
      this.playerLoudness = 0
      if (this.freezeTimer <= 0) {
        this.frozen = false
        this.warmth = FREEZE_THAW
        this.player.clearTint()
      }
      this.player.setDepth(this.player.y)
      this.playerShadow.setPosition(this.player.x, this.player.y + this.player.displayHeight * 0.22).setDepth(this.player.y - 1)
      return
    }

    let ax = (k.D.isDown || k.RIGHT.isDown || t.right ? 1 : 0) - (k.A.isDown || k.LEFT.isDown || t.left ? 1 : 0)
    let ay = (k.S.isDown || k.DOWN.isDown || t.down ? 1 : 0) - (k.W.isDown || k.UP.isDown || t.up ? 1 : 0)
    const moving = ax !== 0 || ay !== 0

    // stamina-gated dash: drains while sprinting, recovers otherwise; once emptied
    // you're locked to a walk until it climbs back past STAM_FLOOR
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
    }
    this.player.body.setVelocity(ax * speed, ay * speed)

    this.playerMoving = moving
    this.playerMoveFactor = moving ? (sprint ? 1 : 0.5) : 0
    this._burst = Math.max(0, this._burst - dt * 1.2)
    this.playerLoudness = (moving ? (sprint ? 1.0 : 0.4) : 0) + this._burst

    if (moving) {
      this.faceX = ax
      this.faceY = ay
      if (Math.abs(ax) > 0.02) this.player.flipX = ax < 0
    }
    if (this.hero.kind === 'anim') {
      const want = moving ? `${this.hero.key}-run` : `${this.hero.key}-idle`
      if (this.player.anims.getName() !== want) this.player.play(want)
    } else {
      // single-frame hero: fake a walk with a vertical squash
      this.player.scaleY = moving ? this.hero.scale * (1 + 0.06 * Math.sin(time / 70)) : this.hero.scale
    }

    // footsteps: cadence scales with speed; only audible while actually moving
    if (moving) {
      this._stepT -= dt
      if (this._stepT <= 0) {
        this._stepT = sprint ? 0.26 : 0.42
        Audio.play(this, SFX.jump, { volume: sprint ? 0.5 : 0.32, rate: sprint ? 1.25 : 1.05 })
      }
    } else {
      this._stepT = 0
    }

    this.player.setDepth(this.player.y)
    this.playerShadow.setPosition(this.player.x, this.player.y + this.player.displayHeight * 0.22).setDepth(this.player.y - 1)

    if (this.hasTorch) {
      this.carryFlame
        .setPosition(this.player.x + 7, this.player.y - this.player.displayHeight * 0.5)
        .setDepth(this.player.y + 1)
        .setScale(1, 1 + 0.18 * Math.sin(time / 110))
    }
  }

  // Exposure: only matters from round 2. Carrying a torch keeps you fully warm;
  // otherwise standing in a map torch's glow warms you and darkness chills you. Hit
  // zero and the hero freezes in place for a beat — defenceless against the hunter.
  updateWarmth(dt) {
    if (this.round < 2 || this.frozen) return
    if (this.hasTorch || this.nearTorchLight()) {
      this.warmth = Math.min(WARM_MAX, this.warmth + WARM_REGEN * dt)
      this.player.clearTint()
    } else {
      this.warmth = Math.max(0, this.warmth - COLD_DRAIN * dt)
      if (this.warmth < 0.45) this.player.setTint(0x9ad0ff)
      if (this.warmth <= 0) {
        this.frozen = true
        this.freezeTimer = FREEZE_TIME
        this.player.setTint(0x6fb6ff)
        Audio.play(this, SFX.crit, { volume: 0.5 })
        this.flashBanner('FROZEN!', '#9ad0ff')
      }
    }
  }

  nearTorchLight() {
    for (const tr of this.torches) {
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, tr.x, tr.y) < WARM_RANGE) return true
    }
    return false
  }

  // A SIGHT hunter can only spot you when you're actually lit: carrying a torch or
  // standing inside a map torch's glow. In true darkness you're invisible to sight.
  playerLit() {
    if (this.hasTorch) return true
    for (const tr of this.torches) {
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, tr.x, tr.y) < TORCH_LIGHT) return true
    }
    return false
  }

  // Throw the carried stone in the facing direction. It lands, makes a loud noise
  // and yanks every hunter's attention to the spot — your tool for peeling a chase.
  throwLure() {
    if (this.frozen || this.carried !== 'stone') return
    this.carried = null
    Audio.play(this, SFX.click)
    let fx = this.faceX
    let fy = this.faceY
    if (fx === 0 && fy === 0) fx = this.player.flipX ? -1 : 1
    const l = Math.hypot(fx, fy) || 1
    const dist = 170
    const tx = Phaser.Math.Clamp(this.player.x + (fx / l) * dist, 40, WORLD_W - 40)
    const ty = Phaser.Math.Clamp(this.player.y + (fy / l) * dist, 40, WORLD_H - 40)

    const rock = this.add.image(this.player.x, this.player.y - 14, 'hunt-mid_stone').setDepth(960).setScale(1.1)
    this.tweens.add({
      targets: rock,
      x: tx,
      y: ty,
      angle: 240,
      duration: 420,
      ease: 'Quad.easeOut',
      onComplete: () => {
        rock.destroy()
        Audio.play(this, SFX.hit, { volume: 0.5 })
        CombatSystem.puff(this, tx, ty, 0xb6c2d8)
        this.scent.push({ x: tx, y: ty, str: 1.1 })
        this.hunters.forEach((h) => h.distract(tx, ty))
      },
    })
    this.updateInventoryHud()
  }

  updateScent(dt) {
    this._scentT += dt
    if (this._scentT >= 0.12) {
      this._scentT = 0
      this.scent.push({ x: this.player.x, y: this.player.y, str: 0.3 + 0.7 * this.playerMoveFactor })
      if (this.scent.length > 70) this.scent.shift()
    }
    for (const s of this.scent) s.str -= dt * 0.18
    this.scent = this.scent.filter((s) => s.str > 0)
  }

  // ---- sense helpers used by Hunter -----------------------------------------
  losClear(ax, ay, bx, by) {
    const steps = 14
    for (let i = 1; i < steps; i++) {
      const t = i / steps
      const x = ax + (bx - ax) * t
      const y = ay + (by - ay) * t
      for (const r of this.wallRects) if (r.contains(x, y)) return false
    }
    return true
  }

  smellQuery(hx, hy, range) {
    let best = null
    let bd = range
    for (const s of this.scent) {
      if (s.str <= 0.12) continue
      const d = Phaser.Math.Distance.Between(hx, hy, s.x, s.y)
      if (d < bd) {
        bd = d
        best = { x: s.x, y: s.y, str: s.str }
      }
    }
    const dp = Phaser.Math.Distance.Between(hx, hy, this.player.x, this.player.y)
    if (dp < bd) {
      best = { x: this.player.x, y: this.player.y, str: 0.55 + 0.45 * this.playerMoveFactor }
      bd = dp
    }
    if (!best) return null
    return { sig: best.str * (1 - bd / range), x: best.x, y: best.y }
  }

  randomPatrolPoint(fromX, fromY, radius) {
    const near = this.openPoints.filter((p) => Phaser.Math.Distance.Between(p.x, p.y, fromX, fromY) < radius)
    const pool = near.length ? near : this.openPoints
    return pool.length ? Phaser.Utils.Array.GetRandom(pool) : { x: fromX, y: fromY }
  }

  // ---- round flow -----------------------------------------------------------
  startRound() {
    this.gameOver = false
    this.clearProjectiles()
    this.clearRoundEntities()

    // escalation: round R fields min(R,3) hunters, each a distinct sense + skin
    const n = Phaser.Math.Clamp(this.round, 1, 3)
    this.activeSenses = Phaser.Utils.Array.Shuffle(Object.keys(SENSES)).slice(0, n)
    this.activeSkins = Phaser.Utils.Array.Shuffle(Object.keys(SKINS)).slice(0, n)

    this.player.setPosition(this.spawn.x, this.spawn.y)
    this.player.body.setVelocity(0, 0)
    this.player.clearTint()
    this.scent.length = 0
    this.carried = null
    this.stamina = STAM_MAX
    this.exhausted = false
    this.warmth = WARM_MAX
    this.frozen = false
    this.freezeTimer = 0
    this.setTorch(false)
    this.updateInventoryHud()

    this.placeObjectives()
    this.placeExit()
    this.placeStones()
    this.placeTorches()
    this.spawnHunters()

    this.roundText.setText('ROUND ' + this.round)
    this.pips.forEach((p) => p.setTint(0x47506a))
    this.updateHudSense()
    this.showRule()
    Audio.play(this, SFX.levelUp)
  }

  clearRoundEntities() {
    for (const o of this.objectives) {
      o.img.destroy()
      o.ring.destroy()
    }
    this.objectives = []
    for (const s of this.stones) s.destroy()
    this.stones = []
    for (const tr of this.torches) {
      tr.flame.destroy()
      tr.glow.destroy()
    }
    this.torches = []
    if (this.exit) {
      this.exit.destroy()
      this.exit = null
    }
    if (this.hunterColliders) {
      for (const c of this.hunterColliders) this.physics.world.removeCollider(c)
      this.hunterColliders = []
    }
    for (const h of this.hunters) h.destroy()
    this.hunters = []
  }

  spreadPoints(n, minFromSpawn, minSep) {
    const out = []
    const pool = Phaser.Utils.Array.Shuffle([...this.openPoints])
    for (const pt of pool) {
      if (out.length >= n) break
      if (Phaser.Math.Distance.Between(pt.x, pt.y, this.spawn.x, this.spawn.y) < minFromSpawn) continue
      if (out.some((q) => Phaser.Math.Distance.Between(q.x, q.y, pt.x, pt.y) < minSep)) continue
      out.push(pt)
    }
    return out
  }

  placeObjectives() {
    const pts = this.spreadPoints(3, 220, 200)
    for (const pt of pts) {
      const img = this.add.image(pt.x, pt.y, 'hunt-chest_closed').setOrigin(0.5, 0.8).setScale(1.4).setDepth(pt.y)
      const ring = this.add.graphics().setDepth(9000)
      this.objectives.push({ x: pt.x, y: pt.y, img, ring, progress: 0, done: false })
    }
  }

  placeExit() {
    const pool = Phaser.Utils.Array.Shuffle([...this.openPoints])
    let pt = pool.find((p) => Phaser.Math.Distance.Between(p.x, p.y, this.spawn.x, this.spawn.y) > 300) || pool[0]
    this.exit = this.add.image(pt.x, pt.y, 'hunt-sign').setOrigin(0.5, 0.85).setScale(1.5).setDepth(pt.y)
    this.exit.setTint(0x3a4670)
    this.exitOpen = false
  }

  spawnHunters() {
    const pool = Phaser.Utils.Array.Shuffle([...this.openPoints]).filter(
      (p) => Phaser.Math.Distance.Between(p.x, p.y, this.spawn.x, this.spawn.y) > 300
    )
    this.hunters = []
    this.hunterColliders = []
    for (let i = 0; i < this.activeSenses.length; i++) {
      const pt = pool[i] || pool[0] || { x: this.spawn.x + 220, y: this.spawn.y }
      const h = new Hunter(this, pt.x, pt.y, this.activeSkins[i % this.activeSkins.length], this.activeSenses[i])
      this.hunters.push(h)
      this.hunterColliders.push(this.physics.add.collider(h, this.wallZones))
    }
  }

  // lure stones: walk over one to pocket it (your only source of throwables)
  placeStones() {
    for (const pt of this.spreadPoints(NUM_STONES, 120, 120)) {
      this.stones.push(this.add.image(pt.x, pt.y, 'hunt-small_stone').setOrigin(0.5, 0.7).setScale(1.6).setDepth(pt.y))
    }
  }

  // map torches: ambient light pools you navigate by; grab one to carry (wide light,
  // but it makes you visible to a nearby hunter)
  placeTorches() {
    for (const pt of this.spreadPoints(NUM_TORCHES, 150, 170)) this.spawnTorch(pt.x, pt.y)
  }

  spawnTorch(x, y) {
    const glow = this.add.ellipse(x, y - 10, 14, 10, 0xffb24a, 0.85).setDepth(y)
    const flame = this.add.ellipse(x, y - 16, 7, 13, 0xffd86b, 1).setDepth(y + 1)
    this.tweens.add({ targets: flame, scaleY: 1.3, scaleX: 0.78, yoyo: true, repeat: -1, duration: 300, ease: 'Sine.easeInOut' })
    this.torches.push({ x, y: y - 12, flame, glow })
  }

  // Single inventory slot: a stone OR a torch OR nothing. Walk over a pickup with an
  // empty slot to take it; a full slot ignores everything until you throw/drop.
  handlePickups() {
    if (this.frozen || this.carried !== null || this._noPickT > 0) return
    for (const s of [...this.stones]) {
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, s.x, s.y) < PICKUP_DIST) {
        this.stones.splice(this.stones.indexOf(s), 1)
        CombatSystem.puff(this, s.x, s.y - 4, 0xb6c2d8)
        s.destroy()
        this.carried = 'stone'
        Audio.play(this, SFX.click)
        this.updateInventoryHud()
        return
      }
    }
    for (const tr of [...this.torches]) {
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, tr.x, tr.y) < PICKUP_DIST) {
        this.torches.splice(this.torches.indexOf(tr), 1)
        tr.flame.destroy()
        tr.glow.destroy()
        this.carried = 'torch'
        this.setTorch(true)
        Audio.play(this, SFX.levelUp)
        this.flashBanner('TORCH LIT', '#ffb24a')
        return
      }
    }
  }

  // Set the carried torch back down as a map torch — go dark to sneak, losing the
  // wide light (and re-exposing yourself to the freeze in round 2+).
  dropTorch() {
    if (this.frozen || this.carried !== 'torch') return
    this.carried = null
    this._noPickT = 0.7 // brief grace so you don't instantly re-grab it
    this.setTorch(false)
    this.spawnTorch(this.player.x, this.player.y + 10)
    Audio.play(this, SFX.click)
    this.flashBanner('TORCH DROPPED', '#8ea0c0')
  }

  setTorch(on) {
    this.hasTorch = on
    if (this.carryFlame) this.carryFlame.setVisible(on)
    this.updateTorchHud()
    this.updateInventoryHud()
  }

  roundCleared() {
    if (this.gameOver) return
    Audio.play(this, SFX.clear)
    this.round++
    this.flashBanner('ROUND CLEARED', '#7cfc98')
    this.startRound()
  }

  // ---- objectives + exit ----------------------------------------------------
  handleObjectives(dt) {
    let remaining = 0
    let idx = 0
    let channeling = false
    for (const o of this.objectives) {
      if (!o.done) {
        remaining++
        const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, o.x, o.y)
        if (d < OBJ_RADIUS && this.interacting && !this.frozen) {
          channeling = true
          o.progress = Math.min(1, o.progress + dt / OBJ_HOLD)
          this._burst = Math.max(this._burst, 0.5) // channeling is audible
          this.chestAlarm(o, dt)
          if (o.progress >= 1) {
            o.done = true
            this._burst = 1.3 // completing is LOUD
            CombatSystem.puff(this, o.x, o.y - 8, 0xffe066)
            Audio.play(this, SFX.clear)
            this.hunters.forEach((h) => h.distract(o.x, o.y))
            if (this.pips[idx]) this.pips[idx].clearTint()
          }
        } else {
          o.progress = Math.max(0, o.progress - dt * 0.8)
        }
      }
      this.drawObjRing(o)
      idx++
    }
    if (!channeling) this._alarmT = 0
    if (remaining === 0 && !this.exitOpen) this.openExit()
  }

  // Opening a chest shrieks an alarm and drags every hunter toward it regardless of
  // their sense — an objective is always a gamble, never a safe grind.
  chestAlarm(o, dt) {
    this._alarmT -= dt
    if (this._alarmT <= 0) {
      this._alarmT = 0.5
      Audio.play(this, SFX.crit, { volume: 0.6 })
      this.hunters.forEach((h) => h.distract(o.x, o.y))
    }
  }

  drawObjRing(o) {
    const g = o.ring
    g.clear()
    if (o.done) return
    const cx = o.x
    const cy = o.y - 20
    g.lineStyle(3, 0x0a0c14, 0.6).strokeCircle(cx, cy, 9)
    if (o.progress > 0) {
      g.lineStyle(3, 0x7cfc98, 1)
      g.beginPath()
      g.arc(cx, cy, 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * o.progress, false)
      g.strokePath()
    }
  }

  openExit() {
    this.exitOpen = true
    this.exit.clearTint()
    this.tweens.add({ targets: this.exit, scale: 1.7, yoyo: true, repeat: -1, duration: 600 })
    Audio.play(this, SFX.levelUp)
    this.flashBanner('EXIT OPEN', '#ffe066')
  }

  handleExit() {
    if (!this.exitOpen || !this.exit) return
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, this.exit.x, this.exit.y) < EXIT_RADIUS) {
      this.roundCleared()
    }
  }

  nearUnfinishedObjective() {
    for (const o of this.objectives) {
      if (!o.done && Phaser.Math.Distance.Between(this.player.x, this.player.y, o.x, o.y) < OBJ_RADIUS) return true
    }
    return false
  }

  checkCatch() {
    for (const h of this.hunters) {
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, h.x, h.y) < CATCH_DIST) {
        this.playerDeath()
        return
      }
    }
  }

  // ---- hunter attacks (ported from AgeOfWar, aimed at the single player) -----
  spawnHunterAttack(h) {
    const p = this.player
    const ox = h.x
    const oy = h.y - h.displayHeight * 0.3
    const tint = SENSES[h.senseKey].color
    if (h.skin.attack === 'volley') {
      Audio.play(this, SFX.slash)
      const base = Math.atan2(p.y - oy, p.x - ox)
      for (const off of [-0.26, 0, 0.26]) {
        const ang = base + off
        this.makeOrb(ox, oy, 'straight', { vx: Math.cos(ang) * VOLLEY_SPEED, vy: Math.sin(ang) * VOLLEY_SPEED, tint, ttl: 2.4 })
      }
    } else if (h.skin.attack === 'wave') {
      Audio.play(this, SFX.heavy)
      CombatSystem.shake(this, 0.006, 140)
      CombatSystem.puff(this, ox, oy, tint)
      const ang = Math.atan2(p.y - oy, p.x - ox)
      const orb = this.makeOrb(ox, oy, 'wave', { vx: Math.cos(ang) * WAVE_SPEED, vy: Math.sin(ang) * WAVE_SPEED, tint, ttl: 1.5 })
      orb.setScale(2.0, 1.0)
    } else {
      Audio.play(this, SFX.spit)
      this.makeOrb(ox, oy, 'homing', { tint, ttl: 2.6 })
    }
  }

  makeOrb(x, y, kind, opts) {
    const orb = this.add.image(x, y, 'venom').setDepth(950).setScale(1.1).setTint(opts.tint)
    orb._kind = kind
    orb._vx = opts.vx || 0
    orb._vy = opts.vy || 0
    orb._life = 0
    orb._ttl = opts.ttl || 2.2
    this.tweens.add({ targets: orb, angle: 360, duration: 600, repeat: -1 })
    this.projectiles.push(orb)
    return orb
  }

  updateProjectiles(dt) {
    for (const orb of [...this.projectiles]) {
      if (!orb.active) {
        this.killProj(orb)
        continue
      }
      orb._life += dt
      if (orb._kind === 'homing') {
        const ang = Math.atan2(this.player.y - orb.y, this.player.x - orb.x)
        orb.x += Math.cos(ang) * HOMING_SPEED * dt
        orb.y += Math.sin(ang) * HOMING_SPEED * dt
      } else {
        orb.x += orb._vx * dt
        orb.y += orb._vy * dt
      }
      const hitR = orb._kind === 'wave' ? 28 : 15
      if (Phaser.Math.Distance.Between(orb.x, orb.y, this.player.x, this.player.y) < hitR) {
        CombatSystem.puff(this, orb.x, orb.y, orb.tintTopLeft || 0xffffff)
        this.killProj(orb)
        this.playerDeath()
        return
      }
      if (orb.x < -30 || orb.x > WORLD_W + 30 || orb.y < -30 || orb.y > WORLD_H + 30 || orb._life > orb._ttl) {
        this.killProj(orb)
      }
    }
  }

  killProj(orb) {
    const i = this.projectiles.indexOf(orb)
    if (i >= 0) this.projectiles.splice(i, 1)
    if (orb.active) orb.destroy()
  }

  clearProjectiles() {
    for (const orb of this.projectiles) if (orb.active) orb.destroy()
    this.projectiles = []
  }

  // ---- darkness -------------------------------------------------------------
  makeLights() {
    this.makeLight('hunt-light', LIGHT_RADIUS, 1)
    this.makeLight('hunt-light-sm', SMALL_LIGHT, 0.85)
    this.makeLight('hunt-torch-light', TORCH_LIGHT, 0.9)
  }

  makeLight(key, radius, peak) {
    if (this.textures.exists(key)) return
    const d = radius * 2
    const c = this.textures.createCanvas(key, d, d)
    const ctx = c.getContext()
    const g = ctx.createRadialGradient(radius, radius, radius * 0.12, radius, radius, radius)
    g.addColorStop(0, `rgba(255,255,255,${peak})`)
    g.addColorStop(0.62, `rgba(255,255,255,${peak * 0.82})`)
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, d, d)
    c.refresh()
  }

  buildFog() {
    this.fog = this.add.renderTexture(0, 0, GAME_WIDTH, GAME_HEIGHT).setOrigin(0, 0).setScrollFactor(0).setDepth(900)
    if (this.textures.exists('vignette')) {
      this.add.image(0, 0, 'vignette').setOrigin(0, 0).setDisplaySize(GAME_WIDTH, GAME_HEIGHT).setScrollFactor(0).setDepth(905).setAlpha(0.7)
    }
  }

  updateFog() {
    const cam = this.cameras.main
    this.fog.clear()
    this.fog.fill(0x05060a, 1) // pitch black outside the lights
    // ambient torch pools first
    for (const tr of this.torches) {
      this.fog.erase('hunt-torch-light', tr.x - cam.scrollX - TORCH_LIGHT, tr.y - cam.scrollY - TORCH_LIGHT)
    }
    // player light: tiny without a torch, wide once one is picked up
    const pr = this.hasTorch ? LIGHT_RADIUS : SMALL_LIGHT
    const pkey = this.hasTorch ? 'hunt-light' : 'hunt-light-sm'
    const sx = this.player.x - cam.scrollX
    const sy = this.player.y - cam.scrollY
    this.fog.erase(pkey, sx - pr, sy - pr)
    for (const h of this.hunters) {
      if (h.mode === 'CHASE') {
        this.fog.erase('hunt-light-sm', h.x - cam.scrollX - SMALL_LIGHT, h.y - cam.scrollY - SMALL_LIGHT)
      }
    }
  }

  // ---- HUD ------------------------------------------------------------------
  buildHud() {
    this.roundText = pixelText(this, 12, 14, 'ROUND 1', 10, '#ffe066').setOrigin(0, 0.5).setScrollFactor(0).setDepth(9500)
    this.pips = []
    for (let i = 0; i < 3; i++) {
      const c = this.add.image(GAME_WIDTH / 2 - 24 + i * 24, 16, 'hunt-coin').setScrollFactor(0).setDepth(9500).setScale(1.5)
      c.setTint(0x47506a)
      this.pips.push(c)
    }
    this.senseIcon = this.add.graphics().setScrollFactor(0).setDepth(9501)
    this.senseText = pixelText(this, GAME_WIDTH - 12, 32, '', 7, '#cdd7ee').setOrigin(1, 0.5).setScrollFactor(0).setDepth(9501)
    // enraged-chase countdown — only shown while a hunter is actively chasing
    this.rageText = pixelText(this, GAME_WIDTH / 2, 40, '', 11, '#ff3b3b').setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(9502).setVisible(false)

    const menu = panelButton(this, GAME_WIDTH - 40, GAME_HEIGHT - 16, 'MENU', () => this.scene.start('MainMenu'), { size: 8, width: 60, depth: 9500 })
    menu.bg.setScrollFactor(0)
    menu.text.setScrollFactor(0)

    // stamina + warmth bars (next to ROUND), inventory, torch state, hero + controls
    this.staminaBar = this.add.graphics().setScrollFactor(0).setDepth(9500)
    this.warmthBar = this.add.graphics().setScrollFactor(0).setDepth(9500)
    this.invText = pixelText(this, 12, 32, '', 8, '#b6c2d8').setOrigin(0, 0.5).setScrollFactor(0).setDepth(9500)
    this.torchText = pixelText(this, 12, 46, '', 8, '#ffb24a').setOrigin(0, 0.5).setScrollFactor(0).setDepth(9500)
    pixelText(this, 12, 60, 'HERO ' + this.hero.label, 8, '#9fb0d6').setOrigin(0, 0.5).setScrollFactor(0).setDepth(9500)
    pixelText(this, 12, GAME_HEIGHT - 14, 'WASD move  SHIFT run  E use/throw/drop', 7, '#7e8aa8').setOrigin(0, 0.5).setScrollFactor(0).setDepth(9500)

    // world-space prompt that hovers over the nearest interactable
    this.prompt = pixelText(this, 0, 0, '', 8, '#ffe066').setOrigin(0.5, 1).setDepth(9400).setVisible(false)
  }

  updateInventoryHud() {
    if (!this.invText) return
    const label =
      this.carried === 'stone'
        ? 'ITEM  stone  [E throw]'
        : this.carried === 'torch'
          ? 'ITEM  torch  [E drop]'
          : 'ITEM  —  (empty)'
    this.invText.setText(label)
  }

  updateTorchHud() {
    if (!this.torchText) return
    this.torchText.setText(this.hasTorch ? 'TORCH lit — hunters can see you' : '')
  }

  // Show a countdown while any hunter is enraged so you know how long the chase lasts.
  updateRageHud() {
    let t = 0
    for (const h of this.hunters) if (h.mode === 'CHASE') t = Math.max(t, h.chaseTimer)
    if (t > 0) this.rageText.setText('ENRAGED  ' + t.toFixed(1) + 's').setVisible(true)
    else this.rageText.setVisible(false)
  }

  drawStamina() {
    const g = this.staminaBar
    g.clear()
    const x = 96
    const y = 11
    const w = 68
    const h = 6
    g.fillStyle(0x0a0c14, 0.7).fillRect(x - 1, y - 1, w + 2, h + 2)
    g.fillStyle(this.exhausted ? 0xe06a6a : 0x7cfc98, 1).fillRect(x, y, w * this.stamina, h)
  }

  drawWarmth() {
    const g = this.warmthBar
    g.clear()
    if (this.round < 2) return
    const x = 96
    const y = 20
    const w = 68
    const h = 5
    g.fillStyle(0x0a0c14, 0.7).fillRect(x - 1, y - 1, w + 2, h + 2)
    const col = this.frozen ? 0x9ad0ff : this.warmth < 0.45 ? 0x6fb6ff : 0xffd27c
    g.fillStyle(col, 1).fillRect(x, y, w * this.warmth, h)
  }

  // Float a "HOLD E" / "ENTER" hint over the closest objective or the open exit.
  updatePrompt() {
    let target = null
    let label = ''
    let best = 60
    for (const o of this.objectives) {
      if (o.done) continue
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, o.x, o.y)
      if (d < best) {
        best = d
        target = o
        label = 'HOLD E'
      }
    }
    if (this.exitOpen && this.exit) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.exit.x, this.exit.y)
      if (d < best) {
        best = d
        target = this.exit
        label = 'ENTER'
      }
    }
    if (target) {
      this.prompt.setText(label).setPosition(target.x, target.y - 28).setVisible(true).setDepth(target.y + 1)
    } else {
      this.prompt.setVisible(false)
    }
  }

  updateHudSense() {
    this.senseIcon.clear()
    const codes = []
    this.activeSenses.forEach((key, i) => {
      const sn = SENSES[key]
      this.drawSenseIcon(this.senseIcon, GAME_WIDTH - 22 - i * 24, 16, sn.glyph, sn.color)
      codes.push(sn.key)
    })
    this.senseText.setText(codes.join(' + '))
  }

  drawSenseIcon(g, x, y, glyph, color) {
    g.lineStyle(2, color, 1).fillStyle(color, 1)
    if (glyph === 'eye') {
      g.strokeCircle(x, y, 7)
      g.fillCircle(x, y, 3)
    } else if (glyph === 'ear') {
      g.beginPath()
      g.arc(x + 1, y, 7, Phaser.Math.DegToRad(-70), Phaser.Math.DegToRad(150), false)
      g.strokePath()
      g.fillCircle(x - 1, y + 3, 2)
    } else {
      g.fillTriangle(x - 6, y + 5, x + 6, y + 5, x, y - 6)
    }
  }

  // ---- banners + overlays ---------------------------------------------------
  showRule() {
    this.clearBanner()
    const y = 108
    const bg = uiPanel(this, GAME_WIDTH / 2, y, 360, 84, { originX: 0.5, originY: 0.5, depth: 11000 }).setScrollFactor(0)
    const head = this.hunters.length > 1 ? `${this.hunters.length} HUNTERS USE` : 'THE HUNTER USES'
    const t1 = pixelText(this, GAME_WIDTH / 2, y - 26, head, 8, '#8ea0c0').setScrollFactor(0).setDepth(11001)
    this.bannerEls = [bg, t1]
    this.activeSenses.forEach((key, i) => {
      const sn = SENSES[key]
      const col = '#' + sn.color.toString(16).padStart(6, '0')
      const yy = y - 4 + i * 18
      const icon = this.add.graphics().setScrollFactor(0).setDepth(11001)
      this.drawSenseIcon(icon, GAME_WIDTH / 2 - 120, yy, sn.glyph, sn.color)
      const code = pixelText(this, GAME_WIDTH / 2 - 100, yy, `${sn.code} = true`, 11, col).setOrigin(0, 0.5).setScrollFactor(0).setDepth(11001)
      this.bannerEls.push(icon, code)
    })
    this.time.delayedCall(2800, () => {
      if (!this.bannerEls.length) return
      this.tweens.add({ targets: this.bannerEls, alpha: 0, duration: 400, onComplete: () => this.clearBanner() })
    })
  }

  flashBanner(text, color) {
    const t = pixelText(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60, text, 18, color).setScrollFactor(0).setDepth(11002)
    this.tweens.add({ targets: t, alpha: 0, y: GAME_HEIGHT / 2 - 90, duration: 1100, onComplete: () => t.destroy() })
  }

  clearBanner() {
    for (const e of this.bannerEls) if (e && e.destroy) e.destroy()
    this.bannerEls = []
  }

  playerDeath() {
    if (this.gameOver) return
    this.gameOver = true
    this.player.body.setVelocity(0, 0)
    Audio.play(this, SFX.playerDie)
    CombatSystem.shake(this, 0.012, 320)
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0b0d1a, 0.72).setOrigin(0, 0).setScrollFactor(0).setDepth(11000)
    pixelText(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 34, 'CAUGHT', 26, '#e06a6a').setScrollFactor(0).setDepth(11001)
    pixelText(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 4, `Reached round ${this.round}`, 9, '#cdd7ee').setScrollFactor(0).setDepth(11001)
    const retry = panelButton(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 28, 'RETRY', () => this.scene.restart({ round: this.round }), { width: 150, depth: 11001 })
    const menu = panelButton(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 64, 'MAIN MENU', () => this.scene.start('MainMenu'), { width: 150, depth: 11001 })
    for (const b of [retry, menu]) {
      b.bg.setScrollFactor(0)
      b.text.setScrollFactor(0)
    }
  }

  // ---- main loop ------------------------------------------------------------
  update(time, delta) {
    if (this.gameOver) {
      this.updateFog()
      return
    }
    const dt = delta / 1000
    this.handlePlayer(dt, time)
    // E (USE) is the single slot action: throw a carried stone or set down a carried
    // torch — but only away from an objective, where holding E channels it instead
    const useBtn = this.keys.E.isDown || TouchState.attackL
    if (useBtn && !this._prevUseBtn && !this.nearUnfinishedObjective()) {
      if (this.carried === 'stone') this.throwLure()
      else if (this.carried === 'torch') this.dropTorch()
    }
    this._prevUseBtn = useBtn
    this.updateScent(dt)
    if (this._noPickT > 0) this._noPickT -= dt
    this.handlePickups()
    this.drawStamina()
    this.drawWarmth()
    for (const h of this.hunters) h.think(dt)
    this.updateRageHud()
    this.updateProjectiles(dt)
    this.handleObjectives(dt)
    this.handleExit()
    this.updatePrompt()
    this.checkCatch()
    this.updateFog()
  }
}
