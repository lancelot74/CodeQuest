import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../config.js'
import { nightBackdrop, button, pixelText, uiPanel, drawSenseIcon, ensureGlowTexture } from '../ui/widgets.js'
import { SENSES } from '../systems/Hunter.js'
import { SaveSystem } from '../systems/SaveSystem.js'

// Hero roster shared with the mode briefing pages. The four animated platformer
// heroes work in every mode; Knight and Golem are single-frame hunt-pack skins
// usable only in NIGHT HUNT (the platformer needs animated sheets).
export const HERO_CARDS = [
  { key: 'ninja', label: 'FROG', anim: true },
  { key: 'pink', label: 'PINK', anim: true },
  { key: 'mask', label: 'MASK', anim: true },
  { key: 'virtual', label: 'VIRTUAL', anim: true },
  { key: 'hunt-hero', label: 'KNIGHT', anim: false, scale: 1.2 },
  { key: 'hunt-golem', label: 'GOLEM', anim: false, scale: 1.5 },
  { key: 'hunt-lantern', label: 'WANDERER', anim: true, huntOnly: true, cardScale: 1.1 },
]

// The "Game" hub: NIGHT HUNT is the flagship card up top (animated, teaches the
// three senses before you ever play); STORY and AGE OF WAR sit below as smaller
// cards. Hero picking lives on each mode's briefing page now.
export default class GameSelectScene extends Phaser.Scene {
  constructor() {
    super('GameSelect')
  }

  create() {
    nightBackdrop(this)
    ensureGlowTexture(this)
    pixelText(this, GAME_WIDTH / 2, 28, 'CHOOSE YOUR HUNT', 18, '#ffe066')

    this.buildHuntCard()
    this.buildChallengeCard(GAME_WIDTH / 2, 254)

    button(this, 52, GAME_HEIGHT - 22, '< BACK', () => this.scene.start('MainMenu'), { size: 8 })
  }

  // Featured card: dark panel, flickering torch, a lurking silhouette, and the three
  // hunter senses cycling in code-speak so the core rule is met before the first run.
  buildHuntCard() {
    const cx = GAME_WIDTH / 2
    const cy = 124
    const w = Math.min(400, GAME_WIDTH - 160)
    const h = 132
    const bg = uiPanel(this, cx, cy, w, h, { originX: 0.5, originY: 0.5 }).setTint(0x8b93b8)
    this.add.rectangle(cx, cy, w - 8, h - 8, 0x0d1226, 0.92)

    pixelText(this, cx, cy - 44, 'NIGHT HUNT', 16, '#ffe066')
    pixelText(this, cx, cy - 24, 'survive the dark forest', 7, '#8ea0c0')

    // vignette row: torch pool + a hunter shape lurking at the card's edge
    const tx = cx - w / 2 + 46
    const glow = this.add.image(tx, cy + 24, 'menu-glow').setScale(0.7, 0.45).setAlpha(0.3).setTint(0xffb24a)
    const flame = this.add.ellipse(tx, cy + 18, 6, 11, 0xffd86b, 1)
    this.tweens.add({ targets: flame, scaleY: 1.3, scaleX: 0.78, yoyo: true, repeat: -1, duration: 300, ease: 'Sine.easeInOut' })
    const lurker = this.add.sprite(cx + w / 2 - 48, cy + 18, 'demon-walk').setScale(0.55).setTint(0x161c30)
    lurker.play('demon-walk')

    // cycling sense line: glyph + its code, one sense at a time
    this.senseG = this.add.graphics()
    this.senseLine = pixelText(this, cx + 12, cy + 18, '', 8, '#cdd7ee').setOrigin(0, 0.5)
    this.senseKeys = Object.keys(SENSES)
    this.senseIdx = 0
    this.showSense()
    this.time.addEvent({ delay: 2200, loop: true, callback: () => this.showSense() })

    const hit = this.add.rectangle(cx, cy, w, h, 0xffffff, 0).setInteractive({ useHandCursor: true })
    hit.on('pointerover', () => bg.setTint(0xe2ecff))
    hit.on('pointerout', () => bg.setTint(0x8b93b8))
    hit.on('pointerup', () => this.scene.start('ModePage', { mode: 'hunt' }))
  }

  showSense() {
    const sn = SENSES[this.senseKeys[this.senseIdx]]
    this.senseIdx = (this.senseIdx + 1) % this.senseKeys.length
    this.senseG.clear()
    drawSenseIcon(this.senseG, this.senseLine.x - 16, this.senseLine.y, sn.glyph, sn.color)
    this.senseLine.setText(`${sn.code} = true`).setColor('#' + sn.color.toString(16).padStart(6, '0'))
    this.senseG.setAlpha(0)
    this.senseLine.setAlpha(0)
    this.tweens.add({ targets: [this.senseG, this.senseLine], alpha: 1, duration: 350 })
  }

  // Challenge (Dungeon Crawl): sneak the floors, fell the guardian, descend. Wanderer-only.
  buildChallengeCard(cx, cy) {
    const w = 240
    const h = 86
    const bg = uiPanel(this, cx, cy, w, h, { originX: 0.5, originY: 0.5 }).setTint(0x8b6b6b)
    this.add.rectangle(cx, cy, w - 8, h - 8, 0x160f1a, 0.9)
    pixelText(this, cx, cy - 22, 'DUNGEON CRAWL', 11, '#ffcf8a')
    pixelText(this, cx, cy + 2, 'sneak, fell the guardian, descend', 6, '#c98a8a')
    const best = SaveSystem.data.challenge?.bestDepth || 0
    pixelText(this, cx, cy + 20, best > 0 ? `deepest: floor ${best}` : 'the lantern is your only light', 7, '#9a8ac0')

    const hit = this.add.rectangle(cx, cy, w, h, 0xffffff, 0).setInteractive({ useHandCursor: true })
    hit.on('pointerover', () => bg.setTint(0xd8b0b0))
    hit.on('pointerout', () => bg.setTint(0x8b6b6b))
    hit.on('pointerup', () => this.scene.start('DungeonCrawl'))
  }
}
