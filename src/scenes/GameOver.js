import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../config.js'
import { COLORS } from '../utils/constants.js'
import { ContentLoader } from '../systems/ContentLoader.js'
import { addBackdrop, pixelText, button } from '../ui/widgets.js'
import { Music } from '../systems/AudioSystem.js'

export default class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOver')
  }

  init(data) {
    this.worldId = data?.worldId || 'matlab'
    this.levelId = data?.levelId || 'matlab-01'
  }

  create() {
    Music.play(this, 'bgm-main') // resume the menu loop after a (silent) level
    const world = new ContentLoader(this).world(this.worldId)
    addBackdrop(this, world?.bg || 'bg-green', 0.72)

    pixelText(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 56, 'GAME OVER', 22, COLORS.danger)
    pixelText(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 22, 'the marsh claims another coder', 8, COLORS.dim)

    button(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 16, 'RETRY  [R]', () => this.retry(), { size: 14 })
    button(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 48, 'LEVELS  [ESC]', () => this.quit(), {
      size: 11,
      color: COLORS.dim,
    })

    this.input.keyboard.once('keydown-R', () => this.retry())
    this.input.keyboard.once('keydown-ESC', () => this.quit())
  }

  retry() {
    this.scene.start('Game', { worldId: this.worldId, levelId: this.levelId })
  }

  quit() {
    this.scene.start('LevelSelect', { worldId: this.worldId })
  }
}
