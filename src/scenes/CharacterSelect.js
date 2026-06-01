import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../config.js'
import { CHARACTERS, CHARACTER_NAMES } from '../utils/constants.js'
import { SaveSystem } from '../systems/SaveSystem.js'
import { addBackdrop, button, pixelText } from '../ui/widgets.js'

export default class CharacterSelectScene extends Phaser.Scene {
  constructor() {
    super('CharacterSelect')
  }

  create() {
    addBackdrop(this, 'bg-blue')
    pixelText(this, GAME_WIDTH / 2, 44, 'CHOOSE YOUR HERO', 16, '#ffe066')

    this.selected = SaveSystem.data.character || 'ninja'
    this.cards = {}

    const gap = 96
    const x0 = GAME_WIDTH / 2 - gap * 1.5
    const y = 158

    CHARACTERS.forEach((c, i) => {
      const x = x0 + i * gap
      const frame = this.add
        .rectangle(x, y, 74, 84, 0x1b2138, 0.8)
        .setStrokeStyle(2, 0x3a4568)
      const spr = this.add.sprite(x, y - 4, `${c}-idle`).setScale(2)
      spr.play(`${c}-idle`)
      const name = pixelText(this, x, y + 54, CHARACTER_NAMES[c], 7, '#cdd7ee')

      const hit = this.add
        .rectangle(x, y, 80, 110, 0xffffff, 0)
        .setInteractive({ useHandCursor: true })
      hit.on('pointerover', () => {
        if (this.selected !== c) frame.setStrokeStyle(2, 0x6f7db0)
      })
      hit.on('pointerout', () => this.refresh())
      hit.on('pointerup', () => {
        this.selected = c
        this.refresh()
      })

      this.cards[c] = { frame, spr, name }
    })

    this.refresh()

    button(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT - 38,
      'CONFIRM',
      () => {
        SaveSystem.setCharacter(this.selected)
        this.registry.set('character', this.selected)
        this.scene.start('WorldSelect')
      },
      { hover: '#7cfc98' },
    )

    button(this, 52, GAME_HEIGHT - 22, '< BACK', () => this.scene.start('MainMenu'), {
      size: 8,
    })
  }

  refresh() {
    for (const c of CHARACTERS) {
      const on = c === this.selected
      this.cards[c].frame
        .setStrokeStyle(2, on ? 0xffe066 : 0x3a4568)
        .setFillStyle(0x1b2138, on ? 0.95 : 0.7)
      this.cards[c].name.setColor(on ? '#ffe066' : '#cdd7ee')
      this.cards[c].spr.setScale(on ? 2.4 : 2)
    }
  }
}
