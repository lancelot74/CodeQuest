import Phaser from 'phaser'
import { GAME_WIDTH } from '../config.js'
import { SaveSystem, xpForLevel } from '../systems/SaveSystem.js'
import { pixelText } from '../ui/widgets.js'

// Overlay scene launched on top of Game. Polls live state each frame rather
// than subscribing to cross-scene events — simpler and leak-free on restart.
export default class HUDScene extends Phaser.Scene {
  constructor() {
    super('HUD')
  }

  create() {
    this.gameScene = this.scene.get('Game')

    pixelText(this, 10, 12, 'HP', 8, '#cdd7ee').setOrigin(0, 0.5)
    this.add.rectangle(30, 12, 84, 9, 0x1b2138).setOrigin(0, 0.5).setStrokeStyle(1, 0x3a4568)
    this.hpFill = this.add.rectangle(31, 12, 82, 6, 0xe06a6a).setOrigin(0, 0.5)

    this.lvText = pixelText(this, 10, 28, 'LV 1', 8, '#ffe066').setOrigin(0, 0.5)
    this.add.rectangle(52, 28, 62, 5, 0x1b2138).setOrigin(0, 0.5).setStrokeStyle(1, 0x3a4568)
    this.xpFill = this.add.rectangle(53, 28, 1, 3, 0x7cfc98).setOrigin(0, 0.5)

    this.objText = pixelText(this, GAME_WIDTH - 10, 12, '', 7, '#cdd7ee').setOrigin(1, 0.5)
  }

  update() {
    const gs = this.gameScene
    if (!gs || !gs.player) return
    const p = gs.player
    this.hpFill.width = Math.max(0, 82 * (p.hp / p.maxHp))
    const ps = SaveSystem.data.player
    this.lvText.setText('LV ' + ps.level)
    this.xpFill.width = Math.max(1, 60 * Math.min(1, ps.xp / xpForLevel(ps.level)))
    this.objText.setText(gs.objectiveLabel || '')
  }
}
