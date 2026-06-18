# Dungeon v2 — Rooms & Ancient Skin (R+A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Challenge mode's floor from one open chamber into a Soul-Knight graph of discrete rooms (combat / stealth / treasure / boss) with a minimap, reskinned as molten "Obsidian Ruins".

**Architecture:** Lay the whole floor out in ONE world-space coordinate system — each room is a rectangular region on a grid, enclosed by obsidian walls with door-gaps to adjacent rooms. The existing follow-camera, fog/lantern, `Hunter.js`, Emberhand and boss controller are reused unchanged; "panning between rooms" is just the camera following the player through a door-gap. Combat rooms seal their door-gaps with barriers until cleared. A `FloorGen` module builds the room graph; `Room` holds per-room state; `Minimap` draws the corner + TAB map.

**Tech Stack:** Phaser 3.90, Vite 5, vanilla JS ES modules. Higgsfield (nano_banana_pro) for the ancient props. Verification: `npm run build` + Playwright programmatic checks against the running dev server (the project has no unit-test harness; this is how the whole game is verified — robust to the headless-WebGL glitch).

**Verification harness:** dev server `npm run dev` (from the project dir, sandbox-disabled), Playwright installed at `/home/yurin/cq-scratch` (chromium cached in `~/.cache/ms-playwright`). Scripts go in `/home/yurin/cq-scratch/*.mjs`, navigate to `http://localhost:5173/#dungeon`, wait for `window.__game.scene.isActive('DungeonCrawl')`, then `evaluate()` against `window.__game.scene.getScene('DungeonCrawl')`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/dungeon/FloorGen.js` | **Create.** Pure function: generate a room graph (grid positions, types, door links) for a floor number. No Phaser. |
| `src/dungeon/Room.js` | **Create.** A small class/factory: room bounds in world space, doors, type, cleared/visited flags, helper `contains(x,y)`. No Phaser rendering. |
| `src/dungeon/Minimap.js` | **Create.** Draws the corner minimap + TAB full-floor overlay from a Floor + explored state. |
| `src/scenes/DungeonCrawl.js` | **Modify.** Replace `buildArena()`/single-chamber + stealth/gate flow with the room system; keep player, camera, fog, Emberhand, boss fight, retry/depth. |
| `public/assets/game/dungeon/` | **Create.** Higgsfield obsidian props: `obelisk.png`, `brazier.png`, `statue.png`, `altar.png`, `rubble.png`. |
| `src/scenes/Preload.js` | **Modify.** Load the dungeon prop images. |

**Constants reused:** `TILE=24`. New: `ROOM_COLS=15, ROOM_ROWS=11` (a room is 360×264px), `GRID=5` (max 5×5 room grid), `DOOR_GAP=3` tiles.

---

## Phase R+A1 — room skeleton (playable floor of rooms)

### Task 1: FloorGen — the room graph

**Files:** Create `src/dungeon/FloorGen.js`

- [ ] **Step 1: Implement the generator**

A floor is a random-walk of rooms on a `GRID×GRID` grid, starting center. Place `count` rooms, link orthogonally-adjacent placed rooms with doors, mark the room with the largest path-distance from start as `boss`, one leaf as `treasure`, rest `combat`.

```js
// src/dungeon/FloorGen.js
const DIRS = [ {dx:0,dy:-1,a:'n',b:'s'}, {dx:1,dy:0,a:'e',b:'w'}, {dx:0,dy:1,a:'s',b:'n'}, {dx:-1,dy:0,a:'w',b:'e'} ]

// rng: a seeded/plain function returning [0,1). Pass Phaser.Math.RND.frac bound, or Math.random in tests.
export function generateFloor(floorNum, rng = Math.random) {
  const G = 5
  const count = Math.min(4 + Math.floor(floorNum / 1.5) + Math.floor(rng() * 2), 8) // 4..8 grows with depth
  const key = (x, y) => `${x},${y}`
  const rooms = new Map()
  const cx = 2, cy = 2
  const add = (x, y, type) => { const r = { id: key(x, y), gx: x, gy: y, type, doors: {}, cleared: false, visited: false }; rooms.set(r.id, r); return r }
  add(cx, cy, 'start')
  let frontier = [{ x: cx, y: cy }]
  while (rooms.size < count) {
    const from = frontier[Math.floor(rng() * frontier.length)]
    const d = DIRS[Math.floor(rng() * 4)]
    const nx = from.x + d.dx, ny = from.y + d.dy
    if (nx < 0 || ny < 0 || nx >= G || ny >= G) continue
    if (!rooms.has(key(nx, ny))) { add(nx, ny, 'combat'); frontier.push({ x: nx, y: ny }) }
  }
  // link every orthogonally-adjacent placed pair with a door
  for (const r of rooms.values()) {
    for (const d of DIRS) {
      const nb = rooms.get(key(r.gx + d.dx, r.gy + d.dy))
      if (nb) r.doors[d.a] = nb.id
    }
  }
  // BFS distance from start; farthest = boss
  const startId = key(cx, cy)
  const dist = bfs(rooms, startId)
  let bossId = startId, far = -1
  for (const [id, dd] of dist) if (dd > far) { far = dd; bossId = id }
  rooms.get(bossId).type = 'boss'
  // a non-start, non-boss leaf (one door) becomes treasure
  for (const r of rooms.values()) {
    if (r.type === 'combat' && Object.keys(r.doors).length === 1) { r.type = 'treasure'; break }
  }
  return { rooms, startId, bossId }
}

function bfs(rooms, startId) {
  const dist = new Map([[startId, 0]])
  const q = [startId]
  while (q.length) {
    const id = q.shift()
    for (const nbId of Object.values(rooms.get(id).doors)) {
      if (!dist.has(nbId)) { dist.set(nbId, dist.get(id) + 1); q.push(nbId) }
    }
  }
  return dist
}
```

- [ ] **Step 2: Verify in Node** (pure module, no Phaser)

Run: `cd /home/yurin/.claude/GameDevelopment && node -e "import('./src/dungeon/FloorGen.js').then(m=>{const f=m.generateFloor(1,()=>0.5);console.log('rooms',f.rooms.size,'start',f.startId,'boss',f.bossId);const types=[...f.rooms.values()].map(r=>r.type);console.log('types',types.join(','));const allLinked=[...f.rooms.values()].every(r=>Object.keys(r.doors).length>0);console.log('all linked',allLinked)})"`
Expected: `rooms 4..8`, exactly one `start`, one `boss`, ≤1 `treasure`, `all linked true`.

- [ ] **Step 3: Commit**

```bash
git add src/dungeon/FloorGen.js
git commit -m "Add dungeon FloorGen room-graph generator (R+A1)"
```

### Task 2: Build the room world (walls, doors, player spawn)

**Files:** Modify `src/scenes/DungeonCrawl.js`

- [ ] **Step 1: Add room geometry.** New constants `ROOM_COLS=15, ROOM_ROWS=11`, `ROOM_W=ROOM_COLS*TILE`, `ROOM_H=ROOM_ROWS*TILE`, `GRID=5`. World = `GRID*ROOM_W × GRID*ROOM_H`. Replace `buildArena()` with `buildFloor()`:
  - `this.floorData = generateFloor(this.floor, () => Phaser.Math.RND.frac())`.
  - For each room: compute world bounds `{x: gx*ROOM_W, y: gy*ROOM_H, w: ROOM_W, h: ROOM_H}`; store on the room (`room.bounds`).
  - Draw the obsidian floor (flagstone graphics) only under placed rooms.
  - For each room edge: if no door on that edge, fill the whole edge with wall obstacles (`addObstacle` stone blocks); if a door exists, leave a `DOOR_GAP`-tile gap centered on the edge and place a `door` marker object there (store `room.doorObjs[dir]`).
  - Spawn the player at the start room center; set `this.physics.world.setBounds` + camera bounds to the full world.
- [ ] **Step 2: Build + screenshot** to confirm rooms render with wall boundaries and door gaps. Run the dev server, Playwright `garg.mjs`-style screenshot at `#dungeon`.
- [ ] **Step 3: Commit** `git commit -m "Build room-graph world with walls + doors (R+A1)"`

### Task 3: Current-room tracking, combat seal/clear, basic melee

**Files:** Modify `src/scenes/DungeonCrawl.js`

- [ ] **Step 1: Current room.** Each update, find the room whose `bounds` contains the player → `this.room`. On entering a new room, mark `visited`, and if `combat`/`boss` and not `cleared`, call `enterCombat(room)`.
- [ ] **Step 2: Seal/spawn.** `enterCombat(room)`: place barrier obstacles in every door gap (store to remove later); spawn `roomEnemyCount(room)` hunters inside the room bounds (reuse `new Hunter`, give each `hunter.hp = 2`); overlap player↔hunter still calls `caughtByHunter`.
- [ ] **Step 3: Basic melee.** Bind attack (key `J` + touch `attackL`): on edge, sweep an arc ~40px in `faceX/faceY`; any hunter within range+arc takes 1 dmg (`hunter.hp--`); at 0 call `banishHunter(h,false)`. A small swing FX (a short white arc/`CombatSystem.puff`). This is the placeholder; W replaces the visual.
- [ ] **Step 4: Clear.** When a sealed room's hunters are all gone → `room.cleared=true`, remove its barriers (open doors), small SFX.
- [ ] **Step 5: Verify** (Playwright): teleport into a combat room, assert doors sealed + hunters spawned; call melee repeatedly / `banishHunter` to clear; assert `room.cleared` and barriers removed; 0 errors.
- [ ] **Step 6: Commit** `git commit -m "Add room combat: seal/clear + basic melee (R+A1)"`

### Task 4: Boss room + stairs + descend (reuse existing fight)

**Files:** Modify `src/scenes/DungeonCrawl.js`

- [ ] **Step 1:** When the player enters the `boss` room, run the EXISTING `startBoss()` flow (seal the room's doors instead of the old wall; spawn the boss at room center). Remove the old `gate`/`bossSpot` single-chamber code.
- [ ] **Step 2:** On `bossDown()` → `spawnStairs()` at the boss room center; `checkStairs()` → `scene.restart({floor:this.floor+1})`. Keep `setUiMood`, depth/won save, retry overlay unchanged.
- [ ] **Step 3: Verify** the full loop (Playwright): generate floor → walk/teleport room to room → boss room seals + boss spawns → kill → stairs → next floor; retry overlay on death; depth saved; 0 errors.
- [ ] **Step 4: Commit + GATE** `git commit -m "Wire boss room + stairs into room system (R+A1)"` — R+A1 is a playable floor-of-rooms. Screenshot-verify, then continue.

---

## Phase R+A2 — the map

### Task 5: Corner minimap

**Files:** Create `src/dungeon/Minimap.js`; modify `src/scenes/DungeonCrawl.js`

- [ ] **Step 1:** `Minimap` draws a top-right grid from `floorData.rooms`: each placed room a small cell at its `gx,gy`; color by state — current (pulsing gold), cleared (solid), visited-not-cleared (dim), boss (red), treasure (gold star), adjacent-unvisited (dashed outline). A scrollFactor(0) Graphics at high depth, redrawn when room state changes.
- [ ] **Step 2:** Scene creates the minimap in `create()`, updates it on room enter/clear.
- [ ] **Step 3: Verify** (Playwright): assert the minimap graphics exists and the current/visited set matches the rooms walked; screenshot. 0 errors.
- [ ] **Step 4: Commit** `git commit -m "Add corner minimap (R+A2)"`

### Task 6: TAB full-floor overlay

**Files:** Modify `src/dungeon/Minimap.js`, `src/scenes/DungeonCrawl.js`

- [ ] **Step 1:** Hold/press `TAB` (and `M`) → draw a large centered version of the same map (scaled up, dimmed backdrop) at depth 12000; release/toggle hides it.
- [ ] **Step 2: Verify** (Playwright): press TAB → overlay container visible; release → hidden; 0 errors. Screenshot.
- [ ] **Step 3: Commit** `git commit -m "Add TAB full-floor map overlay (R+A2)"`

---

## Phase R+A3 — Obsidian skin

### Task 7: Obsidian floor + walls + molten cracks

**Files:** Modify `src/scenes/DungeonCrawl.js`

- [ ] **Step 1:** Reskin the floor draw: base `0x18121c` volcanic stone flagstones (grid), scattered darker tiles, plus ~3–5 **animated molten cracks** per room (thin `0xff5a2a` lines with a pulsing glow tween). Walls: tint the obstacle blocks obsidian `0x2a2030` with a faint molten rim. Fog color → near-black `0x05030a`.
- [ ] **Step 2: Verify** screenshot — reads as molten obsidian, lantern pool visible, cracks glow. 0 errors.
- [ ] **Step 3: Commit** `git commit -m "Reskin dungeon as Obsidian Ruins (R+A3)"`

### Task 8: Higgsfield ancient props

**Files:** Create `public/assets/game/dungeon/{obelisk,brazier,statue,altar,rubble}.png`; modify `src/scenes/Preload.js`, `src/scenes/DungeonCrawl.js`

- [ ] **Step 1: Generate** (main session, Higgsfield `generate_image` nano_banana_pro, 1:1, flat grey bg, single object): an ancient cracked **obelisk** with molten cracks; a lit **brazier** (stone bowl, molten fire); a broken **statue** (eroded guardian); a cracked **altar**; a **rubble** pile. Prompt each "top-down / slight-3-quarter dark-fantasy game prop, black volcanic stone, glowing molten orange cracks, flat neutral grey background, single object, no text".
- [ ] **Step 2: Key + trim** each via the pipeline (`/home/yurin/cq-scratch` or recreate `vid_to_alpha.py`-style still keyer) to a transparent PNG, ~48–72px tall. Download, key the grey, crop.
- [ ] **Step 3: Load + place.** Preload `this.load.image('dprop-obelisk', ...)` etc. In room build, scatter 1–3 props per room as cover (add to `wallRects` for the big ones, decorative for small). Braziers cast a light pool (reuse torch glow).
- [ ] **Step 4: Verify** screenshot — props read as ancient/molten, placed sensibly, light from braziers. 0 errors.
- [ ] **Step 5: Commit** `git commit -m "Add Higgsfield ancient props to dungeon rooms (R+A3)"`

### Task 9: Stealth/ambush + treasure room variants

**Files:** Modify `src/scenes/DungeonCrawl.js`

- [ ] **Step 1: Stealth room.** ~1 combat room per floor (flagged in build) is a **stealth** room: hunters spawn already PATROL/unaware, doors DON'T seal; reaching the far door clears it, or stealth-kill/ward all. The lantern + detection matter.
- [ ] **Step 2: Treasure room.** The `treasure` room holds a pickup at center: walking over it grants a heal (or a brief ward-cooldown buff); a chest/altar visual.
- [ ] **Step 3: Verify** (Playwright): a floor has a stealth room (unsealed, unaware hunters) and a treasure pickup that applies its effect; 0 errors.
- [ ] **Step 4: Commit + push hand-off** `git commit -m "Add stealth + treasure room variants (R+A3)"` then hand the push to the user (`! git -C ... push`).

---

## Self-Review (against the spec)

- **Hybrid rooms (combat-clear + stealth + treasure + boss)** → Tasks 3, 4, 9. ✓
- **Procedural branching ~5–8 rooms/floor** → Task 1 (`count` 4..8, random walk, BFS-farthest boss). ✓
- **Follow-camera panning door to door** → Task 2 (one world, camera bounds = whole floor, door gaps). ✓
- **Obsidian Ruins skin + Higgsfield props** → Tasks 7, 8. ✓
- **Corner minimap + TAB overlay** → Tasks 5, 6. ✓
- **Basic melee now, W upgrades later; Emberhand for bosses; stealth-kills carry** → Task 3 + Task 4 (boss reuse). ✓
- **Module split FloorGen / Room / Minimap** → Tasks 1, 5 (+ Room state folded into FloorGen's room objects; a separate `Room.js` is optional if the plain objects suffice — keep them in FloorGen if `Room.js` adds no behavior). ✓
- **Reuse Hunter/fog/Emberhand/boss/retry/depth** → Tasks 3, 4. ✓
- **Verification via build + Playwright** → every task. ✓

Note: the spec lists `Room.js` as a file; in practice the room objects from `FloorGen` carry their own state and bounds, so a separate class may be unnecessary. The plan folds room state into those objects and only creates `Room.js` if behavior (not just data) emerges — avoiding an empty wrapper (YAGNI).
