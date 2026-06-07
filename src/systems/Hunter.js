import Phaser from 'phaser'

// The stalker. One per round; its active SENSE and boss SKIN are randomized each
// round. Stealth is the whole game: while it can't sense you it patrols, and only
// once its awareness meter fills does it CHASE and fire the skin's signature attack.
export const SENSES = {
  sight: { key: 'sight', code: 'cobb.sight', color: 0xffd24a, glyph: 'eye' },
  hearing: { key: 'hearing', code: 'cobb.hearing', color: 0x53d2ff, glyph: 'ear' },
  smell: { key: 'smell', code: 'cobb.smell', color: 0xb47cff, glyph: 'nose' },
}

export const SKINS = {
  demon: { walk: 'demon-walk', scale: 0.7, attack: 'wave', body: [26, 22] },
  mage: { walk: 'mage-walk', scale: 0.62, attack: 'volley', body: [24, 22] },
  ooze: { walk: 'ooze-walk', scale: 0.74, attack: 'homing', body: [28, 20] },
}

const SIGHT_RANGE = 250
const HEAR_RANGE = 260
const SMELL_RANGE = 160
const AWARE_UP = 0.85 // per second at full sense signal
const AWARE_DOWN = 0.7 // decay per second when nothing is sensed (forgets faster)
const PATROL_SPEED = 52
const HUNT_SPEED = 92 // suspicious / search drift
const CHASE_SPEED = 116 // slower than a sprint (168) so a chase can be broken
const GIVE_UP = 2.8 // seconds of lost contact before a chase collapses to CALM
const CALM_TIME = 2.2 // cooldown spent wandering before going back on patrol
const RAGE_TIME = 6 // a CHASE (enraged) burns itself out after this long, even if it still sees you
const RAGE_COOLDOWN = 4 // ...then it's winded and can't re-enrage for this long (your escape window)
const STUN_TIME = 3 // on burnout it stands dead-still, meter emptied, for this long before recovering
const ATTACK_RANGE = 220
const ATTACK_CD = 1.7
const WINDUP = 0.28 // telegraph before a detection attack fires (fairness)
const TORCH_SEEN_RANGE = 240 // carrying a lit torch makes you visible within this radius

export default class Hunter extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, skinKey, senseKey) {
    const skin = SKINS[skinKey]
    super(scene, x, y, skin.walk)
    scene.add.existing(this)
    scene.physics.add.existing(this)

    this.skinKey = skinKey
    this.skin = skin
    this.senseKey = senseKey
    this.sense = SENSES[senseKey]

    this.setOrigin(0.5, 0.62).setScale(skin.scale).setDepth(y)
    this.body.setAllowGravity(false)
    this.setCollideWorldBounds(true)
    this.body.setSize(skin.body[0], skin.body[1])
    this.play(skin.walk)

    this.mode = 'PATROL'
    this.awareness = 0
    this.lastCue = { x, y }
    this.patrol = { x, y }
    this.attackTimer = 0
    this.unstick = 0
    this.lostTimer = 0
    this.calmTimer = 0
    this.chaseTimer = 0
    this.rageCooldown = 0
    this.stunTimer = 0

    // sits in the world depth band (below the fog) so darkness hides it like the
    // hunter sprite — you only see the awareness ring when the hunter is actually lit
    this.meter = scene.add.graphics()
  }

  // Per-sense signal in 0..1 plus the cue position the hunter should investigate.
  senseSignal() {
    const s = this.scene
    const p = s.player
    const d = Phaser.Math.Distance.Between(this.x, this.y, p.x, p.y)
    if (this.senseKey === 'sight') {
      if (d > SIGHT_RANGE || !s.playerLit() || !s.losClear(this.x, this.y, p.x, p.y)) return { sig: 0 }
      const near = 1 - d / SIGHT_RANGE
      return { sig: near * (s.playerMoving ? 1 : 0.45), x: p.x, y: p.y }
    }
    if (this.senseKey === 'hearing') {
      if (d > HEAR_RANGE) return { sig: 0 }
      const loud = s.playerLoudness // 0..~1.3
      const sig = loud * (1 - d / HEAR_RANGE)
      return sig > 0.02 ? { sig, x: p.x, y: p.y } : { sig: 0 }
    }
    // smell — follows a decaying scent trail; ignores walls and silence, beaten by distance
    const sc = s.smellQuery(this.x, this.y, SMELL_RANGE)
    if (!sc) return { sig: 0 }
    return { sig: sc.sig, x: sc.x, y: sc.y }
  }

  think(dt) {
    let { sig, x, y } = this.senseSignal()
    // a carried torch betrays you regardless of the active sense, if in line of sight
    const s = this.scene
    if (s.hasTorch) {
      const td = Phaser.Math.Distance.Between(this.x, this.y, s.player.x, s.player.y)
      if (td < TORCH_SEEN_RANGE && s.losClear(this.x, this.y, s.player.x, s.player.y)) {
        const tsig = 1 - td / TORCH_SEEN_RANGE
        if (tsig > sig) {
          sig = tsig
          x = s.player.x
          y = s.player.y
        }
      }
    }
    if (sig > 0) {
      this.awareness = Math.min(1, this.awareness + AWARE_UP * sig * dt)
      this.lastCue = { x, y }
      this.lostTimer = 0
    } else {
      this.awareness = Math.max(0, this.awareness - AWARE_DOWN * dt)
      this.lostTimer += dt
    }

    this.updateMode(sig, dt)

    const p = this.scene.player
    if (this.mode === 'CHASE') {
      // only a live signal pinpoints you; once lost, it runs down the last cue
      const tx = sig > 0 ? p.x : this.lastCue.x
      const ty = sig > 0 ? p.y : this.lastCue.y
      this.moveToward(tx, ty, CHASE_SPEED, dt)
      if (sig > 0) this.tryAttack(dt)
    } else if (this.mode === 'STUNNED') {
      this.body.setVelocity(0, 0) // winded after a rage: frozen in place
    } else if (this.mode === 'CALM') {
      // disengaged: amble to a nearby point until it settles back to patrol
      if (this.moveToward(this.patrol.x, this.patrol.y, PATROL_SPEED * 0.8, dt)) {
        this.patrol = this.scene.randomPatrolPoint(this.x, this.y, 200)
      }
      this.attackTimer = Math.max(0, this.attackTimer - dt)
    } else if (this.mode === 'SUSPICIOUS') {
      this.moveToward(this.lastCue.x, this.lastCue.y, HUNT_SPEED, dt)
    } else if (this.mode === 'SEARCH') {
      if (this.moveToward(this.lastCue.x, this.lastCue.y, HUNT_SPEED * 0.85, dt)) {
        this.lastCue = this.scene.randomPatrolPoint(this.x, this.y, 120)
      }
    } else {
      if (this.moveToward(this.patrol.x, this.patrol.y, PATROL_SPEED, dt)) {
        this.patrol = this.scene.randomPatrolPoint(this.x, this.y, 260)
      }
      this.attackTimer = Math.max(0, this.attackTimer - dt)
    }

    this.setDepth(this.y)
    this.drawMeter()
  }

  // Mode transitions. A CHASE breaks once contact is lost for GIVE_UP seconds (or
  // awareness bleeds below a floor) OR once the rage burns out after RAGE_TIME even
  // with you in plain sight — either way dropping into a CALM cooldown so the hunter
  // visibly loses interest instead of locking on across the whole map forever.
  updateMode(sig, dt) {
    const a = this.awareness
    if (this.rageCooldown > 0) this.rageCooldown -= dt
    // winded after a burnout: frozen in place with an empty meter until STUN_TIME elapses
    if (this.mode === 'STUNNED') {
      this.awareness = 0
      this.stunTimer -= dt
      if (this.stunTimer <= 0) {
        this.mode = 'PATROL'
        this.patrol = this.scene.randomPatrolPoint(this.x, this.y, 200)
      }
      return
    }
    if (this.mode === 'CHASE') {
      this.chaseTimer -= dt
      const lostContact = sig <= 0 && (this.lostTimer > GIVE_UP || a < 0.35)
      if (this.chaseTimer <= 0) {
        // rage ran its course: stop dead, drop the meter to zero, then recover
        this.mode = 'STUNNED'
        this.stunTimer = STUN_TIME
        this.awareness = 0
        this.rageCooldown = RAGE_COOLDOWN
        this.body.setVelocity(0, 0)
      } else if (lostContact) {
        this.mode = 'CALM'
        this.calmTimer = CALM_TIME
        this.awareness = Math.min(this.awareness, 0.25)
        this.patrol = this.scene.randomPatrolPoint(this.x, this.y, 180)
      }
      return
    }
    if (this.mode === 'CALM') {
      this.calmTimer -= dt
      if (a >= 1 && this.rageCooldown <= 0) this.enrage()
      else if (this.calmTimer <= 0) this.mode = a >= 0.45 ? 'SUSPICIOUS' : 'PATROL'
      return
    }
    if (a >= 1 && this.rageCooldown <= 0) this.enrage()
    else if (a >= 0.45) this.mode = 'SUSPICIOUS'
    else if (a > 0.08) this.mode = 'SEARCH'
    else this.mode = 'PATROL'
  }

  enrage() {
    this.mode = 'CHASE'
    this.chaseTimer = RAGE_TIME
  }

  // A thrown lure yanks attention to a point. Breaks a chase lock down into an
  // investigate so noise can be used to peel the hunter off you.
  distract(x, y) {
    this.lastCue = { x, y }
    this.lostTimer = 0
    if (this.mode === 'CHASE') {
      this.awareness = 0.7
      this.mode = 'SUSPICIOUS'
    } else {
      this.awareness = Math.max(this.awareness, 0.6)
      if (this.mode === 'PATROL' || this.mode === 'CALM') this.mode = 'SUSPICIOUS'
    }
  }

  moveToward(tx, ty, speed, dt) {
    const dx = tx - this.x
    const dy = ty - this.y
    const d = Math.hypot(dx, dy) || 1
    if (d < 8) {
      this.body.setVelocity(0, 0)
      return true
    }
    let vx = (dx / d) * speed
    let vy = (dy / d) * speed
    if (this.unstick > 0) {
      this.unstick -= dt
      vx += (-dy / d) * speed * 0.7
      vy += (dx / d) * speed * 0.7
    }
    this.body.setVelocity(vx, vy)
    if (this.body.blocked.left || this.body.blocked.right || this.body.blocked.up || this.body.blocked.down) {
      if (this.unstick <= 0) this.unstick = 0.32
    }
    if (Math.abs(vx) > 4) this.flipX = vx < 0
    return false
  }

  tryAttack(dt) {
    this.attackTimer = Math.max(0, this.attackTimer - dt)
    const p = this.scene.player
    const d = Phaser.Math.Distance.Between(this.x, this.y, p.x, p.y)
    if (this.attackTimer > 0 || d > ATTACK_RANGE) return
    this.attackTimer = ATTACK_CD
    this.setTint(0xffffff)
    this.scene.time.delayedCall(WINDUP * 1000, () => {
      if (!this.active) return
      this.clearTint()
      this.scene.spawnHunterAttack(this)
    })
  }

  drawMeter() {
    const g = this.meter
    g.clear()
    g.setDepth(this.y + 1)
    if (this.awareness <= 0.04) return
    const cx = this.x
    const cy = this.y - this.displayHeight * 0.62 - 8
    const r = 10
    g.lineStyle(3, 0x0a0c14, 0.65).strokeCircle(cx, cy, r)
    const col = this.mode === 'CHASE' ? 0xff3b3b : this.sense.color
    g.lineStyle(3, col, 1)
    g.beginPath()
    g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * this.awareness, false)
    g.strokePath()
  }

  destroy(fromScene) {
    if (this.meter) this.meter.destroy()
    super.destroy(fromScene)
  }
}
