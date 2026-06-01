// Thin accessor over the JSON cached by the Preload scene plus on-demand level fetches.
export class ContentLoader {
  constructor(scene) {
    this.scene = scene
  }

  worlds() {
    return this.scene.cache.json.get('worlds') || []
  }

  world(id) {
    return this.worlds().find((w) => w.id === id) || null
  }

  lessons() {
    return this.scene.cache.json.get('lessons') || []
  }

  lesson(id) {
    return this.lessons().find((l) => l.id === id) || null
  }

  questions() {
    return this.scene.cache.json.get('questions') || []
  }

  questionsFor(worldId, maxDifficulty = Infinity) {
    return this.questions().filter(
      (q) => q.world === worldId && q.difficulty <= maxDifficulty,
    )
  }

  // Loads a level definition file on demand, resolving once it's in the cache.
  loadLevel(levelId) {
    return new Promise((resolve, reject) => {
      const key = `level-${levelId}`
      if (this.scene.cache.json.has(key)) {
        resolve(this.scene.cache.json.get(key))
        return
      }
      this.scene.load.json(key, `data/levels/${levelId}.json`)
      this.scene.load.once('complete', () => {
        const data = this.scene.cache.json.get(key)
        if (data) resolve(data)
        else reject(new Error(`Level not found: ${levelId}`))
      })
      this.scene.load.once('loaderror', () => reject(new Error(`Failed to load level: ${levelId}`)))
      this.scene.load.start()
    })
  }
}
