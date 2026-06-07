import Phaser from 'phaser'

export const GAME_HEIGHT = 360

// Match the base canvas to the device's LANDSCAPE aspect ratio (fixed height, flexible
// width) so Phaser.Scale.FIT fills the screen edge-to-edge with no side bars — on the
// phone and the laptop alike. max/min makes it orientation-independent: we get the
// landscape aspect even if the page first loads in portrait. Clamped so extreme
// screens don't make the HUD absurdly wide or narrow.
function computeWidth() {
  if (typeof window === 'undefined') return 768
  // physical screen dims are stable across orientation + immune to address-bar resizing,
  // unlike innerWidth/innerHeight at load; max/min gives the landscape aspect either way
  const w = window.screen?.width || window.innerWidth || 768
  const h = window.screen?.height || window.innerHeight || GAME_HEIGHT
  const aspect = Math.max(w, h) / Math.min(w, h)
  return Phaser.Math.Clamp(Math.round(GAME_HEIGHT * aspect), 640, 1024)
}

export const GAME_WIDTH = computeWidth()

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
