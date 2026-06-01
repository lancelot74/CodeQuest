import { COLORS } from '../utils/constants.js'
import { Audio, SFX } from '../systems/AudioSystem.js'

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

// Kenney nine-slice panel. Frames in the 'ui' sheet: 3 = dark grey-blue panel,
// 2 = lighter grey-blue (good for buttons). 8px borders on the 32px tiles.
export function uiPanel(scene, x, y, w, h, opts = {}) {
  const frame = opts.frame ?? 3
  const p = scene.add.nineslice(x, y, 'ui', frame, w, h, 8, 8, 8, 8)
  p.setOrigin(opts.originX ?? 0, opts.originY ?? 0)
  if (opts.tint != null) p.setTint(opts.tint)
  if (opts.depth != null) p.setDepth(opts.depth)
  return p
}

// A button drawn on a Kenney panel frame. Auto-sizes to the label.
export function panelButton(scene, x, y, label, onClick, opts = {}) {
  const size = opts.size ?? 11
  const depth = opts.depth ?? 5
  const t = pixelText(scene, x, y, label, size, opts.color ?? '#2b3350')
  const w = opts.width ?? Math.ceil(t.width + 28)
  const h = opts.height ?? size + 18
  const bg = scene.add.nineslice(x, y, 'ui', opts.frame ?? 2, w, h, 8, 8, 8, 8).setOrigin(0.5)
  bg.setDepth(depth)
  t.setDepth(depth + 1)

  if (opts.disabled) {
    bg.setTint(0x6d7790)
    t.setColor('#566084')
    return { bg, text: t }
  }

  bg.setInteractive({ useHandCursor: true })
  bg.on('pointerover', () => {
    bg.setTint(0xe2ecff)
    Audio.play(scene, SFX.rollover)
  })
  bg.on('pointerout', () => bg.clearTint())
  bg.on('pointerdown', () => {
    bg.setScale(0.96)
    t.setScale(0.96)
  })
  bg.on('pointerup', () => {
    bg.setScale(1)
    t.setScale(1)
    Audio.play(scene, SFX.click)
    onClick?.()
  })
  return { bg, text: t }
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
  t.on('pointerover', () => {
    t.setColor(hover)
    Audio.play(scene, SFX.rollover)
  })
  t.on('pointerout', () => t.setColor(color))
  t.on('pointerdown', () => t.setScale(0.94))
  t.on('pointerup', () => {
    t.setScale(1)
    Audio.play(scene, SFX.click)
    onClick?.()
  })
  return t
}
