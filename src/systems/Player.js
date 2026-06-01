import Phaser from 'phaser'
import { SaveSystem } from './SaveSystem.js'
import { CombatSystem } from './CombatSystem.js'

const SPEED = 165
const JUMP_V = 430
const COYOTE_MS = 80
const BUFFER_MS = 120
const MAX_JUMPS = 2
const ATTACK_CD = 360
const IFRAME_MS = 700

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
    this.controllable = true

    const stats = SaveSystem.data.player
    this.maxHp = stats.maxHp
    this.hp = this.maxHp
    this.attackPower = stats.attack
    this.attackReadyAt = -1e9
    this.invulnUntil = -1e9

    this.cursors = scene.input.keyboard.createCursorKeys()
    this.keys = scene.input.keyboard.addKeys({ w: 'W', a: 'A', d: 'D', j: 'J', x: 'X' })

    this.play(`${charKey}-idle`)
  }

  preUpdate(time, delta) {
    super.preUpdate(time, delta)
    if (this.dead) return
    if (!this.controllable) {
      this.setVelocityX(0)
      this.animate(this.body.blocked.down)
      return
    }

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

    const attackPressed =
      Phaser.Input.Keyboard.JustDown(this.keys.j) ||
      Phaser.Input.Keyboard.JustDown(this.keys.x)
    if (attackPressed) this.attack(time)

    this.animate(onGround)
  }

  freeze() {
    this.controllable = false
    this.setVelocityX(0)
  }

  attack(time) {
    if (this.dead || time < this.attackReadyAt) return
    this.attackReadyAt = time + ATTACK_CD
    this.scene.events.emit('player-attack', { x: this.x, y: this.y, facing: this.facing })
  }

  hit(amount, fromX, time) {
    if (this.dead || time < this.invulnUntil) return
    this.hp = Math.max(0, this.hp - amount)
    this.invulnUntil = time + IFRAME_MS
    CombatSystem.floatingNumber(this.scene, this.x, this.y - 16, amount, { color: '#e06a6a' })

    const away = this.x < fromX ? -1 : 1
    this.setVelocityX(away * 160)
    this.setVelocityY(-190)
    this.play(`${this.charKey}-hit`, true)
    this.scene.events.emit('player-hp', { hp: this.hp, maxHp: this.maxHp })

    this.scene.tweens.add({
      targets: this,
      alpha: 0.35,
      yoyo: true,
      repeat: 5,
      duration: 90,
      onComplete: () => this.setAlpha(1),
    })

    if (this.hp <= 0) this.die()
  }

  die() {
    if (this.dead) return
    this.dead = true
    this.setVelocity(0, -260)
    this.body.checkCollision.none = true
    this.play(`${this.charKey}-hit`, true)
    this.scene.tweens.add({ targets: this, angle: 180, alpha: 0, duration: 750, ease: 'Quad.in' })
    this.scene.events.emit('player-dead')
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
