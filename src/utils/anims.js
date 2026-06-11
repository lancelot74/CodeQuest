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

// Enemy animations (marsh creatures: Ooze, Demon, Mage). Built once, like the
// hero set. Each death plays through once and holds on its last frame.
export function createEnemyAnimations(scene) {
  define(scene, 'ooze-walk', 'ooze-walk', 7, -1)
  define(scene, 'ooze-death', 'ooze-death', 11, 0)
  define(scene, 'demon-walk', 'demon-walk', 9, -1)
  define(scene, 'demon-death', 'demon-death', 9, 0)
  define(scene, 'mage-walk', 'mage-walk', 9, -1)
  define(scene, 'mage-death', 'mage-death', 10, 0)
  define(scene, 'eyeball-walk', 'eyeball-walk', 6, -1)
  // weather clouds (menu + Night Hunt): bodies + rain loop, one-shot bolt
  define(scene, 'cloud1', 'cloud1', 6, -1)
  define(scene, 'cloud2', 'cloud2', 6, -1)
  define(scene, 'cloud-rain', 'cloud-rain', 14, -1)
  define(scene, 'cloud-effect', 'cloud-effect', 10, -1)
  define(scene, 'cloud-lightning', 'cloud-lightning', 14, 0)
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
