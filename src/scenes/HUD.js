import Phaser from 'phaser'
import { GAME_WIDTH } from '../config.js'
import { SaveSystem, xpForLevel } from '../systems/SaveSystem.js'
import { pixelText, uiPanel } from '../ui/widgets.js'

// Overlay scene launched on top of Game. Polls live state each frame rather
// than subscribing to cross-scene events — simpler and leak-free on restart.
export default class HUDScene extends Phaser.Scene {
  constructor() {
    super('HUD')
  }

  create() {
    this.gameScene = this.scene.get('Game')

    // stats on a Kenney panel (top-left), kept slim
    uiPanel(this, 4, 4, 106, 30, { frame: 3 })
    this.add.rectangle(13, 14, 58, 6, 0x141a2c).setOrigin(0, 0.5).setStrokeStyle(1, 0x39456a)
    this.hpFill = this.add.rectangle(14, 14, 56, 4, 0xe06a6a).setOrigin(0, 0.5)

    this.lvText = pixelText(this, 13, 25, 'LV 1', 7, '#ffe066').setOrigin(0, 0.5)
    this.add.rectangle(49, 25, 42, 4, 0x141a2c).setOrigin(0, 0.5).setStrokeStyle(1, 0x39456a)
    this.xpFill = this.add.rectangle(50, 25, 1, 2, 0x7cfc98).setOrigin(0, 0.5)

    // objective on a matching panel (top-right)
    uiPanel(this, GAME_WIDTH - 4, 4, 150, 20, { frame: 3, originX: 1, originY: 0 })
    this.objText = pixelText(this, GAME_WIDTH - 14, 14, '', 7, '#e8eefc').setOrigin(1, 0.5)
  }

  update() {
    const gs = this.gameScene
    if (!gs || !gs.player) return
    const p = gs.player
    this.hpFill.width = Math.max(0, 56 * (p.hp / p.maxHp))
    const ps = SaveSystem.data.player
    this.lvText.setText('LV ' + ps.level)
    this.xpFill.width = Math.max(1, 42 * Math.min(1, ps.xp / xpForLevel(ps.level)))
    this.objText.setText(gs.objectiveLabel || '')
  }
}
