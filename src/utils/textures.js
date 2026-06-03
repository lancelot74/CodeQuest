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

  // --- Far parallax ridge (128x96, tiles horizontally), tinted dark per world ---
  // Seamless: the sine ridge has period = width, so x=0 and x=128 match.
  const H = scene.make.graphics({ x: 0, y: 0, add: false })
  H.fillStyle(0xffffff, 1)
  H.beginPath()
  H.moveTo(0, 96)
  for (let x = 0; x <= 128; x += 4) {
    H.lineTo(x, 64 - 12 * Math.sin((x / 128) * Math.PI * 2))
  }
  H.lineTo(128, 96)
  H.closePath()
  H.fillPath()
  const blade = (bx, h) => H.fillTriangle(bx - 2, 64, bx + 2, 64, bx, 64 - h)
  blade(28, 30); blade(41, 22); blade(92, 27); blade(105, 18)
  H.generateTexture('hills', 128, 96)
  H.destroy()

  // --- Reed clump (44x56, bottom-anchored), tinted at use, gentle sway in-scene ---
  const R = scene.make.graphics({ x: 0, y: 0, add: false })
  R.fillStyle(0xffffff, 1)
  const reed = (bx, h, lean) => {
    R.beginPath()
    R.moveTo(bx - 2, 56)
    R.lineTo(bx + 2, 56)
    R.lineTo(bx + lean + 1, 56 - h)
    R.lineTo(bx + lean - 1, 56 - h)
    R.closePath()
    R.fillPath()
  }
  reed(9, 30, -6); reed(15, 41, -3); reed(21, 52, 1); reed(27, 44, 5); reed(33, 33, 8)
  R.fillRect(20, 5, 3, 9) // cattail head on the tallest blade
  R.fillRect(27, 13, 3, 8)
  R.generateTexture('reeds', 44, 56)
  R.destroy()

  // --- Vignette (radial darkening, alpha edges) overlaid on the gameplay camera ---
  const vg = scene.textures.createCanvas('vignette', 128, 80)
  if (vg) {
    const vctx = vg.getContext()
    const grd = vctx.createRadialGradient(64, 40, 22, 64, 40, 80)
    grd.addColorStop(0, 'rgba(0,0,0,0)')
    grd.addColorStop(0.65, 'rgba(0,0,0,0)')
    grd.addColorStop(1, 'rgba(7,9,16,0.5)')
    vctx.fillStyle = grd
    vctx.fillRect(0, 0, 128, 80)
    vg.refresh()
  }
}
