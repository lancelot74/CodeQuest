import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../config.js'
import { SaveSystem } from '../systems/SaveSystem.js'
import { addBackdrop, panelButton, button, pixelText } from '../ui/widgets.js'

// Hero roster mirrors NightHunt's HEROES. The four animated platformer heroes work
// in every mode; Knight and Golem are single-frame hunt-pack skins usable only in
// NIGHT HUNT (the platformer needs animated sheets) — picking one sets the Night
// Hunt hero but leaves the campaign hero on the last animated pick.
export const HERO_CARDS = [
  { key: 'ninja', label: 'FROG', anim: true },
  { key: 'pink', label: 'PINK', anim: true },
  { key: 'mask', label: 'MASK', anim: true },
  { key: 'virtual', label: 'VIRTUAL', anim: true },
  { key: 'hunt-hero', label: 'KNIGHT', anim: false, scale: 1.2 },
  { key: 'hunt-golem', label: 'GOLEM', anim: false, scale: 1.5 },
]

// The "Game" hub: pick a default hero up top, then choose a mode from the buttons
// below — each launches straight into its own mode screen.
export default class GameSelectScene extends Phaser.Scene {
  constructor() {
    super('GameSelect')
  }

  create() {
    addBackdrop(this, 'bg-blue')
    pixelText(this, GAME_WIDTH / 2, 26, 'GAME', 22, '#ffe066')
    pixelText(this, GAME_WIDTH / 2, 50, 'pick your hero, then choose a mode', 8, '#8ea0c0')

    const wanted = this.registry.get('huntHero') || SaveSystem.data.character
    this.selected = HERO_CARDS.some((h) => h.key === wanted) ? wanted : 'ninja'
    this.cards = {}

    const gap = 94
    const x0 = GAME_WIDTH / 2 - gap * 2.5
    const y = 112
    HERO_CARDS.forEach((h, i) => {
      const x = x0 + i * gap
      const frame = this.add.rectangle(x, y, 72, 80, 0x1b2138, 0.8).setStrokeStyle(2, 0x3a4568)
      const base = h.anim ? 2 : h.scale || 1.3
      let spr
      if (h.anim) {
        spr = this.add.sprite(x, y - 4, `${h.key}-idle`).setScale(base)
        spr.play(`${h.key}-idle`)
      } else {
        spr = this.add.image(x, y - 4, h.key).setScale(base)
      }
      const name = pixelText(this, x, y + 50, h.label, 7, '#cdd7ee')
      const hit = this.add.rectangle(x, y, 78, 104, 0xffffff, 0).setInteractive({ useHandCursor: true })
      hit.on('pointerover', () => {
        if (this.selected !== h.key) frame.setStrokeStyle(2, 0x6f7db0)
      })
      hit.on('pointerout', () => this.refresh())
      hit.on('pointerup', () => this.pick(h))
      this.cards[h.key] = { frame, spr, name, base }
    })
    this.refresh()

    pixelText(this, GAME_WIDTH / 2, 180, 'Knight & Golem are Night Hunt only', 7, '#6f7db0')

    const W = 184
    panelButton(this, GAME_WIDTH / 2, 214, 'STORY MODE', () => this.scene.start('ModePage', { mode: 'story' }), { width: W })
    panelButton(this, GAME_WIDTH / 2, 252, 'AGE OF WAR', () => this.scene.start('ModePage', { mode: 'war' }), { width: W })
    panelButton(this, GAME_WIDTH / 2, 290, 'NIGHT HUNT', () => this.scene.start('ModePage', { mode: 'hunt' }), { width: W })

    button(this, 52, GAME_HEIGHT - 22, '< BACK', () => this.scene.start('MainMenu'), { size: 8 })
  }

  // Pick sets the default hero everywhere it's supported. Animated heroes also
  // become the campaign hero; static skins only apply to NIGHT HUNT.
  pick(h) {
    this.selected = h.key
    this.registry.set('huntHero', h.key)
    if (h.anim) {
      SaveSystem.setCharacter(h.key)
      this.registry.set('character', h.key)
    }
    this.refresh()
  }

  refresh() {
    for (const h of HERO_CARDS) {
      const on = h.key === this.selected
      const c = this.cards[h.key]
      c.frame.setStrokeStyle(2, on ? 0xffe066 : 0x3a4568).setFillStyle(0x1b2138, on ? 0.95 : 0.7)
      c.name.setColor(on ? '#ffe066' : '#cdd7ee')
      c.spr.setScale(on ? c.base * 1.2 : c.base)
    }
  }
}
