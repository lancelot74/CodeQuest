import Phaser from 'phaser'
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

// Soft radial gradient used by the menu screens for moon halos, torch pools and fog
// wisps. Created once per game; safe to call from any scene before use.
export function ensureGlowTexture(scene) {
  if (scene.textures.exists('menu-glow')) return
  const r = 64
  const c = scene.textures.createCanvas('menu-glow', r * 2, r * 2)
  const ctx = c.getContext()
  const g = ctx.createRadialGradient(r, r, r * 0.1, r, r, r)
  g.addColorStop(0, 'rgba(255,255,255,0.9)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, r * 2, r * 2)
  c.refresh()
}

// Glyph for a hunter sense (eye / ear / nose triangle) drawn into a Graphics object.
// Shared by the NIGHT HUNT HUD, its rules banner and the menu screens.
export function drawSenseIcon(g, x, y, glyph, color) {
  g.lineStyle(2, color, 1).fillStyle(color, 1)
  if (glyph === 'eye') {
    g.strokeCircle(x, y, 7)
    g.fillCircle(x, y, 3)
  } else if (glyph === 'ear') {
    g.beginPath()
    g.arc(x + 1, y, 7, Phaser.Math.DegToRad(-70), Phaser.Math.DegToRad(150), false)
    g.strokePath()
    g.fillCircle(x - 1, y + 3, 2)
  } else {
    g.fillTriangle(x - 6, y + 5, x + 6, y + 5, x, y - 6)
  }
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
