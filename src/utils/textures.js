import Phaser from 'phaser'

// Procedurally generated FX so the slice runs with zero extra image assets.
// Slash/spark/ladder are drawn white and recolored at use via setTint, so the
// base textures stay grayscale (dark stays dark under tint).
export function createPlaceholderTextures(scene) {
  if (scene.textures.exists('slash')) return

  // --- Slash arc (22x26), tinted at use ---
  const a = scene.make.graphics({ x: 0, y: 0, add: false })
  const arc = (lw, alpha) => {
    a.lineStyle(lw, 0xffffff, alpha)
    a.beginPath()
    a.arc(5, 13, 12, Phaser.Math.DegToRad(-70), Phaser.Math.DegToRad(70), false)
    a.strokePath()
  }
  arc(8, 0.22)
  arc(4, 0.95)
  a.generateTexture('slash', 22, 26)
  a.destroy()

  // --- Spark particle (4x4) ---
  const p = scene.make.graphics({ x: 0, y: 0, add: false })
  p.fillStyle(0xffffff, 1).fillRect(0, 0, 4, 4)
  p.generateTexture('spark', 4, 4)
  p.destroy()

  // --- Ladder / vine (21x21, tiles vertically), recolored per world via setTint ---
  const L = scene.make.graphics({ x: 0, y: 0, add: false })
  L.fillStyle(0xffffff, 1)
  L.fillRect(3, 0, 3, 21).fillRect(15, 0, 3, 21) // rails
  L.fillRect(4, 3, 13, 3).fillRect(4, 13, 13, 3) // rungs (spaced for vertical tiling)
  L.fillStyle(0x000000, 0.22)
  L.fillRect(5, 0, 1, 21).fillRect(17, 0, 1, 21)
  L.generateTexture('ladder', 21, 21)
  L.destroy()
}
