import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../config.js'
import { pixelText, panelButton, setUiMood } from '../ui/widgets.js'
import { Audio, SFX, Music } from '../systems/AudioSystem.js'
import { CombatSystem } from '../systems/CombatSystem.js'
import { SaveSystem } from '../systems/SaveSystem.js'
import { TouchState } from '../systems/TouchState.js'
import { showTouchControls, hideTouchControls } from '../ui/touchControls.js'
import Hunter from '../systems/Hunter.js'
import { ensureHuntLights, LIGHT_RADIUS, SMALL_LIGHT, TORCH_LIGHT } from '../utils/lights.js'
import { HEROES } from './NightHunt.js'
import { generateFloor } from '../dungeon/FloorGen.js'
import Minimap from '../dungeon/Minimap.js'

// ============================================================================
// DUNGEON CRAWL — Night Hunt's "Challenge" mode (v2: room-by-room).
// A floor is a graph of discrete rooms (start / combat / treasure / boss) laid
// out in one world; you move door to door. Combat rooms seal on entry and you
// clear them with a melee strike (silent-kills the unaware); the boss room caps
// the floor with the Emberhand fight; stairs descend. Wanderer-only; the lantern
// is your only light. Reuses Hunter AI, fog/lights, the Finale's Emberhand.
// ============================================================================

const TILE = 24
const ROOM_COLS = 30
const ROOM_ROWS = 18
const ROOM_W = ROOM_COLS * TILE // 720 — a touch larger than the viewport so the camera pans within a room
const ROOM_H = ROOM_ROWS * TILE // 432
const GRID = 5
const WORLD_W = GRID * ROOM_W // 3600
const WORLD_H = GRID * ROOM_H // 2160
const WALL_T = 16 // wall thickness
const DOOR_HALF = 26 // half the door-gap width

const ZOOM = 1.5 // camera zoom so the art reads bigger
const WALK_SPEED = 96
const SPRINT_SPEED = 168
const STAM_MAX = 1
const STAM_DRAIN = 0.55
const STAM_REGEN = 0.4
const STAM_FLOOR = 0.25

const STAIRS_RADIUS = 30
const CATCH_RADIUS = 40 // Emberhand grab range
const EMBER_ORBIT = 22
const THROW_SPEED = 300
const RUBBLE_SPEED = 150 // boss hurl speed — slow enough to read + catch
const MELEE_REACH = 50
const MELEE_CD = 0.32
const HUNTER_HP = 2

// Boss roster (config-driven). The Gargoyle has a full custom anim set; the
// stalkers reuse their walk loop as idle + a tinted wind-up telegraph. Every boss
// throws a catchable projectile so the Emberhand works on all of them.
const BOSSES = {
  gargoyle: { tex: 'gargoyle-idle', idle: 'gargoyle-idle', death: 'gargoyle-death', name: 'THE GARGOYLE GUARDIAN', hp: 5, scale: 1.0, body: [44, 34], proj: 'gargoyle-rubble', projScale: 1, hurl: 'gargoyle-hurl', smash: 'gargoyle-smash', hurt: 'gargoyle-hurt', verb: 'the guardian crushed you' },
  demon: { tex: 'demon-walk', idle: 'demon-walk', death: 'demon-death', name: 'THE HORNED STALKER', hp: 3, scale: 1.6, body: [40, 30], proj: 'venom', projScale: 1.4, verb: 'the stalker gored you' },
  mage: { tex: 'mage-walk', idle: 'mage-walk', death: 'mage-death', name: 'THE PALE MAGE', hp: 3, scale: 1.5, body: [36, 34], proj: 'venom', projScale: 1.2, verb: 'the mage blasted you' },
  ooze: { tex: 'ooze-walk', idle: 'ooze-walk', death: 'ooze-death', name: 'THE CREEPING OOZE', hp: 4, scale: 1.6, body: [44, 26], proj: 'venom', projScale: 1.6, verb: 'the ooze dissolved you' },
}

// Authored 4-floor campaign; the Gargoyle caps it. Beyond floor 4 it loops into an
// endless escalating descent (cfg() cycles the bosses with scaled stats).
const FLOORS = [
  { name: 'THE THRESHOLD', boss: 'demon', hunters: [['demon', 'sight']] },
  { name: 'THE WHISPERING HALLS', boss: 'mage', hunters: [['mage', 'hearing'], ['demon', 'sight']] },
  { name: 'THE SUNKEN VAULT', boss: 'ooze', hunters: [['ooze', 'sight'], ['mage', 'hearing']] },
  { name: "THE GUARDIAN'S GATE", boss: 'gargoyle', hunters: [['demon', 'sight'], ['mage', 'hearing'], ['ooze', 'sight']] },
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
    this.phase = 'explore' // 'explore' | 'boss' | 'cleared'
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
    this.fireballs = []
    this.ember = null
    this._prevE = false
    this._prevMelee = false
    this.meleeCd = 0
    this._stepT = 0
    this.boss = null
    this.bossRoom = null
    this.stairs = null
    this.curRoom = null
    this.activeCombat = null
    this.stealthRoom = null
    this.charm = false // a one-hit "lantern charm" from the treasure room
    this.treasurePickup = null
    this.hivemindOn = false
    // hunter-power multipliers Hunter.js reads
    this.senseRangeMul = 1
    this.hearRangeMul = 1
    this.awareUpMul = 1
    this.chaseSpeedMul = 1
    this.atkCdMul = 1
    this.moveMul = 1
    this.loudMul = 1

    this.wallZones = []
    this.wallRects = []
    this.braziers = []
    this.buildFloor()

    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H)
    this.buildPlayer()
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H)
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12)
    this.cameras.main.setZoom(ZOOM)

    ensureHuntLights(this)
    this.buildFog()
    this.buildHud()

    this.keys = this.input.keyboard.addKeys('W,A,S,D,SHIFT,E,SPACE,J,TAB,M,UP,DOWN,LEFT,RIGHT')
    this.input.keyboard.addCapture('TAB')
    showTouchControls({ jump: 'RUN', attack: 'ATK', heavy: 'GRAB' })
    this.events.once('shutdown', () => hideTouchControls())

    Music.play(this, 'bgm-main')
    this.curRoom = this.roomAt(this.spawn.x, this.spawn.y)
    if (this.curRoom) this.curRoom.visited = true
    this.minimap = new Minimap(this, this.floorData)
    this.floorBanner(`FLOOR ${this.floor}`, this.cfg().name)
  }

  cfg() {
    if (this.floor <= FLOORS.length) return FLOORS[this.floor - 1]
    const base = FLOORS[(this.floor - 1) % FLOORS.length]
    return { name: `DESCENT ${this.floor}`, boss: base.boss, hunters: base.hunters }
  }

  // ---- floor / rooms --------------------------------------------------------
  buildFloor() {
    this.floorData = generateFloor(this.floor, () => Phaser.Math.RND.frac())
    for (const r of this.floorData.rooms.values()) {
      r.bounds = new Phaser.Geom.Rectangle(r.gx * ROOM_W, r.gy * ROOM_H, ROOM_W, ROOM_H)
    }
    const start = this.floorData.rooms.get(this.floorData.startId)
    this.spawn = { x: start.bounds.centerX, y: start.bounds.centerY }

    // one combat room per floor becomes a stealth room (unsealed, unaware hunters)
    const combats = [...this.floorData.rooms.values()].filter((r) => r.type === 'combat')
    if (combats.length) Phaser.Utils.Array.GetRandom(combats).type = 'stealth'

    // floor + walls per room, then the molten cracks (Obsidian Ruins skin)
    const floorG = this.add.graphics().setDepth(0)
    for (const r of this.floorData.rooms.values()) this.drawRoomFloor(floorG, r)
    for (const r of this.floorData.rooms.values()) this.buildRoomWalls(r)
    for (const r of this.floorData.rooms.values()) this.addMoltenCracks(r)
    for (const r of this.floorData.rooms.values()) this.placeProps(r)
  }

  // Scatter ancient set pieces per room — cover (obelisk/statue) + decor (altar/
  // rubble) + one brazier that casts a light pool. Kept clear of the room centre
  // (combat/boss spawn), the player spawn, and the door gaps.
  placeProps(room) {
    const defs = [
      { key: 'dprop-obelisk', scale: 0.5, collide: true },
      { key: 'dprop-statue', scale: 0.5, collide: true },
      { key: 'dprop-altar', scale: 0.5, collide: false },
      { key: 'dprop-rubble', scale: 0.55, collide: false },
    ]
    const used = []
    const n = Phaser.Math.Between(2, 4)
    for (let i = 0; i < n; i++) {
      const spot = this.propSpot(room, used)
      if (!spot) break
      used.push(spot)
      this.placeProp(spot.x, spot.y, Phaser.Utils.Array.GetRandom(defs))
    }
    const bp = this.propSpot(room, used)
    if (bp) {
      used.push(bp)
      this.placeProp(bp.x, bp.y, { key: 'dprop-brazier', scale: 0.5, light: true })
    }
  }

  propSpot(room, used) {
    const b = room.bounds
    for (let t = 0; t < 14; t++) {
      const x = Phaser.Math.Between(b.x + 64, b.right - 64)
      const y = Phaser.Math.Between(b.y + 64, b.bottom - 64)
      if (Phaser.Math.Distance.Between(x, y, b.centerX, b.centerY) < 96) continue
      if (Phaser.Math.Distance.Between(x, y, this.spawn.x, this.spawn.y) < 80) continue
      if (used.some((u) => Phaser.Math.Distance.Between(x, y, u.x, u.y) < 64)) continue
      return { x, y }
    }
    return null
  }

  placeProp(x, y, d) {
    const img = this.add.image(x, y, d.key).setOrigin(0.5, 0.92).setScale(d.scale).setDepth(y)
    if (d.collide) {
      const w = img.displayWidth
      const h = img.displayHeight
      const rect = this.add.rectangle(x, y - 6, w * 0.5, 12, 0x000000, 0).setVisible(false)
      this.physics.add.existing(rect, true)
      this.wallZones.push(rect)
      this.wallRects.push(new Phaser.Geom.Rectangle(x - w * 0.3, y - h * 0.7, w * 0.6, h * 0.6))
    }
    if (d.light) {
      const ly = y - img.displayHeight * 0.5
      this.add.ellipse(x, ly, 18, 13, 0xff7a3a, 0.7).setDepth(y + 1)
      const flame = this.add.ellipse(x, ly - 3, 7, 12, 0xffd86b, 0.9).setDepth(y + 2)
      this.tweens.add({ targets: flame, scaleY: 1.3, scaleX: 0.8, yoyo: true, repeat: -1, duration: 280, ease: 'Sine.easeInOut' })
      this.braziers.push({ x, y: ly })
    }
  }

  drawRoomFloor(g, room) {
    const b = room.bounds
    // black volcanic flagstone
    g.fillStyle(0x18121c, 1).fillRect(b.x, b.y, b.width, b.height)
    g.lineStyle(1, 0x0f0a12, 1)
    for (let c = 0; c <= ROOM_COLS; c++) g.lineBetween(b.x + c * TILE, b.y, b.x + c * TILE, b.bottom)
    for (let rr = 0; rr <= ROOM_ROWS; rr++) g.lineBetween(b.x, b.y + rr * TILE, b.right, b.y + rr * TILE)
    for (let i = 0; i < 30; i++) {
      const c = Phaser.Math.Between(0, ROOM_COLS - 1)
      const rr = Phaser.Math.Between(0, ROOM_ROWS - 1)
      g.fillStyle(0x140e18, 1).fillRect(b.x + c * TILE + 1, b.y + rr * TILE + 1, TILE - 2, TILE - 2)
    }
    this.add.rectangle(b.x, b.y, b.width, b.height, 0x080410, 0.4).setOrigin(0, 0).setDepth(1)
  }

  // A few glowing molten cracks per room, faintly piercing the dark + pulsing.
  addMoltenCracks(room) {
    const b = room.bounds
    const n = Phaser.Math.Between(3, 5)
    for (let i = 0; i < n; i++) {
      const g = this.add.graphics().setDepth(950)
      let x = Phaser.Math.Between(b.x + 36, b.right - 36)
      let y = Phaser.Math.Between(b.y + 36, b.bottom - 36)
      const pts = [[x, y]]
      const segs = Phaser.Math.Between(3, 6)
      for (let s = 0; s < segs; s++) {
        x += Phaser.Math.Between(-26, 26)
        y += Phaser.Math.Between(-26, 26)
        pts.push([x, y])
      }
      const stroke = (width, color, alpha) => {
        g.lineStyle(width, color, alpha)
        g.beginPath()
        g.moveTo(pts[0][0], pts[0][1])
        for (const pp of pts) g.lineTo(pp[0], pp[1])
        g.strokePath()
      }
      stroke(5, 0xff5a2a, 0.1) // soft glow
      stroke(1.5, 0xff8a4a, 0.55) // bright core
      g.setAlpha(0.5)
      this.tweens.add({ targets: g, alpha: 0.95, yoyo: true, repeat: -1, duration: Phaser.Math.Between(900, 1700), ease: 'Sine.easeInOut' })
    }
  }

  // Solid wall along each edge, leaving a centred gap where a door connects.
  buildRoomWalls(room) {
    const b = room.bounds
    const D = DOOR_HALF
    room.doorGaps = []
    const horiz = [{ dir: 'n', y: b.y }, { dir: 's', y: b.bottom }]
    for (const e of horiz) {
      if (room.doors[e.dir]) {
        const gx = b.centerX
        const lw = gx - D - b.x
        if (lw > 0) this.addWall(b.x + lw / 2, e.y, lw, WALL_T)
        const rw = b.right - (gx + D)
        if (rw > 0) this.addWall(b.right - rw / 2, e.y, rw, WALL_T)
        room.doorGaps.push({ cx: gx, cy: e.y, w: 2 * D, h: WALL_T })
      } else {
        this.addWall(b.centerX, e.y, b.width + WALL_T, WALL_T)
      }
    }
    const vert = [{ dir: 'w', x: b.x }, { dir: 'e', x: b.right }]
    for (const e of vert) {
      if (room.doors[e.dir]) {
        const gy = b.centerY
        const th = gy - D - b.y
        if (th > 0) this.addWall(e.x, b.y + th / 2, WALL_T, th)
        const bh = b.bottom - (gy + D)
        if (bh > 0) this.addWall(e.x, b.bottom - bh / 2, WALL_T, bh)
        room.doorGaps.push({ cx: e.x, cy: gy, w: WALL_T, h: 2 * D })
      } else {
        this.addWall(e.x, b.centerY, WALL_T, b.height + WALL_T)
      }
    }
  }

  // A static wall rectangle (collider + LOS blocker + simple stone visual).
  addWall(cx, cy, w, h) {
    const rect = this.add.rectangle(cx, cy, w, h, 0x221826).setDepth(cy)
    rect.setStrokeStyle(1, 0x3a2c38, 0.7)
    this.physics.add.existing(rect, true)
    this.wallZones.push(rect)
    this.wallRects.push(new Phaser.Geom.Rectangle(cx - w / 2, cy - h / 2, w, h))
    return rect
  }

  roomAt(x, y) {
    for (const r of this.floorData.rooms.values()) if (r.bounds.contains(x, y)) return r
    return null
  }

  randomPointInRoom(room) {
    const b = room.bounds
    const m = 44
    return { x: Phaser.Math.Between(b.x + m, b.right - m), y: Phaser.Math.Between(b.y + m, b.bottom - m) }
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
    this.carryFlame = this.add.ellipse(this.spawn.x, this.spawn.y, 8, 13, 0xffd86b, 1)
  }

  floorBanner(line1, line2) {
    const a = this.fixUI(pixelText(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 16, line1, 22, '#ffe066').setScrollFactor(0).setDepth(11000))
    const b = this.fixUI(pixelText(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 14, line2, 10, '#cdd7ee').setScrollFactor(0).setDepth(11000))
    this.tweens.add({ targets: [a, b], alpha: 0, delay: 1700, duration: 900, onComplete: () => { a.destroy(); b.destroy() } })
  }

  // Counter the camera zoom for a screen-space (scrollFactor 0) UI object so it
  // keeps its intended screen position + size despite cameras.main.setZoom(ZOOM).
  fixUI(obj) {
    const mx = GAME_WIDTH / 2
    const my = GAME_HEIGHT / 2
    obj.setPosition(mx + (obj.x - mx) / ZOOM, my + (obj.y - my) / ZOOM)
    obj.setScale(obj.scaleX / ZOOM, obj.scaleY / ZOOM)
    return obj
  }

  // ---- Hunter.js scene contract ---------------------------------------------
  playerLit() {
    return true
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
    return null
  }

  randomPatrolPoint(fromX, fromY) {
    const room = this.roomAt(fromX, fromY)
    return room ? this.randomPointInRoom(room) : { x: fromX, y: fromY }
  }

  flashBanner(text, color) {
    const t = this.fixUI(pixelText(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60, text, 14, color).setScrollFactor(0).setDepth(11002))
    this.tweens.add({ targets: t, alpha: 0, y: t.y - 26 / ZOOM, duration: 1000, onComplete: () => t.destroy() })
  }

  spawnHunterAttack(h) {
    const a = Math.atan2(this.player.y - h.y, this.player.x - h.x)
    h.body.setVelocity(Math.cos(a) * 220, Math.sin(a) * 220)
    h.setTint(0xff6a6a)
    this.time.delayedCall(220, () => h.active && h.clearTint())
  }

  caughtByHunter(h) {
    if (this.gameOver) return
    if (h && h.mode !== 'CHASE') return // only an enraged hunter catches you
    if (this.consumeShield()) return
    this.playerDeath('the hunters took you')
  }

  // ---- melee (basic; W upgrades the visuals + tuning later) ------------------
  handleMelee(dt) {
    this.meleeCd = Math.max(0, this.meleeCd - dt)
    const pressed = this.keys.SPACE.isDown || this.keys.J.isDown || TouchState.attackL
    const edge = pressed && !this._prevMelee
    this._prevMelee = pressed
    if (edge && this.meleeCd <= 0) this.doMelee()
  }

  doMelee() {
    this.meleeCd = MELEE_CD
    let dx = this.faceX
    let dy = this.faceY
    if (dx === 0 && dy === 0) { dx = this.player.flipX ? -1 : 1; dy = 0 }
    const l = Math.hypot(dx, dy) || 1
    dx /= l
    dy /= l
    const hx = this.player.x + dx * MELEE_REACH * 0.55
    const hy = this.player.y + dy * MELEE_REACH * 0.55
    const arc = this.add.circle(hx, hy, 16, 0xfff0c0, 0.5).setDepth(this.player.y + 2)
    this.tweens.add({ targets: arc, scale: 1.7, alpha: 0, duration: 150, onComplete: () => arc.destroy() })
    Audio.play(this, SFX.slash, { volume: 0.5, rate: 1.15 })
    for (const h of [...this.hunters]) {
      const tdx = h.x - this.player.x
      const tdy = h.y - this.player.y
      const td = Math.hypot(tdx, tdy)
      if (td > MELEE_REACH) continue
      if ((tdx / (td || 1)) * dx + (tdy / (td || 1)) * dy < 0.15) continue // must be in front (~80°)
      const unaware = h.mode !== 'CHASE' && h.awareness < 0.45
      if (unaware) this.banishHunter(h, true) // silent kill
      else this.damageHunter(h, 1)
    }
  }

  damageHunter(h, dmg) {
    h.hp = (h.hp ?? HUNTER_HP) - dmg
    h.setTint(0xffffff)
    this.time.delayedCall(80, () => h.active && h.clearTint())
    if (h.hp <= 0) {
      this.banishHunter(h, false)
    } else {
      Audio.play(this, SFX.enemyHit, { volume: 0.6 })
      h.distract(this.player.x, this.player.y) // knock it out of a chase briefly
    }
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

  // ---- room flow ------------------------------------------------------------
  updateRoom() {
    const r = this.roomAt(this.player.x, this.player.y)
    if (r && r !== this.curRoom) {
      const prev = this.curRoom
      this.curRoom = r
      if (prev && prev.type === 'stealth' && !prev.cleared) this.clearStealth(prev)
      this.onEnterRoom(r)
      this.minimap?.refresh()
    }
  }

  onEnterRoom(room) {
    const firstVisit = !room.visited
    room.visited = true
    if (room.cleared) return
    if (room.type === 'boss') this.startBoss(room)
    else if (room.type === 'combat' && firstVisit) this.startCombat(room)
    else if (room.type === 'stealth' && firstVisit) this.startStealth(room)
    else if (room.type === 'treasure') this.enterTreasure(room)
  }

  // A watched hall: hunters patrol UNAWARE and the doors stay open. Sneak through
  // (clears when you reach the next room) or stealth-kill them. Detection = a chase.
  startStealth(room) {
    this.stealthRoom = room
    const cfg = this.cfg()
    const n = Math.min(2 + Math.floor(this.floor / 2), 4)
    for (let i = 0; i < n; i++) {
      const [skin, sense] = cfg.hunters[i % cfg.hunters.length]
      const p = this.randomPointInRoom(room)
      const hn = new Hunter(this, p.x, p.y, skin, sense)
      hn.hp = HUNTER_HP
      hn.room = room
      hn.mode = 'PATROL'
      hn.awareness = 0
      this.hunters.push(hn)
      this.hunterColliders.push(this.physics.add.collider(hn, this.wallZones))
      this.physics.add.overlap(this.player, hn, () => this.caughtByHunter(hn))
    }
    this.flashBanner('a watched hall — stay unseen', '#b47cff')
  }

  clearStealth(room) {
    room.cleared = true
    if (this.stealthRoom === room) this.stealthRoom = null
    for (const h of [...this.hunters].filter((hh) => hh.room === room)) {
      const i = this.hunters.indexOf(h)
      if (i >= 0) {
        this.hunters.splice(i, 1)
        this.hunterColliders[i]?.destroy()
        this.hunterColliders.splice(i, 1)
      }
      h.meter.clear()
      h.destroy()
    }
    this.flashBanner('slipped through', '#7cfc98')
  }

  // The treasure room holds a "lantern charm" pickup: it survives one killing blow.
  enterTreasure(room) {
    if (room.cleared || this.treasurePickup) return
    const c = room.bounds
    this.add.image(c.centerX, c.centerY + 6, 'dprop-altar').setOrigin(0.5, 0.7).setScale(0.7).setDepth(c.centerY)
    this.add.ellipse(c.centerX, c.centerY - 26, 26, 26, 0x7cfc98, 0.22).setDepth(c.centerY + 4)
    const orb = this.add.ellipse(c.centerX, c.centerY - 26, 12, 12, 0x9affc0, 0.95).setDepth(c.centerY + 5)
    this.tweens.add({ targets: orb, y: orb.y - 6, yoyo: true, repeat: -1, duration: 700, ease: 'Sine.easeInOut' })
    this.treasurePickup = { orb, room, x: c.centerX, y: c.centerY - 26 }
    this.flashBanner('a charm rests here', '#7cfc98')
  }

  checkTreasure() {
    const t = this.treasurePickup
    if (!t) return
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, t.x, t.y) < 28) {
      this.charm = true
      t.room.cleared = true
      this.tweens.add({ targets: t.orb, scale: 2, alpha: 0, duration: 300, onComplete: () => t.orb.destroy() })
      this.treasurePickup = null
      Audio.play(this, SFX.levelUp, { volume: 0.7 })
      this.flashBanner('lantern charm — survives one blow', '#7cfc98')
      this.minimap?.refresh()
    }
  }

  startCombat(room) {
    this.activeCombat = room
    setUiMood(this, 'danger')
    this.sealRoom(room)
    const cfg = this.cfg()
    const n = Math.min(2 + Math.floor(this.floor / 2), 5)
    for (let i = 0; i < n; i++) {
      const [skin, sense] = cfg.hunters[i % cfg.hunters.length]
      const p = this.randomPointInRoom(room)
      const hn = new Hunter(this, p.x, p.y, skin, sense)
      hn.hp = HUNTER_HP
      hn.room = room
      hn.awareness = 0.9 // it's a fight — they engage fast
      hn.mode = 'SUSPICIOUS'
      hn.lastCue = { x: this.player.x, y: this.player.y }
      this.hunters.push(hn)
      this.hunterColliders.push(this.physics.add.collider(hn, this.wallZones))
      this.physics.add.overlap(this.player, hn, () => this.caughtByHunter(hn))
    }
    Audio.play(this, SFX.heavy, { volume: 0.5, rate: 1.2 })
  }

  sealRoom(room) {
    room.seals = []
    for (const g of room.doorGaps) {
      const rect = this.add.rectangle(g.cx, g.cy, g.w, g.h, 0x2a2030).setDepth(g.cy)
      rect.setStrokeStyle(2, 0xff5a2a, 0.7)
      this.physics.add.existing(rect, true)
      this.wallZones.push(rect)
      room.seals.push(rect)
    }
  }

  unsealRoom(room) {
    for (const s of room.seals || []) {
      const i = this.wallZones.indexOf(s)
      if (i >= 0) this.wallZones.splice(i, 1)
      s.destroy()
    }
    room.seals = []
  }

  checkCombatClear() {
    const room = this.activeCombat
    if (!room) return
    if (this.hunters.some((h) => h.room === room)) return
    room.cleared = true
    this.activeCombat = null
    this.unsealRoom(room)
    setUiMood(this, 'calm')
    Audio.play(this, SFX.clear, { volume: 0.6 })
    this.flashBanner('room cleared', '#7cfc98')
    this.minimap?.refresh()
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

  // ---- boss room ------------------------------------------------------------
  startBoss(room) {
    this.phase = 'boss'
    this.bossRoom = room
    this.sealRoom(room)
    const cfg = this.cfg()
    const b = BOSSES[cfg.boss]
    this.bossCfg = b
    const over = Math.max(0, this.floor - FLOORS.length)
    const boss = this.physics.add.sprite(room.bounds.centerX, room.bounds.centerY, b.tex).setScale(b.scale).setOrigin(0.5, 0.7)
    boss.play(b.idle)
    boss.body.setAllowGravity(false)
    boss.body.setSize(b.body[0], b.body[1])
    boss.hp = b.hp + Math.floor(over * 1.5)
    boss.maxHp = boss.hp
    boss.state = 'idle'
    boss.actT = 1.4
    boss.invuln = 0
    this.boss = boss
    this.physics.add.collider(boss, this.wallZones)
    this.physics.add.overlap(this.player, boss, () => this.bossTouch())

    Music.play(this, 'bgm-boss', { fade: 500 })
    setUiMood(this, 'danger')
    this.floorBanner(b.name, 'catch its shot — hurl it back')
    this.buildBossHud()
  }

  updateBoss(dt) {
    const b = this.boss
    if (!b || b.state === 'dead') return
    b.setDepth(b.y)
    if (b.invuln > 0) b.invuln -= dt
    const d = Phaser.Math.Distance.Between(b.x, b.y, this.player.x, this.player.y)
    if (Math.abs(this.player.x - b.x) > 6) b.flipX = this.player.x < b.x

    if (b.state === 'hurl' || b.state === 'smash' || b.state === 'hurt') return

    const a = Math.atan2(this.player.y - b.y, this.player.x - b.x)
    b.body.setVelocity(Math.cos(a) * 26, Math.sin(a) * 26)

    b.actT -= dt
    if (b.actT > 0) return
    if (d < 120 && this.bossCfg.smash) this.bossSmash()
    else this.bossHurl()
  }

  bossHurl() {
    const b = this.boss
    b.state = 'hurl'
    b.body.setVelocity(0, 0)
    const back = () => {
      if (b.state !== 'hurl') return
      this.spawnRubble()
      b.play(this.bossCfg.idle)
      b.state = 'idle'
      b.actT = Phaser.Math.FloatBetween(1.6, 2.4)
    }
    if (this.bossCfg.hurl) {
      b.play(this.bossCfg.hurl)
      b.once(`animationcomplete-${this.bossCfg.hurl}`, back)
    } else {
      b.setTint(0xffd24a)
      this.time.delayedCall(360, () => { if (b.active && b.state !== 'dead') b.clearTint() })
      this.time.delayedCall(380, back)
    }
  }

  bossSmash() {
    const b = this.boss
    b.state = 'smash'
    b.body.setVelocity(0, 0)
    b.play(`${this.bossCfg.smash}`)
    const ring = this.add.circle(b.x, b.y + 10, 12, 0xff5a3c, 0.18).setDepth(b.y - 1)
    this.tweens.add({ targets: ring, radius: 96, alpha: 0, duration: 620 })
    this.time.delayedCall(520, () => {
      if (b.state !== 'smash') return
      if (!this.gameOver && Phaser.Math.Distance.Between(b.x, b.y + 10, this.player.x, this.player.y) < 100) {
        if (!this.consumeShield()) this.playerDeath(this.bossCfg.verb)
      }
      CombatSystem.puff(this, b.x, b.y + 10, 0xff7a4a, b.y)
      Audio.play(this, SFX.heavy, { volume: 0.8, rate: 0.8 })
      this.cameras.main.shake(180, 0.012)
    })
    b.once(`animationcomplete-${this.bossCfg.smash}`, () => {
      if (b.state !== 'smash') return
      ring.destroy()
      b.play(this.bossCfg.idle)
      b.state = 'idle'
      b.actT = Phaser.Math.FloatBetween(1.4, 2.2)
    })
  }

  makeProj(x, y) {
    const b = this.bossCfg
    const spr = this.physics.add.sprite(x, y, b.proj).setScale(b.projScale).setDepth(9000)
    spr.body.setAllowGravity(false)
    if (this.anims.exists(b.proj)) spr.play(b.proj)
    else spr.body.setAngularVelocity(420)
    return spr
  }

  spawnRubble() {
    const b = this.boss
    const a = Math.atan2(this.player.y - b.y, this.player.x - b.x)
    const spr = this.makeProj(b.x, b.y - 10)
    spr.body.setVelocity(Math.cos(a) * RUBBLE_SPEED, Math.sin(a) * RUBBLE_SPEED)
    this.fireballs.push({ spr, catchable: true, thrown: false, ttl: 5 })
    Audio.play(this, SFX.slash, { volume: 0.6, rate: 0.7 })
  }

  // ---- Emberhand (boss room) ------------------------------------------------
  handleEmber(dt) {
    if (this.gameOver) return
    const pressed = this.keys.E.isDown || TouchState.attackH
    const edge = pressed && !this._prevE
    this._prevE = pressed

    if (this.ember) {
      this._orbitA = (this._orbitA || 0) + dt * 5
      this.ember.setPosition(this.player.x + Math.cos(this._orbitA) * EMBER_ORBIT, this.player.y - 8 + Math.sin(this._orbitA) * EMBER_ORBIT).setDepth(this.player.y + 2)
      if (edge) this.throwEmber()
      return
    }
    if (!edge) return
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
    if (this.anims.exists(this.bossCfg.proj)) this.ember.play(this.bossCfg.proj)
    Audio.play(this, SFX.clear, { volume: 0.5, rate: 1.3 })
    CombatSystem.puff(this, this.player.x, this.player.y - 8, 0xffd24a, this.player.y)
    this.flashBanner('caught! — GRAB to hurl', '#ffd24a')
  }

  throwEmber() {
    const e = this.ember
    this.ember = null
    let dx = this.faceX
    let dy = this.faceY
    if (dx === 0 && dy === 0) dx = this.player.flipX ? -1 : 1
    const l = Math.hypot(dx, dy) || 1
    const spr = this.makeProj(e.x, e.y)
    spr.body.setVelocity((dx / l) * THROW_SPEED, (dy / l) * THROW_SPEED)
    this.fireballs.push({ spr, catchable: false, thrown: true, ttl: 2.2 })
    e.destroy()
    Audio.play(this, SFX.slash, { rate: 0.9 })
  }

  consumeShield() {
    if (this.ember) {
      CombatSystem.puff(this, this.ember.x, this.ember.y, 0xffd24a, this.player.y)
      this.ember.destroy()
      this.ember = null
      Audio.play(this, SFX.crit, { volume: 0.6 })
      this.flashBanner('shield spent!', '#ffd24a')
      return true
    }
    if (this.charm) {
      this.charm = false
      CombatSystem.puff(this, this.player.x, this.player.y - 8, 0x7cfc98, this.player.y)
      Audio.play(this, SFX.crit, { volume: 0.6 })
      this.flashBanner('charm shattered!', '#7cfc98')
      return true
    }
    return false
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
      if (f.thrown && this.boss && this.boss.state !== 'dead' && Phaser.Math.Distance.Between(s.x, s.y, this.boss.x, this.boss.y - 8) < 44) {
        this.killFireball(f)
        this.bossHit()
        continue
      }
      if (f.catchable && !f.thrown && !this.gameOver && Phaser.Math.Distance.Between(s.x, s.y, this.player.x, this.player.y) < 18) {
        this.killFireball(f)
        if (!this.consumeShield()) this.playerDeath('struck down — catch it next time')
      }
    }
  }

  bossTouch() {
    if (this.gameOver || !this.boss || this.boss.state === 'dead') return
    if (this.consumeShield()) return
    this.playerDeath(this.bossCfg.verb)
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
    b.body.setVelocity(0, 0)
    if (this.bossCfg.hurt) {
      b.state = 'hurt'
      b.play(this.bossCfg.hurt)
      b.once(`animationcomplete-${this.bossCfg.hurt}`, () => {
        if (b.state !== 'hurt') return
        b.play(this.bossCfg.idle)
        b.state = 'idle'
        b.actT = 0.8
      })
    } else {
      b.setTint(0xff8a8a)
      this.time.delayedCall(160, () => { if (b.active && b.state !== 'dead') b.clearTint() })
      b.actT = Math.max(b.actT, 0.6)
    }
  }

  bossDown() {
    const b = this.boss
    b.state = 'dead'
    b.body.setVelocity(0, 0)
    b.body.enable = false
    Audio.play(this, SFX.enemyDie, { volume: 0.9, rate: 0.7 })
    b.play(this.bossCfg.death)
    this.cameras.main.shake(360, 0.014)
    this.phase = 'cleared'
    if (this.bossRoom) { this.bossRoom.cleared = true; this.unsealRoom(this.bossRoom) }
    this.minimap?.refresh()
    setUiMood(this, 'calm')
    Music.play(this, 'bgm-main', { fade: 700 })
    const ch = SaveSystem.data.challenge
    if (this.floor > ch.bestDepth) ch.bestDepth = this.floor
    const finalFloor = this.floor === FLOORS.length
    if (finalFloor) ch.won = true
    SaveSystem.save()
    this.time.delayedCall(1400, () => this.spawnStairs(finalFloor))
  }

  spawnStairs(victory) {
    const c = this.bossRoom ? this.bossRoom.bounds : { centerX: this.player.x, centerY: this.player.y }
    this.stairs = this.add.image(c.centerX, c.centerY + 40, 'hunt-sign').setOrigin(0.5, 1).setDepth(c.centerY + 40).setScale(1.5).setTint(0x7cfc98)
    this.tweens.add({ targets: this.stairs, y: this.stairs.y - 4, yoyo: true, repeat: -1, duration: 600 })
    if (victory) this.floorBanner('THE DUNGEON IS CONQUERED', 'the endless descent opens below')
    else this.floorBanner('THE WAY IS CLEAR', 'descend the stairs')
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
    this.fogColor = 0x05030a
    this.fog = this.add.renderTexture(0, 0, GAME_WIDTH, GAME_HEIGHT).setOrigin(0, 0).setScrollFactor(0).setDepth(900)
  }

  updateFog() {
    const cam = this.cameras.main
    this.fog.clear()
    this.fog.fill(this.fogColor, 1)
    // the fog is a screen-space overlay scaled by the camera zoom around the screen
    // centre, so light positions need this offset to land on the right world point
    const ox = (GAME_WIDTH / 2) * (ZOOM - 1) / ZOOM
    const oy = (GAME_HEIGHT / 2) * (ZOOM - 1) / ZOOM
    const sx = this.player.x - cam.scrollX + ox
    const sy = this.player.y - cam.scrollY + oy
    this.fog.erase('hunt-light', sx - LIGHT_RADIUS, sy - LIGHT_RADIUS)
    for (const br of this.braziers) {
      this.fog.erase('hunt-torch-light', br.x - cam.scrollX + ox - TORCH_LIGHT, br.y - cam.scrollY + oy - TORCH_LIGHT)
    }
    if (this.boss && this.boss.state !== 'dead') {
      this.fog.erase('hunt-torch-light', this.boss.x - cam.scrollX + ox - TORCH_LIGHT, this.boss.y - cam.scrollY + oy - TORCH_LIGHT)
    }
    for (const h of this.hunters) {
      if (h.mode === 'CHASE' || this.gameOver) {
        this.fog.erase('hunt-light-sm', h.x - cam.scrollX + ox - SMALL_LIGHT, h.y - cam.scrollY + oy - SMALL_LIGHT)
      }
    }
  }

  // ---- HUD ------------------------------------------------------------------
  buildHud() {
    this.hudFloor = this.fixUI(pixelText(this, 10, 8, '', 9, '#ffe066').setOrigin(0, 0).setScrollFactor(0).setDepth(11000))
    this.hudHint = this.fixUI(pixelText(this, 10, 24, '', 7, '#8ea0c0').setOrigin(0, 0).setScrollFactor(0).setDepth(11000))
    this.hudBest = this.fixUI(pixelText(this, GAME_WIDTH - 10, 8, '', 7, '#7c84a0').setOrigin(1, 0).setScrollFactor(0).setDepth(11000))
    this.hudCharm = this.fixUI(pixelText(this, 10, 40, '', 7, '#7cfc98').setOrigin(0, 0).setScrollFactor(0).setDepth(11000))
    this.bossHud = null
  }

  updateHud() {
    this.hudFloor.setText(`FLOOR ${this.floor}`)
    this.hudBest.setText(`deepest: ${SaveSystem.data.challenge.bestDepth}`)
    this.hudCharm.setText(this.charm ? '✦ charm ready' : '')
    this.hudHint.setText(
      this.phase === 'boss'
        ? 'ATK: strike  ·  GRAB: catch + hurl'
        : this.phase === 'cleared'
          ? 'take the stairs down'
          : this.activeCombat
            ? 'ATK: strike  ·  clear the room'
            : 'ATK: strike  ·  find the stairs'
    )
  }

  buildBossHud() {
    this.bossHud = this.fixUI(this.add.graphics().setScrollFactor(0).setDepth(11000))
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
      for (const h of this.hunters) h.think(dt)
      this.updateRoom()
      this.handleMelee(dt)
      this.checkTreasure()
      if (this.phase === 'boss') {
        this.updateBoss(dt)
        this.handleEmber(dt)
        this.updateProjectiles(dt)
      } else {
        this.checkCombatClear()
      }
      if (this.phase === 'cleared') this.checkStairs()
    }
    this.minimap?.setFull(this.keys.TAB.isDown || this.keys.M.isDown)
    this.updateHud()
    this.updateFog()
  }
}
