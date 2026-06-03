import Phaser from 'phaser'
import { CombatSystem } from './CombatSystem.js'

// Attack tuning (shared timings; per-type stats live in TYPES below).
const DETECT = 210 // starts paying attention to the player within this range
const MELEE = 46 // lunge-bite range
const SPIT_MIN = 56 // closer than this, prefer to lunge
const SPIT_MAX = 200 // farther than this, just patrol
const SAME_LEVEL = 50 // vertical tolerance for "can see / reach the player"
const LUNGE_WINDUP = 240
const LUNGE_DASH = 240
const LUNGE_SPEED = 235
const LUNGE_CD = 1500
const SPIT_WINDUP = 280
const SPIT_CD = 1700
const RECOVER = 380
const SLAM_WINDUP = 360 // demon telegraph before the leap-slam
const SLAM_RANGE = 150 // demon slams when the player is within this (but past melee)
const SLAM_CD = 2600
const VOLLEY_WINDUP = 360 // mage telegraph before the triple-bolt fan
const VOLLEY_CD = 3200

// Per-type config. body = [width, height, offsetX, offsetY] in unscaled cell px;
// origin is bottom-centre so y is the feet line. All three sheets face LEFT
// natively (flipX when moving right).
const TYPES = {
  ooze: {
    walk: 'ooze-walk', death: 'ooze-death',
    scale: 0.68, body: [40, 30, 12, 20],
    hp: 30, contact: 12, speed: 40,
    lunge: true, spit: true, venom: 0x9be86a,
  },
  demon: {
    walk: 'demon-walk', death: 'demon-death',
    scale: 0.7, body: [42, 40, 11, 16],
    hp: 60, contact: 18, speed: 58,
    lunge: true, spit: false, slam: true, venom: 0x9be86a,
  },
  mage: {
    walk: 'mage-walk', death: 'mage-death',
    scale: 0.62, body: [30, 44, 10, 20],
    hp: 22, contact: 9, speed: 34,
    lunge: false, spit: true, volley: true, venom: 0xc77bff,
  },
}

// Marsh enemy. Patrols a platform; the Ooze spits venom and lunge-bites, the
// Demon is a heavy melee bruiser (lunge only), the Mage is a fragile caster
// (ranged spit only). Telegraphs every attack with a squash + warning flash.
export default class Enemy extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, type = 'ooze') {
    const cfg = TYPES[type] || TYPES.ooze
    super(scene, x, y, cfg.walk)
    scene.add.existing(this)
    scene.physics.add.existing(this)

    this.type = type
    this.cfg = cfg
    this.baseScale = cfg.scale

    this.setOrigin(0.5, 1)
    this.setScale(cfg.scale)
    this.setDepth(8)
    this.body.setSize(cfg.body[0], cfg.body[1]).setOffset(cfg.body[2], cfg.body[3])
    this.setCollideWorldBounds(true)

    this.maxHp = cfg.hp
    this.hp = this.maxHp
    this.contactDamage = cfg.contact
    this.speed = cfg.speed
    this.dead = false
    this.dir = Math.random() < 0.5 ? -1 : 1
    this.face(this.dir)

    this.state = 'patrol'
    this.stateUntil = 0
    this.nextLungeAt = 0
    this.nextSpitAt = 0
    this.nextSlamAt = 0
    this.nextVolleyAt = 0
    this.slamArmAt = 0
    this.lungeActive = false

    this.play(cfg.walk)
  }

  preUpdate(time, delta) {
    super.preUpdate(time, delta)
    if (this.dead) return

    if (this.state === 'windupLunge') {
      this.setVelocityX(0)
      if (time >= this.stateUntil) {
        this.state = 'lunge'
        this.stateUntil = time + LUNGE_DASH
        this.lungeActive = true
        this.setVelocityX(this.dir * LUNGE_SPEED)
        this.setVelocityY(-130)
      }
      return
    }
    if (this.state === 'lunge') {
      const offLedge = this.body.blocked.down && !this.aheadIsSolid()
      if (time >= this.stateUntil || this.body.blocked.left || this.body.blocked.right || offLedge) {
        this.lungeActive = false
        this.setVelocityX(0)
        this.state = 'recover'
        this.stateUntil = time + RECOVER
      }
      return
    }
    if (this.state === 'windupSlam') {
      this.setVelocityX(0)
      if (time >= this.stateUntil) {
        this.state = 'slamAir'
        this.slamArmAt = time + 180
        this.stateUntil = time + 1300
        this.setVelocityY(-300)
        this.setVelocityX(this.dir * 110)
      }
      return
    }
    if (this.state === 'slamAir') {
      if (time >= this.slamArmAt && (this.body.blocked.down || time >= this.stateUntil)) {
        this.setVelocity(0, 0)
        this.scene.spawnSlam(this.x, this.y)
        this.state = 'recover'
        this.stateUntil = time + RECOVER
      }
      return
    }
    if (this.state === 'windupSpit') {
      this.setVelocityX(0)
      if (time >= this.stateUntil) {
        const p = this.scene.player
        if (p && !p.dead) this.scene.spawnVenom(this.x, this.y - 24, p.x, p.y - 10, this.cfg.venom)
        this.state = 'recover'
        this.stateUntil = time + RECOVER
      }
      return
    }
    if (this.state === 'windupVolley') {
      this.setVelocityX(0)
      if (time >= this.stateUntil) {
        const p = this.scene.player
        if (p && !p.dead) this.scene.spawnVolley(this.x, this.y - 24, p.x, p.y - 10, this.cfg.venom)
        this.state = 'recover'
        this.stateUntil = time + RECOVER
      }
      return
    }
    if (this.state === 'recover') {
      this.setVelocityX(0)
      if (time >= this.stateUntil) this.state = 'patrol'
      return
    }

    // --- patrol, and decide whether to start an attack ---
    const p = this.scene.player
    const canAttack = p && !p.dead && p.controllable && !this.scene.cleared
    if (canAttack) {
      const dx = p.x - this.x
      const ad = Math.abs(dx)
      if (Math.abs(p.y - this.y) < SAME_LEVEL && ad < DETECT) {
        const fdir = dx < 0 ? -1 : 1
        if (this.cfg.lunge && ad <= MELEE && time >= this.nextLungeAt) {
          this.face(fdir)
          this.beginAttack('windupLunge', LUNGE_WINDUP)
          this.nextLungeAt = time + LUNGE_CD
          return
        }
        if (this.cfg.slam && ad <= SLAM_RANGE && time >= this.nextSlamAt) {
          this.face(fdir)
          this.beginAttack('windupSlam', SLAM_WINDUP)
          this.nextSlamAt = time + SLAM_CD
          return
        }
        if (this.cfg.spit && ad > SPIT_MIN && ad < SPIT_MAX && time >= this.nextSpitAt) {
          this.face(fdir)
          if (this.cfg.volley && time >= this.nextVolleyAt) {
            this.beginAttack('windupVolley', VOLLEY_WINDUP)
            this.nextVolleyAt = time + VOLLEY_CD
          } else {
            this.beginAttack('windupSpit', SPIT_WINDUP)
          }
          this.nextSpitAt = time + SPIT_CD
          return
        }
      }
    }

    if (this.body.blocked.left) this.face(1)
    else if (this.body.blocked.right) this.face(-1)
    else if (this.body.blocked.down && !this.aheadIsSolid()) this.face(-this.dir)

    this.setVelocityX(this.speed * this.dir)
    this.play(this.cfg.walk, true)
  }

  aheadIsSolid() {
    const aheadX = this.x + this.dir * (this.body.halfWidth + 3)
    return this.scene.isSolidAtPixel(aheadX, this.body.bottom + 4)
  }

  beginAttack(state, windup) {
    this.state = state
    this.stateUntil = this.scene.time.now + windup
    this.setVelocityX(0)
    // telegraph: brief squash + warning flash so the player can react
    this.scene.tweens.add({
      targets: this,
      scaleX: this.baseScale * 1.18,
      scaleY: this.baseScale * 0.88,
      yoyo: true,
      duration: windup / 2,
    })
    this.setTint(0xfff0a6)
    this.scene.time.delayedCall(windup - 20, () => {
      if (!this.dead) this.clearTint()
    })
  }

  face(dir) {
    this.dir = dir
    this.setFlipX(dir > 0)
  }

  hurt(amount, isCrit, fromX) {
    if (this.dead) return
    this.hp -= amount
    CombatSystem.floatingNumber(this.scene, this.x, this.y - 30, amount, { crit: isCrit })

    const away = this.x < fromX ? -1 : 1
    this.setVelocityX(away * 90)
    this.setVelocityY(-110)

    this.setTintFill(0xffffff)
    this.scene.time.delayedCall(70, () => {
      if (!this.dead) this.clearTint()
    })

    if (this.hp <= 0) this.die()
  }

  die() {
    this.dead = true
    this.lungeActive = false
    this.clearTint()
    this.setVelocity(0, 0)
    this.body.enable = false
    this.scene.events.emit('enemy-died', this)
    this.play(this.cfg.death)
    this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.scene.tweens.add({
        targets: this,
        alpha: 0,
        duration: 180,
        ease: 'Quad.in',
        onComplete: () => this.destroy(),
      })
    })
  }
}
