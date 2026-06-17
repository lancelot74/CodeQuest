const KEY = 'codequest.save.v1'
const VERSION = 1

function defaultSave() {
  return {
    version: VERSION,
    character: 'ninja',
    settings: { musicVol: 0.85, sfxVol: 0.45, muted: false },
    hunt: { bestRound: 1, dawn: false },
    challenge: { bestDepth: 0 },
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
}
