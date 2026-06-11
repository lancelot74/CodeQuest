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
    // dev shortcuts: #finale jumps straight to the lair, #arena skips the
    // corridors and drops you at the dragon fight with the catch already granted
    if (window.location.hash === '#finale' || window.location.hash === '#arena') {
      this.scene.start('Finale', { fromArena: window.location.hash === '#arena' })
      return
    }
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
    this.moonHalo = this.add.image(mx, 52, 'menu-glow').setScale(1.4).setAlpha(0.22).setTint(0xcdd7ee)
    this.fullMoon = [
      this.add.circle(mx, 52, 16, 0xe8edf8, 1),
      this.add.circle(mx - 5, 47, 3, 0xc6cfe4, 1),
      this.add.circle(mx + 5, 57, 2.2, 0xc6cfe4, 1),
      this.add.circle(mx + 7, 46, 1.5, 0xc6cfe4, 1),
    ]
    // true crescent: the lune between the moon's rim and an offset cut, drawn as its
    // own filled shape — crossfaded with the full disc, the sky shows through the
    // dark part instead of a shadow ball sitting on the moon
    const rad = Phaser.Math.DegToRad
    this.crescent = this.add.graphics()
    this.crescent.fillStyle(0xe8edf8, 1)
    this.crescent.beginPath()
    this.crescent.arc(mx, 52, 16, rad(25), rad(255.5), false)
    this.crescent.arc(mx + 6, 47, 14.5, rad(226.3), rad(54.1), true)
    this.crescent.closePath()
    this.crescent.fillPath()
    this.crescent.fillStyle(0xc6cfe4, 1).fillCircle(mx - 9, 59.7, 1.8)
    this.crescent.setAlpha(0)

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

    // free-roaming clouds: each picks its own pace and direction, drifts clean off
    // one edge and re-enters from the other as a fresh cloud (new height + size)
    this.clouds = []
    for (let i = 0; i < 4; i++) {
      const c = {
        spr: this.add.sprite(Phaser.Math.Between(30, GAME_WIDTH - 30), Phaser.Math.Between(36, 92), 'cloud1').setDepth(1),
        scale: Phaser.Math.FloatBetween(1.4, 2.3),
        vx: Phaser.Math.FloatBetween(6, 16) * (Math.random() < 0.5 ? -1 : 1),
        rain: Math.random() < 0.5,
        rainT: Phaser.Math.FloatBetween(6, 18), // each cloud showers on its own clock
        fx: [],
      }
      c.spr.setScale(c.scale).play('cloud1')
      if (c.rain) this.buildRainCurtain(c)
      this.clouds.push(c)
    }
    this.events.on('update', (_t, delta) => this.driftClouds(delta))

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
    this.moonPhase = 'full'
    this.time.addEvent({ delay: 14000, loop: true, callback: () => this.turnMoon() })
  }

  // The moon turns on a slow cycle — full, crescent, or blood, never the same phase
  // twice. Blood flushes the whole scene red; the crescent dims the halo with it.
  turnMoon() {
    this.moonPhase = Phaser.Utils.Array.GetRandom(['full', 'crescent', 'blood'].filter((p) => p !== this.moonPhase))
    const blood = this.moonPhase === 'blood'
    const crescent = this.moonPhase === 'crescent'
    const ease = 'Sine.easeInOut'
    const dur = 2800
    this.tweens.add({ targets: this.bloodMoon, alpha: blood ? 1 : 0, duration: dur, ease })
    this.tweens.add({ targets: this.bloodHalo, alpha: blood ? 0.26 : 0, duration: dur, ease })
    this.tweens.add({ targets: this.bloodWash, alpha: blood ? 0.22 : 0, duration: dur, ease })
    this.tweens.add({ targets: this.fullMoon, alpha: crescent ? 0 : 1, duration: dur, ease })
    this.tweens.add({ targets: this.crescent, alpha: crescent ? 1 : 0, duration: dur, ease })
    this.tweens.add({ targets: this.moonHalo, alpha: crescent ? 0.1 : 0.22, duration: dur, ease })

    // the clouds turn with the moon: angry storm faces under blood — each on its
    // own beat (a flock snapping in unison reads mechanical). Late turners check
    // the CURRENT phase, so a quick flip back never strands an angry cloud.
    for (const c of this.clouds) {
      this.time.delayedCall(Phaser.Math.Between(0, 2600), () => {
        c.spr.play(this.moonPhase === 'blood' ? 'cloud2' : 'cloud1')
      })
    }
    if (blood) {
      this.time.delayedCall(dur, () => {
        if (this.moonPhase !== 'blood') return
        const c = Phaser.Utils.Array.GetRandom(this.clouds)
        const bolt = this.add
          .sprite(c.spr.x, c.spr.y + 48 * c.scale, 'cloud-lightning')
          .setScale(c.scale, c.scale * 1.8) // stretched so the strike reaches down
          .setDepth(1)
        bolt.play('cloud-lightning')
        bolt.once('animationcomplete', () => bolt.destroy())
        this.cameras.main.flash(120, 255, 240, 180)
      })
    }
  }

  // Rain curtain under a cloud: seamless cropped tiles all the way down, with the
  // full frame (bottom splashes intact) as the last segment so the rain lands.
  buildRainCurtain(c) {
    for (const s of c.fx) s.destroy()
    c.fx = []
    const tileH = 40 * c.scale
    let yy = c.spr.y + 48 * c.scale * 0.7
    while (yy < GAME_HEIGHT - 26 - tileH) {
      const seg = this.add.sprite(c.spr.x, yy, 'cloud-rain-tile').setScale(c.scale).setAlpha(0.7).setDepth(1)
      seg.play('cloud-rain-tile')
      c.fx.push(seg)
      yy += tileH
    }
    const splash = this.add.sprite(c.spr.x, yy, 'cloud-rain').setScale(c.scale).setAlpha(0.7).setDepth(1)
    splash.play('cloud-rain')
    c.fx.push(splash)
  }

  driftClouds(delta) {
    const dt = delta / 1000
    for (const c of this.clouds) {
      c.spr.x += c.vx * dt
      // every cloud showers and dries on its own independent timer
      c.rainT -= dt
      if (c.rainT <= 0) {
        c.rainT = Phaser.Math.FloatBetween(6, 18)
        this.setRain(c, !c.rain)
      }
      const half = 24 * c.scale + 12
      if ((c.vx > 0 && c.spr.x > GAME_WIDTH + half) || (c.vx < 0 && c.spr.x < -half)) {
        // fully out: re-enter from the opposite edge as a new cloud
        c.spr.x = c.vx > 0 ? -half : GAME_WIDTH + half
        c.spr.y = Phaser.Math.Between(36, 92)
        c.scale = Phaser.Math.FloatBetween(1.4, 2.3)
        c.vx = Phaser.Math.FloatBetween(6, 16) * Math.sign(c.vx)
        c.spr.setScale(c.scale)
        if (c.rain) this.buildRainCurtain(c)
      }
      for (const seg of c.fx) seg.setX(c.spr.x)
    }
  }

  // Toggle a cloud's shower: rain fades in fresh, or the curtain lingers a beat
  // and dissolves (it stops following the cloud, like rain trailing off behind).
  setRain(c, on) {
    c.rain = on
    if (on) {
      this.buildRainCurtain(c)
      for (const s of c.fx) {
        s.setAlpha(0)
        this.tweens.add({ targets: s, alpha: 0.7, duration: 900 })
      }
    } else {
      const old = c.fx
      c.fx = []
      for (const s of old) this.tweens.add({ targets: s, alpha: 0, duration: 900, onComplete: () => s.destroy() })
    }
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
