import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../config.js'
import { addBackdrop, panelButton, pixelText } from '../ui/widgets.js'
import { Audio, SFX } from '../systems/AudioSystem.js'
import { CombatSystem } from '../systems/CombatSystem.js'
import WarUnit, { UNIT_TYPES } from '../systems/WarUnit.js'

const GROUND_Y = 300
const BASE_MAX_HP = 300
const START_COINS = 100
const INCOME_RATE = 8 // coins per second
const PROJ_SPEED = 240

// A self-contained Age of War lane battle: spend coins to spawn monsters that
// march right and fight an AI that spawns from the left-facing right base.
export default class AgeOfWarScene extends Phaser.Scene {
  constructor() {
    super('AgeOfWar')
  }

  create() {
    // Anchors read by WarUnit.
    this.PLAYER_SPAWN_X = 80
    this.ENEMY_SPAWN_X = GAME_WIDTH - 80
    this.PLAYER_BASE_HIT_X = 66
    this.ENEMY_BASE_HIT_X = GAME_WIDTH - 66

    this.gameOver = false
    this.playerUnits = []
    this.enemyUnits = []
    this.projectiles = []
    this.playerCoins = START_COINS
    this.enemyCoins = START_COINS
    this.incomeAccum = 0
    this.enemyIncomeAccum = 0
    this.aiElapsed = 0
    this.aiNextSpawnAt = 0
    this.playerBaseHp = BASE_MAX_HP
    this.enemyBaseHp = BASE_MAX_HP

    addBackdrop(this, 'bg-gray', 0.35)
    this.add.rectangle(0, GROUND_Y, GAME_WIDTH, GAME_HEIGHT - GROUND_Y, 0x241f33).setOrigin(0, 0).setDepth(0)
    this.add.rectangle(0, GROUND_Y, GAME_WIDTH, 3, 0x3c3357).setOrigin(0, 0).setDepth(1)

    this.buildBase(40, 0x5a86c8, 'player')
    this.buildBase(GAME_WIDTH - 40, 0xc8625a, 'enemy')

    pixelText(this, GAME_WIDTH / 2, 16, 'AGE OF WAR', 12, '#ffe066')
    this.coinText = pixelText(this, 12, 14, 'COINS 100', 9, '#ffe066').setOrigin(0, 0.5)

    this.buildBuyBar()
    panelButton(this, GAME_WIDTH - 40, 16, 'MENU', () => this.scene.start('MainMenu'), { size: 8, width: 64 })
  }

  buildBase(x, color, side) {
    const tower = this.add.rectangle(x, GROUND_Y, 36, 64, color).setOrigin(0.5, 1).setDepth(2)
    tower.setStrokeStyle(2, 0x1a1426)
    this.add.rectangle(x, GROUND_Y - 74, 44, 7, 0x141a2c).setDepth(3)
    const fill = this.add.rectangle(x - 21, GROUND_Y - 74, 42, 5, 0x7cfc98).setOrigin(0, 0.5).setDepth(4)
    if (side === 'player') this.playerBaseFill = fill
    else this.enemyBaseFill = fill
  }

  buildBuyBar() {
    const keys = ['slime', 'spitter', 'mage', 'demon']
    const gap = 8
    const bw = 110
    const totalW = keys.length * bw + (keys.length - 1) * gap
    let x = GAME_WIDTH / 2 - totalW / 2 + bw / 2
    this.buyButtons = []
    for (const k of keys) {
      const cfg = UNIT_TYPES[k]
      const btn = panelButton(this, x, GAME_HEIGHT - 22, `${cfg.label} ${cfg.cost}`, () => this.buyUnit(k), {
        size: 8,
        width: bw,
      })
      this.buyButtons.push({ key: k, cfg, btn, affordable: true })
      x += bw + gap
    }
  }

  buyUnit(type) {
    if (this.gameOver) return
    const cfg = UNIT_TYPES[type]
    if (this.playerCoins < cfg.cost) {
      Audio.play(this, SFX.rollover)
      return
    }
    this.playerCoins -= cfg.cost
    this.spawnUnit(type, 'player')
    Audio.play(this, SFX.click)
  }

  spawnUnit(type, side) {
    const u = new WarUnit(this, type, side, GROUND_Y)
    ;(side === 'player' ? this.playerUnits : this.enemyUnits).push(u)
  }

  spawnWarProjectile(from, target) {
    const orb = this.add
      .image(from.x, from.y - from.displayHeight * 0.6, 'venom')
      .setDepth(9)
      .setScale(from.cfg.scale)
    if (from.cfg.projTint) orb.setTint(from.cfg.projTint)
    orb._target = target
    orb._side = from.side
    orb._dmg = from.cfg.attack
    orb._type = from.type
    orb._tintColor = from.cfg.projTint || 0xffffff
    orb._life = 0
    this.tweens.add({ targets: orb, angle: 360, duration: 600, repeat: -1 })
    this.projectiles.push(orb)
  }

  updateProjectiles(delta) {
    const dt = delta / 1000
    for (const orb of [...this.projectiles]) {
      if (!orb.active) {
        this.killProj(orb)
        continue
      }
      orb._life += dt
      let tgt = orb._target
      if (!tgt || tgt.dead || !tgt.active) {
        tgt = this.nearestUnitForProjectile(orb)
        orb._target = tgt
      }
      if (tgt) {
        const tx = tgt.x
        const ty = tgt.y - tgt.displayHeight * 0.5
        const ang = Math.atan2(ty - orb.y, tx - orb.x)
        orb.x += Math.cos(ang) * PROJ_SPEED * dt
        orb.y += Math.sin(ang) * PROJ_SPEED * dt
        if (Math.abs(orb.x - tx) <= 16 && Math.abs(orb.y - ty) <= 16) {
          const { amount, isCrit } = CombatSystem.roll(orb._dmg, { critChance: orb._type === 'mage' ? 0.18 : 0.08 })
          tgt.hurt(amount, isCrit)
          CombatSystem.puff(this, orb.x, orb.y, orb._tintColor)
          this.killProj(orb)
          continue
        }
      } else {
        orb.x += (orb._side === 'player' ? 1 : -1) * PROJ_SPEED * dt
      }
      if (orb.x < -20 || orb.x > GAME_WIDTH + 20 || orb._life > 2.5) this.killProj(orb)
    }
  }

  nearestUnitForProjectile(orb) {
    const foes = orb._side === 'player' ? this.enemyUnits : this.playerUnits
    let best = null
    let bd = Infinity
    for (const o of foes) {
      if (!o || o.dead || !o.active) continue
      const d = Math.abs(o.x - orb.x)
      if (d < bd) {
        bd = d
        best = o
      }
    }
    return best
  }

  killProj(orb) {
    const i = this.projectiles.indexOf(orb)
    if (i >= 0) this.projectiles.splice(i, 1)
    if (orb.active) orb.destroy()
  }

  damageBase(side, amount) {
    if (this.gameOver) return
    if (side === 'enemy') this.enemyBaseHp = Math.max(0, this.enemyBaseHp - amount)
    else this.playerBaseHp = Math.max(0, this.playerBaseHp - amount)
    CombatSystem.shake(this, 0.004, 90)
    if (this.enemyBaseHp <= 0) this.endGame(true)
    else if (this.playerBaseHp <= 0) this.endGame(false)
  }

  onUnitKilled(deadSide, reward) {
    // Killer is the opposing side of whoever died.
    if (deadSide === 'player') this.enemyCoins += reward
    else this.playerCoins += reward
  }

  // Weighted AI pick that ramps toward stronger units as the match drags on.
  aiPickUnit() {
    const t = this.aiElapsed
    const pool = []
    const add = (k, w) => {
      for (let i = 0; i < w; i++) pool.push(k)
    }
    add('slime', 4)
    add('spitter', t > 10 ? 3 : 1)
    add('mage', t > 20 ? 3 : 1)
    add('demon', t > 30 ? 3 : 0)
    const affordable = pool.filter((k) => this.enemyCoins >= UNIT_TYPES[k].cost)
    if (!affordable.length) return null
    const idx = Math.floor((t * 7.13 + this.enemyCoins * 0.37) % affordable.length)
    return affordable[idx]
  }

  runAi(time, dtSec) {
    this.aiElapsed += dtSec
    if (time < this.aiNextSpawnAt) return
    const pick = this.aiPickUnit()
    if (pick) {
      this.enemyCoins -= UNIT_TYPES[pick].cost
      this.spawnUnit(pick, 'enemy')
    }
    this.aiNextSpawnAt = time + Math.max(800, 2400 - this.aiElapsed * 26)
  }

  endGame(won) {
    if (this.gameOver) return
    this.gameOver = true
    Audio.play(this, won ? SFX.clear : SFX.playerDie)
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0b0d1a, 0.7).setOrigin(0, 0).setDepth(20)
    pixelText(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 30, won ? 'VICTORY' : 'DEFEAT', 24, won ? '#ffe066' : '#e06a6a').setDepth(21)
    panelButton(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 16, 'RESTART', () => this.scene.restart(), { width: 150, depth: 21 })
    panelButton(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 52, 'MAIN MENU', () => this.scene.start('MainMenu'), { width: 150, depth: 21 })
  }

  update(time, delta) {
    if (this.gameOver) return
    const dtSec = delta / 1000

    this.incomeAccum += INCOME_RATE * dtSec
    while (this.incomeAccum >= 1) {
      this.playerCoins++
      this.incomeAccum--
    }
    this.enemyIncomeAccum += (INCOME_RATE + this.aiElapsed * 0.05) * dtSec
    while (this.enemyIncomeAccum >= 1) {
      this.enemyCoins++
      this.enemyIncomeAccum--
    }

    this.runAi(time, dtSec)

    for (const u of [...this.playerUnits]) u.update(time, delta)
    for (const u of [...this.enemyUnits]) u.update(time, delta)
    this.updateProjectiles(delta)

    this.coinText.setText('COINS ' + this.playerCoins)
    this.playerBaseFill.width = 42 * (this.playerBaseHp / BASE_MAX_HP)
    this.enemyBaseFill.width = 42 * (this.enemyBaseHp / BASE_MAX_HP)

    for (const b of this.buyButtons) {
      const ok = this.playerCoins >= b.cfg.cost
      if (ok !== b.affordable) {
        b.affordable = ok
        if (ok) {
          b.btn.bg.clearTint()
          b.btn.text.setColor('#eaf1ff')
        } else {
          b.btn.bg.setTint(0x6d7790)
          b.btn.text.setColor('#566084')
        }
      }
    }
  }
}
