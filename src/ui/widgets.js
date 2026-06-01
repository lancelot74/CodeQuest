import { COLORS } from '../utils/constants.js'

// A repeating pixel backdrop dimmed for legibility — shared across menu scenes.
export function addBackdrop(scene, bgKey = 'bg-purple', dim = 0.5) {
  const w = scene.scale.width
  const h = scene.scale.height
  if (scene.textures.exists(bgKey)) {
    scene.add.tileSprite(0, 0, w, h, bgKey).setOrigin(0, 0).setScrollFactor(0)
  }
  scene.add.rectangle(0, 0, w, h, 0x0b0d1a, dim).setOrigin(0, 0).setScrollFactor(0)
}

export function pixelText(scene, x, y, text, size = 10, color = COLORS.text) {
  return scene.add
    .text(x, y, text, { fontFamily: '"Press Start 2P"', fontSize: `${size}px`, color })
    .setOrigin(0.5)
}

export function button(scene, x, y, label, onClick, opts = {}) {
  const size = opts.size ?? 12
  const color = opts.color ?? COLORS.text
  const hover = opts.hover ?? COLORS.accent
  const t = pixelText(scene, x, y, label, size, color)

  if (opts.disabled) {
    t.setColor('#5a6488')
    return t
  }

  t.setInteractive({ useHandCursor: true })
  t.on('pointerover', () => t.setColor(hover))
  t.on('pointerout', () => t.setColor(color))
  t.on('pointerdown', () => t.setScale(0.94))
  t.on('pointerup', () => {
    t.setScale(1)
    onClick?.()
  })
  return t
}
