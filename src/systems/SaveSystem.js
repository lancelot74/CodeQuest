const KEY = 'codequest.save.v1'
const VERSION = 1

export function xpForLevel(level) {
  return 12 + (level - 1) * 8
}

function defaultSave() {
  return {
    version: VERSION,
    character: 'ninja',
    player: { level: 1, xp: 0, maxHp: 100, attack: 10 },
    progress: { clearedLevels: [], unlockedWorlds: ['matlab'] },
    codex: { unlockedLessons: [] },
    settings: { musicVol: 0.85, sfxVol: 0.45, muted: false },
    hunt: { bestRound: 1 },
  }
}

let cache = null

export const SaveSystem = {
  load() {
    if (cache) return cache
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) {
        const data = JSON.parse(raw)
        // Version guard: only accept a matching schema, else fall back cleanly.
        if (data && data.version === VERSION) {
          cache = { ...defaultSave(), ...data }
          return cache
        }
      }
    } catch (e) {
      // Corrupt or unavailable storage — start fresh rather than crash.
    }
    cache = defaultSave()
    return cache
  },

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.load()))
    } catch (e) {
      // Persistence is best-effort; ignore quota/availability errors.
    }
  },

  reset() {
    cache = defaultSave()
    this.save()
    return cache
  },

  exists() {
    try {
      return !!localStorage.getItem(KEY)
    } catch (e) {
      return false
    }
  },

  get data() {
    return this.load()
  },

  setCharacter(key) {
    this.load().character = key
    this.save()
  },

  isWorldUnlocked(id) {
    return this.load().progress.unlockedWorlds.includes(id)
  },

  unlockWorld(id) {
    const d = this.load()
    if (!d.progress.unlockedWorlds.includes(id)) {
      d.progress.unlockedWorlds.push(id)
      this.save()
    }
  },

  isLevelCleared(id) {
    return this.load().progress.clearedLevels.includes(id)
  },

  markLevelCleared(id) {
    const d = this.load()
    if (!d.progress.clearedLevels.includes(id)) {
      d.progress.clearedLevels.push(id)
      this.save()
    }
  },

  isLessonUnlocked(id) {
    return this.load().codex.unlockedLessons.includes(id)
  },

  unlockLesson(id) {
    const d = this.load()
    if (!d.codex.unlockedLessons.includes(id)) {
      d.codex.unlockedLessons.push(id)
      this.save()
    }
  },

  savePlayer(stats) {
    Object.assign(this.load().player, stats)
    this.save()
  },

  addXp(amount) {
    const p = this.load().player
    p.xp += amount
    let leveledUp = false
    while (p.xp >= xpForLevel(p.level)) {
      p.xp -= xpForLevel(p.level)
      p.level += 1
      p.maxHp += 10
      p.attack += 2
      leveledUp = true
    }
    this.save()
    return { leveledUp, level: p.level }
  },
}
