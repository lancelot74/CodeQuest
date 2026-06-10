import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../config.js'
import { pixelText, panelButton, uiPanel, drawSenseIcon } from '../ui/widgets.js'
import { Audio, SFX, Music } from '../systems/AudioSystem.js'
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
const TENSION_HOLD = 5.5 // keep the tension track this long after the hunter leaves sight
const DEATH_TENSION_HOLD = 3.5 // on a catch, hold the tension loop this long before easing back
const OBJ_RADIUS = 34
const OBJ_HOLD = 1.5 // seconds to channel an objective
const EXIT_RADIUS = 30
const CATCH_DIST = 22
const PICKUP_DIST = 26
const NUM_STONES = 5
const NUM_TORCHES = 5
const NUM_FOOD = 6
const NUM_HOLES = 4
const TRAP_PRESSES = 7 // E-mashes needed to climb out of a hole
const VOLLEY_SPEED = 200
const WAVE_SPEED = 180
const HOMING_SPEED = 150 // ooze spit — deliberately slow so it can be outrun

// hunger: drains slowly every round; emptied it slows the hero. Food refills it.
const HUNGER_MAX = 1
const HUNGER_DRAIN = 0.025 // ~40s from full to starving
const FOOD_REFILL = 0.45
const STARVE_SLOW = 0.7 // movement multiplier while starving

// dash stamina: sprinting drains it; emptying it forces a walk until it recovers
// past STAM_FLOOR. Tuned so a sprint lasts a few seconds, not forever.
const STAM_MAX = 1
const STAM_DRAIN = 0.55
const STAM_REGEN = 0.4
const STAM_FLOOR = 0.25

// exposure / freeze (hero.freeze debuff): standing in darkness with no torch drains
// warmth; at zero the hero freezes in place for a beat — easy prey. Torchlight (carried,
// or a map torch's glow) warms you; carrying a torch makes you immune.
const WARM_MAX = 1
const COLD_DRAIN = 0.15 // slower onset — freezing takes a bit more time
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

// Per-round modifiers. Round N rolls N of these total (boss powers + hero debuffs),
// always including at least one boss power. Each mutates a scene multiplier that the
// scene and Hunter.js read live.
const BOSS_POWERS = [
  { label: 'boss.attackSpeed++', apply: (s) => (s.atkCdMul *= 0.6) },
  { label: 'boss.moveSpeed++', apply: (s) => (s.chaseSpeedMul *= 1.25) },
  { label: 'boss.senseRange++', apply: (s) => (s.senseRangeMul *= 1.3) },
  { label: 'boss.awareness++', apply: (s) => (s.awareUpMul *= 1.4) },
]
const HERO_DEBUFFS = [
  { label: 'hero.moveSpeed--', apply: (s) => (s.moveMul *= 0.82) },
  { label: 'hero.hunger--', apply: (s) => (s.hungerDrainMul *= 2) },
  { label: 'hero.noise++', apply: (s) => (s.loudMul *= 1.6) },
  { label: 'hero.stamina--', apply: (s) => (s.staminaDrainMul *= 1.5) },
  { label: 'hero.freeze++', apply: (s) => (s.freezeOn = true) },
]

// Night events: an optional twist per round from round 2 on, announced as a third
// code object (night.*) beside the boss powers and hero debuffs. ~40% of rounds roll
// one (guaranteed after two quiet nights); wash/fog recolor the dark itself so the
// rule stays visible all round, not just during the banner.
const NIGHT_EVENTS = [
  {
    key: 'bloodMoon',
    label: 'night.bloodMoon = true',
    hint: 'wary hunters - but fast chests',
    wash: 0x2a0a18,
    fog: 0x0a0408,
    apply: (s) => {
      s.awareUpMul *= 1.35
      s.objHoldMul = 0.5
    },
  },
  {
    key: 'silence',
    label: 'night.silence = true',
    hint: 'quiet feet - quiet stones',
    wash: 0x081226,
    fog: 0x03050c,
    apply: (s) => {
      s.loudMul *= 0.5
      s.hearRangeMul = 0.6
      s.coldDrainMul = 1.5
      s.silenceOn = true
    },
  },
  {
    key: 'starfall',
    label: 'night.starfall = true',
    hint: 'flashes reveal everyone',
    apply: (s) => (s.starfallOn = true),
  },
  {
    key: 'feast',
    label: 'night.feast = true',
    hint: 'extra food - eating is loud',
    apply: (s) => (s.feastOn = true),
  },
  {
    key: 'hivemind',
    label: 'night.hivemind = true',
    hint: 'one rage wakes the pack',
    need: (s) => s.hunterCount >= 2,
    apply: (s) => (s.hivemindOn = true),
  },
]

// NIGHT HUNT — a top-down survival-horror roguelite (Cobb Can Move-style). Roam a
// dark forest opening chests and reach the exit while 1-3 stalkers hunt you; each
// round's modifier budget rolls the pack size, senses + boss skins. See Hunter.js.
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
    this.hunger = HUNGER_MAX
    this.trapped = false
    this.trapEscapes = 0
    this.trapHole = null
    this._trapGrace = 0
    this._alarmT = 0
    this._noPickT = 0
    this.torches = []
    this.stones = []
    this.food = []
    this.holes = []
    this.playerMoving = false
    this.playerLoudness = 0
    this.playerMoveFactor = 0
    this.exits = []
    this.hunters = []
    this.bannerEls = []
    this._dryRounds = 0
    this.flashes = []
    this.resetModifiers()

    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H)
    this.buildArena()
    this.buildPlayer()

    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H)
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12)

    this.makeLights()
    this.buildFog()
    this.buildHud()

    // smell-trail viz: sits just above the night wash, under the fog — readable in
    // light pools, hidden in darkness like everything else world-side
    this.scentGfx = this.add.graphics().setDepth(2)

    this.keys = this.input.keyboard.addKeys('W,A,S,D,SHIFT,E,UP,DOWN,LEFT,RIGHT')

    showTouchControls(TOUCH_LABELS)
    this.events.once('shutdown', () => hideTouchControls())

    Music.play(this, 'bgm-main') // same track as the menu -> seamless, no restart
    this.startRound()
  }

  // ---- arena ----------------------------------------------------------------
  buildArena() {
    const floor = this.add.renderTexture(0, 0, WORLD_W, WORLD_H).setOrigin(0, 0).setDepth(0)
    // batch the 1700 tile stamps into one draw pass — drawFrame per tile makes every
    // scene (re)start pay a full begin/end render cycle per stamp
    floor.beginDraw()
    for (let r = 0; r < WORLD_ROWS; r++) {
      for (let c = 0; c < WORLD_COLS; c++) {
        floor.batchDrawFrame('hunt-tiles', Phaser.Utils.Array.GetRandom(GRASS), c * TILE, r * TILE)
      }
    }
    floor.endDraw()
    // night wash — dims the grass so the flashlight reads (robust vs. tint support);
    // kept on the scene so night events can recolor the dark itself per round
    this.nightWash = this.add.rectangle(0, 0, WORLD_W, WORLD_H, 0x0a1430, 0.5).setOrigin(0, 0).setDepth(1)

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

    if (this.trapped) {
      // stuck in a hole: rooted in place and helpless until you mash free
      this.interacting = false
      this.player.body.setVelocity(0, 0)
      this.playerMoving = false
      this.playerMoveFactor = 0
      this.playerLoudness = 0
      this.restPose()
      this.player.setDepth(this.player.y)
      this.playerShadow.setPosition(this.player.x, this.player.y + this.player.displayHeight * 0.22).setDepth(this.player.y - 1)
      return
    }
    // exposure/freeze (hero.freeze debuff): refill near torchlight, drain in the dark.
    // Sits below the trapped return so warmth pauses in a hole — a freeze triggered
    // there could never tick down (the frozen branch is unreachable while trapped).
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
      this.restPose()
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
      this.stamina = Math.max(0, this.stamina - STAM_DRAIN * this.staminaDrainMul * dt)
      if (this.stamina === 0) this.exhausted = true
    } else {
      this.stamina = Math.min(STAM_MAX, this.stamina + STAM_REGEN * dt)
      if (this.exhausted && this.stamina >= STAM_FLOOR) this.exhausted = false
    }
    let speed = (sprint ? SPRINT_SPEED : WALK_SPEED) * this.moveMul
    if (this.hunger <= 0) speed *= STARVE_SLOW
    if (moving) {
      const l = Math.hypot(ax, ay)
      ax /= l
      ay /= l
    }
    this.player.body.setVelocity(ax * speed, ay * speed)

    this.playerMoving = moving
    this.playerMoveFactor = moving ? (sprint ? 1 : 0.5) : 0
    this._burst = Math.max(0, this._burst - dt * 1.2)
    this.playerLoudness = ((moving ? (sprint ? 1.0 : 0.4) : 0) + this._burst) * this.loudMul

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

  // Halt the locomotion visuals: anim heroes drop to idle, static heroes lose the walk
  // squash — a hero stuck in a hole or frozen solid shouldn't keep running in place.
  restPose() {
    if (this.hero.kind === 'anim') {
      const idle = `${this.heroKey}-idle`
      if (this.player.anims.getName() !== idle) this.player.play(idle)
    } else {
      this.player.scaleY = this.hero.scale
    }
  }

  // Exposure: only active when the hero.freeze debuff is rolled this round.
  // Carrying a torch keeps you fully warm; otherwise standing in a map torch's
  // glow warms you and darkness chills you. Hit zero and the hero freezes in
  // place for a beat — defenceless against the hunter.
  updateWarmth(dt) {
    if (!this.freezeOn || this.frozen) return
    if (this.hasTorch || this.nearTorchLight()) {
      this.warmth = Math.min(WARM_MAX, this.warmth + WARM_REGEN * dt)
      this.player.clearTint()
    } else {
      this.warmth = Math.max(0, this.warmth - COLD_DRAIN * this.coldDrainMul * dt)
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
    for (const f of this.flashes) {
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, f.x, f.y) < TORCH_LIGHT) return true
    }
    return false
  }

  // Hunger ticks down every round; emptying it slows the hero (see handlePlayer).
  updateHunger(dt) {
    const before = this.hunger
    this.hunger = Math.max(0, this.hunger - HUNGER_DRAIN * this.hungerDrainMul * dt)
    if (before > 0 && this.hunger === 0) {
      // announce the slow-down the moment it kicks in — eating re-arms this naturally
      this.flashBanner('hero.hunger = 0', '#e06a6a')
      Audio.play(this, SFX.hit, { volume: 0.5, rate: 0.7 })
    }
  }

  // Food sits outside the single inventory slot — grab it any time to refill hunger.
  handleFood() {
    if (this.frozen || this.trapped) return
    for (const f of [...this.food]) {
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, f.x, f.y) < PICKUP_DIST) {
        this.food.splice(this.food.indexOf(f), 1)
        f.gfx.destroy()
        this.hunger = Math.min(HUNGER_MAX, this.hunger + FOOD_REFILL)
        CombatSystem.puff(this, f.x, f.y - 4, 0xe0584a)
        if (this.feastOn) {
          // night.feast: gorging is LOUD — every apple near a hearing hunter is a bet
          this._burst = Math.max(this._burst, 1.0)
          Audio.play(this, SFX.heavy, { volume: 0.6, rate: 0.8 })
        } else {
          Audio.play(this, SFX.click, { volume: 0.5 })
        }
        return
      }
    }
  }

  // Step onto an unfilled hole and you're trapped; mash E (handled in update) to climb out.
  checkTraps() {
    if (this.trapped || this.frozen || this._trapGrace > 0) return
    for (const ho of this.holes) {
      if (ho.used) continue
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, ho.x, ho.y) < 16) {
        this.trapped = true
        this.trapEscapes = 0
        this.trapHole = ho
        this.player.body.setVelocity(0, 0)
        Audio.play(this, SFX.hit, { volume: 0.6 })
        CombatSystem.shake(this, 0.006, 120)
        return
      }
    }
  }

  freeFromTrap() {
    this.trapped = false
    this._trapGrace = 1.0 // step-off grace so you don't instantly re-trigger
    if (this.trapHole) {
      this.trapHole.used = true
      this.trapHole.gfx.setFillStyle(0x2a2418, 0.9).setStrokeStyle(2, 0x3a3322) // filled-in dirt
      this.trapHole = null
    }
    CombatSystem.puff(this, this.player.x, this.player.y, 0xb6c2d8)
    Audio.play(this, SFX.levelUp, { volume: 0.5 })
    this.flashBanner('FREE!', '#7cfc98')
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
    const thrownIn = this.round
    this.tweens.add({
      targets: rock,
      x: tx,
      y: ty,
      angle: 240,
      duration: 420,
      ease: 'Quad.easeOut',
      onComplete: () => {
        rock.destroy()
        // the round ended (or the hero died) mid-flight: don't distract the NEXT
        // round's hunters or inject stale scent at the old landing spot
        if (this.gameOver || this.round !== thrownIn) return
        Audio.play(this, SFX.hit, { volume: 0.5 })
        CombatSystem.puff(this, tx, ty, 0xb6c2d8)
        this.scent.push({ x: tx, y: ty, str: 1.1 })
        // on a silent night the clatter doesn't carry — only nearby hunters take the bait
        this.hunters.forEach((h) => {
          if (!this.silenceOn || Phaser.Math.Distance.Between(h.x, h.y, tx, ty) < 240) h.distract(tx, ty)
        })
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
    this.drawScent()
  }

  // When a smell hunter is in play, faintly render the decaying trail it tracks — the
  // mechanic becomes something the player can see and reason about, not a hidden stat.
  drawScent() {
    const g = this.scentGfx
    g.clear()
    if (!this.hunters.some((h) => h.senseKey === 'smell')) return
    for (const s of this.scent) {
      g.fillStyle(0xb47cff, Math.min(0.22, s.str * 0.2))
      g.fillCircle(s.x, s.y, 3)
    }
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

  // ---- per-round modifiers --------------------------------------------------
  resetModifiers() {
    this.moveMul = 1
    this.loudMul = 1
    this.staminaDrainMul = 1
    this.hungerDrainMul = 1
    this.atkCdMul = 1
    this.chaseSpeedMul = 1
    this.senseRangeMul = 1
    this.awareUpMul = 1
    this.freezeOn = false
    this.objHoldMul = 1
    this.hearRangeMul = 1
    this.coldDrainMul = 1
    this.silenceOn = false
    this.starfallOn = false
    this.feastOn = false
    this.hivemindOn = false
    this.nightEvent = null
    this.activePowers = []
    this.activeDebuffs = []
  }

  rollModifiers() {
    this.resetModifiers()
    let remaining = this.round

    // a hunter (with its sense) always exists and counts as the first unit;
    // extra hunters come from the "duplicate" power, up to 3 senses total.
    let hunters = 1
    remaining -= 1

    const powerPool = Phaser.Utils.Array.Shuffle([...BOSS_POWERS])
    const debuffPool = Phaser.Utils.Array.Shuffle([...HERO_DEBUFFS])
    const powers = []
    const debuffs = []

    // guarantee one boss power whenever the budget can afford it
    if (remaining > 0) {
      powers.push(powerPool.pop())
      remaining--
    }

    // spend the rest at random across the three categories, until the budget
    // runs out or every category is maxed (3 hunters, 4 powers, 4 debuffs)
    while (remaining > 0) {
      const opts = []
      if (hunters < 3) opts.push('dup')
      if (powers.length < BOSS_POWERS.length) opts.push('pow')
      if (debuffs.length < HERO_DEBUFFS.length) opts.push('deb')
      if (!opts.length) break
      const pick = opts[Phaser.Math.Between(0, opts.length - 1)]
      if (pick === 'dup') hunters++
      else if (pick === 'pow') powers.push(powerPool.pop())
      else debuffs.push(debuffPool.pop())
      remaining--
    }

    this.hunterCount = hunters
    this.activePowers = powers
    this.activeDebuffs = debuffs
    for (const m of powers) m.apply(this)
    for (const m of debuffs) m.apply(this)

    // night event: round 2+ (round 1 stays a clean tutorial), ~40% — with a pity
    // rule so the variety engine never sleeps more than two rounds straight
    if (this.round >= 2 && (this._dryRounds >= 2 || Math.random() < 0.4)) {
      const pool = NIGHT_EVENTS.filter((e) => !e.need || e.need(this))
      this.nightEvent = Phaser.Utils.Array.GetRandom(pool)
      this.nightEvent.apply(this)
      this._dryRounds = 0
    } else {
      this._dryRounds++
    }
  }

  // ---- round flow -----------------------------------------------------------
  startRound() {
    this.gameOver = false
    this._tensionHold = 0 // a fresh round always opens on the calm theme
    Music.cueStop(this) // the endgame layer ends once the exit is taken
    this.clearProjectiles()
    this.clearRoundEntities()

    // round R spends R "modifier units" across hunter senses (the duplicate
    // power), boss powers and hero debuffs — see rollModifiers(). Senses are
    // part of the budget now, so the hunter count is whatever it allocated.
    this.rollModifiers()
    const n = this.hunterCount
    this.activeSenses = Phaser.Utils.Array.Shuffle(Object.keys(SENSES)).slice(0, n)
    this.activeSkins = Phaser.Utils.Array.Shuffle(Object.keys(SKINS)).slice(0, n)

    // the night itself carries the event: tinted wash + fog, fresh starfall state
    this.nightWash.setFillStyle(this.nightEvent?.wash ?? 0x0a1430, 0.5)
    this.fogColor = this.nightEvent?.fog ?? 0x05060a
    this.flashes = []
    this._starT = Phaser.Math.FloatBetween(4, 7)

    // chests grow from round 2 on; exits from round 3 on (round-1 of them)
    this.chestCount = 3 + Math.max(0, this.round - 1)
    this.exitCount = this.round >= 3 ? this.round - 1 : 1
    this.chestsCleared = false

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
    this.hunger = HUNGER_MAX
    this.trapped = false
    this.trapEscapes = 0
    this.trapHole = null
    this._trapGrace = 0
    this.setTorch(false)
    this.updateInventoryHud()

    this.claimedPts = []
    this.placeObjectives()
    this.placeExits()
    this.placeStones()
    this.placeTorches()
    this.placeFood()
    this.placeHoles()
    this.spawnHunters()

    this.roundText.setText('ROUND ' + this.round)
    this.buildPips(this.objectives.length)
    this.buildExitPips()
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
      this.tweens.killTweensOf(tr.flame) // flicker tween outlives a destroyed flame
      tr.flame.destroy()
      tr.glow.destroy()
    }
    this.torches = []
    for (const f of this.food) f.gfx.destroy()
    this.food = []
    for (const ho of this.holes) ho.gfx.destroy()
    this.holes = []
    for (const e of this.exits) {
      if (e.tween) e.tween.stop()
      e.img.destroy()
    }
    this.exits = []
    if (this.hunterColliders) {
      for (const c of this.hunterColliders) this.physics.world.removeCollider(c)
      this.hunterColliders = []
    }
    for (const h of this.hunters) h.destroy()
    this.hunters = []
  }

  // Placements all sample the same 56px openPoints grid, so cross-category overlap
  // means literally the same point — claimedPts (reset each round) keeps a hole from
  // hiding under a chest, exit, torch, stone or apple.
  spreadPoints(n, minFromSpawn, minSep) {
    const out = []
    const pool = Phaser.Utils.Array.Shuffle([...this.openPoints])
    for (const pt of pool) {
      if (out.length >= n) break
      if (this.claimedPts.includes(pt)) continue
      if (Phaser.Math.Distance.Between(pt.x, pt.y, this.spawn.x, this.spawn.y) < minFromSpawn) continue
      if (out.some((q) => Phaser.Math.Distance.Between(q.x, q.y, pt.x, pt.y) < minSep)) continue
      out.push(pt)
    }
    this.claimedPts.push(...out)
    return out
  }

  placeObjectives() {
    const pts = this.spreadPoints(this.chestCount, 180, 150)
    for (const pt of pts) {
      const img = this.add.image(pt.x, pt.y, 'hunt-chest_closed').setOrigin(0.5, 0.8).setScale(1.4).setDepth(pt.y)
      // ring sits in the world depth band (below the fog) so it's hidden in the dark
      const ring = this.add.graphics().setDepth(pt.y + 1)
      this.objectives.push({ x: pt.x, y: pt.y, img, ring, progress: 0, done: false })
    }
  }

  // Exits: 1 until round 3, then round-1 of them. You reach the non-final exits first;
  // the final one only opens once they're all reached and every chest is opened.
  placeExits() {
    const pts = this.spreadPoints(this.exitCount, 280, 180)
    this.exits = []
    pts.forEach((pt, i) => {
      const isFinal = i === pts.length - 1
      const img = this.add.image(pt.x, pt.y, 'hunt-sign').setOrigin(0.5, 0.85).setScale(1.5).setDepth(pt.y)
      img.setTint(0x3a4670)
      this.exits.push({ x: pt.x, y: pt.y, img, isFinal, open: false, reached: false, tween: null })
    })
  }

  // Food: walk over to refill the hunger bar. Scattered fresh each round.
  placeFood() {
    for (const pt of this.spreadPoints(NUM_FOOD * (this.feastOn ? 2 : 1), 100, 120)) {
      const gfx = this.add.container(pt.x, pt.y).setDepth(pt.y)
      const apple = this.add.ellipse(0, -5, 11, 12, 0xe0584a)
      const leaf = this.add.ellipse(3, -11, 6, 4, 0x6fcf5a).setAngle(-30)
      gfx.add([apple, leaf])
      this.food.push({ x: pt.x, y: pt.y, gfx })
    }
  }

  // Holes: step on one and you're trapped until you mash E seven times. Dark pits
  // that live under the fog, so you only spot them inside your light.
  placeHoles() {
    for (const pt of this.spreadPoints(NUM_HOLES, 200, 150)) {
      const gfx = this.add.ellipse(pt.x, pt.y, 34, 22, 0x04050a, 0.95).setStrokeStyle(2, 0x141a2a).setDepth(3)
      this.holes.push({ x: pt.x, y: pt.y, gfx, used: false })
    }
  }

  buildPips(count) {
    if (this.pips) for (const p of this.pips) p.destroy()
    this.pips = []
    const x0 = GAME_WIDTH / 2 - ((count - 1) * 18) / 2
    for (let i = 0; i < count; i++) {
      const c = this.add.image(x0 + i * 18, 16, 'hunt-coin').setScrollFactor(0).setDepth(9500).setScale(1.2)
      c.setTint(0x47506a)
      this.pips.push(c)
    }
  }

  // Exit row under the chest pips: one sign per exit (final rightmost). Mirrors the
  // in-world sign states — dark = locked, lit = open, green = reached.
  buildExitPips() {
    if (this.exitPips) for (const p of this.exitPips) p.destroy()
    this.exitPips = []
    const n = this.exits.length
    const x0 = GAME_WIDTH / 2 - ((n - 1) * 20) / 2
    for (let i = 0; i < n; i++) {
      this.exitPips.push(this.add.image(x0 + i * 20, 36, 'hunt-sign').setScrollFactor(0).setDepth(9500).setScale(0.8))
    }
    this.updateExitPips()
  }

  updateExitPips() {
    this.exits.forEach((e, i) => {
      const p = this.exitPips[i]
      if (!p) return
      if (e.reached) p.setTint(0x7cfc98)
      else if (e.open) p.clearTint()
      else p.setTint(0x47506a)
    })
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
    if (this.frozen || this.trapped || this.carried !== null || this._noPickT > 0) return
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
        this.tweens.killTweensOf(tr.flame)
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
  // wide light (and re-exposing yourself to the cold when hero.freeze is rolled).
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
          o.progress = Math.min(1, o.progress + dt / (OBJ_HOLD * this.objHoldMul))
          this._burst = Math.max(this._burst, 0.5) // channeling is audible
          this.chestAlarm(o, dt)
          if (o.progress >= 1) {
            o.done = true
            this._burst = 1.3 // completing is LOUD
            CombatSystem.puff(this, o.x, o.y - 8, 0xffe066)
            Audio.play(this, SFX.clear)
            // the last chest on rounds 1-2 opens the lone FINAL exit this same frame,
            // which fires the cue-exit stinger — don't stack the chest cue on top of it
            const opensFinal = this.objectives.every((x) => x.done) && this.exits.every((e) => e.isFinal)
            if (!opensFinal) Music.stinger(this, 'cue-chest')
            o.img.setTint(0x5a6480) // spent — visibly done even from across a torch pool
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
    if (remaining === 0 && !this.chestsCleared) this.onChestsCleared()
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

  // All chests opened: light up the non-final exits (or the lone exit on rounds 1-2).
  onChestsCleared() {
    this.chestsCleared = true
    const nonFinal = this.exits.filter((e) => !e.isFinal)
    if (nonFinal.length) {
      nonFinal.forEach((e) => this.openOneExit(e))
      this.flashBanner('EXITS OPEN', '#ffe066')
    } else {
      this.exits.forEach((e) => this.openOneExit(e))
      this.flashBanner('EXIT OPEN', '#ffe066')
    }
    Audio.play(this, SFX.levelUp)
  }

  openOneExit(e) {
    if (e.open) return
    e.open = true
    // the way out just appeared — the urgency layer loops over the music until the
    // hero actually steps through (stopped in startRound / playerDeath)
    if (e.isFinal) Music.cueLoop(this, 'cue-exit')
    e.img.clearTint()
    e.tween = this.tweens.add({ targets: e.img, scale: 1.7, yoyo: true, repeat: -1, duration: 600 })
    this.updateExitPips()
  }

  handleExit() {
    if (!this.chestsCleared) return
    for (const e of this.exits) {
      if (!e.open || e.reached) continue
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y) < EXIT_RADIUS) {
        if (e.isFinal) {
          this.roundCleared()
          return
        }
        // a waypoint exit: tick it off, then unlock the final exit once all are done
        e.reached = true
        if (e.tween) {
          e.tween.stop()
          e.tween = null
        }
        e.img.setScale(1.5).setTint(0x7cfc98)
        this.updateExitPips()
        Audio.play(this, SFX.clear)
        this.flashBanner('EXIT REACHED', '#7cfc98')
        if (this.exits.filter((x) => !x.isFinal).every((x) => x.reached)) {
          const fin = this.exits.find((x) => x.isFinal)
          if (fin) {
            this.openOneExit(fin)
            this.flashBanner('FINAL EXIT OPEN', '#ffe066')
          }
        }
      }
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
      // only the stump blocks a shot — the same base collider that stops the player, not the
      // taller leaf/body footprint (wallRects) used for line-of-sight
      if (
        this.wallZones.some((z) => {
          const b = z.body
          return orb.x >= b.x - 6 && orb.x <= b.x + b.width + 6 && orb.y >= b.y - 6 && orb.y <= b.y + b.height + 6
        })
      ) {
        // depth 950 = above the fog, like the orb itself — a shot dying against a tree
        // in the dark should still visibly burst
        CombatSystem.puff(this, orb.x, orb.y, orb.tintTopLeft || 0xffffff, 950)
        this.killProj(orb)
        continue
      }
      const hitR = orb._kind === 'wave' ? 28 : 15
      if (Phaser.Math.Distance.Between(orb.x, orb.y, this.player.x, this.player.y) < hitR) {
        CombatSystem.puff(this, orb.x, orb.y, orb.tintTopLeft || 0xffffff, 950)
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
    this.tweens.killTweensOf(orb) // destroy() doesn't stop the repeat:-1 spin tween
    if (orb.active) orb.destroy()
  }

  clearProjectiles() {
    for (const orb of this.projectiles) {
      this.tweens.killTweensOf(orb)
      if (orb.active) orb.destroy()
    }
    this.projectiles = []
  }

  // night.starfall: every so often a streak falls (0.7s telegraph — sprint clear, or
  // stand and watch) and bursts into a brief pool of light. Scouting tool and exposure
  // hazard in one: it reveals a lurking hunter, but counts as lit for sight hunters.
  // Driven from update(), so it pauses cleanly on gameOver.
  updateStarfall(dt) {
    for (const f of this.flashes) f.t -= dt
    this.flashes = this.flashes.filter((f) => f.t > 0)
    if (!this.starfallOn) return
    this._starT -= dt
    if (this._starT > 0) return
    this._starT = Phaser.Math.FloatBetween(7, 10)
    // bias toward the action: prefer points inside the camera view so each flash is
    // a visible event, not off-screen noise
    const view = this.cameras.main.worldView
    const near = this.openPoints.filter((p) => view.contains(p.x, p.y))
    const pt = Phaser.Utils.Array.GetRandom(near.length ? near : this.openPoints)
    const streak = this.add.image(pt.x, pt.y - 170, 'venom').setDepth(950).setScale(0.8, 1.6).setTint(0xfff2b0)
    const inRound = this.round
    Audio.play(this, SFX.spit, { volume: 0.35, rate: 1.5 })
    this.tweens.add({
      targets: streak,
      y: pt.y,
      duration: 700,
      ease: 'Quad.easeIn',
      onComplete: () => {
        streak.destroy()
        if (this.gameOver || this.round !== inRound) return
        this.flashes.push({ x: pt.x, y: pt.y, t: 1.1 })
        CombatSystem.puff(this, pt.x, pt.y, 0xfff2b0, 950)
        Audio.play(this, SFX.crit, { volume: 0.3, rate: 1.3 })
      },
    })
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
    this.fog.fill(this.fogColor, 1) // pitch black outside the lights (event-tinted)
    // ambient torch pools first, then any live starfall flashes
    for (const tr of this.torches) {
      this.fog.erase('hunt-torch-light', tr.x - cam.scrollX - TORCH_LIGHT, tr.y - cam.scrollY - TORCH_LIGHT)
    }
    for (const f of this.flashes) {
      this.fog.erase('hunt-torch-light', f.x - cam.scrollX - TORCH_LIGHT, f.y - cam.scrollY - TORCH_LIGHT)
    }
    // player light: tiny without a torch, wide once one is picked up
    const pr = this.hasTorch ? LIGHT_RADIUS : SMALL_LIGHT
    const pkey = this.hasTorch ? 'hunt-light' : 'hunt-light-sm'
    const sx = this.player.x - cam.scrollX
    const sy = this.player.y - cam.scrollY
    this.fog.erase(pkey, sx - pr, sy - pr)
    // an enraged chaser self-illuminates; on death every hunter is revealed so you
    // can see what caught you (and where the others were)
    for (const h of this.hunters) {
      if (h.mode === 'CHASE' || this.gameOver) {
        this.fog.erase('hunt-light-sm', h.x - cam.scrollX - SMALL_LIGHT, h.y - cam.scrollY - SMALL_LIGHT)
      }
    }
  }

  // ---- HUD ------------------------------------------------------------------
  buildHud() {
    this.roundText = pixelText(this, 12, 14, 'ROUND 1', 10, '#ffe066').setOrigin(0, 0.5).setScrollFactor(0).setDepth(9500)
    this.senseIcon = this.add.graphics().setScrollFactor(0).setDepth(9501)
    this.senseText = pixelText(this, GAME_WIDTH - 12, 32, '', 7, '#cdd7ee').setOrigin(1, 0.5).setScrollFactor(0).setDepth(9501)
    // enraged-chase countdown — only shown while a hunter is actively chasing
    // sits below the chest + exit pip rows
    this.rageText = pixelText(this, GAME_WIDTH / 2, 54, '', 11, '#ff3b3b').setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(9502).setVisible(false)

    const menu = panelButton(this, GAME_WIDTH - 40, GAME_HEIGHT - 16, 'MENU', () => this.scene.start('MainMenu'), { size: 8, width: 60, depth: 9500 })
    menu.bg.setScrollFactor(0)
    menu.text.setScrollFactor(0)

    // stamina + warmth + hunger bars (next to ROUND), inventory, torch state, hero + controls
    this.staminaBar = this.add.graphics().setScrollFactor(0).setDepth(9500)
    this.warmthBar = this.add.graphics().setScrollFactor(0).setDepth(9500)
    this.hungerBar = this.add.graphics().setScrollFactor(0).setDepth(9500)
    this.invText = pixelText(this, 12, 40, '', 8, '#b6c2d8').setOrigin(0, 0.5).setScrollFactor(0).setDepth(9500)
    this.torchText = pixelText(this, 12, 54, '', 8, '#ffb24a').setOrigin(0, 0.5).setScrollFactor(0).setDepth(9500)
    pixelText(this, 12, 66, 'HERO ' + this.hero.label, 8, '#9fb0d6').setOrigin(0, 0.5).setScrollFactor(0).setDepth(9500)
    pixelText(this, 12, GAME_HEIGHT - 14, 'WASD move  SHIFT run  E use/throw/drop', 7, '#7e8aa8').setOrigin(0, 0.5).setScrollFactor(0).setDepth(9500)

    // big centred shout when you're stuck in a hole and must mash E to climb out
    this.trapText = pixelText(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 24, '', 13, '#ffd27c').setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(11002).setVisible(false)

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
    this.torchText.setText(this.hasTorch ? 'TORCH lit — sight hunters see you' : '')
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
    if (!this.freezeOn) return
    const x = 96
    const y = 20
    const w = 68
    const h = 5
    g.fillStyle(0x0a0c14, 0.7).fillRect(x - 1, y - 1, w + 2, h + 2)
    const col = this.frozen ? 0x9ad0ff : this.warmth < 0.45 ? 0x6fb6ff : 0xffd27c
    g.fillStyle(col, 1).fillRect(x, y, w * this.warmth, h)
  }

  drawHunger() {
    const g = this.hungerBar
    g.clear()
    const x = 96
    const y = 28
    const w = 68
    const h = 4
    g.fillStyle(0x0a0c14, 0.7).fillRect(x - 1, y - 1, w + 2, h + 2)
    const col = this.hunger <= 0 ? 0xe06a6a : this.hunger < 0.3 ? 0xffa64a : 0xc98a4a
    g.fillStyle(col, 1).fillRect(x, y, w * this.hunger, h)
  }

  updateTrapHud() {
    if (this.trapped) {
      this.trapText.setText(`TRAPPED!  mash E   ${this.trapEscapes}/${TRAP_PRESSES}`).setVisible(true)
    } else {
      this.trapText.setVisible(false)
    }
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
    for (const e of this.exits) {
      if (!e.open || e.reached) continue
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y)
      if (d < best) {
        best = d
        target = e
        label = e.isFinal ? 'ENTER' : 'REACH'
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
      drawSenseIcon(this.senseIcon, GAME_WIDTH - 22 - i * 24, 16, sn.glyph, sn.color)
      codes.push(sn.key)
    })
    this.senseText.setText(codes.join(' + '))
  }

  // ---- banners + overlays ---------------------------------------------------
  showRule() {
    this.clearBanner()
    const mods = [
      ...this.activePowers.map((m) => ({ text: m.label, color: '#ff7a6b' })),
      ...this.activeDebuffs.map((m) => ({ text: m.label, color: '#7ab8ff' })),
    ]
    if (this.nightEvent) {
      mods.push({ text: this.nightEvent.label, color: '#ffa64a' })
      mods.push({ text: this.nightEvent.hint, color: '#8ea0c0' })
    }
    const rows = this.activeSenses.length + (mods.length ? mods.length + 1 : 0)
    const h = 46 + rows * 16
    const top = 58
    const bg = uiPanel(this, GAME_WIDTH / 2, top + h / 2, 380, h, { originX: 0.5, originY: 0.5, depth: 11000 }).setScrollFactor(0)
    const head = this.hunters.length > 1 ? `${this.hunters.length} HUNTERS USE` : 'THE HUNTER USES'
    const t1 = pixelText(this, GAME_WIDTH / 2, top + 14, head, 8, '#8ea0c0').setScrollFactor(0).setDepth(11001)
    this.bannerEls = [bg, t1]
    let yy = top + 30
    this.activeSenses.forEach((key) => {
      const sn = SENSES[key]
      const col = '#' + sn.color.toString(16).padStart(6, '0')
      const icon = this.add.graphics().setScrollFactor(0).setDepth(11001)
      drawSenseIcon(icon, GAME_WIDTH / 2 - 130, yy, sn.glyph, sn.color)
      const code = pixelText(this, GAME_WIDTH / 2 - 110, yy, `${sn.code} = true`, 11, col).setOrigin(0, 0.5).setScrollFactor(0).setDepth(11001)
      this.bannerEls.push(icon, code)
      yy += 16
    })
    if (mods.length) {
      const sub = pixelText(this, GAME_WIDTH / 2, yy, '— ROUND ' + this.round + ' MODIFIERS —', 7, '#8ea0c0').setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(11001)
      this.bannerEls.push(sub)
      yy += 16
      mods.forEach((m) => {
        const t = pixelText(this, GAME_WIDTH / 2, yy, m.text, 9, m.color).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(11001)
        this.bannerEls.push(t)
        yy += 16
      })
    }
    this.time.delayedCall(3200, () => {
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
    this.trapped = false
    if (this.trapText) this.trapText.setVisible(false)
    this.player.body.setVelocity(0, 0)
    this.restPose()
    // update() bails on gameOver but arcade physics keeps stepping — without this the
    // hunters glide on their last velocity under the death overlay
    for (const h of this.hunters) h.body.setVelocity(0, 0)
    Audio.play(this, SFX.playerDie)
    Music.cueStop(this, { fade: 500 }) // a death cuts the endgame layer short
    // Let the dread ride out on the tension loop, then ease back to the main theme. update()
    // bails on gameOver, so this delayed swap won't be fought by updateMusicState.
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

  // ---- main loop ------------------------------------------------------------
  update(time, delta) {
    if (this.gameOver) {
      this.updateFog()
      return
    }
    const dt = delta / 1000
    if (this._trapGrace > 0) this._trapGrace -= dt
    this.handlePlayer(dt, time)
    // E (USE): while trapped it powers your escape; otherwise it's the single-slot
    // action — throw a carried stone or set down a carried torch (channels a chest
    // near one instead)
    const useBtn = this.keys.E.isDown || TouchState.attackL
    if (this.trapped) {
      if (useBtn && !this._prevUseBtn) {
        this.trapEscapes++
        CombatSystem.puff(this, this.player.x, this.player.y - 6, 0xc98a4a)
        Audio.play(this, SFX.click, { volume: 0.5 })
        if (this.trapEscapes >= TRAP_PRESSES) this.freeFromTrap()
      }
    } else if (useBtn && !this._prevUseBtn && !this.nearUnfinishedObjective()) {
      if (this.carried === 'stone') this.throwLure()
      else if (this.carried === 'torch') this.dropTorch()
    }
    this._prevUseBtn = useBtn
    this.updateScent(dt)
    this.updateHunger(dt)
    if (this._noPickT > 0) this._noPickT -= dt
    this.handlePickups()
    this.handleFood()
    this.checkTraps()
    this.drawStamina()
    this.drawWarmth()
    this.drawHunger()
    this.updateTrapHud()
    for (const h of this.hunters) h.think(dt)
    this.updateRageHud()
    this.updateStarfall(dt)
    this.updateProjectiles(dt)
    this.handleObjectives(dt)
    this.handleExit()
    this.updateMusicState(dt)
    this.updatePrompt()
    this.checkCatch()
    this.updateFog()
  }

  // Swap to the tension loop the instant the player catches sight of a hunter — any pixel
  // of it crossing into the player's light, standing in an on-screen map torch's pool, or
  // an enraged chaser (which self-illuminates as it charges) — and back to the main loop
  // once it's stayed out of sight for a beat. A hunter lying low in the dark no longer
  // triggers it. Music.play no-ops on the current key, so this only crossfades on an
  // actual change.
  updateMusicState(dt) {
    const lit = this.hasTorch ? LIGHT_RADIUS : SMALL_LIGHT
    const view = this.cameras.main.worldView
    let seen = false
    for (const h of this.hunters) {
      if (h.mode === 'CHASE') {
        seen = true
        break
      }
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, h.x, h.y)
      if (d < lit + h.displayWidth * 0.5) {
        seen = true
        break
      }
      if (
        view.contains(h.x, h.y) &&
        (this.torches.some((tr) => Phaser.Math.Distance.Between(h.x, h.y, tr.x, tr.y) < TORCH_LIGHT + h.displayWidth * 0.5) ||
          this.flashes.some((f) => Phaser.Math.Distance.Between(h.x, h.y, f.x, f.y) < TORCH_LIGHT + h.displayWidth * 0.5))
      ) {
        seen = true
        break
      }
    }
    this._tensionHold = seen ? TENSION_HOLD : Math.max(0, this._tensionHold - dt)
    Music.play(this, this._tensionHold > 0 ? 'bgm-tension' : 'bgm-main', { fade: 900 })
  }
}
