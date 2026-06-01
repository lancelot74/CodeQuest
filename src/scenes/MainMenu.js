import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../config.js'
import { SaveSystem } from '../systems/SaveSystem.js'
import { addBackdrop, button, pixelText } from '../ui/widgets.js'

export default class MainMenuScene extends Phaser.Scene {
  constructor() {
    super('MainMenu')
  }

  create() {
    addBackdrop(this, 'bg-green')
    pixelText(this, GAME_WIDTH / 2, 84, 'CODEQUEST', 32, '#ffe066')
    pixelText(this, GAME_WIDTH / 2, 120, 'learn to code by playing', 8, '#8ea0c0')

    const hasSave = SaveSystem.exists()
    let y = 196

    button(this, GAME_WIDTH / 2, y, 'NEW GAME', () => {
      SaveSystem.reset()
      this.scene.start('CharacterSelect')
    })

    y += 34
    button(
      this,
      GAME_WIDTH / 2,
      y,
      'CONTINUE',
      () => this.scene.start('WorldSelect'),
      { disabled: !hasSave },
    )

    y += 34
    button(this, GAME_WIDTH / 2, y, 'CODEX', () => this.scene.start('Codex'), {
      disabled: !hasSave,
    })
  }
}
