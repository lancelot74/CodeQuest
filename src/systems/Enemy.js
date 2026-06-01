import Phaser from 'phaser'
import { CombatSystem } from './CombatSystem.js'

const PATROL_SPEED = 40
const SCALE = 0.68

// Attack tuning
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

// Marsh enemy: the Ooze. Native art faces LEFT (flipX when moving right). It
// patrols, spits a venom orb at range, and lunge-bites up close. Origin is
// bottom-centre so the sprite's y is its feet line — it rests cleanly on the
// floor instead of sinking in.
export default class Enemy extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    super(scene, x, y, 'ooze-walk')
    scene.add.existing(this)
    scene.physics.add.existing(this)

    this.setOrigin(0.5, 1)
    this.setScale(SCALE)
    this.setDepth(8)
    // Body bottom sits on the feet line; inset and centred in the 64x50 cell.
    this.body.setSize(40, 30).setOffset(12, 20)
    this.setCollideWorldBounds(true)

    this.maxHp = 30
    this.hp = this.maxHp
    this.contactDamage = 12
    this.dead = false
    this.dir = Math.random() < 0.5 ? -1 : 1
    this.face(this.dir)

    this.state = 'patrol'
    this.stateUntil = 0
    this.nextLungeAt = 0
    this.nextSpitAt = 0
    this.lungeActive = false

    this.play('ooze-walk')
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
    if (this.state === 'windupSpit') {
      this.setVelocityX(0)
      if (time >= this.stateUntil) {
        const p = this.scene.player
        if (p && !p.dead) this.scene.spawnVenom(this.x, this.y - 24, p.x, p.y - 10)
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
        if (ad <= MELEE && time >= this.nextLungeAt) {
          this.face(fdir)
          this.beginAttack('windupLunge', LUNGE_WINDUP)
          this.nextLungeAt = time + LUNGE_CD
          return
        }
        if (ad > SPIT_MIN && ad < SPIT_MAX && time >= this.nextSpitAt) {
          this.face(fdir)
          this.beginAttack('windupSpit', SPIT_WINDUP)
          this.nextSpitAt = time + SPIT_CD
          return
        }
      }
    }

    if (this.body.blocked.left) this.face(1)
    else if (this.body.blocked.right) this.face(-1)
    else if (this.body.blocked.down && !this.aheadIsSolid()) this.face(-this.dir)

    this.setVelocityX(PATROL_SPEED * this.dir)
    this.play('ooze-walk', true)
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
      scaleX: SCALE * 1.18,
      scaleY: SCALE * 0.88,
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
    this.play('ooze-death')
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
