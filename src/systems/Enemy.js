import Phaser from 'phaser'
import { CombatSystem } from './CombatSystem.js'

const PATROL_SPEED = 40
const SCALE = 0.68

// Marsh enemy: the Ooze creature (trimmed boss sheets). Native art faces LEFT,
// so flipX is true when moving right. Patrol/HP/death contract matches what the
// scene expects; per-world variants (Demon, Mage) can reuse this shape later.
export default class Enemy extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    super(scene, x, y, 'ooze-walk')
    scene.add.existing(this)
    scene.physics.add.existing(this)

    this.setScale(SCALE)
    this.setDepth(8)
    // Body inset from the 64x50 cell, bottom-anchored to the creature's base.
    this.body.setSize(40, 30).setOffset(12, 20)
    this.setCollideWorldBounds(true)

    this.maxHp = 30
    this.hp = this.maxHp
    this.contactDamage = 12
    this.dead = false
    this.dir = Math.random() < 0.5 ? -1 : 1
    this.face(this.dir)

    this.play('ooze-walk')
  }

  preUpdate(time, delta) {
    super.preUpdate(time, delta)
    if (this.dead) return

    if (this.body.blocked.left) this.face(1)
    else if (this.body.blocked.right) this.face(-1)
    else if (this.body.blocked.down) {
      const aheadX = this.x + this.dir * (this.body.halfWidth + 3)
      const belowY = this.body.bottom + 4
      if (!this.scene.isSolidAtPixel(aheadX, belowY)) this.face(-this.dir)
    }

    this.setVelocityX(PATROL_SPEED * this.dir)
  }

  face(dir) {
    this.dir = dir
    this.setFlipX(dir > 0)
  }

  hurt(amount, isCrit, fromX) {
    if (this.dead) return
    this.hp -= amount
    CombatSystem.floatingNumber(this.scene, this.x, this.y - 18, amount, { crit: isCrit })

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
