import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../config.js'
import { CHARACTERS } from '../utils/constants.js'
import { createCharacterAnimations } from '../utils/anims.js'
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

    this.load.spritesheet('terrain', 'assets/game/tiles/terrain.png', {
      frameWidth: 16,
      frameHeight: 16,
    })
    this.load.image('bg-green', 'assets/game/bg/green.png')
    this.load.image('bg-blue', 'assets/game/bg/blue.png')
    this.load.image('bg-gray', 'assets/game/bg/gray.png')
    this.load.image('bg-purple', 'assets/game/bg/purple.png')

    this.load.json('worlds', 'data/worlds.json')
    this.load.json('lessons', 'data/lessons.json')
    this.load.json('questions', 'data/questions.json')
  }

  create() {
    createCharacterAnimations(this)
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
