import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../config.js'
import { SaveSystem } from '../systems/SaveSystem.js'
import { ContentLoader } from '../systems/ContentLoader.js'
import { addBackdrop, button, pixelText } from '../ui/widgets.js'

export default class WorldSelectScene extends Phaser.Scene {
  constructor() {
    super('WorldSelect')
  }

  create() {
    addBackdrop(this, 'bg-green')
    pixelText(this, GAME_WIDTH / 2, 44, 'SELECT WORLD', 16, '#ffe066')

    const content = new ContentLoader(this)
    const worlds = content.worlds().slice().sort((a, b) => a.order - b.order)

    const y0 = 116
    worlds.forEach((w, i) => {
      const y = y0 + i * 58
      const unlocked = SaveSystem.isWorldUnlocked(w.id)
      const levels = w.levels || []
      const cleared = levels.filter((l) => SaveSystem.isLevelCleared(l.id)).length

      button(
        this,
        GAME_WIDTH / 2,
        y,
        unlocked ? w.name : `${w.name}  [LOCKED]`,
        () => this.scene.start('LevelSelect', { worldId: w.id }),
        { disabled: !unlocked, size: 14 },
      )
      if (unlocked && levels.length) {
        pixelText(this, GAME_WIDTH / 2, y + 18, `${cleared}/${levels.length} cleared`, 7, '#8ea0c0')
      }
    })

    button(this, 52, GAME_HEIGHT - 22, '< MENU', () => this.scene.start('MainMenu'), {
      size: 8,
    })
  }
}
