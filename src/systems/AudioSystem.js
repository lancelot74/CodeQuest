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
    const vol = (s.sfxVol ?? 0.45) * (GAIN[key] ?? 0.6) * (opts.volume ?? 1)
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
let curCue = null // persistent overlay cue (endgame layer) — independent of the loop

function musVol(scale = 1) {
  const s = SaveSystem.data.settings || {}
  if (s.muted) return 0
  return (s.musicVol ?? 0.85) * scale
}

// Tween a Phaser sound's volume; optionally destroy it once silent (destroy, not stop,
// so retired loops don't pile up in the global sound manager). Fade tweens live on the
// calling scene, so if that scene shuts down mid-fade the tween dies with it — the
// once-SHUTDOWN finalizer snaps the sound to its destination instead, otherwise an
// outgoing loop would keep playing at mid-fade volume forever.
function fade(scene, sound, to, ms, { stopAtEnd = false, ease } = {}) {
  if (!sound) return
  const finalize = () => {
    if (stopAtEnd) sound.destroy()
    else sound.setVolume(to)
  }
  scene.events.once('shutdown', finalize)
  scene.tweens.add({
    targets: sound,
    volume: to,
    duration: ms,
    ease,
    onComplete: () => {
      scene.events.off('shutdown', finalize)
      if (stopAtEnd) sound.destroy()
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
  // The un-duck rides the cue's 'complete' event (global sound manager), which can fire
  // after the calling scene is gone — the once-SHUTDOWN hook restores instantly in that
  // case so the loop doesn't sit ducked forever.
  stinger(scene, key, { duck = 0.35, fade: ms = 400 } = {}) {
    if (!scene.cache.audio.exists(key)) return
    const cue = scene.sound.add(key, { volume: musVol() })
    const cutShort = () => {
      cue.destroy() // also drops the pending 'complete' handler
      if (curSound) curSound.setVolume(musVol())
    }
    if (curSound) fade(scene, curSound, musVol(duck), ms)
    cue.once('complete', () => {
      scene.events.off('shutdown', cutShort)
      if (curSound) fade(scene, curSound, musVol(), ms)
      cue.destroy()
    })
    scene.events.once('shutdown', cutShort)
    cue.play()
  },

  stop(scene, { fade: ms = 600 } = {}) {
    if (curSound) fade(scene, curSound, 0, ms, { stopAtEnd: true })
    curKey = null
    curSound = null
  },

  // Open-ended looping overlay on TOP of the current loop (the endgame "way out is
  // open" layer): the main/tension system keeps crossfading underneath it. Runs until
  // cueStop — or the scene dies, which destroys it via the shutdown hook.
  cueLoop(scene, key, { volume = 0.8, fade: ms = 600 } = {}) {
    if (curCue || !scene.cache.audio.exists(key)) return
    const cue = scene.sound.add(key, { loop: true, volume: 0 })
    curCue = cue
    cue.play()
    fade(scene, cue, musVol(volume), ms)
    scene.events.once('shutdown', () => {
      if (curCue === cue) {
        curCue = null
        cue.destroy()
      }
    })
  },

  cueStop(scene, { fade: ms = 800 } = {}) {
    if (!curCue) return
    fade(scene, curCue, 0, ms, { stopAtEnd: true })
    curCue = null
  },

  // Re-apply the saved music volume to the live loop — lets the settings slider
  // retune the currently playing track instantly while dragging.
  refresh() {
    if (curSound) curSound.setVolume(musVol())
  },
}
