#!/usr/bin/env python3
# CodeQuest MATLAB-Marsh level generator. Authors the inline ASCII maps in
# public/data/levels/*.json from a grid model, validates footing + reachability,
# and renders PNG previews to /tmp/mapprev. RUN FROM THE REPO ROOT:
#     python3 tools/genmaps.py
# (the paths below are relative to the working directory, not this script).
import json, os, sys
from collections import deque
from PIL import Image

LV_DIR = 'public/data/levels'
SHEET = 'public/assets/platformer-art-pixel/Tilemap/tilemap_packed.png'
OOZE = 'public/assets/game/enemies/ooze/walk.png'
TILE = 21; COLS = 30
TOP = [301, 303, 305]; FILL = 334; ONEWAY = 334
TINT = (0x47, 0x56, 0x6e); ONEWAY_TINT = (0x85, 0x97, 0xb0); LADDER_TINT = (0xb7, 0xc6, 0xdc)

# ---------------- grid model ----------------
class Grid:
    def __init__(self, w, h):
        self.w = w; self.h = h
        self.g = [[' '] * w for _ in range(h)]
    def setc(self, c, r, ch):
        if 0 <= r < self.h and 0 <= c < self.w: self.g[r][c] = ch
    def get(self, c, r):
        if 0 <= r < self.h and 0 <= c < self.w: return self.g[r][c]
        return ' '
    def floor(self, r, c0, c1):
        for c in range(c0, c1 + 1): self.setc(c, r, '#')
    def block(self, r0, r1, c0, c1):
        for r in range(r0, r1 + 1):
            for c in range(c0, c1 + 1): self.setc(c, r, '#')
    def oneway(self, r, c0, c1):
        for c in range(c0, c1 + 1): self.setc(c, r, '=')
    def ladder(self, c, r0, r1):
        for r in range(r0, r1 + 1): self.setc(c, r, 'H')
    def put(self, c, r, ch): self.setc(c, r, ch)
    def rows(self): return [''.join(row).rstrip() for row in self.g]

def climb(g, col, surface_row, floor_row):
    # Ladder that punches THROUGH the destination platform: its top rung sits at
    # the standing row (surface_row-1) so you climb up onto the surface, and the
    # rungs overwrite the solid tile at (col, surface_row), leaving a gap to pass
    # through. Grounded on floor_row (bottom rung at floor_row-1).
    g.ladder(col, surface_row - 1, floor_row - 1)

def passable(ch): return ch in ' PEODM'
def support(ch): return ch in '#='

# ---------------- validation ----------------
def validate(grid, name):
    errs = []
    g = grid
    Ecells = []; H_cols = {}
    spawn = portal = None
    for r in range(g.h):
        for c in range(g.w):
            ch = g.get(c, r)
            if ch in 'EDM': Ecells.append((c, r))
            elif ch == 'H': H_cols.setdefault(c, []).append(r)
            elif ch == 'P': spawn = (c, r)
            elif ch == 'O': portal = (c, r)
    if not spawn: errs.append('no spawn P')
    if not portal: errs.append('no portal O')
    # enemies need solid directly below and headroom
    for (c, r) in Ecells:
        if g.get(c, r + 1) != '#':
            errs.append(f'enemy ({c},{r}) has no SOLID # directly below (got {g.get(c,r+1)!r})')
        if not passable(g.get(c, r - 1)):
            errs.append(f'enemy ({c},{r}) has no headroom above')
    # ladders: contiguous, grounded at bottom, step-off at top
    for c, rs in H_cols.items():
        rs = sorted(rs)
        if rs != list(range(rs[0], rs[-1] + 1)):
            errs.append(f'ladder col {c} not contiguous: {rs}')
        bottom = rs[-1]
        if not support(g.get(c, bottom + 1)):
            errs.append(f'ladder col {c} bottom ({c},{bottom}) not grounded')
        top = rs[0]
        stepoff = support(g.get(c - 1, top + 1)) or support(g.get(c + 1, top + 1)) or support(g.get(c, top - 1))
        if not stepoff:
            errs.append(f'ladder col {c} top ({c},{top}) has no step-off footing')
    # portal footing within 2 rows
    if portal:
        pc, pr = portal
        if not any(g.get(pc, pr + k) == '#' for k in range(1, 4)):
            errs.append(f'portal ({pc},{pr}) has no footing below')
    return errs, spawn, portal, Ecells, H_cols

# ---------------- reachability (permissive, double-jump aware) ----------------
def walkable(ch): return ch in ' PEOHDM'  # tiles a body can occupy (not solid/one-way)

def standable(g, c, r):
    ch = g.get(c, r)
    if ch == 'H': return True            # can cling anywhere on a ladder
    if not passable(ch): return False
    below = g.get(c, r + 1)
    return support(below) or below == 'H'

def reachable_set(g, start):
    seen = {start}; dq = deque([start])
    JX = 4; JUP = 3
    def add(nc, nr):
        if (nc, nr) not in seen and 0 <= nc < g.w and 0 <= nr < g.h and standable(g, nc, nr):
            seen.add((nc, nr)); dq.append((nc, nr))
    while dq:
        c, r = dq.popleft()
        # walk / step up or down one
        for dx in (-1, 1):
            for dy in (-1, 0, 1): add(c + dx, r + dy)
        # walk off an edge and fall into the adjacent column
        for dx in (-1, 1):
            nc = c + dx; rr = r
            while rr < g.h and walkable(g.get(nc, rr)):
                if standable(g, nc, rr): add(nc, rr); break
                rr += 1
        # drop straight down
        rr = r + 1
        while rr < g.h and walkable(g.get(c, rr)):
            if standable(g, c, rr): add(c, rr); break
            rr += 1
        # jump/leap across a gap: up to JX cols sideways, JUP up or a few down
        for dx in range(-JX, JX + 1):
            for up in range(1, JUP + 1): add(c + dx, r - up)   # jump up
            for dn in range(0, 6): add(c + dx, r + dn)         # level leap / drop across
        # ladder: climb the whole column, step off either side at every rung
        if g.get(c, r) == 'H' or g.get(c, r + 1) == 'H':
            col = [rr for rr in range(g.h) if g.get(c, rr) == 'H']
            for hr in col:
                add(c, hr)
                for dx in (-1, 1):
                    add(c + dx, hr); add(c + dx, hr + 1)
    return seen

def spawn_landing(g, spawn):
    c, r = spawn
    rr = r
    while rr < g.h - 1 and not standable(g, c, rr):
        rr += 1
    return (c, rr)

def check_reach(g, spawn, portal, Ecells):
    start = spawn_landing(g, spawn)
    R = reachable_set(g, start)
    probs = []
    # portal reachable if any tile adjacent/at portal column base is reachable
    pc, pr = portal
    pbase = pr
    while pbase < g.h - 1 and not standable(g, pc, pbase): pbase += 1
    if (pc, pbase) not in R: probs.append(f'portal not reachable from spawn (start={start}, portalbase=({pc},{pbase}))')
    for (c, r) in Ecells:
        if (c, r) not in R: probs.append(f'enemy ({c},{r}) not reachable')
    return probs, R, start

# ---------------- preview render ----------------
def load_tiles():
    im = Image.open(SHEET).convert('RGBA')
    def tile(idx):
        c = idx % COLS; r = idx // COLS
        return im.crop((c * TILE, r * TILE, (c + 1) * TILE, (r + 1) * TILE))
    return tile

def mult(img, t):
    out = img.copy(); px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            px[x, y] = (r * t[0] // 255, g * t[1] // 255, b * t[2] // 255, a)
    return out

def render(grid, path):
    g = grid; tile = load_tiles()
    capL, capM, capR = [mult(tile(i), TINT) for i in TOP]
    fill = mult(tile(FILL), TINT)
    oneway = mult(tile(ONEWAY), ONEWAY_TINT)
    ooze = Image.open(OOZE).convert('RGBA').crop((0, 0, 64, 50))
    ooze = ooze.resize((int(64 * 0.68), int(50 * 0.68)), Image.NEAREST)
    demon = Image.open('public/assets/game/enemies/demon/walk.png').convert('RGBA').crop((0, 0, 64, 56))
    demon = demon.resize((int(64 * 0.70), int(56 * 0.70)), Image.NEAREST)
    mage = Image.open('public/assets/game/enemies/mage/walk.png').convert('RGBA').crop((0, 0, 58, 64))
    mage = mage.resize((int(58 * 0.62), int(64 * 0.62)), Image.NEAREST)
    sprites = {'E': ooze, 'D': demon, 'M': mage}
    img = Image.new('RGBA', (g.w * TILE, g.h * TILE), (27, 34, 51, 255))
    def issolid(c, r): return g.get(c, r) == '#'
    for r in range(g.h):
        for c in range(g.w):
            ch = g.get(c, r); x = c * TILE; y = r * TILE
            if ch == '#':
                if issolid(c, r - 1): t = fill
                else: t = capL if not issolid(c - 1, r) else (capR if not issolid(c + 1, r) else capM)
                img.alpha_composite(t, (x, y))
            elif ch == '=':
                img.alpha_composite(oneway, (x, y))
            elif ch == 'H':
                lad = Image.new('RGBA', (TILE, TILE), (0, 0, 0, 0)); p = lad.load()
                for yy in range(TILE):
                    for xx in (3, 4, 5, 15, 16, 17): p[xx, yy] = (*LADDER_TINT, 255)
                for yy in (3, 4, 5, 13, 14, 15):
                    for xx in range(4, 17): p[xx, yy] = (*LADDER_TINT, 255)
                img.alpha_composite(lad, (x, y))
    # entities on top
    for r in range(g.h):
        for c in range(g.w):
            ch = g.get(c, r); x = c * TILE; y = r * TILE
            if ch in 'EDM':
                spr = sprites[ch]
                fx = x + TILE // 2 - spr.width // 2
                fy = (r + 1) * TILE - spr.height
                img.alpha_composite(spr, (fx, fy))
            elif ch == 'P':
                d = Image.new('RGBA', (12, 18), (90, 210, 120, 255)); img.alpha_composite(d, (x + 4, y + 2))
            elif ch == 'O':
                d = Image.new('RGBA', (16, 32), (255, 220, 100, 255)); img.alpha_composite(d, (x + 2, y - 10))
    img.convert('RGB').save(path)

# ---------------- level designs ----------------
# Reachability budget (validator): jumps span <=4 columns and rise <=3 rows; bigger
# rises need a climb() ladder. Pits are kept to 3 empty columns so a jump clears
# them. Ground floors are two rows; ledges/platforms are one row.

def lvl1():
    # First Steps (reachPortal): a gentle, longer warm-up. Three ground spans linked
    # by short jumps, a low ledge and a one-way step to teach verticality, a sniping
    # Mage on the home stretch, then a ladder up to the portal perch. 5 Ooze + 1 Mage.
    g = Grid(112, 22)
    g.put(5, 1, 'P')
    g.floor(18, 1, 30); g.floor(19, 1, 30)           # ground A
    g.put(12, 17, 'E')                               # first ooze (easy)
    g.floor(15, 18, 24)                              # low ledge L1
    g.put(21, 14, 'E')                               # ooze on L1
    g.floor(18, 34, 64); g.floor(19, 34, 64)         # ground B (gap 31..33)
    g.put(44, 17, 'E')                               # ooze B
    g.oneway(15, 40, 46)                             # one-way step (optional)
    g.put(56, 17, 'M')                               # mage snipes the approach
    g.floor(18, 68, 110); g.floor(19, 68, 110)       # ground C (gap 65..67)
    g.put(78, 17, 'E')                               # ooze C
    g.put(90, 17, 'E')                               # ooze C
    g.floor(13, 95, 108)                             # portal perch
    climb(g, 100, 13, 18)                            # ladder ground C -> perch
    g.put(103, 12, 'O')
    return 'matlab-01', 'First Steps', 'reachPortal', 'matlab-intro', g

def lvl2():
    # Marsh Path (reachPortal): a long low road guarded by two Demons, with an
    # OPTIONAL high route (two ladders up to a Mage sniping the whole left side) and
    # a mid platform Mage on the right. Ladder to the portal perch. 5 Ooze 2 Demon 2 Mage.
    g = Grid(132, 23)
    g.put(4, 1, 'P')
    g.floor(20, 1, 44); g.floor(21, 1, 44)           # ground A
    g.floor(20, 48, 88); g.floor(21, 48, 88)         # ground B (gap 45..47)
    g.floor(20, 92, 130); g.floor(21, 92, 130)       # ground C (gap 89..91)
    # optional high route over A
    g.floor(14, 8, 20)                               # platform P1
    climb(g, 16, 14, 20)                             # ladder A -> P1
    g.put(11, 13, 'E')                               # ooze on P1
    g.floor(9, 14, 24)                               # platform P2 (high)
    climb(g, 18, 9, 14)                              # ladder P1 -> P2
    g.put(21, 8, 'M')                                # sniping mage (high left)
    # low road threats
    g.put(34, 19, 'D')                               # demon A
    g.put(54, 19, 'E')                               # ooze B
    g.put(64, 19, 'D')                               # demon B
    g.put(74, 19, 'E')                               # ooze B
    g.put(108, 19, 'E')                              # ooze C (clear of the mid ladder at col100)
    g.put(116, 19, 'E')                              # ooze C
    # mid platform over C with a mage
    g.floor(15, 96, 106)
    climb(g, 100, 15, 20)
    g.put(103, 14, 'M')
    # portal perch
    g.floor(15, 118, 129)
    climb(g, 124, 15, 20)
    g.put(126, 14, 'O')
    return 'matlab-02', 'Marsh Path', 'reachPortal', 'matlab-variables', g

def lvl3():
    # Reeds & Roots (defeatAll): the finale. Descend three left tiers (ooze, ooze,
    # demon), brawl across a three-span arena (oozes + demons), then climb the right
    # tiers past two Mages to the portal. 6 Ooze + 3 Demon + 2 Mage.
    g = Grid(140, 25)
    g.put(3, 1, 'P')
    g.floor(6, 1, 12); g.floor(7, 1, 12)             # tier T1
    g.put(8, 5, 'E')
    g.floor(11, 8, 20)                               # tier T2
    g.put(15, 10, 'E')
    g.floor(16, 16, 30)                              # tier T3
    g.put(24, 15, 'D')
    # arena floor (three spans)
    g.floor(22, 1, 46); g.floor(23, 1, 46)
    g.floor(22, 50, 92); g.floor(23, 50, 92)         # gap 47..49
    g.floor(22, 96, 139); g.floor(23, 96, 139)       # gap 93..95
    g.put(12, 21, 'E')
    g.put(36, 21, 'D')
    g.put(60, 21, 'E')
    g.put(78, 21, 'D')
    g.put(108, 21, 'E')
    g.put(124, 21, 'E')
    # mid platform with a mage
    g.floor(16, 54, 70)
    climb(g, 58, 16, 22)
    g.put(64, 15, 'M')
    # right tiers up to the portal
    g.floor(16, 100, 116)                            # R1
    climb(g, 104, 16, 22)
    g.floor(10, 112, 128)                            # R2
    climb(g, 116, 10, 16)
    g.put(122, 9, 'M')
    g.put(126, 9, 'O')
    return 'matlab-03', 'Reeds & Roots', 'defeatAll', 'matlab-arrays', g

def main():
    os.makedirs('/tmp/mapprev', exist_ok=True)
    ok = True
    for fn in (lvl1, lvl2, lvl3):
        lid, name, obj, lesson, g = fn()
        errs, spawn, portal, E, H = validate(g, lid)
        reach, R, start = check_reach(g, spawn, portal, E) if spawn and portal else (['no spawn/portal'], set(), None)
        status = 'CLEAN' if not errs and not reach else 'PROBLEMS'
        if errs or reach: ok = False
        ec = sum(1 for (c, r) in E if g.get(c, r) == 'E')
        dc = sum(1 for (c, r) in E if g.get(c, r) == 'D')
        mc = sum(1 for (c, r) in E if g.get(c, r) == 'M')
        print(f'\n=== {lid} ({name}) {g.w}x{g.h}  enemies={len(E)} (E{ec} D{dc} M{mc})  {status} ===')
        for e in errs: print('  FOOTING:', e)
        for e in reach: print('  REACH  :', e)
        data = {
            'id': lid, 'world': 'matlab', 'index': int(lid[-1]), 'name': name,
            'objective': {'type': obj}, 'lessonId': lesson, 'isBoss': False, 'bossId': None,
            'layout': g.rows(),
        }
        with open(os.path.join(LV_DIR, lid + '.json'), 'w') as f:
            json.dump(data, f, indent=2)
        render(g, f'/tmp/mapprev/{lid}.png')
        print(f'  wrote {lid}.json + preview')
    print('\nALL CLEAN' if ok else '\nHAS PROBLEMS')
    sys.exit(0 if ok else 1)

if __name__ == '__main__':
    main()
