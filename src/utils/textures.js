import Phaser from 'phaser'

// Procedurally generated placeholder art so the slice runs with zero extra
// image assets. Slimes are drawn white and recolored per world via setTint,
// so the base texture must stay grayscale (dark stays dark under tint).
export function createPlaceholderTextures(scene) {
  if (scene.textures.exists('slime')) return

  // --- Blob slime (24x18) ---
  const s = scene.make.graphics({ x: 0, y: 0, add: false })
  s.fillStyle(0xffffff, 1).fillEllipse(12, 10, 22, 16)
  s.lineStyle(2, 0x222633, 0.35).strokeEllipse(12, 10, 22, 16)
  s.fillStyle(0x1a1d2b, 1).fillCircle(8, 9, 2.2).fillCircle(16, 9, 2.2)
  s.fillStyle(0x1a1d2b, 1).fillRect(10, 14, 4, 1.4)
  s.generateTexture('slime', 24, 18)
  s.destroy()

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
}
