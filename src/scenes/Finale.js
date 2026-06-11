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
    this.bramble = null
    this.brambleBits = []
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
    this.buildDoors()

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
      this.startDawn() // real body in the dawn task
    }
  }

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
  }

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
        if (this.bramble && Math.abs(f.spr.x - this.bramble.x) < 18) {
          this.killFireball(f)
          this.burnBramble()
          continue
        }
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
    this.sealDoorsBehind()
    this.updateStages()
    if ((this.stage === 'corridor1' || this.stage === 'corridor2') && (this._strafeT -= dt) <= 0) {
      this._strafeT = this.stage === 'corridor1' ? 3.5 : 4.5
      this.runStrafe()
    }
    if (this.stage === 'gift') this.updateGift()
    this.updateDragon(dt)
    this.handleEmber(dt)
    this.updateFireballs(dt)
    this.drawStamina()
    this.updateFog()
  }
}

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
