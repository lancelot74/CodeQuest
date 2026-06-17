import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../config.js'
import { pixelText, panelButton, setUiMood } from '../ui/widgets.js'
import { Audio, SFX, Music } from '../systems/AudioSystem.js'
import { CombatSystem } from '../systems/CombatSystem.js'
import { SaveSystem } from '../systems/SaveSystem.js'
import { TouchState } from '../systems/TouchState.js'
import { showTouchControls, hideTouchControls } from '../ui/touchControls.js'
import Hunter, { SENSES, SKINS } from '../systems/Hunter.js'
import { ensureHuntLights, LIGHT_RADIUS, SMALL_LIGHT, TORCH_LIGHT } from '../utils/lights.js'
import { HEROES } from './NightHunt.js'

// ============================================================================
// DUNGEON CRAWL — Night Hunt's "Challenge" mode.
// A hybrid stealth + boss-arena descent. Each floor: sneak past patrolling
// hunters in the dark to reach the sealed boss chamber, beat the boss with the
// Emberhand (catch its hurled projectile, throw it back), take the stairs down.
// Wanderer-only — the lantern is both your light and your liability. Reuses
// Night Hunt's arena/fog/Hunter AI and a top-down take on the Finale's Emberhand.
// ============================================================================

const TILE = 24
const WORLD_COLS = 50
const WORLD_ROWS = 34
const WORLD_W = WORLD_COLS * TILE // 1200
const WORLD_H = WORLD_ROWS * TILE // 816

const WALK_SPEED = 96
const SPRINT_SPEED = 168
const STAM_MAX = 1
const STAM_DRAIN = 0.55
const STAM_REGEN = 0.4
const STAM_FLOOR = 0.25

const GATE_RADIUS = 34
const STAIRS_RADIUS = 30
const CATCH_RADIUS = 40 // Emberhand grab range
const EMBER_ORBIT = 22
const THROW_SPEED = 300
const RUBBLE_SPEED = 150 // boss hurl speed — slow enough to read + catch
const BLAST_RADIUS = 120 // lantern ward — staggers nearby creatures
const BLAST_CD = 3 // ward cooldown (seconds)
const KILL_RANGE = 34 // stealth-kill reach

// Boss roster (config-driven so campaign floors can swap in the stalkers later).
const BOSSES = {
  gargoyle: { sheet: 'gargoyle', name: 'THE GARGOYLE GUARDIAN', hp: 4, scale: 1.0, body: [44, 34], proj: 'gargoyle-rubble', projScale: 1, hurl: 'gargoyle-hurl', smash: 'gargoyle-smash', hurt: 'gargoyle-hurt' },
}

// Authored campaign. Floors beyond the list become endless (last floor, scaled).
const FLOORS = [
  { name: 'THE THRESHOLD', boss: 'gargoyle', hunters: [['demon', 'sight'], ['mage', 'hearing']] },
]

export default class DungeonCrawl extends Phaser.Scene {
  constructor() {
    super('DungeonCrawl')
  }

  create(data) {
    this.floor = data?.floor || 1
    this.heroKey = 'hunt-lantern'
    this.hero = HEROES.find((h) => h.key === this.heroKey)

    // ---- state ----
    this.gameOver = false
    this.phase = 'stealth' // 'stealth' | 'boss' | 'cleared'
    this.spawn = { x: 90, y: WORLD_H / 2 }
    this.faceX = 1
    this.faceY = 0
    this.stamina = STAM_MAX
    this.exhausted = false
    this.hasTorch = true // the Wanderer's lantern is always lit
    this.playerMoving = false
    this.playerLoudness = 0
    this.playerMoveFactor = 0
    this.scent = []
    this.hunters = []
    this.hunterColliders = []
    this.fireballs = [] // catchable boss projectiles
    this.bolts = [] // non-catchable hunter lunges (unused for now; reserved)
    this.ember = null
    this._prevE = false
    this._prevBlast = false
    this.blastCd = 0
    this._stepT = 0
    this.boss = null
    this.stairs = null
    this.hivemindOn = false
    // hunter-power multipliers Hunter.js reads (no per-floor modifiers yet)
    this.senseRangeMul = 1
    this.hearRangeMul = 1
    this.awareUpMul = 1
    this.chaseSpeedMul = 1
    this.atkCdMul = 1
    this.moveMul = 1
    this.loudMul = 1

    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H)
    this.buildArena()
    this.buildPlayer()

    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H)
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12)

    ensureHuntLights(this)
    this.buildFog()
    this.buildHud()

    this.keys = this.input.keyboard.addKeys('W,A,S,D,SHIFT,E,SPACE,UP,DOWN,LEFT,RIGHT')
    showTouchControls({ jump: 'RUN', attack: 'USE', heavy: 'WARD' })
    this.events.once('shutdown', () => hideTouchControls())

    Music.play(this, 'bgm-main')
    this.startFloor()
  }

  cfg() {
    return FLOORS[Math.min(this.floor, FLOORS.length) - 1]
  }

  // ---- arena (dungeon-skinned) ----------------------------------------------
  buildArena() {
    // flat flagstone floor drawn once into a render texture
    const g = this.add.graphics()
    g.fillStyle(0x23252f, 1).fillRect(0, 0, WORLD_W, WORLD_H)
    g.lineStyle(1, 0x191b23, 1)
    for (let c = 0; c <= WORLD_COLS; c++) g.lineBetween(c * TILE, 0, c * TILE, WORLD_H)
    for (let r = 0; r <= WORLD_ROWS; r++) g.lineBetween(0, r * TILE, WORLD_W, r * TILE)
    // a few darker flagstones for texture
    for (let i = 0; i < 80; i++) {
      const c = Phaser.Math.Between(0, WORLD_COLS - 1)
      const r = Phaser.Math.Between(0, WORLD_ROWS - 1)
      g.fillStyle(0x1e2028, 1).fillRect(c * TILE + 1, r * TILE + 1, TILE - 2, TILE - 2)
    }
    g.setDepth(0)
    // cold stone wash so the lantern pool reads
    this.add.rectangle(0, 0, WORLD_W, WORLD_H, 0x0a0c16, 0.45).setOrigin(0, 0).setDepth(1)

    this.wallZones = []
    this.wallRects = []

    // perimeter wall of stone blocks
    for (let x = 14; x < WORLD_W; x += 40) {
      this.addObstacle(x, 30, 'hunt-big_stone', true)
      this.addObstacle(x, WORLD_H - 6, 'hunt-big_stone', true)
    }
    for (let y = 60; y < WORLD_H - 40; y += 40) {
      this.addObstacle(14, y, 'hunt-big_stone', true)
      this.addObstacle(WORLD_W - 14, y, 'hunt-big_stone', true)
    }

    // interior pillars/rubble — cover to sneak behind (kept clear of spawn + boss chamber)
    const props = ['hunt-big_stone', 'hunt-mid_stone', 'hunt-mid_stone', 'hunt-skull']
    for (let i = 0; i < 24; i++) {
      const x = Phaser.Math.Between(220, WORLD_W - 320)
      const y = Phaser.Math.Between(110, WORLD_H - 110)
      if (Phaser.Math.Distance.Between(x, y, this.spawn.x, this.spawn.y) < 150) continue
      this.addObstacle(x, y, Phaser.Utils.Array.GetRandom(props))
    }

    // open points for hunter patrol / placement
    this.openPoints = []
    for (let x = 120; x < WORLD_W - 120; x += 56) {
      for (let y = 90; y < WORLD_H - 90; y += 56) {
        if (!this.wallRects.some((rr) => rr.contains(x, y))) this.openPoints.push({ x, y })
      }
    }

    // boss chamber sits at the right; the gate is the stealth objective
    this.bossSpot = { x: WORLD_W - 150, y: WORLD_H / 2 }
  }

  addObstacle(x, y, key, border = false) {
    const img = this.add.image(x, y, key).setOrigin(0.5, 1).setDepth(border ? 4 : y)
    if (border) img.setTint(0x6b7180)
    const w = img.width
    const h = img.height
    const rect = this.add.rectangle(x, y - 7, w * 0.5, 12, 0x000000, 0).setVisible(false)
    this.physics.add.existing(rect, true)
    this.wallZones.push(rect)
    this.wallRects.push(new Phaser.Geom.Rectangle(x - w * 0.32, y - h * 0.7, w * 0.64, h * 0.62))
  }

  // ---- player (Wanderer) ----------------------------------------------------
  buildPlayer() {
    const h = this.hero
    this.playerShadow = this.add.ellipse(this.spawn.x, this.spawn.y, 20, 7, 0x000000, 0.32)
    this.player = this.physics.add.sprite(this.spawn.x, this.spawn.y, `${h.key}-idle`).setOrigin(0.5, h.origin).setScale(h.scale)
    this.player.play(`${h.key}-idle`)
    this.player.body.setAllowGravity(false)
    this.player.setCollideWorldBounds(true)
    this.player.body.setSize(h.body[0], h.body[1])
    if (h.off) this.player.body.setOffset(h.off[0], h.off[1])
    this.physics.add.collider(this.player, this.wallZones)
    // lantern glow the Wanderer always carries
    this.carryFlame = this.add.ellipse(this.spawn.x, this.spawn.y, 8, 13, 0xffd86b, 1)
  }

  // ---- floor setup ----------------------------------------------------------
  startFloor() {
    const cfg = this.cfg()
    // difficulty scales past the authored campaign
    const over = Math.max(0, this.floor - FLOORS.length)
    this.senseRangeMul = 1 + over * 0.08
    this.chaseSpeedMul = 1 + over * 0.05

    // hunters between you and the gate
    const list = [...cfg.hunters]
    for (let i = 0; i < over; i++) list.push(['ooze', i % 2 ? 'hearing' : 'sight']) // endless adds stalkers
    const pool = Phaser.Utils.Array.Shuffle(
      this.openPoints.filter((p) => p.x > 300 && Phaser.Math.Distance.Between(p.x, p.y, this.spawn.x, this.spawn.y) > 240)
    )
    list.forEach(([skin, sense], i) => {
      const pt = pool[i] || { x: WORLD_W / 2, y: WORLD_H / 2 }
      const hn = new Hunter(this, pt.x, pt.y, skin, sense)
      this.hunters.push(hn)
      this.hunterColliders.push(this.physics.add.collider(hn, this.wallZones))
      this.physics.add.overlap(this.player, hn, () => this.caughtByHunter(hn))
    })

    // the gate — a glowing sealed door at the boss chamber entrance
    this.gate = this.add.image(WORLD_W - 280, WORLD_H / 2, 'hunt-sign').setOrigin(0.5, 1).setDepth(WORLD_H / 2).setScale(1.4).setTint(0xffd24a)
    this.tweens.add({ targets: this.gate, scaleX: 1.55, scaleY: 1.3, yoyo: true, repeat: -1, duration: 700, ease: 'Sine.easeInOut' })
    this.gateGlow = this.add.ellipse(this.gate.x, this.gate.y - 16, 60, 40, 0xffb24a, 0.25).setDepth(3)

    this.floorBanner(`FLOOR ${this.floor}`, cfg.name)
  }

  floorBanner(line1, line2) {
    const a = pixelText(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 16, line1, 22, '#ffe066').setScrollFactor(0).setDepth(11000)
    const b = pixelText(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 14, line2, 10, '#cdd7ee').setScrollFactor(0).setDepth(11000)
    this.tweens.add({ targets: [a, b], alpha: 0, delay: 1700, duration: 900, onComplete: () => { a.destroy(); b.destroy() } })
  }

  // ---- Hunter.js scene contract ---------------------------------------------
  playerLit() {
    return true // the lantern is always lit
  }

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

  smellQuery() {
    return null // no smell hunters in the dungeon
  }

  randomPatrolPoint(fromX, fromY, radius) {
    const near = this.openPoints.filter((p) => Phaser.Math.Distance.Between(p.x, p.y, fromX, fromY) < radius)
    const pool = near.length ? near : this.openPoints
    return pool.length ? Phaser.Utils.Array.GetRandom(pool) : { x: fromX, y: fromY }
  }

  flashBanner(text, color) {
    const t = pixelText(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60, text, 14, color).setScrollFactor(0).setDepth(11002)
    this.tweens.add({ targets: t, alpha: 0, y: GAME_HEIGHT / 2 - 86, duration: 1000, onComplete: () => t.destroy() })
  }

  // a chasing hunter lunges instead of firing — contact is the kill (handled by overlap)
  spawnHunterAttack(h) {
    const a = Math.atan2(this.player.y - h.y, this.player.x - h.x)
    h.body.setVelocity(Math.cos(a) * 220, Math.sin(a) * 220)
    h.setTint(0xff6a6a)
    this.time.delayedCall(220, () => h.active && h.clearTint())
  }

  caughtByHunter() {
    if (this.gameOver || this.phase !== 'stealth') return
    if (this.consumeShield()) return
    this.playerDeath('the hunters took you')
  }

  // ---- stealth-kill + lantern ward ------------------------------------------
  // Execute the nearest UNAWARE hunter (patrolling / not yet locked on) in reach.
  tryStealthKill() {
    let best = null
    let bd = KILL_RANGE
    for (const h of this.hunters) {
      if (h.mode === 'CHASE' || h.awareness >= 0.45) continue
      const d = Phaser.Math.Distance.Between(h.x, h.y, this.player.x, this.player.y)
      if (d < bd) { bd = d; best = h }
    }
    if (!best) return
    this.banishHunter(best, true)
    this.flashBanner('silent kill', '#7cfc98')
  }

  banishHunter(h, silent) {
    const i = this.hunters.indexOf(h)
    if (i >= 0) {
      this.hunters.splice(i, 1)
      const col = this.hunterColliders[i]
      if (col) col.destroy()
      this.hunterColliders.splice(i, 1)
    }
    h.meter.clear()
    h.body.enable = false
    CombatSystem.puff(this, h.x, h.y - 6, silent ? 0x7cfc98 : 0xffe6a0, h.y + 1)
    Audio.play(this, SFX.enemyDie, { volume: 0.7, rate: silent ? 0.9 : 1.1 })
    const deathKey = `${h.skinKey}-death`
    if (this.anims.exists(deathKey)) {
      h.play(deathKey)
      h.once(`animationcomplete-${deathKey}`, () => h.destroy())
      this.time.delayedCall(1400, () => h.active && h.destroy())
    } else {
      h.destroy()
    }
  }

  // Lantern ward: a short-range light-blast that staggers nearby creatures and
  // jolts the boss out of its rhythm. Light vs. the dungeon dark.
  handleBlast(dt) {
    this.blastCd = Math.max(0, this.blastCd - dt)
    const pressed = this.keys.SPACE.isDown || TouchState.attackH
    const edge = pressed && !this._prevBlast
    this._prevBlast = pressed
    if (edge && this.blastCd <= 0) this.doBlast()
  }

  doBlast() {
    this.blastCd = BLAST_CD
    const px = this.player.x
    const py = this.player.y - 6
    const ring = this.add.circle(px, py, 10, 0xffe6a0, 0.5).setDepth(py + 2)
    this.tweens.add({ targets: ring, radius: BLAST_RADIUS, alpha: 0, duration: 380, onComplete: () => ring.destroy() })
    Audio.play(this, SFX.clear, { volume: 0.7 })
    CombatSystem.puff(this, px, py, 0xffe6a0, py + 1)
    // stagger nearby hunters — frozen long enough to slip past
    for (const h of this.hunters) {
      if (Phaser.Math.Distance.Between(h.x, h.y, px, py) > BLAST_RADIUS) continue
      h.mode = 'STUNNED'
      h.stunTimer = 2.5
      h.awareness = 0
      h.setTint(0xffe6a0)
      this.time.delayedCall(220, () => h.active && h.clearTint())
    }
    // jolt the boss: delay its next action + a brief flinch tint
    if (this.boss && this.boss.state !== 'dead' && Phaser.Math.Distance.Between(this.boss.x, this.boss.y, px, py) < BLAST_RADIUS + 50) {
      this.boss.actT = Math.max(this.boss.actT, 1.4)
      this.boss.setTint(0xffe6a0)
      this.time.delayedCall(240, () => this.boss?.active && this.boss.clearTint())
    }
  }

  // ---- player movement ------------------------------------------------------
  handlePlayer(dt, time) {
    if (this.gameOver) {
      this.player.body.setVelocity(0, 0)
      return
    }
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
    }
    this.player.body.setVelocity(ax * speed, ay * speed)

    this.playerMoving = moving
    this.playerMoveFactor = moving ? (sprint ? 1 : 0.5) : 0
    this.playerLoudness = moving ? (sprint ? 1.0 : 0.4) : 0

    if (moving) {
      this.faceX = ax
      this.faceY = ay
      if (Math.abs(ax) > 0.02) this.player.flipX = ax < 0
    }
    const want = !moving
      ? `${this.heroKey}-idle`
      : sprint && this.anims.exists(`${this.heroKey}-sprint`)
        ? `${this.heroKey}-sprint`
        : `${this.heroKey}-run`
    if (this.player.anims.getName() !== want) this.player.play(want)

    if (moving) {
      this._stepT -= dt
      if (this._stepT <= 0) {
        this._stepT = sprint ? 0.26 : 0.42
        Audio.play(this, SFX.jump, { volume: sprint ? 0.5 : 0.32, rate: sprint ? 1.25 : 1.05 })
      }
    }

    this.player.setDepth(this.player.y)
    this.playerShadow.setPosition(this.player.x, this.player.y + this.player.displayHeight * 0.22).setDepth(this.player.y - 1)
    this.carryFlame
      .setPosition(this.player.x + 7, this.player.y - this.player.displayHeight * 0.5)
      .setDepth(this.player.y + 1)
      .setScale(1, 1 + 0.18 * Math.sin(time / 110))
  }

  // ---- stealth -> boss ------------------------------------------------------
  checkGate() {
    if (this.phase !== 'stealth') return
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, this.gate.x, this.gate.y - 12) < GATE_RADIUS) {
      this.startBoss()
    }
  }

  startBoss() {
    this.phase = 'boss'
    // seal the chamber: clamp the camera to the right end, wall off behind
    this.gate.destroy()
    this.gateGlow.destroy()
    const wallX = WORLD_W - 360
    for (let y = 40; y < WORLD_H - 20; y += 38) this.addObstacle(wallX, y, 'hunt-big_stone', true)
    // the gate seals behind you — freeze the stealth hunters and clear their rings
    for (const h of this.hunters) { h.mode = 'PATROL'; h.awareness = 0; h.body.setVelocity(0, 0); h.meter.clear() }

    const cfg = this.cfg()
    const b = BOSSES[cfg.boss]
    this.bossCfg = b
    const over = Math.max(0, this.floor - FLOORS.length)
    const boss = this.physics.add.sprite(this.bossSpot.x, this.bossSpot.y, `${b.sheet}-idle`).setScale(b.scale).setOrigin(0.5, 0.7)
    boss.play(`${b.sheet}-idle`)
    boss.body.setAllowGravity(false)
    boss.body.setSize(b.body[0], b.body[1])
    boss.hp = b.hp + Math.floor(over * 1.5)
    boss.maxHp = boss.hp
    boss.state = 'idle'
    boss.actT = 1.4
    boss.invuln = 0
    this.boss = boss
    this.physics.add.overlap(this.player, boss, () => this.bossTouch())

    Music.play(this, 'bgm-boss', { fade: 500 })
    setUiMood(this, 'danger')
    this.floorBanner(b.name, 'catch the rubble — hurl it back')
    this.buildBossHud()
  }

  // ---- boss AI --------------------------------------------------------------
  updateBoss(dt) {
    const b = this.boss
    if (!b || b.state === 'dead') return
    b.setDepth(b.y)
    if (b.invuln > 0) b.invuln -= dt
    const d = Phaser.Math.Distance.Between(b.x, b.y, this.player.x, this.player.y)
    if (Math.abs(this.player.x - b.x) > 6) b.flipX = this.player.x < b.x

    if (b.state === 'hurl' || b.state === 'smash' || b.state === 'hurt') return // locked in an action

    // creep slowly toward the player to keep pressure
    const a = Math.atan2(this.player.y - b.y, this.player.x - b.x)
    b.body.setVelocity(Math.cos(a) * 26, Math.sin(a) * 26)

    b.actT -= dt
    if (b.actT > 0) return
    if (d < 120) this.bossSmash()
    else this.bossHurl()
  }

  bossHurl() {
    const b = this.boss
    b.state = 'hurl'
    b.body.setVelocity(0, 0)
    b.play(`${this.bossCfg.hurl}`)
    b.once(`animationcomplete-${this.bossCfg.hurl}`, () => {
      if (b.state !== 'hurl') return
      this.spawnRubble()
      b.play(`${this.bossCfg.sheet}-idle`)
      b.state = 'idle'
      b.actT = Phaser.Math.FloatBetween(1.6, 2.4)
    })
  }

  bossSmash() {
    const b = this.boss
    b.state = 'smash'
    b.body.setVelocity(0, 0)
    b.play(`${this.bossCfg.smash}`)
    // telegraph ring at the slam point
    const ring = this.add.circle(b.x, b.y + 10, 12, 0xff5a3c, 0.18).setDepth(b.y - 1)
    this.tweens.add({ targets: ring, radius: 96, alpha: 0, duration: 620 })
    this.time.delayedCall(520, () => {
      if (b.state !== 'smash') return
      // impact: hit if the player is within the shockwave
      if (!this.gameOver && Phaser.Math.Distance.Between(b.x, b.y + 10, this.player.x, this.player.y) < 100) {
        if (!this.consumeShield()) this.playerDeath('the guardian crushed you')
      }
      CombatSystem.puff(this, b.x, b.y + 10, 0xff7a4a, b.y)
      Audio.play(this, SFX.heavy, { volume: 0.8, rate: 0.8 })
      this.cameras.main.shake(180, 0.012)
    })
    b.once(`animationcomplete-${this.bossCfg.smash}`, () => {
      if (b.state !== 'smash') return
      ring.destroy()
      b.play(`${this.bossCfg.sheet}-idle`)
      b.state = 'idle'
      b.actT = Phaser.Math.FloatBetween(1.4, 2.2)
    })
  }

  spawnRubble() {
    const b = this.boss
    const a = Math.atan2(this.player.y - b.y, this.player.x - b.x)
    const spr = this.physics.add.sprite(b.x, b.y - 10, this.bossCfg.proj).setScale(this.bossCfg.projScale).setDepth(9000)
    spr.play(this.bossCfg.proj)
    spr.body.setAllowGravity(false)
    const f = { spr, catchable: true, thrown: false, ttl: 5 }
    spr.body.setVelocity(Math.cos(a) * RUBBLE_SPEED, Math.sin(a) * RUBBLE_SPEED)
    this.fireballs.push(f)
    Audio.play(this, SFX.slash, { volume: 0.6, rate: 0.7 })
  }

  // ---- Emberhand (catch / shield / throw) -----------------------------------
  handleEmber(dt) {
    if (this.gameOver) return
    const pressed = this.keys.E.isDown || TouchState.attackL
    const edge = pressed && !this._prevE
    this._prevE = pressed

    // in the stealth phase, E executes an unaware hunter instead (no projectiles yet)
    if (this.phase === 'stealth') {
      if (edge) this.tryStealthKill()
      return
    }

    if (this.ember) {
      this._orbitA = (this._orbitA || 0) + dt * 5
      this.ember.setPosition(this.player.x + Math.cos(this._orbitA) * EMBER_ORBIT, this.player.y - 8 + Math.sin(this._orbitA) * EMBER_ORBIT).setDepth(this.player.y + 2)
      if (edge) this.throwEmber()
      return
    }
    if (!edge) return
    // try to catch the nearest catchable boss projectile
    let best = null
    let bd = CATCH_RADIUS
    for (const f of this.fireballs) {
      if (!f.catchable || f.thrown) continue
      const d = Phaser.Math.Distance.Between(f.spr.x, f.spr.y, this.player.x, this.player.y)
      if (d < bd) { bd = d; best = f }
    }
    if (!best) return
    this.killFireball(best)
    this.ember = this.add.sprite(this.player.x, this.player.y - 8, this.bossCfg.proj).setScale(this.bossCfg.projScale).setDepth(this.player.y + 2)
    this.ember.play(this.bossCfg.proj)
    Audio.play(this, SFX.clear, { volume: 0.5, rate: 1.3 })
    CombatSystem.puff(this, this.player.x, this.player.y - 8, 0xffd24a, this.player.y)
    this.flashBanner('caught! — E to hurl', '#ffd24a')
  }

  throwEmber() {
    const e = this.ember
    this.ember = null
    let dx = this.faceX
    let dy = this.faceY
    if (dx === 0 && dy === 0) dx = this.player.flipX ? -1 : 1
    const l = Math.hypot(dx, dy) || 1
    const spr = this.physics.add.sprite(e.x, e.y, this.bossCfg.proj).setScale(this.bossCfg.projScale).setDepth(9000)
    spr.play(this.bossCfg.proj)
    spr.body.setAllowGravity(false)
    spr.body.setVelocity((dx / l) * THROW_SPEED, (dy / l) * THROW_SPEED)
    this.fireballs.push({ spr, catchable: false, thrown: true, ttl: 2.2 })
    e.destroy()
    Audio.play(this, SFX.slash, { rate: 0.9 })
  }

  consumeShield() {
    if (!this.ember) return false
    CombatSystem.puff(this, this.ember.x, this.ember.y, 0xffd24a, this.player.y)
    this.ember.destroy()
    this.ember = null
    Audio.play(this, SFX.crit, { volume: 0.6 })
    this.flashBanner('shield spent!', '#ffd24a')
    return true
  }

  killFireball(f) {
    f.spr.destroy()
    const i = this.fireballs.indexOf(f)
    if (i >= 0) this.fireballs.splice(i, 1)
  }

  updateProjectiles(dt) {
    for (const f of [...this.fireballs]) {
      f.ttl -= dt
      const s = f.spr
      if (f.ttl <= 0 || s.x < 0 || s.x > WORLD_W || s.y < 0 || s.y > WORLD_H) {
        this.killFireball(f)
        continue
      }
      // a thrown ember that reaches the boss damages it
      if (f.thrown && this.boss && this.boss.state !== 'dead' && Phaser.Math.Distance.Between(s.x, s.y, this.boss.x, this.boss.y - 8) < 44) {
        this.killFireball(f)
        this.bossHit()
        continue
      }
      // an uncaught boss projectile that reaches the player hits
      if (f.catchable && !f.thrown && !this.gameOver && Phaser.Math.Distance.Between(s.x, s.y, this.player.x, this.player.y) < 18) {
        this.killFireball(f)
        if (!this.consumeShield()) this.playerDeath('struck by rubble')
      }
    }
  }

  bossTouch() {
    if (this.gameOver || !this.boss || this.boss.state === 'dead') return
    if (this.consumeShield()) return
    this.playerDeath('the guardian crushed you')
  }

  bossHit() {
    const b = this.boss
    if (!b || b.state === 'dead' || b.invuln > 0) return
    b.hp--
    b.invuln = 0.4
    this.updateBossHud()
    CombatSystem.puff(this, b.x, b.y - 8, 0xffffff, b.y + 1)
    this.cameras.main.shake(120, 0.008)
    if (b.hp <= 0) {
      this.bossDown()
      return
    }
    Audio.play(this, SFX.enemyHit, { volume: 0.8 })
    // flinch
    b.state = 'hurt'
    b.body.setVelocity(0, 0)
    b.play(this.bossCfg.hurt)
    b.once(`animationcomplete-${this.bossCfg.hurt}`, () => {
      if (b.state !== 'hurt') return
      b.play(`${this.bossCfg.sheet}-idle`)
      b.state = 'idle'
      b.actT = 0.8
    })
  }

  bossDown() {
    const b = this.boss
    b.state = 'dead'
    b.body.setVelocity(0, 0)
    b.body.enable = false
    Audio.play(this, SFX.enemyDie, { volume: 0.9, rate: 0.7 })
    b.play(`${this.bossCfg.sheet}-death`)
    this.cameras.main.shake(360, 0.014)
    this.phase = 'cleared'
    setUiMood(this, 'calm')
    Music.play(this, 'bgm-main', { fade: 700 })
    // record depth
    const ch = SaveSystem.data.challenge
    if (this.floor > ch.bestDepth) { ch.bestDepth = this.floor; SaveSystem.save() }
    this.time.delayedCall(1400, () => this.spawnStairs())
  }

  spawnStairs() {
    this.stairs = this.add.image(this.bossSpot.x, this.bossSpot.y, 'hunt-sign').setOrigin(0.5, 1).setDepth(this.bossSpot.y).setScale(1.5).setTint(0x7cfc98)
    this.tweens.add({ targets: this.stairs, y: this.stairs.y - 4, yoyo: true, repeat: -1, duration: 600 })
    this.floorBanner('GUARDIAN FELLED', 'descend the stairs')
  }

  checkStairs() {
    if (this.phase !== 'cleared' || !this.stairs) return
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, this.stairs.x, this.stairs.y - 14) < STAIRS_RADIUS) {
      this.stairs = null
      this.cameras.main.fadeOut(500, 0, 0, 0)
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.restart({ floor: this.floor + 1 }))
    }
  }

  // ---- death ----------------------------------------------------------------
  playerDeath(reason) {
    if (this.gameOver) return
    this.gameOver = true
    setUiMood(this, 'danger')
    Audio.play(this, SFX.playerDie)
    Music.play(this, 'bgm-trap', { fade: 400 })
    this.player.body.setVelocity(0, 0)
    const deathKey = `${this.heroKey}-death`
    if (this.anims.exists(deathKey)) {
      this.player.play(deathKey)
      this.player.once(`animationcomplete-${deathKey}`, () => this.showDeathOverlay(reason))
      this.time.delayedCall(2000, () => this.showDeathOverlay(reason))
    } else {
      this.showDeathOverlay(reason)
    }
  }

  showDeathOverlay(reason) {
    if (this._overlayShown) return
    this._overlayShown = true
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x05060c, 0.72).setOrigin(0, 0).setScrollFactor(0).setDepth(12000)
    pixelText(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 52, 'FALLEN', 26, '#e06a6a').setScrollFactor(0).setDepth(12001)
    pixelText(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20, reason || '', 8, '#cdd7ee').setScrollFactor(0).setDepth(12001)
    pixelText(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 4, `floor ${this.floor}`, 8, '#8ea0c0').setScrollFactor(0).setDepth(12001)
    const retry = panelButton(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 40, 'RETRY FLOOR', () => this.scene.restart({ floor: this.floor }), { width: 170, depth: 12001 })
    const menu = panelButton(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 78, 'MAIN MENU', () => this.scene.start('MainMenu'), { width: 170, depth: 12001 })
    for (const btn of [retry, menu]) { btn.bg.setScrollFactor(0); btn.text.setScrollFactor(0) }
  }

  // ---- fog ------------------------------------------------------------------
  buildFog() {
    this.fogColor = 0x05060f
    this.fog = this.add.renderTexture(0, 0, GAME_WIDTH, GAME_HEIGHT).setOrigin(0, 0).setScrollFactor(0).setDepth(900)
  }

  updateFog() {
    const cam = this.cameras.main
    this.fog.clear()
    this.fog.fill(this.fogColor, 1)
    const sx = this.player.x - cam.scrollX
    const sy = this.player.y - cam.scrollY
    this.fog.erase('hunt-light', sx - LIGHT_RADIUS, sy - LIGHT_RADIUS)
    // the boss chamber is lit during the fight; chasers self-illuminate
    if (this.boss && this.boss.state !== 'dead') {
      this.fog.erase('hunt-torch-light', this.boss.x - cam.scrollX - TORCH_LIGHT, this.boss.y - cam.scrollY - TORCH_LIGHT)
    }
    for (const h of this.hunters) {
      if (h.mode === 'CHASE' || this.gameOver) {
        this.fog.erase('hunt-light-sm', h.x - cam.scrollX - SMALL_LIGHT, h.y - cam.scrollY - SMALL_LIGHT)
      }
    }
  }

  // ---- HUD ------------------------------------------------------------------
  buildHud() {
    this.hudFloor = pixelText(this, 10, 8, '', 9, '#ffe066').setOrigin(0, 0).setScrollFactor(0).setDepth(11000)
    this.hudHint = pixelText(this, 10, 24, '', 7, '#8ea0c0').setOrigin(0, 0).setScrollFactor(0).setDepth(11000)
    this.hudBest = pixelText(this, GAME_WIDTH - 10, 8, '', 7, '#7c84a0').setOrigin(1, 0).setScrollFactor(0).setDepth(11000)
    this.bossHud = null
  }

  updateHud() {
    this.hudFloor.setText(`FLOOR ${this.floor}`)
    this.hudBest.setText(`deepest: ${SaveSystem.data.challenge.bestDepth}`)
    const ward = this.blastCd > 0 ? ` (ward ${this.blastCd.toFixed(1)}s)` : '  ·  SPACE: ward'
    this.hudHint.setText(
      this.phase === 'boss'
        ? `E: catch / hurl rubble${ward}`
        : this.phase === 'cleared'
          ? 'take the stairs down'
          : `reach the gate  ·  E: silent kill${ward}`
    )
  }

  buildBossHud() {
    this.bossHud = this.add.graphics().setScrollFactor(0).setDepth(11000)
    this.updateBossHud()
  }

  updateBossHud() {
    if (!this.bossHud || !this.boss) return
    const g = this.bossHud
    g.clear()
    const n = this.boss.maxHp
    const w = 26
    const total = n * (w + 4)
    const x0 = GAME_WIDTH / 2 - total / 2
    for (let i = 0; i < n; i++) {
      const filled = i < this.boss.hp
      g.fillStyle(filled ? 0xe0552a : 0x2a2d3a, 1)
      g.fillRect(x0 + i * (w + 4), GAME_HEIGHT - 22, w, 8)
    }
  }

  // ---- main loop ------------------------------------------------------------
  update(time, delta) {
    const dt = delta / 1000
    if (!this.player) return
    this.handlePlayer(dt, time)
    if (!this.gameOver) {
      if (this.phase === 'stealth') for (const h of this.hunters) h.think(dt)
      if (this.phase === 'stealth') this.checkGate()
      if (this.phase === 'boss') this.updateBoss(dt)
      if (this.phase === 'cleared') this.checkStairs()
      this.handleEmber(dt)
      this.handleBlast(dt)
      this.updateProjectiles(dt)
    }
    this.updateHud()
    this.updateFog()
  }
}
