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

  // The Wanderer (hunt-only, 64px). idle loops via yoyo so the gentle sway is
  // seam-free; run/hit/death are added once their strips exist.
  if (scene.textures.exists('hunt-lantern-idle') && !scene.anims.exists('hunt-lantern-idle')) {
    scene.anims.create({
      key: 'hunt-lantern-idle',
      frames: scene.anims.generateFrameNumbers('hunt-lantern-idle'),
      frameRate: 8,
      repeat: -1,
      yoyo: true,
    })
  }
  // run loops forward; hit + death play once and hold on the last frame
  if (scene.textures.exists('hunt-lantern-run') && !scene.anims.exists('hunt-lantern-run')) {
    scene.anims.create({ key: 'hunt-lantern-run', frames: scene.anims.generateFrameNumbers('hunt-lantern-run'), frameRate: 10, repeat: -1 })
  }
  if (scene.textures.exists('hunt-lantern-hit') && !scene.anims.exists('hunt-lantern-hit')) {
    scene.anims.create({ key: 'hunt-lantern-hit', frames: scene.anims.generateFrameNumbers('hunt-lantern-hit'), frameRate: 12, repeat: 0 })
  }
  if (scene.textures.exists('hunt-lantern-death') && !scene.anims.exists('hunt-lantern-death')) {
    scene.anims.create({ key: 'hunt-lantern-death', frames: scene.anims.generateFrameNumbers('hunt-lantern-death'), frameRate: 10, repeat: 0 })
  }
  if (scene.textures.exists('hunt-lantern-sprint') && !scene.anims.exists('hunt-lantern-sprint')) {
    scene.anims.create({ key: 'hunt-lantern-sprint', frames: scene.anims.generateFrameNumbers('hunt-lantern-sprint'), frameRate: 14, repeat: -1 })
  }
  // melee swing (Dungeon Crawl) — one-shot lantern strike
  if (scene.textures.exists('hunt-lantern-attack') && !scene.anims.exists('hunt-lantern-attack')) {
    scene.anims.create({ key: 'hunt-lantern-attack', frames: scene.anims.generateFrameNumbers('hunt-lantern-attack'), frameRate: 18, repeat: 0 })
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
  define(scene, 'cloud-rain-tile', 'cloud-rain-tile', 14, -1)
  define(scene, 'cloud-effect', 'cloud-effect', 10, -1)
  define(scene, 'cloud-lightning', 'cloud-lightning', 14, 0)
  // finale dragons: two loops per color, plus the tumbling fireball
  define(scene, 'green-fly', 'green-fly', 8, -1)
  define(scene, 'green-glide', 'green-glide', 8, -1)
  define(scene, 'red-fly', 'red-fly', 8, -1)
  define(scene, 'red-glide', 'red-glide', 8, -1)
  define(scene, 'fireball', 'fireball', 12, -1)

  // Gargoyle Guardian (dungeon final boss): idle loops slow + heavy; death holds on
  // the rubble heap; rubble spins. smash/hurl/hurt are one-shot combat anims.
  if (scene.textures.exists('gargoyle-idle')) {
    define(scene, 'gargoyle-idle', 'gargoyle-idle', 6, -1)
    define(scene, 'gargoyle-death', 'gargoyle-death', 10, 0)
    define(scene, 'gargoyle-rubble', 'gargoyle-rubble', 12, -1)
    define(scene, 'gargoyle-smash', 'gargoyle-smash', 12, 0)
    define(scene, 'gargoyle-hurl', 'gargoyle-hurl', 12, 0)
    define(scene, 'gargoyle-hurt', 'gargoyle-hurt', 14, 0)
  }

  // New dungeon bosses (Ember Brute / Ashen Warlock / Magma Serpent): idle loops;
  // hurl/hurt one-shot; death holds on the last frame.
  for (const boss of ['brute', 'warlock', 'serpent']) {
    if (!scene.textures.exists(`${boss}-idle`)) continue
    define(scene, `${boss}-idle`, `${boss}-idle`, 6, -1)
    define(scene, `${boss}-death`, `${boss}-death`, 10, 0)
    define(scene, `${boss}-hurl`, `${boss}-hurl`, 12, 0)
    define(scene, `${boss}-hurt`, `${boss}-hurt`, 14, 0)
  }
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
