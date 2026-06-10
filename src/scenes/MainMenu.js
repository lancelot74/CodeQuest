import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../config.js'
import { nightBackdrop, panelButton, pixelText, ensureGlowTexture } from '../ui/widgets.js'
import { Audio, SFX, Music } from '../systems/AudioSystem.js'
import { SaveSystem } from '../systems/SaveSystem.js'

// Skins that can amble across the menu strip — the same walk sheets the hunters use.
const WALKERS = ['demon-walk', 'mage-walk', 'ooze-walk']

// The title screen doubles as a NIGHT HUNT vignette: a dark forest strip with torch
// pools, drifting fog and — every so often — a hunter silhouette crossing in the dark,
// heard before it's seen. All built from in-game assets; UI sits at depth 5+.
export default class MainMenuScene extends Phaser.Scene {
  constructor() {
    super('MainMenu')
  }

  create() {
    nightBackdrop(this, { treeline: false }) // the vignette below brings its own forest
    ensureGlowTexture(this)
    this.buildVignette()

    pixelText(this, GAME_WIDTH / 2, 110, 'CODEQUEST', 32, '#ffe066')
    pixelText(this, GAME_WIDTH / 2, 148, 'learn to code by playing', 8, '#8ea0c0')

    // roguelite stakes on the boot screen, in the game's own code-speak
    const best = SaveSystem.data.hunt.bestRound
    if (best > 1) pixelText(this, 12, 16, `save.bestRound = ${best}`, 8, '#7ab8ff').setOrigin(0, 0.5)

    const W = 180
    panelButton(this, GAME_WIDTH / 2, 214, 'GAME', () => this.scene.start('GameSelect'), { width: W })
    panelButton(this, GAME_WIDTH / 2, 256, 'CODEX', () => this.scene.start('Codex'), { width: W })
    panelButton(this, GAME_WIDTH / 2, 298, 'SETTINGS', () => this.scene.start('Settings'), { width: W })

    Music.play(this, 'bgm-main')

    this.time.addEvent({ delay: Phaser.Math.Between(6000, 11000), loop: true, callback: () => this.spawnWalker() })
  }

  buildVignette() {
    // full round moon with craters, up in the corner behind the title
    const mx = GAME_WIDTH - 70
    this.add.image(mx, 52, 'menu-glow').setScale(1.4).setAlpha(0.22).setTint(0xcdd7ee)
    this.add.circle(mx, 52, 16, 0xe8edf8, 1)
    this.add.circle(mx - 5, 47, 3, 0xc6cfe4, 1)
    this.add.circle(mx + 5, 57, 2.2, 0xc6cfe4, 1)
    this.add.circle(mx + 7, 46, 1.5, 0xc6cfe4, 1)

    // forest floor strip along the bottom, dimmed to night
    const stripY = GAME_HEIGHT - 48
    this.add.tileSprite(0, stripY, GAME_WIDTH, 48, 'hunt-tiles', 0).setOrigin(0, 0).setDepth(1)
    this.add.rectangle(0, stripY, GAME_WIDTH, 48, 0x0a1430, 0.55).setOrigin(0, 0).setDepth(2)
    for (const fx of [0.08, 0.34, 0.62, 0.93]) {
      this.add.image(GAME_WIDTH * fx, GAME_HEIGHT + 2, 'hunt-tree').setOrigin(0.5, 1).setDepth(2).setTint(0x4a5578)
    }

    // two torch pools the silhouette can snuff as it passes
    this.torches = [GAME_WIDTH * 0.22, GAME_WIDTH * 0.78].map((x) => {
      const glow = this.add.image(x, GAME_HEIGHT - 14, 'menu-glow').setScale(0.9, 0.55).setAlpha(0.3).setTint(0xffb24a).setDepth(2)
      const flame = this.add.ellipse(x, GAME_HEIGHT - 20, 6, 11, 0xffd86b, 1).setDepth(3)
      this.tweens.add({ targets: flame, scaleY: 1.3, scaleX: 0.78, yoyo: true, repeat: -1, duration: 300, ease: 'Sine.easeInOut' })
      return { x, glow, flame, lit: true }
    })

    // slow fog wisps drifting across the strip (kept faint — title must stay crisp)
    for (let i = 0; i < 3; i++) {
      const y = GAME_HEIGHT - Phaser.Math.Between(18, 52)
      const wisp = this.add
        .image(Phaser.Math.Between(0, GAME_WIDTH), y, 'menu-glow')
        .setScale(2.6, 0.5)
        .setAlpha(0.07)
        .setTint(0x9fb0d6)
        .setDepth(4)
      this.tweens.add({
        targets: wisp,
        x: wisp.x + Phaser.Math.Between(120, 220) * (i % 2 ? -1 : 1),
        yoyo: true,
        repeat: -1,
        duration: Phaser.Math.Between(9000, 14000),
        ease: 'Sine.easeInOut',
      })
    }

    // blood moon layer: an identical red moon + a red wash over the whole scene,
    // crossfaded in and out on a slow cycle (mirrors the night.bloodMoon event)
    this.bloodMoon = [
      this.add.circle(mx, 52, 16, 0xd84848, 1),
      this.add.circle(mx - 5, 47, 3, 0xab3434, 1),
      this.add.circle(mx + 5, 57, 2.2, 0xab3434, 1),
      this.add.circle(mx + 7, 46, 1.5, 0xab3434, 1),
    ]
    this.bloodHalo = this.add.image(mx, 52, 'menu-glow').setScale(1.4).setTint(0xff6a5a)
    this.bloodWash = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x4a0a14, 1).setOrigin(0, 0).setDepth(4)
    for (const e of [...this.bloodMoon, this.bloodHalo, this.bloodWash]) e.setAlpha(0)
    this.bloodOn = false
    this.time.addEvent({ delay: 14000, loop: true, callback: () => this.turnMoon() })
  }

  // The moon turns: blood rises, the whole night flushes red, then it wanes again.
  turnMoon() {
    this.bloodOn = !this.bloodOn
    const ease = 'Sine.easeInOut'
    const dur = 2800
    this.tweens.add({ targets: this.bloodMoon, alpha: this.bloodOn ? 1 : 0, duration: dur, ease })
    this.tweens.add({ targets: this.bloodHalo, alpha: this.bloodOn ? 0.26 : 0, duration: dur, ease })
    this.tweens.add({ targets: this.bloodWash, alpha: this.bloodOn ? 0.22 : 0, duration: dur, ease })
  }

  // A hunter silhouette ambles across the strip — footsteps swell as it nears the
  // middle, and any torch it passes is snuffed dark for a beat. You hear the hunter
  // before you see it, exactly like in the woods.
  spawnWalker() {
    if (this.walker) return
    const fromLeft = Math.random() < 0.5
    const x0 = fromLeft ? -40 : GAME_WIDTH + 40
    const x1 = fromLeft ? GAME_WIDTH + 40 : -40
    const w = this.add.sprite(x0, GAME_HEIGHT - 16, Phaser.Utils.Array.GetRandom(WALKERS)).setDepth(3)
    w.play(w.texture.key).setScale(0.6).setTint(0x161c30).setFlipX(!fromLeft)
    this.walker = w

    const steps = this.time.addEvent({
      delay: 480,
      loop: true,
      callback: () => {
        const vol = 0.5 * (1 - Math.abs(w.x - GAME_WIDTH / 2) / (GAME_WIDTH / 2))
        if (vol > 0.04) Audio.play(this, SFX.jump, { volume: vol, rate: 0.62, detune: -250 })
      },
    })

    this.tweens.add({
      targets: w,
      x: x1,
      duration: 16000,
      onUpdate: () => {
        for (const t of this.torches) {
          if (t.lit && Math.abs(w.x - t.x) < 24) this.snuffTorch(t)
        }
      },
      onComplete: () => {
        steps.remove()
        w.destroy()
        this.walker = null
      },
    })
  }

  snuffTorch(t) {
    t.lit = false
    this.tweens.add({ targets: [t.glow, t.flame], alpha: 0, duration: 250 })
    this.time.delayedCall(2200, () => {
      this.tweens.add({ targets: t.glow, alpha: 0.3, duration: 600 })
      this.tweens.add({ targets: t.flame, alpha: 1, duration: 600 })
      t.lit = true
    })
  }
}
