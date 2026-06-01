import Phaser from 'phaser'

const SPEED = 165
const JUMP_V = 430
const COYOTE_MS = 80
const BUFFER_MS = 120
const MAX_JUMPS = 2

export default class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, charKey) {
    super(scene, x, y, `${charKey}-idle`)
    this.charKey = charKey
    scene.add.existing(this)
    scene.physics.add.existing(this)

    this.setCollideWorldBounds(true)
    this.body.setSize(16, 24).setOffset(8, 8)
    this.setDepth(10)

    this.lastGroundedAt = -1e9
    this.lastJumpAt = -1e9
    this.jumpsUsed = 0
    this.facing = 1
    this.dead = false

    this.cursors = scene.input.keyboard.createCursorKeys()
    this.keys = scene.input.keyboard.addKeys({ w: 'W', a: 'A', d: 'D' })

    this.play(`${charKey}-idle`)
  }

  preUpdate(time, delta) {
    super.preUpdate(time, delta)
    if (this.dead) return

    const onGround = this.body.blocked.down
    if (onGround) {
      this.lastGroundedAt = time
      this.jumpsUsed = 0
    }

    const left = this.cursors.left.isDown || this.keys.a.isDown
    const right = this.cursors.right.isDown || this.keys.d.isDown
    if (left && !right) {
      this.setVelocityX(-SPEED)
      this.facing = -1
      this.setFlipX(true)
    } else if (right && !left) {
      this.setVelocityX(SPEED)
      this.facing = 1
      this.setFlipX(false)
    } else {
      this.setVelocityX(0)
    }

    const jumpPressed =
      Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
      Phaser.Input.Keyboard.JustDown(this.cursors.space) ||
      Phaser.Input.Keyboard.JustDown(this.keys.w)
    if (jumpPressed) this.lastJumpAt = time

    const buffered = time - this.lastJumpAt <= BUFFER_MS
    const coyote = time - this.lastGroundedAt <= COYOTE_MS
    if (buffered) {
      if (this.jumpsUsed === 0 && (onGround || coyote)) this.doJump(false)
      else if (this.jumpsUsed >= 1 && this.jumpsUsed < MAX_JUMPS) this.doJump(true)
    }

    // Variable jump height: releasing while rising cuts the ascent.
    const jumpHeld =
      this.cursors.up.isDown || this.cursors.space.isDown || this.keys.w.isDown
    if (!jumpHeld && this.body.velocity.y < 0) {
      this.setVelocityY(this.body.velocity.y * 0.5)
    }

    this.animate(onGround)
  }

  doJump(isDouble) {
    this.setVelocityY(-JUMP_V)
    this.jumpsUsed = isDouble ? this.jumpsUsed + 1 : 1
    this.lastJumpAt = -1e9
    this.lastGroundedAt = -1e9
    if (isDouble) this.play(`${this.charKey}-doublejump`, true)
    this.scene.events.emit('player-jump')
  }

  animate(onGround) {
    if (this.dead) return
    if (!onGround) {
      const cur = this.anims.currentAnim?.key
      if (cur === `${this.charKey}-doublejump` && this.anims.isPlaying) return
      this.play(`${this.charKey}-${this.body.velocity.y < 0 ? 'jump' : 'fall'}`, true)
    } else if (Math.abs(this.body.velocity.x) > 10) {
      this.play(`${this.charKey}-run`, true)
    } else {
      this.play(`${this.charKey}-idle`, true)
    }
  }
}
