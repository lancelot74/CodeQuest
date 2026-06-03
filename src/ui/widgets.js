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

// Kenney UI Pack (Pixel Adventure) nine-slice panel — blue-grey, 8px borders on
// the 32px tile. Shared by menu chrome and the HUD.
export function uiPanel(scene, x, y, w, h, opts = {}) {
  const p = scene.add.nineslice(x, y, 'ui-panel', undefined, w, h, 8, 8, 8, 8)
  p.setOrigin(opts.originX ?? 0, opts.originY ?? 0)
  if (opts.tint != null) p.setTint(opts.tint)
  if (opts.depth != null) p.setDepth(opts.depth)
  return p
}

// A button drawn on a Kenney panel. Auto-sizes to the label.
export function panelButton(scene, x, y, label, onClick, opts = {}) {
  const size = opts.size ?? 11
  const depth = opts.depth ?? 5
  const t = pixelText(scene, x, y, label, size, opts.color ?? '#eaf1ff')
  const w = opts.width ?? Math.ceil(t.width + 28)
  const h = opts.height ?? size + 18
  const bg = scene.add.nineslice(x, y, 'ui-panel', undefined, w, h, 8, 8, 8, 8).setOrigin(0.5)
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

// Text on a Kenney panel. Returns the label (callers position by it); the panel
// behind it carries the interaction so the whole pill is tappable.
export function button(scene, x, y, label, onClick, opts = {}) {
  const size = opts.size ?? 12
  const color = opts.color ?? COLORS.text
  const hover = opts.hover ?? COLORS.accent
  const t = pixelText(scene, x, y, label, size, color).setDepth(6)
  const w = Math.ceil(t.width + 22)
  const h = size + 14
  const bg = scene.add.nineslice(x, y, 'ui-panel', undefined, w, h, 8, 8, 8, 8).setOrigin(0.5).setDepth(5)

  if (opts.disabled) {
    t.setColor('#5a6488')
    bg.setTint(0x5b6580)
    return t
  }

  bg.setInteractive({ useHandCursor: true })
  bg.on('pointerover', () => {
    bg.setTint(0xe2ecff)
    t.setColor(hover)
    Audio.play(scene, SFX.rollover)
  })
  bg.on('pointerout', () => {
    bg.clearTint()
    t.setColor(color)
  })
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
  return t
}
