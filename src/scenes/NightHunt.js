import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../config.js'
import { pixelText, panelButton, uiPanel } from '../ui/widgets.js'
import { Audio, SFX } from '../systems/AudioSystem.js'
import { CombatSystem } from '../systems/CombatSystem.js'
import Hunter, { SENSES, SKINS } from '../systems/Hunter.js'

const TILE = 24
const WORLD_COLS = 50
const WORLD_ROWS = 34
const WORLD_W = WORLD_COLS * TILE // 1200
const WORLD_H = WORLD_ROWS * TILE // 816

const WALK_SPEED = 96
const SPRINT_SPEED = 168
const LIGHT_RADIUS = 104
const SMALL_LIGHT = 48
const OBJ_RADIUS = 34
const OBJ_HOLD = 1.5 // seconds to channel an objective
const EXIT_RADIUS = 30
const CATCH_DIST = 22
const VOLLEY_SPEED = 200
const WAVE_SPEED = 180
const HOMING_SPEED = 210

const GRASS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 13, 14, 16, 18, 21, 33]

// NIGHT HUNT — a top-down survival-horror roguelite (Cobb Can Move-style). Roam a
// dark forest doing 3 objectives and reach the exit while ONE stalker hunts you;
// each round randomizes its active sense + boss skin. See Hunter.js for the AI.
export default class NightHuntScene extends Phaser.Scene {
  constructor() {
    super('NightHunt')
  }

  create(data) {
    this.round = data?.round || 1
    this.gameOver = false
    this.spawn = { x: WORLD_W / 2, y: WORLD_H / 2 }
    this.objectives = []
    this.projectiles = []
    this.scent = []
    this._burst = 0
    this._scentT = 0
    this.playerMoving = false
    this.playerLoudness = 0
    this.playerMoveFactor = 0
    this.exit = null
    this.hunter = null
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
    this.playerShadow = this.add.ellipse(this.spawn.x, this.spawn.y, 22, 8, 0x000000, 0.32)
    this.player = this.physics.add.sprite(this.spawn.x, this.spawn.y, 'hunt-hero').setOrigin(0.5, 0.62).setScale(0.62)
    this.player.body.setAllowGravity(false)
    this.player.setCollideWorldBounds(true)
    this.player.body.setSize(20, 14)
    this.physics.add.collider(this.player, this.wallZones)
  }

  handlePlayer(dt, time) {
    const k = this.keys
    let ax = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0)
    let ay = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0)
    const sprint = k.SHIFT.isDown
    const moving = ax !== 0 || ay !== 0
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

    if (moving && Math.abs(ax) > 0.02) this.player.flipX = ax < 0
    this.player.scaleY = moving ? 0.62 * (1 + 0.05 * Math.sin(time / 70)) : 0.62
    this.player.setDepth(this.player.y)
    this.playerShadow.setPosition(this.player.x, this.player.y + this.player.displayHeight * 0.3).setDepth(this.player.y - 1)
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

    this.activeSense = Phaser.Utils.Array.GetRandom(Object.keys(SENSES))
    this.activeSkin = Phaser.Utils.Array.GetRandom(Object.keys(SKINS))

    this.player.setPosition(this.spawn.x, this.spawn.y)
    this.player.body.setVelocity(0, 0)
    this.scent.length = 0

    this.placeObjectives()
    this.placeExit()
    this.spawnHunter()

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
    if (this.exit) {
      this.exit.destroy()
      this.exit = null
    }
    if (this.hunterCollider) {
      this.physics.world.removeCollider(this.hunterCollider)
      this.hunterCollider = null
    }
    if (this.hunter) {
      this.hunter.destroy()
      this.hunter = null
    }
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

  spawnHunter() {
    const pool = Phaser.Utils.Array.Shuffle([...this.openPoints])
    const pt = pool.find((p) => Phaser.Math.Distance.Between(p.x, p.y, this.spawn.x, this.spawn.y) > 340) || pool[0]
    this.hunter = new Hunter(this, pt.x, pt.y, this.activeSkin, this.activeSense)
    this.hunterCollider = this.physics.add.collider(this.hunter, this.wallZones)
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
    for (const o of this.objectives) {
      if (!o.done) {
        remaining++
        const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, o.x, o.y)
        if (d < OBJ_RADIUS && this.keys.E.isDown) {
          o.progress = Math.min(1, o.progress + dt / OBJ_HOLD)
          this._burst = Math.max(this._burst, 0.5) // channeling is audible
          if (o.progress >= 1) {
            o.done = true
            this._burst = 1.3 // completing is LOUD
            CombatSystem.puff(this, o.x, o.y - 8, 0xffe066)
            Audio.play(this, SFX.clear)
            if (this.pips[idx]) this.pips[idx].clearTint()
          }
        } else {
          o.progress = Math.max(0, o.progress - dt * 0.8)
        }
      }
      this.drawObjRing(o)
      idx++
    }
    if (remaining === 0 && !this.exitOpen) this.openExit()
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

  checkCatch() {
    if (!this.hunter) return
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, this.hunter.x, this.hunter.y) < CATCH_DIST) {
      this.playerDeath()
    }
  }

  // ---- hunter attacks (ported from AgeOfWar, aimed at the single player) -----
  spawnHunterAttack(h) {
    const p = this.player
    const ox = h.x
    const oy = h.y - h.displayHeight * 0.3
    const tint = SENSES[this.activeSense].color
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
    this.makeLight('hunt-light-sm', SMALL_LIGHT, 0.55)
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
    this.fog.fill(0x05060a, 0.97)
    const sx = this.player.x - cam.scrollX
    const sy = this.player.y - cam.scrollY
    this.fog.erase('hunt-light', sx - LIGHT_RADIUS, sy - LIGHT_RADIUS)
    if (this.hunter && this.hunter.mode === 'CHASE') {
      const hx = this.hunter.x - cam.scrollX
      const hy = this.hunter.y - cam.scrollY
      this.fog.erase('hunt-light-sm', hx - SMALL_LIGHT, hy - SMALL_LIGHT)
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
    this.senseBg = this.add.image(GAME_WIDTH - 158, 18, 'ui', 3).setScrollFactor(0).setDepth(9500).setDisplaySize(26, 26)
    this.senseIcon = this.add.graphics().setScrollFactor(0).setDepth(9501)
    this.senseText = pixelText(this, GAME_WIDTH - 142, 18, '', 9, '#cdd7ee').setOrigin(0, 0.5).setScrollFactor(0).setDepth(9501)

    const menu = panelButton(this, GAME_WIDTH - 40, GAME_HEIGHT - 16, 'MENU', () => this.scene.start('MainMenu'), { size: 8, width: 60, depth: 9500 })
    menu.bg.setScrollFactor(0)
    menu.text.setScrollFactor(0)
  }

  updateHudSense() {
    const sn = SENSES[this.activeSense]
    const col = '#' + sn.color.toString(16).padStart(6, '0')
    this.senseText.setText(sn.code).setColor(col)
    this.senseIcon.clear()
    this.drawSenseIcon(this.senseIcon, GAME_WIDTH - 158, 18, sn.glyph, sn.color)
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
    const sn = SENSES[this.activeSense]
    const col = '#' + sn.color.toString(16).padStart(6, '0')
    const y = 108
    const bg = uiPanel(this, GAME_WIDTH / 2, y, 330, 76, { originX: 0.5, originY: 0.5, depth: 11000 }).setScrollFactor(0)
    const t1 = pixelText(this, GAME_WIDTH / 2, y - 18, 'THE HUNTER USES', 8, '#8ea0c0').setScrollFactor(0).setDepth(11001)
    const code = pixelText(this, GAME_WIDTH / 2 + 18, y + 8, `${sn.code} = true`, 13, col).setScrollFactor(0).setDepth(11001)
    const icon = this.add.graphics().setScrollFactor(0).setDepth(11001)
    this.drawSenseIcon(icon, GAME_WIDTH / 2 - 116, y + 9, sn.glyph, sn.color)
    this.bannerEls = [bg, t1, code, icon]
    this.time.delayedCall(2600, () => {
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
    this.updateScent(dt)
    if (this.hunter) this.hunter.think(dt)
    this.updateProjectiles(dt)
    this.handleObjectives(dt)
    this.handleExit()
    this.checkCatch()
    this.updateFog()
  }
}
