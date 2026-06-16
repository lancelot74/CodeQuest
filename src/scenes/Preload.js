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

    // Eyeball hunter (Brysia pack): 20px hover strip + its 7px bullet.
    this.load.spritesheet('eyeball-walk', 'assets/game/enemies/eyeball/walk.png', { frameWidth: 20, frameHeight: 20 })
    this.load.image('eye-bullet', 'assets/game/enemies/eyeball/bullet.png')

    // Weather clouds (48px strips): calm + storm bodies, rain curtain, crackle, bolt.
    const CLOUD = { frameWidth: 48, frameHeight: 48 }
    this.load.spritesheet('cloud1', 'assets/game/clouds/cloud1.png', CLOUD)
    this.load.spritesheet('cloud2', 'assets/game/clouds/cloud2.png', CLOUD)
    this.load.spritesheet('cloud-rain', 'assets/game/clouds/rain.png', CLOUD)
    // bottom-cropped rain frames (48x40): stack seamlessly for tall curtains
    this.load.spritesheet('cloud-rain-tile', 'assets/game/clouds/rain-tile.png', { frameWidth: 48, frameHeight: 40 })
    this.load.spritesheet('cloud-effect', 'assets/game/clouds/effect.png', CLOUD)
    this.load.spritesheet('cloud-lightning', 'assets/game/clouds/lightning.png', CLOUD)

    // Finale dragons (48px strips: fly + glide per color) and their fireball.
    const DRG = { frameWidth: 48, frameHeight: 48 }
    this.load.spritesheet('green-fly', 'assets/game/dragons/green1.png', DRG)
    this.load.spritesheet('green-glide', 'assets/game/dragons/green2.png', DRG)
    this.load.spritesheet('red-fly', 'assets/game/dragons/red1.png', DRG)
    this.load.spritesheet('red-glide', 'assets/game/dragons/red2.png', DRG)
    this.load.spritesheet('fireball', 'assets/game/dragons/fireball.png', { frameWidth: 32, frameHeight: 32 })

    // NIGHT HUNT — the Wanderer: an animated lantern hero (hunt-only, 64px strips).
    const LANT = { frameWidth: 64, frameHeight: 64 }
    this.load.spritesheet('hunt-lantern-idle', 'assets/game/players/hunt-lantern/idle.png', LANT)
    this.load.spritesheet('hunt-lantern-run', 'assets/game/players/hunt-lantern/run.png', LANT)
    this.load.spritesheet('hunt-lantern-hit', 'assets/game/players/hunt-lantern/hit.png', LANT)
    this.load.spritesheet('hunt-lantern-death', 'assets/game/players/hunt-lantern/death.png', LANT)

    // NIGHT HUNT (top-down stalker mode). Florest tileset is 24x24; hero/golem are
    // single-frame images. Props back the arena walls/objectives (no wall tiles exist).
    const HUNT = 'assets/game/hunt'
    this.load.spritesheet('hunt-tiles', `${HUNT}/spritesheet/tileset_florest.png`, {
      frameWidth: 24,
      frameHeight: 24,
    })
    this.load.image('hunt-hero', `${HUNT}/characters/hero.png`)
    this.load.image('hunt-golem', `${HUNT}/characters/golem.png`)
    this.load.image('hunt-coin', `${HUNT}/spritesheet/ui_coin.png`)
    for (const p of ['tree', 'big_stone', 'mid_stone', 'small_stone', 'chest_closed', 'skull', 'sign']) {
      this.load.image(`hunt-${p}`, `${HUNT}/spritesheet/props_${p}.png`)
    }

    // Kenney pixel-adventure UI sheet (32px tiles, no spacing) for panels/buttons.
    this.load.spritesheet('ui', 'assets/game/ui/kenney-ui.png', { frameWidth: 32, frameHeight: 32 })
    // Kenney UI Pack (Pixel Adventure): blue-grey 9-slice panel for menu/HUD chrome.
    this.load.image('ui-panel', 'assets/game/ui/ui-panel.png')

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

    // Background music + cues (Mind's Eye Loops pack, ogg). Keys used by Music.*
    const mus = (key, file) => this.load.audio(key, `assets/audio/music/${file}`)
    mus('bgm-main', 'veil-of-night.ogg')
    mus('bgm-tension', 'dark-forest.ogg')
    mus('cue-exit', 'somethings-wrong-in.ogg')
    mus('cue-chest', 'fredelig-out.ogg')
    mus('bgm-trap', 'insanity.ogg') // loops while the hero is stuck in a hole
    mus('bgm-boss', 'final-kill.ogg') // finale arena loop
    mus('cue-dawn', 'roll-credits.ogg') // one-shot over the dawn screen

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
