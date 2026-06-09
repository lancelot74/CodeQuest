import Phaser from 'phaser'
import { GAME_WIDTH } from '../config.js'
import { COLORS } from '../utils/constants.js'
import { addBackdrop, panelButton, pixelText } from '../ui/widgets.js'
import { Audio, SFX, Music } from '../systems/AudioSystem.js'
import { SaveSystem } from '../systems/SaveSystem.js'

export default class SettingsScene extends Phaser.Scene {
  constructor() {
    super('Settings')
  }

  create() {
    addBackdrop(this, 'bg-blue')
    pixelText(this, GAME_WIDTH / 2, 80, 'SETTINGS', 28, COLORS.accent)

    // Keep the menu loop audible so the music slider previews against something.
    Music.play(this, 'bgm-main')

    const s = SaveSystem.data.settings

    this.makeSlider(168, 'MUSIC', () => s.musicVol ?? 0.85, (v) => {
      s.musicVol = v
      SaveSystem.save()
      Music.refresh()
    })

    this.makeSlider(228, 'SFX', () => s.sfxVol ?? 0.45, (v) => {
      s.sfxVol = v
      SaveSystem.save()
    }, () => Audio.play(this, SFX.clear))

    panelButton(this, GAME_WIDTH / 2, 312, 'BACK', () => this.scene.start('MainMenu'), { width: 150 })
  }

  // One volume row: label, draggable track, live percent. onChange fires on every
  // move (cheap retune); onRelease fires once on let-go (used to sample the SFX level).
  makeSlider(y, label, getVal, onChange, onRelease) {
    const cx = GAME_WIDTH / 2
    const trackX = cx - 100
    const trackW = 200

    pixelText(this, cx - 180, y, label, 11, COLORS.text).setOrigin(0, 0.5)

    const track = this.add.rectangle(trackX, y, trackW, 6, 0x2a3350).setOrigin(0, 0.5)
    const fill = this.add.rectangle(trackX, y, trackW * getVal(), 6, 0xffe066).setOrigin(0, 0.5)
    const handle = this.add
      .rectangle(trackX + trackW * getVal(), y, 14, 22, 0xeaf1ff)
      .setStrokeStyle(2, 0x1b2138)
    const pct = pixelText(this, cx + 116, y, `${Math.round(getVal() * 100)}%`, 9, COLORS.dim).setOrigin(0, 0.5)

    const setFromX = (px) => {
      const v = Phaser.Math.Clamp((px - trackX) / trackW, 0, 1)
      fill.width = trackW * v
      handle.x = trackX + trackW * v
      pct.setText(`${Math.round(v * 100)}%`)
      onChange(v)
    }

    handle.setInteractive({ useHandCursor: true })
    this.input.setDraggable(handle)
    handle.on('drag', (_p, dragX) => setFromX(dragX))
    handle.on('dragend', () => onRelease?.())

    track.setInteractive({ useHandCursor: true })
    track.on('pointerdown', (p) => {
      setFromX(p.x)
      onRelease?.()
    })
  }
}
