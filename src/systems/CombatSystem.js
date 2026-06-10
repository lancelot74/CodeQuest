import { pixelText } from '../ui/widgets.js'

// Stateless damage math + hit feedback shared by player and enemies.
export const CombatSystem = {
  roll(base, opts = {}) {
    const { critChance = 0.15, guaranteedCrit = false, variance = 0.18 } = opts
    const isCrit = guaranteedCrit || Math.random() < critChance
    const spread = 1 + (Math.random() * 2 - 1) * variance
    let amount = Math.max(1, Math.round(base * spread))
    if (isCrit) amount = amount * 2
    return { amount, isCrit }
  },

  floatingNumber(scene, x, y, amount, opts = {}) {
    const { crit = false, color } = opts
    const c = color || (crit ? '#ffe066' : '#ffffff')
    const size = crit ? 12 : 9
    const label = crit ? `${amount}!` : `${amount}`
    const t = pixelText(scene, x, y, label, size, c).setDepth(40)
    scene.tweens.add({
      targets: t,
      y: y - (crit ? 26 : 20),
      alpha: 0,
      duration: crit ? 720 : 540,
      ease: 'Cubic.out',
      onComplete: () => t.destroy(),
    })
    return t
  },

  puff(scene, x, y, tint = 0xffffff, depth = 30) {
    const emitter = scene.add.particles(x, y, 'spark', {
      speed: { min: 50, max: 130 },
      angle: { min: 0, max: 360 },
      scale: { start: 1.4, end: 0 },
      lifespan: 360,
      quantity: 10,
      tint,
      emitting: false,
    })
    emitter.setDepth(depth)
    emitter.explode(10)
    scene.time.delayedCall(420, () => emitter.destroy())
  },

  shake(scene, intensity = 0.006, duration = 130) {
    scene.cameras.main.shake(duration, intensity)
  },
}
