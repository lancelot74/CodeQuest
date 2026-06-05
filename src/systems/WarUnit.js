import Phaser from 'phaser'
import { CombatSystem } from './CombatSystem.js'
import { Audio, SFX } from './AudioSystem.js'

// Buyable units for the Age of War sub-game. Costs are fixed (15/25/25/50);
// stats scale with cost without equalling it. Slime is a procedural placeholder
// (melee only); the other three reuse the platformer enemy sprites.
export const UNIT_TYPES = {
  slime: {
    label: 'SLIME', cost: 15, walk: 'slime-walk', death: null,
    hp: 42, attack: 6, range: 26, cooldown: 700, speed: 64,
    ranged: false, tint: 0x6fcf5a, scale: 1, projTint: null, killReward: 7,
  },
  spitter: {
    label: 'SPITTER', cost: 25, walk: 'ooze-walk', death: 'ooze-death',
    hp: 64, attack: 9, range: 120, cooldown: 1100, speed: 40,
    ranged: true, tint: 0xb060ff, scale: 0.78, projTint: 0xc77bff, killReward: 12,
  },
  mage: {
    label: 'MAGE', cost: 25, walk: 'mage-walk', death: 'mage-death',
    hp: 38, attack: 15, range: 150, cooldown: 1500, speed: 38,
    ranged: true, tint: 0xffffff, scale: 0.62, projTint: 0x7ad6ff, killReward: 12,
  },
  demon: {
    label: 'DEMON', cost: 50, walk: 'demon-walk', death: 'demon-death',
    hp: 150, attack: 22, range: 30, cooldown: 1000, speed: 48,
    ranged: false, tint: 0xff7a5a, scale: 0.74, projTint: null, killReward: 25,
  },
}

const SPACING = 20 // hold this far behind a stopped friendly to form a front line

export default class WarUnit extends Phaser.GameObjects.Sprite {
  constructor(scene, type, side, groundY) {
    const cfg = UNIT_TYPES[type]
    const spawnX = side === 'player' ? scene.PLAYER_SPAWN_X : scene.ENEMY_SPAWN_X
    super(scene, spawnX + Phaser.Math.Between(-8, 8), groundY, cfg.walk)
    scene.add.existing(this)
    this.cfg = cfg
    this.type = type
    this.side = side
    this.dir = side === 'player' ? 1 : -1
    this.hp = cfg.hp
    this.maxHp = cfg.hp
    this.dead = false
    this.nextAttackAt = 0
    this.setOrigin(0.5, 1)
    this.setScale(cfg.scale)
    this.setTint(cfg.tint)
    this.setDepth(8)
    this.setFlipX(this.dir > 0) // sprites face left natively
    this.play(cfg.walk)
  }

  update(time, delta) {
    if (this.dead || !this.active) return
    const foes = this.side === 'player' ? this.scene.enemyUnits : this.scene.playerUnits
    const friends = this.side === 'player' ? this.scene.playerUnits : this.scene.enemyUnits

    const target = this.nearestFoeInRange(foes)
    if (target) {
      if (time >= this.nextAttackAt) {
        this.attackUnit(target)
        this.nextAttackAt = time + this.cfg.cooldown
      }
      return
    }

    if (this.blockedByFriend(friends)) return

    if (this.atEnemyBase()) {
      if (time >= this.nextAttackAt) {
        this.scene.damageBase(this.side === 'player' ? 'enemy' : 'player', this.cfg.attack)
        this.nextAttackAt = time + this.cfg.cooldown
      }
      return
    }

    this.x += this.dir * this.cfg.speed * (delta / 1000)
    if (this.anims.currentAnim?.key !== this.cfg.walk) this.play(this.cfg.walk, true)
  }

  nearestFoeInRange(foes) {
    let best = null
    let bestDist = Infinity
    for (const o of foes) {
      if (!o || o.dead || !o.active) continue
      if ((o.x - this.x) * this.dir <= 0) continue // must be ahead
      const dist = Math.abs(o.x - this.x)
      if (dist <= this.cfg.range && dist < bestDist) {
        best = o
        bestDist = dist
      }
    }
    return best
  }

  blockedByFriend(friends) {
    for (const f of friends) {
      if (f === this || !f || f.dead || !f.active) continue
      const ahead = (f.x - this.x) * this.dir
      if (ahead > 0 && ahead < SPACING) return true
    }
    return false
  }

  atEnemyBase() {
    return this.side === 'player'
      ? this.x >= this.scene.ENEMY_BASE_HIT_X
      : this.x <= this.scene.PLAYER_BASE_HIT_X
  }

  attackUnit(target) {
    if (this.cfg.ranged) {
      this.scene.spawnWarProjectile(this, target)
      Audio.play(this.scene, SFX.spit)
    } else {
      const { amount, isCrit } = CombatSystem.roll(this.cfg.attack, { critChance: 0.1 })
      target.hurt(amount, isCrit)
      Audio.play(this.scene, this.type === 'demon' ? SFX.heavy : SFX.slash)
      this.scene.tweens.add({
        targets: this,
        scaleX: this.cfg.scale * 1.15,
        duration: 80,
        yoyo: true,
      })
    }
  }

  hurt(amount, isCrit) {
    if (this.dead) return
    this.hp -= amount
    CombatSystem.floatingNumber(this.scene, this.x, this.y - this.displayHeight - 4, amount, { crit: isCrit })
    this.setTintFill(0xffffff)
    this.scene.time.delayedCall(60, () => {
      if (!this.dead && this.active) this.setTint(this.cfg.tint)
    })
    Audio.play(this.scene, SFX.enemyHit)
    if (this.hp <= 0) this.die()
  }

  die() {
    if (this.dead) return
    this.dead = true
    const arr = this.side === 'player' ? this.scene.playerUnits : this.scene.enemyUnits
    const i = arr.indexOf(this)
    if (i >= 0) arr.splice(i, 1)
    this.scene.onUnitKilled(this.side, this.cfg.killReward)
    Audio.play(this.scene, SFX.enemyDie)
    this.setTint(this.cfg.tint)
    if (this.cfg.death) {
      this.play(this.cfg.death)
      this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
        this.scene.tweens.add({ targets: this, alpha: 0, duration: 200, onComplete: () => this.destroy() })
      })
    } else {
      this.anims.stop()
      this.scene.tweens.add({
        targets: this,
        scaleY: this.cfg.scale * 0.2,
        alpha: 0,
        duration: 240,
        onComplete: () => this.destroy(),
      })
    }
  }
}
