import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../config.js'
import { SaveSystem } from '../systems/SaveSystem.js'
import { ContentLoader } from '../systems/ContentLoader.js'
import { addBackdrop, button, pixelText } from '../ui/widgets.js'

export default class LevelSelectScene extends Phaser.Scene {
  constructor() {
    super('LevelSelect')
  }

  init(data) {
    this.worldId = data?.worldId || 'matlab'
  }

  create() {
    const content = new ContentLoader(this)
    const world = content.world(this.worldId)
    addBackdrop(this, world?.bg || 'bg-green')
    pixelText(this, GAME_WIDTH / 2, 40, world?.name || 'LEVELS', 16, '#ffe066')

    const levels = world?.levels || []
    const cols = Math.max(1, Math.min(levels.length, 5))
    const gap = 100
    const x0 = GAME_WIDTH / 2 - ((cols - 1) * gap) / 2

    levels.forEach((lv, i) => {
      const x = x0 + (i % cols) * gap
      const y = 132 + Math.floor(i / cols) * 78
      const prev = levels[i - 1]
      const unlocked = i === 0 || (prev && SaveSystem.isLevelCleared(prev.id))
      const cleared = SaveSystem.isLevelCleared(lv.id)
      const face = lv.isBoss ? 'BOSS' : String(i + 1).padStart(2, '0')
      const col = !unlocked ? '#5a6488' : cleared ? '#7cfc98' : '#cdd7ee'

      const box = this.add
        .rectangle(x, y, 58, 58, 0x1b2138, unlocked ? 0.9 : 0.45)
        .setStrokeStyle(2, lv.isBoss ? 0xe06a6a : 0x3a4568)
      pixelText(this, x, y, face, lv.isBoss ? 10 : 16, col)
      pixelText(this, x, y + 42, lv.name, 6, col)

      if (unlocked) {
        const hit = this.add
          .rectangle(x, y, 58, 58, 0xffffff, 0)
          .setInteractive({ useHandCursor: true })
        hit.on('pointerover', () => box.setStrokeStyle(2, 0xffe066))
        hit.on('pointerout', () =>
          box.setStrokeStyle(2, lv.isBoss ? 0xe06a6a : 0x3a4568),
        )
        hit.on('pointerup', () =>
          this.scene.start('Game', { worldId: this.worldId, levelId: lv.id }),
        )
      } else {
        pixelText(this, x, y - 1, '\u{1F512}', 14, '#5a6488')
      }
    })

    button(this, 52, GAME_HEIGHT - 22, '< WORLDS', () => this.scene.start('WorldSelect'), {
      size: 8,
    })
  }
}
