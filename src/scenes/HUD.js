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

    this.add.rectangle(10, 11, 60, 7, 0x1b2138).setOrigin(0, 0.5).setStrokeStyle(1, 0x39456a)
    this.hpFill = this.add.rectangle(11, 11, 58, 4, 0xe06a6a).setOrigin(0, 0.5)

    this.lvText = pixelText(this, 10, 23, 'LV 1', 7, '#ffe066').setOrigin(0, 0.5)
    this.add.rectangle(46, 23, 44, 4, 0x1b2138).setOrigin(0, 0.5).setStrokeStyle(1, 0x39456a)
    this.xpFill = this.add.rectangle(47, 23, 1, 2, 0x7cfc98).setOrigin(0, 0.5)

    this.objText = pixelText(this, GAME_WIDTH - 10, 11, '', 7, '#cdd7ee').setOrigin(1, 0.5)
  }

  update() {
    const gs = this.gameScene
    if (!gs || !gs.player) return
    const p = gs.player
    this.hpFill.width = Math.max(0, 58 * (p.hp / p.maxHp))
    const ps = SaveSystem.data.player
    this.lvText.setText('LV ' + ps.level)
    this.xpFill.width = Math.max(1, 42 * Math.min(1, ps.xp / xpForLevel(ps.level)))
    this.objText.setText(gs.objectiveLabel || '')
  }
}
