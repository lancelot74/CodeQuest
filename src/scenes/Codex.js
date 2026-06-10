import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../config.js'
import { SaveSystem } from '../systems/SaveSystem.js'
import { ContentLoader } from '../systems/ContentLoader.js'
import { nightBackdrop, button, pixelText } from '../ui/widgets.js'
import { showLessonCard } from '../ui/domOverlay.js'

const WORLD_TAG = { matlab: 'MAT', c: 'C', cpp: 'C++' }

export default class CodexScene extends Phaser.Scene {
  constructor() {
    super('Codex')
  }

  create() {
    nightBackdrop(this)
    pixelText(this, GAME_WIDTH / 2, 38, 'CODEX', 18, '#ffe066')

    const lessons = new ContentLoader(this).lessons()
    const unlocked = lessons.filter((l) => SaveSystem.isLessonUnlocked(l.id))

    if (unlocked.length === 0) {
      pixelText(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, 'clear a level to unlock lessons', 8, '#8ea0c0')
    } else {
      pixelText(this, GAME_WIDTH / 2, 62, `${unlocked.length} unlocked`, 7, '#8ea0c0')
      const perCol = 7
      const cols = Math.ceil(unlocked.length / perCol)
      const colW = 300
      const x0 = GAME_WIDTH / 2 - ((cols - 1) * colW) / 2
      unlocked.forEach((l, i) => {
        const x = x0 + Math.floor(i / perCol) * colW
        const y = 92 + (i % perCol) * 28
        const tag = WORLD_TAG[l.world] || '?'
        button(this, x, y, `[${tag}] ${l.title}`, () => showLessonCard(l, undefined, 'CODEX ENTRY'), {
          size: 8,
        })
      })
    }

    button(this, GAME_WIDTH / 2, GAME_HEIGHT - 26, 'BACK', () => this.scene.start('MainMenu'), {
      size: 10,
    })
  }
}
