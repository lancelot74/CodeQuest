import { pixelText } from '../ui/widgets.js'
import { GAME_WIDTH, GAME_HEIGHT } from '../config.js'

// The explored-area map for the Dungeon Crawl. A corner room-grid (always on) +
// a TAB/M full-floor overlay. Rooms are revealed as you reach them or stand next
// to them; type (boss / treasure) only shows once you've actually entered.

const COL = {
  current: 0xffd24a,
  cleared: 0x6a8aa0,
  visited: 0x4a4f63,
  boss: 0xc0392b,
  treasure: 0xc9a24a,
  hint: 0x3a3f4e,
  link: 0x5a6070,
}

export default class Minimap {
  constructor(scene, floorData) {
    this.scene = scene
    this.floor = floorData
    let minX = 99
    let minY = 99
    let maxX = -1
    let maxY = -1
    for (const r of floorData.rooms.values()) {
      minX = Math.min(minX, r.gx)
      minY = Math.min(minY, r.gy)
      maxX = Math.max(maxX, r.gx)
      maxY = Math.max(maxY, r.gy)
    }
    this.gb = { minX, minY, maxX, maxY }
    this.g = scene.fixUI(scene.add.graphics().setScrollFactor(0).setDepth(11050))
    this._full = false
    this.refresh()
  }

  // A room is "known" once visited or adjacent to a visited room.
  known(r) {
    if (r.visited) return true
    for (const nbId of Object.values(r.doors)) {
      const nb = this.floor.rooms.get(nbId)
      if (nb && nb.visited) return true
    }
    return false
  }

  colorFor(r) {
    if (r === this.scene.curRoom) return COL.current
    if (!r.visited) return COL.hint
    if (r.type === 'boss') return r.cleared ? COL.cleared : COL.boss
    if (r.type === 'treasure') return COL.treasure
    if (r.cleared) return COL.cleared
    return COL.visited
  }

  // Draw the map into a Graphics at (x0,y0) with the given cell size + gap.
  paint(g, x0, y0, cell, gap) {
    const { minX, minY } = this.gb
    const cx = (r) => x0 + (r.gx - minX) * (cell + gap)
    const cy = (r) => y0 + (r.gy - minY) * (cell + gap)
    // door connectors between known rooms first (under the cells)
    g.lineStyle(2, COL.link, 0.8)
    for (const r of this.floor.rooms.values()) {
      if (!this.known(r)) continue
      for (const nbId of Object.values(r.doors)) {
        const nb = this.floor.rooms.get(nbId)
        if (!nb || !this.known(nb)) continue
        if (nb.gx < r.gx || (nb.gx === r.gx && nb.gy < r.gy)) continue // draw each pair once
        g.lineBetween(cx(r) + cell / 2, cy(r) + cell / 2, cx(nb) + cell / 2, cy(nb) + cell / 2)
      }
    }
    // cells
    for (const r of this.floor.rooms.values()) {
      if (!this.known(r)) continue
      const x = cx(r)
      const y = cy(r)
      if (r.visited) {
        g.fillStyle(this.colorFor(r), 1).fillRect(x, y, cell, cell)
        if (r === this.scene.curRoom) g.lineStyle(2, 0xffffff, 0.9).strokeRect(x - 1, y - 1, cell + 2, cell + 2)
      } else {
        // hinted but unentered — dim outline only
        g.lineStyle(1.5, COL.hint, 1).strokeRect(x, y, cell, cell)
      }
    }
  }

  refresh() {
    const g = this.g
    g.clear()
    const cell = 14
    const gap = 4
    const cols = this.gb.maxX - this.gb.minX + 1
    const gridW = cols * (cell + gap) - gap
    const x0 = GAME_WIDTH - 10 - gridW
    const y0 = 30
    this.paint(g, x0, y0, cell, gap)
    if (this._full) this.drawFull()
  }

  setFull(show) {
    if (show === this._full) return
    this._full = show
    if (show) {
      this.fullEls = []
      const bg = this.scene.fixUI(this.scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x05060c, 0.82).setOrigin(0, 0).setScrollFactor(0).setDepth(11900))
      const fg = this.scene.fixUI(this.scene.add.graphics().setScrollFactor(0).setDepth(11901))
      const title = this.scene.fixUI(pixelText(this.scene, GAME_WIDTH / 2, 40, `FLOOR ${this.scene.floor} MAP`, 12, '#ffe066').setScrollFactor(0).setDepth(11902))
      this.fullBg = bg
      this.fullG = fg
      this.fullEls.push(bg, fg, title)
      this.drawFull()
    } else {
      for (const e of this.fullEls || []) e.destroy()
      this.fullEls = []
      this.fullG = null
    }
  }

  drawFull() {
    if (!this.fullG) return
    const cell = 30
    const gap = 12
    const cols = this.gb.maxX - this.gb.minX + 1
    const rows = this.gb.maxY - this.gb.minY + 1
    const gridW = cols * (cell + gap) - gap
    const gridH = rows * (cell + gap) - gap
    const x0 = (GAME_WIDTH - gridW) / 2
    const y0 = (GAME_HEIGHT - gridH) / 2 + 10
    this.fullG.clear()
    this.paint(this.fullG, x0, y0, cell, gap)
  }
}
