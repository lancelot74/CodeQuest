import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../config.js'
import { SaveSystem } from '../systems/SaveSystem.js'
import { nightBackdrop, panelButton, button, pixelText, drawSenseIcon } from '../ui/widgets.js'
import { HERO_CARDS } from './GameSelect.js'
import { SENSES } from '../systems/Hunter.js'
import { showLessonCard } from '../ui/domOverlay.js'

// Almanac card for the briefing's RULES button: every night event and weather
// cloud, written as the code the game itself announces them in.
const NIGHT_ALMANAC = {
  title: "THE NIGHT'S RULES",
  body:
    'From round 2 on, a night event can rewrite the rules, and weather clouds can roll in over the hero at any moment. Every rule in force is listed in the top-right corner during play.',
  code: `night.bloodMoon = true  // wary hunters - chests open 2x faster
night.silence   = true  // quiet feet, but stones barely carry
night.starfall  = true  // falling flashes reveal anyone
night.feast     = true  // double food - eating is LOUD
night.hivemind  = true  // one rage wakes the whole pack
cloud.rain      = true  // fast feet + food, but draws hunters
cloud.storm     = true  // run before the bolt drops`,
}

// One briefing page per mode, reached from the GAME hub. Hero picking lives HERE
// (single home): hunt offers the full roster, story only the animated heroes.
const MODE_INFO = {
  story: {
    title: 'STORY MODE',
    play: 'WorldSelect',
    hero: 'anim',
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
    hero: 'all',
    blurb: ['Open the chests and escape the forest', 'while the hunters stalk you.'],
  },
}

export default class ModePageScene extends Phaser.Scene {
  constructor() {
    super('ModePage')
  }

  create(data) {
    this.mode = data?.mode || 'hunt'
    const info = MODE_INFO[this.mode]
    nightBackdrop(this)
    pixelText(this, GAME_WIDTH / 2, 40, info.title, 22, '#ffe066')
    info.blurb.forEach((line, i) => pixelText(this, GAME_WIDTH / 2, 74 + i * 14, line, 8, '#cdd7ee'))

    if (info.hero) this.buildHeroCarousel(info)
    if (this.mode === 'hunt') {
      this.buildSenseLegend()
      const best = SaveSystem.data.hunt.bestRound
      if (best > 1) pixelText(this, GAME_WIDTH / 2, 276, `save.bestRound = ${best}  — beat it`, 8, '#7ab8ff')
      // events + weather get the same treatment the senses do — explained in the
      // calm of the briefing, in the game's own code-speak
      panelButton(this, GAME_WIDTH / 2 + 164, 306, 'RULES', () => showLessonCard(NIGHT_ALMANAC, undefined, 'NIGHT ALMANAC'), { size: 9, width: 104 })
      // dawn earned: the lair stays open for refights
      if (SaveSystem.data.hunt.dawn) {
        panelButton(this, GAME_WIDTH / 2 - 164, 306, 'FINALE', () => this.scene.start('Finale'), { size: 9, width: 104 })
      }
    }

    panelButton(this, GAME_WIDTH / 2, 306, 'PLAY', () => this.scene.start(info.play), { width: 160 })
    button(this, 52, GAME_HEIGHT - 22, '< BACK', () => this.scene.start('GameSelect'), { size: 8 })
  }

  // Arrow carousel over the roster. Picks persist exactly like the old hub picker:
  // every pick sets the NIGHT HUNT hero; animated picks also become the campaign hero.
  buildHeroCarousel(info) {
    this.roster = info.hero === 'all' ? HERO_CARDS : HERO_CARDS.filter((h) => h.anim)
    const wanted = this.registry.get('huntHero') || SaveSystem.data.character
    this.idx = Math.max(0, this.roster.findIndex((h) => h.key === wanted))

    // hunt shares the row with the sense legend; story gets the full width
    this.heroX = this.mode === 'hunt' ? GAME_WIDTH / 2 - 150 : GAME_WIDTH / 2
    this.heroY = 178
    this.heroSpr = null
    this.heroName = pixelText(this, this.heroX, this.heroY + 44, '', 8, '#ffe066')
    pixelText(this, this.heroX, this.heroY + 60, 'your hero', 7, '#6f7db0')
    button(this, this.heroX - 64, this.heroY, '<', () => this.cycle(-1), { size: 12 })
    button(this, this.heroX + 64, this.heroY, '>', () => this.cycle(1), { size: 12 })
    this.showHero()
  }

  cycle(dir) {
    this.idx = (this.idx + dir + this.roster.length) % this.roster.length
    this.showHero()
    const h = this.roster[this.idx]
    this.registry.set('huntHero', h.key)
    if (h.anim) {
      SaveSystem.setCharacter(h.key)
      this.registry.set('character', h.key)
    }
  }

  showHero() {
    const h = this.roster[this.idx]
    if (this.heroSpr) this.heroSpr.destroy()
    if (h.anim) {
      this.heroSpr = this.add.sprite(this.heroX, this.heroY, `${h.key}-idle`).setScale(2.2)
      this.heroSpr.play(`${h.key}-idle`)
    } else {
      this.heroSpr = this.add.image(this.heroX, this.heroY, h.key).setScale((h.scale || 1.3) * 1.5)
    }
    const tag = h.anim ? '' : '  (hunt only)'
    this.heroName.setText(h.label + tag)
  }

  // The three senses in their native code-speak, each with its counterplay — the
  // lesson kids otherwise have to absorb from a 3-second banner mid-chase.
  buildSenseLegend() {
    const x = GAME_WIDTH / 2 - 40
    pixelText(this, x + 110, 132, 'THE HUNTERS USE', 7, '#8ea0c0')
    const g = this.add.graphics()
    Object.values(SENSES).forEach((sn, i) => {
      const y = 156 + i * 30
      drawSenseIcon(g, x, y, sn.glyph, sn.color)
      const col = '#' + sn.color.toString(16).padStart(6, '0')
      pixelText(this, x + 16, y - 6, `${sn.code} = true`, 8, col).setOrigin(0, 0.5)
      pixelText(this, x + 16, y + 7, sn.hint, 7, '#8ea0c0').setOrigin(0, 0.5)
    })
  }
}
