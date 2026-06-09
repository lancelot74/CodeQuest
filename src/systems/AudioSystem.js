import { SaveSystem } from './SaveSystem.js'

// Logical sfx name -> loaded audio key (files registered in Preload). Kept as a
// map so callers reference intent (SFX.jump) rather than asset keys.
export const SFX = {
  jump: 'sfx-jump',
  slash: 'sfx-slash',
  heavy: 'sfx-heavy',
  hit: 'sfx-hit', // player takes damage
  enemyHit: 'sfx-enemyHit',
  crit: 'sfx-crit',
  enemyDie: 'sfx-enemyDie',
  spit: 'sfx-spit',
  levelUp: 'sfx-levelUp',
  click: 'sfx-click',
  rollover: 'sfx-rollover',
  clear: 'sfx-clear',
  playerDie: 'sfx-playerDie',
}

// Per-sfx baseline gain so the raw samples sit together in the mix.
const GAIN = {
  'sfx-jump': 0.45,
  'sfx-slash': 0.5,
  'sfx-heavy': 0.7,
  'sfx-hit': 0.8,
  'sfx-enemyHit': 0.45,
  'sfx-crit': 0.85,
  'sfx-enemyDie': 0.65,
  'sfx-spit': 0.5,
  'sfx-levelUp': 0.8,
  'sfx-click': 0.55,
  'sfx-rollover': 0.3,
  'sfx-clear': 0.9,
  'sfx-playerDie': 0.85,
}

// Thin wrapper over Phaser's (global) sound manager that folds in the player's
// saved volume/mute. Sounds are global once loaded, so any scene can play them.
export const Audio = {
  play(scene, key, opts = {}) {
    const s = SaveSystem.data.settings || {}
    if (s.muted) return
    const vol = (s.sfxVol ?? 0.8) * (GAIN[key] ?? 0.6) * (opts.volume ?? 1)
    if (vol <= 0) return
    if (!scene.cache.audio.exists(key)) return
    scene.sound.play(key, { volume: vol, rate: opts.rate ?? 1, detune: opts.detune ?? 0 })
  },
}

// Background music: one looping track at a time, crossfaded on change. Short one-shot
// "stingers" play over the loop while ducking it, then it fades back. Volume folds in
// the saved musicVol + mute, mirroring Audio.play. The sound manager is global, so the
// current loop survives scene transitions — each scene just declares what it wants.
let curKey = null
let curSound = null

function musVol(scale = 1) {
  const s = SaveSystem.data.settings || {}
  if (s.muted) return 0
  return (s.musicVol ?? 0.6) * scale
}

// Tween a Phaser sound's volume; optionally stop it once silent. Guard the target so a
// sound destroyed mid-tween doesn't throw.
function fade(scene, sound, to, ms, { stopAtEnd = false, ease } = {}) {
  if (!sound) return
  scene.tweens.add({
    targets: sound,
    volume: to,
    duration: ms,
    ease,
    onComplete: () => {
      if (stopAtEnd && sound) sound.stop()
    },
  })
}

export const Music = {
  // Crossfade to a looping track. Calling with the track already playing is a no-op,
  // so menus -> Night Hunt (same key) stay seamless and per-frame calls are cheap.
  play(scene, key, { fade: ms = 800 } = {}) {
    if (key === curKey && curSound && curSound.isPlaying) return
    if (!scene.cache.audio.exists(key)) return
    const prev = curSound
    const next = scene.sound.add(key, { loop: true, volume: 0 })
    next.play()
    curKey = key
    curSound = next
    // Equal-power crossfade (sin in / cos out): the loops overlap at full perceived
    // loudness through the swap, instead of both sitting at ~50% mid-fade and leaving
    // an audible gap.
    fade(scene, next, musVol(), ms, { ease: 'Sine.easeOut' })
    if (prev) fade(scene, prev, 0, ms, { stopAtEnd: true, ease: 'Sine.easeIn' })
  },

  // One-shot cue over the current loop: duck the loop, play the cue, restore on end.
  stinger(scene, key, { duck = 0.35, fade: ms = 400 } = {}) {
    if (!scene.cache.audio.exists(key)) return
    const cue = scene.sound.add(key, { volume: musVol() })
    if (curSound) fade(scene, curSound, musVol(duck), ms)
    cue.once('complete', () => {
      if (curSound) fade(scene, curSound, musVol(), ms)
      cue.destroy()
    })
    cue.play()
  },

  stop(scene, { fade: ms = 600 } = {}) {
    if (curSound) fade(scene, curSound, 0, ms, { stopAtEnd: true })
    curKey = null
    curSound = null
  },

  // Re-apply the saved music volume to the live loop — lets the settings slider
  // retune the currently playing track instantly while dragging.
  refresh() {
    if (curSound) curSound.setVolume(musVol())
  },
}
