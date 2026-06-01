import Phaser from 'phaser'

export const GAME_WIDTH = 640
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
