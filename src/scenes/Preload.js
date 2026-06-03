import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../config.js'
import { CHARACTERS } from '../utils/constants.js'
import { createCharacterAnimations, createEnemyAnimations } from '../utils/anims.js'
import { createPlaceholderTextures } from '../utils/textures.js'

const SHEET = { frameWidth: 32, frameHeight: 32 }

export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload')
  }

  preload() {
    this.drawLoadingBar()

    for (const c of CHARACTERS) {
      this.load.spritesheet(`${c}-idle`, `assets/game/players/${c}/idle.png`, SHEET)
      this.load.spritesheet(`${c}-run`, `assets/game/players/${c}/run.png`, SHEET)
      this.load.spritesheet(`${c}-jump`, `assets/game/players/${c}/jump.png`, SHEET)
      this.load.spritesheet(`${c}-fall`, `assets/game/players/${c}/fall.png`, SHEET)
      this.load.spritesheet(`${c}-doublejump`, `assets/game/players/${c}/doublejump.png`, SHEET)
      this.load.spritesheet(`${c}-hit`, `assets/game/players/${c}/hit.png`, SHEET)
    }

    this.load.spritesheet('terrain', 'assets/game/tiles/kenney-platformer.png', {
      frameWidth: 21,
      frameHeight: 21,
    })

    // Marsh enemies: trimmed boss sheets (uniform bottom-anchored cells, centered).
    const OOZE = { frameWidth: 64, frameHeight: 50 }
    this.load.spritesheet('ooze-walk', 'assets/game/enemies/ooze/walk.png', OOZE)
    this.load.spritesheet('ooze-death', 'assets/game/enemies/ooze/death.png', OOZE)
    this.load.image('venom', 'assets/game/enemies/ooze/venom.png')

    const DEMON = { frameWidth: 64, frameHeight: 56 }
    this.load.spritesheet('demon-walk', 'assets/game/enemies/demon/walk.png', DEMON)
    this.load.spritesheet('demon-death', 'assets/game/enemies/demon/death.png', DEMON)
    const MAGE = { frameWidth: 58, frameHeight: 64 }
    this.load.spritesheet('mage-walk', 'assets/game/enemies/mage/walk.png', MAGE)
    this.load.spritesheet('mage-death', 'assets/game/enemies/mage/death.png', MAGE)

    // Kenney pixel-adventure UI sheet (32px tiles, no spacing) for panels/buttons.
    this.load.spritesheet('ui', 'assets/game/ui/kenney-ui.png', { frameWidth: 32, frameHeight: 32 })
    // Kenney UI Pack (Pixel Adventure): blue-grey 9-slice panel for menu/HUD chrome.
    this.load.image('ui-panel', 'assets/game/ui/ui-panel.png')
    this.load.image('bg-green', 'assets/game/bg/green.png')
    this.load.image('bg-blue', 'assets/game/bg/blue.png')
    this.load.image('bg-gray', 'assets/game/bg/gray.png')
    this.load.image('bg-purple', 'assets/game/bg/purple.png')

    // SFX — Kenney ui / impact / rpg packs (ogg). Logical names live in SFX.
    const sfx = (key, path) => this.load.audio(key, `assets/audio/${path}`)
    sfx('sfx-jump', 'rpg/Audio/cloth1.ogg')
    sfx('sfx-slash', 'rpg/Audio/knifeSlice.ogg')
    sfx('sfx-heavy', 'rpg/Audio/chop.ogg')
    sfx('sfx-hit', 'impact/Audio/impactPunch_medium_000.ogg')
    sfx('sfx-enemyHit', 'impact/Audio/impactSoft_medium_000.ogg')
    sfx('sfx-crit', 'impact/Audio/impactMetal_heavy_000.ogg')
    sfx('sfx-enemyDie', 'impact/Audio/impactSoft_heavy_000.ogg')
    sfx('sfx-spit', 'impact/Audio/impactGlass_light_000.ogg')
    sfx('sfx-levelUp', 'impact/Audio/impactBell_heavy_002.ogg')
    sfx('sfx-click', 'ui/Audio/click1.ogg')
    sfx('sfx-rollover', 'ui/Audio/rollover1.ogg')
    sfx('sfx-clear', 'impact/Audio/impactBell_heavy_000.ogg')
    sfx('sfx-playerDie', 'impact/Audio/impactPunch_heavy_000.ogg')

    this.load.json('worlds', 'data/worlds.json')
    this.load.json('lessons', 'data/lessons.json')
    this.load.json('questions', 'data/questions.json')
  }

  create() {
    createCharacterAnimations(this)
    createEnemyAnimations(this)
    createPlaceholderTextures(this)
    this.scene.start('MainMenu')
  }

  drawLoadingBar() {
    const w = 240
    const h = 14
    const x = (GAME_WIDTH - w) / 2
    const y = GAME_HEIGHT / 2

    const box = this.add.graphics()
    box.fillStyle(0x1b2138, 1).fillRect(x, y, w, h)

    const bar = this.add.graphics()
    const label = this.add
      .text(GAME_WIDTH / 2, y - 22, 'CODEQUEST', {
        fontFamily: '"Press Start 2P"',
        fontSize: '16px',
        color: '#ffe066',
      })
      .setOrigin(0.5)

    this.load.on('progress', (p) => {
      bar.clear().fillStyle(0xffe066, 1).fillRect(x + 2, y + 2, (w - 4) * p, h - 4)
    })
    this.load.on('complete', () => {
      bar.destroy()
      box.destroy()
      label.destroy()
    })
  }
}
