import Phaser from 'phaser'

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot')
  }

  async create() {
    // Make sure the pixel font is ready before any canvas text renders,
    // otherwise the first frames fall back to a default font.
    try {
      await document.fonts.load('16px "Press Start 2P"')
      await document.fonts.ready
    } catch (e) {
      // Font is non-critical; continue with the browser fallback.
    }
    this.scene.start('Preload')
  }
}
