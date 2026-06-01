import Phaser from 'phaser'
import { SaveSystem } from './SaveSystem.js'
import { CombatSystem } from './CombatSystem.js'

const MAX_SPEED = 170
const ACCEL_GROUND = 1700
const ACCEL_AIR = 620
const DRAG_GROUND = 1900
const DRAG_AIR = 150
const JUMP_V = 430
const COYOTE_MS = 80
const BUFFER_MS = 120
const MAX_JUMPS = 2
const CD_SLASH = 260
const CD_UP = 300
const CD_DIVE = 360
const CD_HEAVY = 580
const COMBO_WINDOW = 520
const CLIMB_SPEED = 95
const IFRAME_MS = 700

export default class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, charKey) {
    super(scene, x, y, `${charKey}-idle`)
    this.charKey = charKey
    scene.add.existing(this)
    scene.physics.add.existing(this)

    this.setCollideWorldBounds(true)
    this.body.setSize(16, 24).setOffset(8, 8)
    this.body.setMaxVelocity(MAX_SPEED, 1000)
    this.setDragX(DRAG_GROUND)
    this.setDepth(10)

    this.lastGroundedAt = -1e9
    this.lastJumpAt = -1e9
    this.jumpsUsed = 0
    this.facing = 1
    this.dead = false
    this.controllable = true
    this.comboCount = 0
    this.comboExpireAt = -1e9
    this.diving = false
    this.jumpCutAvailable = false
    this.climbing = false
    this.dropThrough = false
    this.leftLadderGrace = false

    const stats = SaveSystem.data.player
    this.maxHp = stats.maxHp
    this.hp = this.maxHp
    this.attackPower = stats.attack
    this.attackReadyAt = -1e9
    this.invulnUntil = -1e9

    this.cursors = scene.input.keyboard.createCursorKeys()
    this.keys = scene.input.keyboard.addKeys({ w: 'W', a: 'A', s: 'S', d: 'D', j: 'J', k: 'K', x: 'X' })

    this.play(`${charKey}-idle`)
  }

  preUpdate(time, delta) {
    super.preUpdate(time, delta)
    if (this.dead) return
    if (!this.controllable) {
      this.setAccelerationX(0)
      this.setVelocityX(0)
      this.animate(this.body.blocked.down)
      return
    }

    const onGround = this.body.blocked.down
    if (onGround) {
      this.lastGroundedAt = time
      this.jumpsUsed = 0
      this.diving = false
      this.jumpCutAvailable = false
      this.leftLadderGrace = false
    }

    // --- Ladder climbing: grab when on a ladder and pressing up/down; while
    // climbing, gravity is off and movement is fully vertical until you step
    // off, reach the end, or hop away. It overrides normal movement.
    const wantUp = this.cursors.up.isDown || this.keys.w.isDown
    const wantDown = this.cursors.down.isDown || this.keys.s.isDown
    const onLadder = this.scene.isLadderAtPixel(this.x, this.y)
    this.dropThrough = wantDown && !this.climbing
    if (this.climbing) {
      this.updateClimb(wantUp, wantDown, onLadder)
      return
    }
    if (onLadder && (wantUp || wantDown)) {
      this.startClimb()
      this.updateClimb(wantUp, wantDown, onLadder)
      return
    }

    // Acceleration + drag give momentum: snappy on the ground, but in the air
    // you can't instantly reverse or stop — you carry your speed and steer it.
    const left = this.cursors.left.isDown || this.keys.a.isDown
    const right = this.cursors.right.isDown || this.keys.d.isDown
    const accel = onGround ? ACCEL_GROUND : ACCEL_AIR
    if (left && !right) {
      this.setAccelerationX(-accel)
      this.facing = -1
      this.setFlipX(true)
    } else if (right && !left) {
      this.setAccelerationX(accel)
      this.facing = 1
      this.setFlipX(false)
    } else {
      this.setAccelerationX(0)
    }
    this.setDragX(onGround ? DRAG_GROUND : DRAG_AIR)

    const jumpPressed =
      Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
      Phaser.Input.Keyboard.JustDown(this.cursors.space) ||
      Phaser.Input.Keyboard.JustDown(this.keys.w)
    if (jumpPressed) this.lastJumpAt = time

    const buffered = time - this.lastJumpAt <= BUFFER_MS
    const coyote = time - this.lastGroundedAt <= COYOTE_MS
    if (buffered) {
      if (this.jumpsUsed === 0 && (onGround || coyote || this.leftLadderGrace)) this.doJump(false)
      else if (this.jumpsUsed >= 1 && this.jumpsUsed < MAX_JUMPS) this.doJump(true)
    }

    // Variable jump height: releasing while rising cuts the ascent.
    const jumpHeld =
      this.cursors.up.isDown || this.cursors.space.isDown || this.keys.w.isDown
    if (this.jumpCutAvailable && !jumpHeld && this.body.velocity.y < 0) {
      this.setVelocityY(this.body.velocity.y * 0.5)
    }

    const lightPressed =
      Phaser.Input.Keyboard.JustDown(this.keys.j) ||
      Phaser.Input.Keyboard.JustDown(this.keys.x)
    const heavyPressed = Phaser.Input.Keyboard.JustDown(this.keys.k)
    if (heavyPressed) this.attack(time, 'heavy')
    else if (lightPressed) this.attack(time, 'light')

    this.animate(onGround)
  }

  freeze() {
    this.controllable = false
    this.stopClimb()
    this.setAccelerationX(0)
    this.setVelocityX(0)
  }

  startClimb() {
    this.climbing = true
    this.body.setAllowGravity(false)
    this.setAccelerationX(0)
    this.setVelocity(0, 0)
    this.jumpsUsed = 0
  }

  stopClimb() {
    this.climbing = false
    this.body.setAllowGravity(true)
  }

  updateClimb(up, down, onLadder) {
    if (!onLadder) {
      this.stopClimb()
      // Stepped off the side/end of a ladder into open air: hand back a fresh
      // ground-style jump (plus the usual air jump) so you're never stranded.
      if (!this.body.blocked.down) {
        this.jumpsUsed = 0
        this.leftLadderGrace = true
      }
      return
    }
    // Hop off the ladder with Space (Up/W are reserved for climbing up). The hop
    // counts as the first jump, leaving the air jump available on the way down.
    if (Phaser.Input.Keyboard.JustDown(this.cursors.space)) {
      this.stopClimb()
      this.setVelocityY(-JUMP_V * 0.85)
      this.jumpCutAvailable = true
      this.jumpsUsed = 1
      this.scene.events.emit('player-jump')
      return
    }
    this.setVelocityY(up ? -CLIMB_SPEED : down ? CLIMB_SPEED : 0)
    const left = this.cursors.left.isDown || this.keys.a.isDown
    const right = this.cursors.right.isDown || this.keys.d.isDown
    this.setVelocityX(left ? -60 : right ? 60 : 0)
    this.play(`${this.charKey}-idle`, true)
  }

  attack(time, kind) {
    if (this.dead || time < this.attackReadyAt) return
    const onGround = this.body.blocked.down
    const down = this.cursors.down.isDown || this.keys.s.isDown
    const up = this.cursors.up.isDown || this.keys.w.isDown

    let type, cd
    if (kind === 'heavy') {
      type = 'heavy'
      cd = CD_HEAVY
    } else if (!onGround && down) {
      type = 'dive'
      cd = CD_DIVE
    } else if (up) {
      type = 'up'
      cd = CD_UP
    } else {
      type = 'slash'
      cd = CD_SLASH
    }

    let combo = 0
    if (type === 'slash') {
      this.comboCount = time < this.comboExpireAt ? this.comboCount + 1 : 1
      if (this.comboCount > 3) this.comboCount = 1
      this.comboExpireAt = time + COMBO_WINDOW
      combo = this.comboCount
    } else {
      this.comboCount = 0
    }

    this.attackReadyAt = time + cd

    if (type === 'heavy') this.setVelocityX(this.facing * 110)
    else if (type === 'dive') {
      this.setVelocityY(360)
      this.diving = true
    }

    this.scene.events.emit('player-attack', {
      type,
      combo,
      x: this.x,
      y: this.y,
      facing: this.facing,
    })
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
    this.stopClimb()
    this.setAccelerationX(0)
    this.setVelocity(0, -260)
    this.body.checkCollision.none = true
    this.play(`${this.charKey}-hit`, true)
    this.scene.tweens.add({ targets: this, angle: 180, alpha: 0, duration: 750, ease: 'Quad.in' })
    this.scene.events.emit('player-dead')
  }

  doJump(isDouble) {
    this.setVelocityY(-JUMP_V)
    this.jumpsUsed = isDouble ? this.jumpsUsed + 1 : 1
    this.jumpCutAvailable = true
    this.leftLadderGrace = false
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
