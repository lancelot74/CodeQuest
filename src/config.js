import Phaser from 'phaser'

// Wider-than-16:9 base canvas (~2.13:1) so the game fills modern widescreen phones
// and laptop windows with far less letterboxing, and shows more of the world across.
export const GAME_WIDTH = 768
export const GAME_HEIGHT = 360

export function createConfig(scenes) {
  return {
    type: Phaser.AUTO,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    parent: 'game',
    backgroundColor: '#0b0d1a',
    pixelArt: true,
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: {
      default: 'arcade',
      arcade: { gravity: { y: 900 }, debug: false },
    },
    scene: scenes,
  }
}
