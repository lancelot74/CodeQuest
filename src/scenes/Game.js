import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../config.js'
import { SaveSystem } from '../systems/SaveSystem.js'
import { ContentLoader } from '../systems/ContentLoader.js'
import Player from '../systems/Player.js'
import Slime from '../systems/Enemy.js'
import { CombatSystem } from '../systems/CombatSystem.js'
import { TERRAIN_THEMES, TILE } from '../utils/tiles.js'

function hexToNum(hex, fallback) {
  if (typeof hex !== 'string') return fallback
  const n = parseInt(hex.replace('#', ''), 16)
  return Number.isNaN(n) ? fallback : n
}

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

    this.spawnEnemies()
    this.physics.add.collider(this.enemies, this.solids)
    this.physics.add.overlap(this.player, this.enemies, this.onTouchEnemy, undefined, this)

    this.events.off('player-attack', this.onPlayerAttack, this)
    this.events.on('player-attack', this.onPlayerAttack, this)
    this.events.off('player-dead', this.onPlayerDead, this)
    this.events.once('player-dead', this.onPlayerDead, this)

    this.cameras.main.setBounds(0, 0, this.worldW, this.worldH)
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12)
    this.cameras.main.setDeadzone(70, 50)

    this.buildPortal()
  }

  spawnEnemies() {
    this.enemies = this.physics.add.group()
    const tint = hexToNum(this.worldDef?.slimeTint, 0x67d46a)
    for (const sp of this.enemySpawns) {
      this.enemies.add(new Slime(this, sp.x, sp.y, tint))
    }
  }

  onTouchEnemy(player, enemy) {
    if (player.dead || enemy.dead) return
    player.hit(enemy.contactDamage, enemy.x, this.time.now)
  }

  onPlayerAttack({ x, y, facing }) {
    const cx = x + facing * 16
    this.spawnSlashFx(cx, y, facing)
    const rect = new Phaser.Geom.Rectangle(cx - 14, y - 14, 28, 28)
    const base = this.player.attackPower + 8
    for (const enemy of this.enemies.getChildren()) {
      if (enemy.dead) continue
      if (Phaser.Geom.Intersects.RectangleToRectangle(rect, enemy.getBounds())) {
        const { amount, isCrit } = CombatSystem.roll(base)
        enemy.hurt(amount, isCrit, this.player.x)
        if (isCrit) CombatSystem.shake(this)
      }
    }
  }

  spawnSlashFx(x, y, facing) {
    const fx = this.add
      .sprite(x, y, 'slash')
      .setDepth(20)
      .setTint(0xffe066)
      .setFlipX(facing < 0)
      .setScale(0.6)
    this.tweens.add({
      targets: fx,
      scaleX: 1.2,
      scaleY: 1.2,
      alpha: 0,
      duration: 170,
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
    const bgKey = this.worldDef?.bg || 'bg-green'
    this.bg = this.add
      .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, bgKey)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-10)
  }

  buildTerrain() {
    const grid = this.level.layout
    const rows = grid.length
    const cols = Math.max(...grid.map((r) => r.length))
    this.worldW = cols * TILE
    this.worldH = rows * TILE
    this.physics.world.setBounds(0, 0, this.worldW, this.worldH)

    const theme = TERRAIN_THEMES[this.worldId] || TERRAIN_THEMES.matlab
    const at = (c, r) => (r >= 0 && r < rows && c >= 0 && c < grid[r].length ? grid[r][c] : ' ')
    const solid = (c, r) => at(c, r) === '#'

    this.solids = this.physics.add.staticGroup()
    this.solidSet = new Set()
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
          this.solids.create(px, py, 'terrain', frame).refreshBody()
          this.solidSet.add(`${c},${r}`)
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
    if (this.player && !this.player.dead && this.player.y > this.worldH + 80) {
      this.scene.restart()
    }
  }
}
