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

  startStage(name) {
    this.stage = name
    if (name === 'corridor1') this.flashBanner('something flies above', '#8ea0c0')
    // 'gift', 'corridor2', 'arena1', 'arena2', 'rage' and 'dawn' get their
    // entry logic in later tasks
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
    this.sealDoorsBehind()
    this.updateStages()
    this.drawStamina()
    this.updateFog()
  }
}
