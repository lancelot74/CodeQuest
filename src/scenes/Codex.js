import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../config.js'
import { addBackdrop, button, pixelText } from '../ui/widgets.js'

// Stub — fleshed out in the lesson-card step.
export default class CodexScene extends Phaser.Scene {
  constructor() {
    super('Codex')
  }

  create() {
    addBackdrop(this, 'bg-purple', 0.6)
    pixelText(this, GAME_WIDTH / 2, 60, 'CODEX', 20, '#ffe066')
    pixelText(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, 'unlocked lessons appear here', 8, '#8ea0c0')
    button(this, GAME_WIDTH / 2, GAME_HEIGHT - 40, 'BACK', () => this.scene.start('MainMenu'), {
      size: 10,
    })
  }
}
