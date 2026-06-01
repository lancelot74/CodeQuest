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
