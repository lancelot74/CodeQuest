import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../config.js'
import { SaveSystem } from '../systems/SaveSystem.js'
import { addBackdrop, panelButton, button, pixelText } from '../ui/widgets.js'
import { HERO_CARDS } from './GameSelect.js'

// One dedicated launch page per arcade mode (reached from the Game hub). Shows the
// mode's blurb + PLAY; NIGHT HUNT also previews the chosen hero.
const MODE_INFO = {
  war: {
    title: 'AGE OF WAR',
    play: 'AgeOfWar',
    blurb: ['Lane battle — spawn units and push the', 'enemy base. Answer code prompts to', 'earn gold and power up your army.'],
    hero: false,
  },
  hunt: {
    title: 'NIGHT HUNT',
    play: 'NightHunt',
    blurb: ['Survive a dark forest: clear 3 objectives', 'and reach the exit while a stalker hunts.', 'Each round adds a sense — and a hunter.'],
    hero: true,
  },
}

export default class ModePageScene extends Phaser.Scene {
  constructor() {
    super('ModePage')
  }

  create(data) {
    const info = MODE_INFO[data?.mode] || MODE_INFO.hunt
    addBackdrop(this, 'bg-blue')
    pixelText(this, GAME_WIDTH / 2, 56, info.title, 24, '#ffe066')
    info.blurb.forEach((line, i) => pixelText(this, GAME_WIDTH / 2, 110 + i * 18, line, 8, '#cdd7ee'))

    if (info.hero) this.showHero()

    panelButton(this, GAME_WIDTH / 2, 252, 'PLAY', () => this.scene.start(info.play), { width: 160 })
    button(this, 52, GAME_HEIGHT - 22, '< BACK', () => this.scene.start('GameSelect'), { size: 8 })
  }

  showHero() {
    const wanted = this.registry.get('huntHero') || SaveSystem.data.character
    const h = HERO_CARDS.find((c) => c.key === wanted) || HERO_CARDS[0]
    const x = GAME_WIDTH / 2
    const y = 196
    if (h.anim) {
      this.add.sprite(x, y, `${h.key}-idle`).setScale(2).play(`${h.key}-idle`)
    } else {
      this.add.image(x, y, h.key).setScale(h.scale || 1.3)
    }
    pixelText(this, x, y + 30, `HERO  ${h.label}`, 7, '#9fb0d6')
  }
}
