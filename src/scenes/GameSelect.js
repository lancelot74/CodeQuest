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

// Each mode lives on its OWN page; the ‹ › arrows flip between them. Hero-using
// modes show the default-hero picker; Age of War summons units, so it hides it.
const MODES = [
  { title: 'STORY MODE', play: 'WorldSelect', hero: true, blurb: ['Side-scroll platformer — solve code', 'puzzles to clear each level.'] },
  { title: 'AGE OF WAR', play: 'AgeOfWar', hero: false, blurb: ['Lane battle — answer code prompts to', 'earn gold and push the enemy base.'] },
  { title: 'NIGHT HUNT', play: 'NightHunt', hero: true, blurb: ['Survive a dark forest: clear 3 objectives', 'and escape while a stalker hunts you.'] },
]

export default class GameSelectScene extends Phaser.Scene {
  constructor() {
    super('GameSelect')
  }

  create() {
    addBackdrop(this, 'bg-blue')

    const wanted = this.registry.get('huntHero') || SaveSystem.data.character
    this.selected = HERO_CARDS.some((h) => h.key === wanted) ? wanted : 'ninja'
    this.modeIndex = 0
    this.blurbEls = []

    this.titleText = pixelText(this, GAME_WIDTH / 2, 34, '', 24, '#ffe066')
    this.buildHeroPicker()

    // one PLAY button serves every page — it reads the live mode index on click
    panelButton(this, GAME_WIDTH / 2, 236, 'PLAY', () => this.scene.start(MODES[this.modeIndex].play), { width: 160 })

    button(this, 20, 146, '‹', () => this.go(-1), { size: 26 })
    button(this, GAME_WIDTH - 20, 146, '›', () => this.go(1), { size: 26 })
    this.dots = []
    for (let i = 0; i < MODES.length; i++) {
      this.dots.push(this.add.circle(GAME_WIDTH / 2 - (MODES.length - 1) * 8 + i * 16, 270, 4, 0x3a4568))
    }

    button(this, 52, GAME_HEIGHT - 22, '< BACK', () => this.scene.start('MainMenu'), { size: 8 })

    this.showMode()
  }

  buildHeroPicker() {
    this.heroLabel = pixelText(this, GAME_WIDTH / 2, 98, 'DEFAULT HERO', 8, '#8ea0c0')
    this.heroNote = pixelText(this, GAME_WIDTH / 2, 204, 'Knight & Golem are Night Hunt only', 7, '#6f7db0')
    this.warNote = pixelText(this, GAME_WIDTH / 2, 150, 'Units are summoned — no hero to pick', 8, '#8ea0c0')

    this.cards = {}
    const gap = 88
    const x0 = GAME_WIDTH / 2 - gap * 2.5
    const y = 150
    HERO_CARDS.forEach((h, i) => {
      const x = x0 + i * gap
      const frame = this.add.rectangle(x, y, 60, 68, 0x1b2138, 0.8).setStrokeStyle(2, 0x3a4568)
      const base = h.anim ? 1.7 : h.scale || 1.2
      let spr
      if (h.anim) {
        spr = this.add.sprite(x, y - 4, `${h.key}-idle`).setScale(base)
        spr.play(`${h.key}-idle`)
      } else {
        spr = this.add.image(x, y - 4, h.key).setScale(base)
      }
      const name = pixelText(this, x, y + 40, h.label, 6, '#cdd7ee')
      const hit = this.add.rectangle(x, y, 66, 90, 0xffffff, 0).setInteractive({ useHandCursor: true })
      hit.on('pointerover', () => {
        if (this.selected !== h.key) frame.setStrokeStyle(2, 0x6f7db0)
      })
      hit.on('pointerout', () => this.refresh())
      hit.on('pointerup', () => this.pick(h))
      this.cards[h.key] = { frame, spr, name, hit, base }
    })
    this.refresh()
  }

  go(dir) {
    this.modeIndex = Phaser.Math.Wrap(this.modeIndex + dir, 0, MODES.length)
    this.showMode()
  }

  showMode() {
    const m = MODES[this.modeIndex]
    this.titleText.setText(m.title)

    for (const e of this.blurbEls) e.destroy()
    this.blurbEls = m.blurb.map((line, i) => pixelText(this, GAME_WIDTH / 2, 62 + i * 16, line, 8, '#cdd7ee'))

    const showHero = m.hero
    this.heroLabel.setVisible(showHero)
    this.heroNote.setVisible(showHero)
    this.warNote.setVisible(!showHero)
    for (const h of HERO_CARDS) {
      const c = this.cards[h.key]
      c.frame.setVisible(showHero)
      c.spr.setVisible(showHero)
      c.name.setVisible(showHero)
      c.hit.setVisible(showHero)
      if (c.hit.input) c.hit.input.enabled = showHero
    }
    this.dots.forEach((d, i) => d.setFillStyle(i === this.modeIndex ? 0xffe066 : 0x3a4568))
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
      c.spr.setScale(on ? c.base * 1.15 : c.base)
    }
  }
}
