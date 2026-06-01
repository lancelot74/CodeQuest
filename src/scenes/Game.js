import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../config.js'
import { SaveSystem } from '../systems/SaveSystem.js'
import { ContentLoader } from '../systems/ContentLoader.js'
import Player from '../systems/Player.js'
import Enemy from '../systems/Enemy.js'
import { CombatSystem } from '../systems/CombatSystem.js'
import { TERRAIN_THEMES, TILE } from '../utils/tiles.js'
import { pixelText } from '../ui/widgets.js'
import { showLessonCard } from '../ui/domOverlay.js'

const XP_PER_SLIME = 8

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('Game')
  }

  init(data) {
    this.worldId = data?.worldId || 'matlab'
    this.levelId = data?.levelId || 'matlab-01'
  }

  preload() {
    this.load.json(`level-${this.levelId}`, `data/levels/${this.levelId}.json`)
  }

  create() {
    const content = new ContentLoader(this)
    this.worldDef = content.world(this.worldId)
    this.level = this.cache.json.get(`level-${this.levelId}`)

    if (!this.level || !this.level.layout) {
      this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, `Level "${this.levelId}" failed to load`, {
          fontFamily: '"Press Start 2P"',
          fontSize: '10px',
          color: '#e06a6a',
        })
        .setOrigin(0.5)
      return
    }

    this.buildBackground()
    this.buildTerrain()

    const charKey = SaveSystem.data.character || 'ninja'
    this.player = new Player(this, this.spawn.x, this.spawn.y, charKey)
    this.physics.add.collider(this.player, this.solids)
    this.physics.add.collider(this.player, this.oneways, undefined, this.oneWayProcess, this)

    this.spawnEnemies()
    this.physics.add.collider(this.enemies, this.solids)
    this.physics.add.overlap(this.player, this.enemies, this.onTouchEnemy, undefined, this)

    this.projectiles = this.physics.add.group()
    this.physics.add.overlap(this.player, this.projectiles, this.onVenomHit, undefined, this)
    this.physics.add.collider(this.projectiles, this.solids, (orb) => this.popVenom(orb))

    this.events.off('player-attack', this.onPlayerAttack, this)
    this.events.on('player-attack', this.onPlayerAttack, this)
    this.events.off('player-dead', this.onPlayerDead, this)
    this.events.once('player-dead', this.onPlayerDead, this)
    this.events.off('enemy-died', this.onEnemyDied, this)
    this.events.on('enemy-died', this.onEnemyDied, this)

    this.cameras.main.setBounds(0, 0, this.worldW, this.worldH)
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12)
    this.cameras.main.setDeadzone(70, 50)

    this.buildPortal()
    this.setupObjective()

    this.scene.launch('HUD')
    this.events.once('shutdown', () => this.scene.stop('HUD'))

    this.showControlsHint()
  }

  showControlsHint() {
    const t = pixelText(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT - 16,
      'Move A/D  Jump W  Climb W/S  Drop S  Slash J  Up W+J  Dive S+J  Heavy K',
      7,
      '#aebbd6',
    )
      .setScrollFactor(0)
      .setDepth(45)
    this.tweens.add({
      targets: t,
      alpha: 0,
      delay: 4200,
      duration: 1000,
      onComplete: () => t.destroy(),
    })
  }

  setupObjective() {
    this.cleared = false
    this.objective = this.level.objective || { type: 'reachPortal' }
    if (this.exitPos) {
      this.portalZone = this.add.zone(this.exitPos.x, this.exitPos.y, TILE, TILE * 2)
      this.physics.add.existing(this.portalZone, true)
      this.physics.add.overlap(this.player, this.portalZone, () => this.tryClear(), undefined, this)
    }
    this.refreshObjective()
  }

  enemiesRemaining() {
    return this.enemies ? this.enemies.getChildren().filter((e) => !e.dead).length : 0
  }

  refreshObjective() {
    const remaining = this.enemiesRemaining()
    if (this.objective.type === 'defeatAll' && remaining > 0) {
      this.objectiveLabel = `Defeat foes: ${remaining}`
      this.portal?.setFillStyle(0xe06a6a, 0.35).setStrokeStyle(2, 0xe06a6a)
    } else {
      this.objectiveLabel = 'Reach the portal'
      this.portal?.setFillStyle(0xffe066, 0.4).setStrokeStyle(2, 0xffe066)
    }
  }

  objectiveMet() {
    return this.objective.type !== 'defeatAll' || this.enemiesRemaining() === 0
  }

  tryClear() {
    if (this.cleared || !this.objectiveMet()) return
    this.clearLevel()
  }

  clearLevel() {
    this.cleared = true
    this.player.freeze()

    const lessonId = this.level.lessonId
    SaveSystem.markLevelCleared(this.levelId)
    if (lessonId) SaveSystem.unlockLesson(lessonId)
    const lesson = lessonId ? new ContentLoader(this).lesson(lessonId) : null

    this.cameras.main.flash(180, 124, 252, 152)
    const t = pixelText(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 12, 'LEVEL CLEAR', 18, '#7cfc98')
      .setScrollFactor(0)
      .setDepth(50)
    this.tweens.add({ targets: t, scale: { from: 0.6, to: 1 }, duration: 280, ease: 'Back.out' })

    const toLevels = () => this.scene.start('LevelSelect', { worldId: this.worldId })
    this.time.delayedCall(900, () => {
      if (lesson) showLessonCard(lesson, toLevels)
      else toLevels()
    })
  }

  onEnemyDied() {
    const res = SaveSystem.addXp(XP_PER_SLIME)
    this.player.maxHp = SaveSystem.data.player.maxHp
    this.player.attackPower = SaveSystem.data.player.attack
    if (res.leveledUp) {
      this.player.hp = this.player.maxHp
      this.showLevelUp(res.level)
    }
    this.refreshObjective()
  }

  showLevelUp(level) {
    this.cameras.main.flash(150, 255, 224, 102)
    const t = pixelText(this, GAME_WIDTH / 2, 74, `LEVEL UP  ${level}`, 12, '#ffe066')
      .setScrollFactor(0)
      .setDepth(50)
    this.tweens.add({
      targets: t,
      y: 54,
      alpha: 0,
      duration: 1100,
      ease: 'Cubic.out',
      onComplete: () => t.destroy(),
    })
  }

  spawnEnemies() {
    this.enemies = this.physics.add.group()
    for (const sp of this.enemySpawns) {
      this.enemies.add(new Enemy(this, sp.x, sp.y))
    }
  }

  onTouchEnemy(player, enemy) {
    if (this.cleared || player.dead || enemy.dead) return
    const dmg = enemy.lungeActive ? enemy.contactDamage + 6 : enemy.contactDamage
    player.hit(dmg, enemy.x, this.time.now)
  }

  spawnVenom(x, y, targetX, targetY) {
    const orb = this.projectiles.create(x, y, 'venom')
    orb.setDepth(7).setTint(0x9be86a)
    orb.body.setAllowGravity(false)
    orb.body.setCircle(6, 3, 3)
    const ang = Math.atan2(targetY - y, targetX - x)
    const SPEED = 165
    orb.setVelocity(Math.cos(ang) * SPEED, Math.sin(ang) * SPEED)
    this.tweens.add({ targets: orb, angle: 360, duration: 700, repeat: -1 })
    this.time.delayedCall(2600, () => orb.active && orb.destroy())
  }

  onVenomHit(player, orb) {
    if (this.cleared || player.dead) return this.popVenom(orb)
    player.hit(10, orb.x, this.time.now)
    this.popVenom(orb)
  }

  popVenom(orb) {
    if (!orb || !orb.active) return
    CombatSystem.puff(this, orb.x, orb.y, 0x9be86a)
    orb.destroy()
  }

  onPlayerAttack({ type, combo, x, y, facing }) {
    this.spawnSlashFx(type, x, y, facing)

    const atk = this.player.attackPower
    let rect
    let base = atk + 8
    let critChance = 0.15
    let guaranteedCrit = false
    let knock = 1

    if (type === 'up') {
      rect = new Phaser.Geom.Rectangle(x - 15, y - 34, 30, 32)
    } else if (type === 'dive') {
      rect = new Phaser.Geom.Rectangle(x - 16, y + 2, 32, 28)
      base = atk + 10
    } else if (type === 'heavy') {
      const cx = x + facing * 20
      rect = new Phaser.Geom.Rectangle(cx - 22, y - 15, 44, 30)
      base = atk + 16
      critChance = 0.25
      knock = 1.9
    } else {
      const cx = x + facing * 16
      rect = new Phaser.Geom.Rectangle(cx - 15, y - 13, 30, 26)
      if (combo >= 3) {
        base = Math.round(base * 1.6)
        guaranteedCrit = true
      }
    }

    let hitAny = false
    for (const enemy of this.enemies.getChildren()) {
      if (enemy.dead) continue
      if (Phaser.Geom.Intersects.RectangleToRectangle(rect, enemy.getBounds())) {
        const { amount, isCrit } = CombatSystem.roll(base, { critChance, guaranteedCrit })
        enemy.hurt(amount, isCrit, this.player.x)
        if (knock > 1 && !enemy.dead) {
          const away = enemy.x < this.player.x ? -1 : 1
          enemy.setVelocityX(away * 90 * knock)
        }
        hitAny = true
        if (isCrit) CombatSystem.shake(this)
      }
    }

    if (type === 'dive' && hitAny) {
      this.player.jumpCutAvailable = false
      this.player.setVelocityY(-330)
      this.player.diving = false
      CombatSystem.shake(this, 0.005, 110)
    }
    if (type === 'heavy') CombatSystem.shake(this, 0.005, 110)
  }

  spawnSlashFx(type, x, y, facing) {
    let ox = x + facing * 16
    let oy = y
    let angle = 0
    let scale = 0.6
    let tint = 0xffe066
    let flip = facing < 0
    if (type === 'up') {
      ox = x
      oy = y - 18
      angle = -90
      flip = false
    } else if (type === 'dive') {
      ox = x
      oy = y + 16
      angle = 90
      flip = false
    } else if (type === 'heavy') {
      ox = x + facing * 20
      scale = 0.9
      tint = 0xff9a3c
    }
    const fx = this.add
      .sprite(ox, oy, 'slash')
      .setDepth(20)
      .setTint(tint)
      .setFlipX(flip)
      .setAngle(angle)
      .setScale(scale)
    this.tweens.add({
      targets: fx,
      scaleX: scale * 2,
      scaleY: scale * 2,
      alpha: 0,
      duration: type === 'heavy' ? 230 : 170,
      ease: 'Quad.out',
      onComplete: () => fx.destroy(),
    })
  }

  onPlayerDead() {
    this.player.body.checkCollision.none = true
    this.time.delayedCall(700, () => {
      this.scene.start('GameOver', { worldId: this.worldId, levelId: this.levelId })
    })
  }

  isSolidAtPixel(px, py) {
    const c = Math.floor(px / TILE)
    const r = Math.floor(py / TILE)
    return this.solidSet.has(`${c},${r}`)
  }

  buildBackground() {
    const bgKey = this.worldDef?.bg || 'bg-blue'
    const theme = TERRAIN_THEMES[this.worldId] || TERRAIN_THEMES.matlab
    this.bg = this.add
      .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, bgKey)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-10)
    if (theme.bgTint) this.bg.setTint(theme.bgTint)
  }

  buildTerrain() {
    const grid = this.level.layout
    const rows = grid.length
    const cols = Math.max(...grid.map((r) => r.length))
    this.worldW = cols * TILE
    this.worldH = rows * TILE
    // Extra room below the level so the player actually falls through pit gaps
    // instead of being caught by the bottom world bound; falling = death (update()).
    this.physics.world.setBounds(0, 0, this.worldW, this.worldH + 160)

    const theme = TERRAIN_THEMES[this.worldId] || TERRAIN_THEMES.matlab
    const at = (c, r) => (r >= 0 && r < rows && c >= 0 && c < grid[r].length ? grid[r][c] : ' ')
    const solid = (c, r) => at(c, r) === '#'

    this.solids = this.physics.add.staticGroup()
    this.oneways = this.physics.add.staticGroup()
    this.solidSet = new Set()
    this.ladderSet = new Set()
    this.spawn = { x: TILE * 2, y: TILE * 2 }
    this.exitPos = null
    this.enemySpawns = []

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        const ch = grid[r][c]
        const px = c * TILE + TILE / 2
        const py = r * TILE + TILE / 2
        if (ch === '#') {
          const set = solid(c, r - 1) ? theme.fill : theme.top
          const frame = !solid(c - 1, r) ? set[0] : !solid(c + 1, r) ? set[2] : set[1]
          const block = this.solids.create(px, py, 'terrain', frame)
          if (theme.tint) block.setTint(theme.tint)
          block.refreshBody()
          this.solidSet.add(`${c},${r}`)
        } else if (ch === '=') {
          const ledge = this.oneways.create(px, py, 'terrain', theme.oneway)
          ledge.setTint(theme.onewayTint || theme.tint || 0xffffff)
          ledge.refreshBody()
        } else if (ch === 'H') {
          this.add.image(px, py, 'ladder').setTint(theme.ladderTint).setDepth(2)
          this.ladderSet.add(`${c},${r}`)
        } else if (ch === 'P') {
          this.spawn = { x: px, y: py }
        } else if (ch === 'O') {
          this.exitPos = { x: px, y: py }
        } else if (ch === 'E') {
          this.enemySpawns.push({ x: px, y: py })
        }
      }
    }
  }

  oneWayProcess(player, plat) {
    // Drop-through: ignore the platform while the player holds Down.
    if (player.dropThrough) return false
    // Land only from above — require the feet to have been at/above the surface
    // last frame, so you can jump up through it and never snag from the side.
    const prevBottom = player.body.prev.y + player.body.height
    return player.body.velocity.y >= 0 && prevBottom <= plat.body.top + 2
  }

  isLadderAtPixel(px, py) {
    const c = Math.floor(px / TILE)
    const r = Math.floor(py / TILE)
    return this.ladderSet.has(`${c},${r}`)
  }

  buildPortal() {
    if (!this.exitPos) return
    this.portal = this.add
      .rectangle(this.exitPos.x, this.exitPos.y, TILE - 2, TILE * 2, 0xffe066, 0.4)
      .setStrokeStyle(2, 0xffe066)
      .setDepth(5)
    this.tweens.add({
      targets: this.portal,
      alpha: { from: 0.25, to: 0.6 },
      yoyo: true,
      repeat: -1,
      duration: 700,
    })
  }

  update() {
    if (this.bg) {
      this.bg.tilePositionX = this.cameras.main.scrollX * 0.3
    }
    if (this.player && !this.player.dead && this.player.y > this.worldH + 48) {
      this.player.die()
    }
  }
}
