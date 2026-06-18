// Procedural room-graph generator for the Dungeon Crawl's floors.
// Pure (no Phaser): returns { rooms: Map<id, room>, startId, bossId }. The scene
// turns each room's grid position into world-space bounds + walls/doors.
//
// A floor is a random walk of rooms on a GRID x GRID grid starting at the centre.
// Orthogonally-adjacent placed rooms get a door between them; the room farthest
// (in door-hops) from the start becomes the boss; a one-door leaf becomes treasure.

const DIRS = [
  { dx: 0, dy: -1, a: 'n', b: 's' },
  { dx: 1, dy: 0, a: 'e', b: 'w' },
  { dx: 0, dy: 1, a: 's', b: 'n' },
  { dx: -1, dy: 0, a: 'w', b: 'e' },
]

export const GRID = 5

// rng: a function returning [0,1). Pass a Phaser RND.frac binding in-game, or
// Math.random / a stub in tests.
export function generateFloor(floorNum, rng = Math.random) {
  const count = Math.min(4 + Math.floor(floorNum / 1.5) + Math.floor(rng() * 2), 8) // 4..8, grows with depth
  const key = (x, y) => `${x},${y}`
  const rooms = new Map()
  const cx = 2
  const cy = 2
  const add = (x, y, type) => {
    const r = { id: key(x, y), gx: x, gy: y, type, doors: {}, cleared: false, visited: false }
    rooms.set(r.id, r)
    return r
  }
  add(cx, cy, 'start')
  const frontier = [{ x: cx, y: cy }]
  let guard = 0
  while (rooms.size < count && guard++ < 1000) {
    const from = frontier[Math.floor(rng() * frontier.length)]
    const d = DIRS[Math.floor(rng() * 4)]
    const nx = from.x + d.dx
    const ny = from.y + d.dy
    if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue
    if (!rooms.has(key(nx, ny))) {
      add(nx, ny, 'combat')
      frontier.push({ x: nx, y: ny })
    }
  }

  // link every orthogonally-adjacent placed pair with a door
  for (const r of rooms.values()) {
    for (const d of DIRS) {
      const nb = rooms.get(key(r.gx + d.dx, r.gy + d.dy))
      if (nb) r.doors[d.a] = nb.id
    }
  }

  // BFS door-distance from start; the farthest room is the boss
  const startId = key(cx, cy)
  const dist = bfs(rooms, startId)
  let bossId = startId
  let far = -1
  for (const [id, dd] of dist) {
    if (dd > far) {
      far = dd
      bossId = id
    }
  }
  rooms.get(bossId).type = 'boss'

  // a non-start, non-boss dead-end (single door) becomes the treasure room
  for (const r of rooms.values()) {
    if (r.type === 'combat' && Object.keys(r.doors).length === 1) {
      r.type = 'treasure'
      break
    }
  }

  return { rooms, startId, bossId }
}

function bfs(rooms, startId) {
  const dist = new Map([[startId, 0]])
  const q = [startId]
  while (q.length) {
    const id = q.shift()
    for (const nbId of Object.values(rooms.get(id).doors)) {
      if (!dist.has(nbId)) {
        dist.set(nbId, dist.get(id) + 1)
        q.push(nbId)
      }
    }
  }
  return dist
}
