import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../config.js'
import { addBackdrop, panelButton, pixelText } from '../ui/widgets.js'
import { Music } from '../systems/AudioSystem.js'

export default class MainMenuScene extends Phaser.Scene {
  constructor() {
    super('MainMenu')
  }

  create() {
    addBackdrop(this, 'bg-blue')
    pixelText(this, GAME_WIDTH / 2, 110, 'CODEQUEST', 32, '#ffe066')
    pixelText(this, GAME_WIDTH / 2, 148, 'learn to code by playing', 8, '#8ea0c0')

    const W = 180
    panelButton(this, GAME_WIDTH / 2, 214, 'GAME', () => this.scene.start('GameSelect'), { width: W })
    panelButton(this, GAME_WIDTH / 2, 256, 'CODEX', () => this.scene.start('Codex'), { width: W })

    Music.play(this, 'bgm-main')
  }
}
