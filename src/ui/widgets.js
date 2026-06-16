import Phaser from 'phaser'
import { COLORS } from '../utils/constants.js'
import { Audio, SFX } from '../systems/AudioSystem.js'

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

// Procedural night sky shared by the menu screens — vertical gradient, twinkling
// stars and a distant treeline. Replaces the tiled square backdrops so the whole
// shell carries NIGHT HUNT's mood. Textures are created once and guarded.
export function nightBackdrop(scene, { treeline = true } = {}) {
  const w = scene.scale.width
  const h = scene.scale.height
  if (!scene.textures.exists('night-sky')) {
    const c = scene.textures.createCanvas('night-sky', 8, 256)
    const ctx = c.getContext()
    const g = ctx.createLinearGradient(0, 0, 0, 256)
    g.addColorStop(0, '#16203e')
    g.addColorStop(0.55, '#0c1226')
    g.addColorStop(1, '#070a16')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 8, 256)
    c.refresh()
  }
  scene.add.image(0, 0, 'night-sky').setOrigin(0, 0).setDisplaySize(w, h)
  for (let i = 0; i < 26; i++) {
    const star = scene.add.circle(Math.random() * w, Math.random() * h * 0.72, Math.random() < 0.25 ? 1.5 : 1, 0xdde6ff, 0.4 + Math.random() * 0.5)
    if (i % 3 === 0) {
      scene.tweens.add({ targets: star, alpha: 0.12, yoyo: true, repeat: -1, duration: 900 + Math.random() * 1600, delay: Math.random() * 1200 })
    }
  }
  if (treeline) {
    for (let x = 10; x < w + 20; x += 34 + Math.random() * 26) {
      scene.add.image(x, h + 4, 'hunt-tree').setOrigin(0.5, 1).setTint(0x131a30).setScale(0.85 + Math.random() * 0.5)
    }
  }
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

// Glyph for a hunter sense drawn into a Graphics object, fitting a ~16px box around
// (x, y). Shared by the NIGHT HUNT HUD, its rules banner and the menu screens.
export function drawSenseIcon(g, x, y, glyph, color) {
  const rad = Phaser.Math.DegToRad
  if (glyph === 'eye') {
    // almond eye: lens outline, iris, and a glint so it reads as watching
    g.lineStyle(2, color, 1).strokeEllipse(x, y, 16, 10)
    g.fillStyle(color, 1).fillCircle(x, y, 3)
    g.fillStyle(0xffffff, 0.9).fillCircle(x + 1.5, y - 1.5, 1.2)
  } else if (glyph === 'ear') {
    // ear shell with inner fold and lobe, plus a sound wave arriving from the left
    g.lineStyle(2, color, 1)
    g.beginPath()
    g.arc(x + 3, y - 1, 6, rad(-100), rad(120), false)
    g.strokePath()
    g.beginPath()
    g.arc(x + 2, y, 3, rad(-90), rad(60), false)
    g.strokePath()
    g.fillStyle(color, 1).fillCircle(x + 1, y + 5, 1.6)
    g.lineStyle(2, color, 0.7)
    g.beginPath()
    g.arc(x - 7, y, 3.5, rad(-55), rad(55), false)
    g.strokePath()
  } else {
    // snout with two scent trails curling upward
    g.fillStyle(color, 1).fillTriangle(x - 5, y + 7, x + 5, y + 7, x, y + 1)
    g.lineStyle(2, color, 0.85)
    for (const dx of [-3, 3]) {
      g.beginPath()
      g.arc(x + dx, y - 2, 2.2, rad(90), rad(270), false)
      g.strokePath()
      g.beginPath()
      g.arc(x + dx, y - 6.4, 2.2, rad(90), rad(270), true)
      g.strokePath()
    }
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
