import Phaser from 'phaser'
import { CombatSystem } from './CombatSystem.js'

const PATROL_SPEED = 42

// Placeholder blob-slime. Swap for the Pixel Adventure 2 enemy pack later;
// the patrol/HP/death contract here stays the same.
export default class Slime extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, tint = 0xffffff) {
    super(scene, x, y, 'slime')
    scene.add.existing(this)
    scene.physics.add.existing(this)

    this.baseTint = tint
    this.setTint(tint)
    this.setDepth(8)
    this.body.setSize(18, 12).setOffset(3, 5)
    this.setCollideWorldBounds(true)

    this.maxHp = 30
    this.hp = this.maxHp
    this.contactDamage = 12
    this.dead = false
    this.dir = Math.random() < 0.5 ? -1 : 1
    this.setFlipX(this.dir < 0)

    this.bob = scene.tweens.add({
      targets: this,
      scaleY: 0.86,
      scaleX: 1.1,
      yoyo: true,
      repeat: -1,
      duration: 520,
      ease: 'Sine.inOut',
    })
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
    this.setFlipX(dir < 0)
  }

  hurt(amount, isCrit, fromX) {
    if (this.dead) return
    this.hp -= amount
    CombatSystem.floatingNumber(this.scene, this.x, this.y - 12, amount, { crit: isCrit })

    const away = this.x < fromX ? -1 : 1
    this.setVelocityX(away * 90)
    this.setVelocityY(-110)

    this.setTintFill(0xffffff)
    this.scene.time.delayedCall(70, () => {
      if (!this.dead) this.setTint(this.baseTint)
    })

    if (this.hp <= 0) this.die()
  }

  die() {
    this.dead = true
    this.bob?.stop()
    this.setTint(this.baseTint)
    this.body.enable = false
    CombatSystem.puff(this.scene, this.x, this.y, this.baseTint)
    this.scene.events.emit('enemy-died', this)
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      scaleX: 1.4,
      scaleY: 0.4,
      y: this.y + 4,
      duration: 220,
      ease: 'Quad.in',
      onComplete: () => this.destroy(),
    })
  }
}
