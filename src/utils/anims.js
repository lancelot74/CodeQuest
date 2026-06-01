import { CHARACTERS } from './constants.js'

// Builds every character animation once; safe to call from multiple scenes.
export function createCharacterAnimations(scene) {
  for (const c of CHARACTERS) {
    define(scene, `${c}-idle`, `${c}-idle`, 20, -1)
    define(scene, `${c}-run`, `${c}-run`, 20, -1)
    define(scene, `${c}-jump`, `${c}-jump`, 1, 0)
    define(scene, `${c}-fall`, `${c}-fall`, 1, 0)
    define(scene, `${c}-doublejump`, `${c}-doublejump`, 20, 0)
    define(scene, `${c}-hit`, `${c}-hit`, 20, 0)
  }
}

// Enemy animations (the Ooze marsh creature). Built once, like the hero set.
export function createEnemyAnimations(scene) {
  define(scene, 'ooze-walk', 'ooze-walk', 7, -1)
  define(scene, 'ooze-death', 'ooze-death', 11, 0)
}

function define(scene, key, sheetKey, frameRate, repeat) {
  if (scene.anims.exists(key)) return
  scene.anims.create({
    key,
    frames: scene.anims.generateFrameNumbers(sheetKey),
    frameRate,
    repeat,
  })
}
