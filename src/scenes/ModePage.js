import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../config.js'
import { SaveSystem } from '../systems/SaveSystem.js'
import { addBackdrop, panelButton, button, pixelText } from '../ui/widgets.js'
import { HERO_CARDS } from './GameSelect.js'

// One dedicated page per mode, reached from a GAME-hub button. Shows the mode's
// blurb + the hero it'll play as, then PLAY launches the mode itself.
const MODE_INFO = {
  story: {
    title: 'STORY MODE',
    play: 'WorldSelect',
    hero: true,
    blurb: ['Side-scroll platformer — solve code', 'puzzles to clear each level.'],
  },
  war: {
    title: 'AGE OF WAR',
    play: 'AgeOfWar',
    hero: false,
    blurb: ['Lane battle — answer code prompts to', 'earn gold and push the enemy base.'],
  },
  hunt: {
    title: 'NIGHT HUNT',
    play: 'NightHunt',
    hero: true,
    blurb: ['Survive a dark forest: clear 3 objectives', 'and escape while a stalker hunts you.'],
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
    info.blurb.forEach((line, i) => pixelText(this, GAME_WIDTH / 2, 104 + i * 18, line, 8, '#cdd7ee'))

    if (info.hero) this.showHero(info)

    panelButton(this, GAME_WIDTH / 2, 258, 'PLAY', () => this.scene.start(info.play), { width: 160 })
    button(this, 52, GAME_HEIGHT - 22, '< BACK', () => this.scene.start('GameSelect'), { size: 8 })
  }

  // NIGHT HUNT plays as the registry hero (can be Knight/Golem); STORY uses the saved
  // campaign character, which is always one of the animated platformer heroes.
  showHero(info) {
    const wanted = info.play === 'NightHunt' ? this.registry.get('huntHero') || SaveSystem.data.character : SaveSystem.data.character
    const h = HERO_CARDS.find((c) => c.key === wanted) || HERO_CARDS[0]
    const x = GAME_WIDTH / 2
    const y = 190
    if (h.anim) {
      this.add.sprite(x, y, `${h.key}-idle`).setScale(2).play(`${h.key}-idle`)
    } else {
      this.add.image(x, y, h.key).setScale((h.scale || 1.3) * 1.6)
    }
    pixelText(this, x, y + 32, `HERO  ${h.label}`, 7, '#9fb0d6')
  }
}
