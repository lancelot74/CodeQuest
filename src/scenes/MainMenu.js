import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../config.js'
import { SaveSystem } from '../systems/SaveSystem.js'
import { addBackdrop, panelButton, pixelText } from '../ui/widgets.js'

export default class MainMenuScene extends Phaser.Scene {
  constructor() {
    super('MainMenu')
  }

  create() {
    addBackdrop(this, 'bg-blue')
    pixelText(this, GAME_WIDTH / 2, 84, 'CODEQUEST', 32, '#ffe066')
    pixelText(this, GAME_WIDTH / 2, 120, 'learn to code by playing', 8, '#8ea0c0')

    const hasSave = SaveSystem.exists()
    let y = 196
    const W = 168

    panelButton(this, GAME_WIDTH / 2, y, 'NEW GAME', () => {
      SaveSystem.reset()
      this.scene.start('CharacterSelect')
    }, { width: W })

    y += 36
    panelButton(this, GAME_WIDTH / 2, y, 'CONTINUE', () => this.scene.start('WorldSelect'), {
      width: W,
      disabled: !hasSave,
    })

    y += 36
    panelButton(this, GAME_WIDTH / 2, y, 'CODEX', () => this.scene.start('Codex'), {
      width: W,
      disabled: !hasSave,
    })

    y += 36
    panelButton(this, GAME_WIDTH / 2, y, 'AGE OF WAR', () => this.scene.start('AgeOfWar'), {
      width: W,
    })
  }
}
