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
# rises need a climb() ladder. The levels are vertical towers: a two-row full-width
# base plus single-row floors stacked ~5 rows apart and staggered left/right, each
# linked to the next only by a climb() ladder (col must be interior to the upper
# floor and grounded on the lower one). The base catches falls so they're recoverable.

def lvl1():
    # First Steps (reachPortal): a gentle vertical warm-up. A nine-floor tower whose
    # staggered ledges (alternating left/right) are linked only by ladders, so you
    # climb from the ground spawn up to the portal perch, crossing each floor past a
    # light enemy on the way. Full-width base catches any fall. 5 Ooze + 1 Mage.
    g = Grid(40, 48)
    g.floor(44, 1, 39); g.floor(45, 1, 39)           # F0 base (full width, safe landing)
    g.put(4, 43, 'P')
    g.floor(39, 12, 32); climb(g, 13, 39, 44); g.put(26, 38, 'E')   # F1
    g.floor(34, 1, 21);  climb(g, 19, 34, 39); g.put(8, 33, 'E')    # F2
    g.floor(29, 14, 34); climb(g, 20, 29, 34); g.put(28, 28, 'M')   # F3 (mage snipes)
    g.floor(24, 2, 22);  climb(g, 15, 24, 29); g.put(10, 23, 'E')   # F4
    g.floor(19, 14, 34); climb(g, 21, 19, 24); g.put(28, 18, 'E')   # F5
    g.floor(14, 2, 22);  climb(g, 16, 14, 19); g.put(8, 13, 'E')    # F6
    g.floor(9, 12, 30);  climb(g, 14, 9, 14)                        # F7
    g.floor(4, 12, 26);  climb(g, 22, 4, 9)                         # F8 portal perch
    g.put(20, 3, 'O')
    return 'matlab-01', 'First Steps', 'reachPortal', 'matlab-intro', g

def lvl2():
    # Marsh Path (reachPortal): a taller ten-floor climb that raises the threat. Same
    # staggered-ladder tower, now guarded by two Demons (low floors) and two sniping
    # Mages (mid floors) among the oozes. Full-width base. 5 Ooze 2 Demon 2 Mage.
    g = Grid(44, 54)
    g.floor(50, 1, 43); g.floor(51, 1, 43)           # F0 base
    g.put(4, 49, 'P')
    g.floor(45, 12, 36); climb(g, 14, 45, 50); g.put(26, 44, 'D')   # F1 demon
    g.floor(40, 2, 26);  climb(g, 24, 40, 45); g.put(8, 39, 'E')    # F2
    g.floor(35, 16, 40); climb(g, 18, 35, 40); g.put(34, 34, 'M')   # F3 mage
    g.floor(30, 4, 28);  climb(g, 26, 30, 35); g.put(10, 29, 'E')   # F4
    g.floor(25, 16, 40); climb(g, 20, 25, 30); g.put(34, 24, 'D')   # F5 demon
    g.floor(20, 4, 28);  climb(g, 22, 20, 25); g.put(10, 19, 'E')   # F6
    g.floor(15, 14, 38); climb(g, 16, 15, 20); g.put(32, 14, 'M')   # F7 mage
    g.floor(10, 2, 26);  climb(g, 25, 10, 15); g.put(8, 9, 'E'); g.put(22, 9, 'E')  # F8
    g.floor(5, 14, 30);  climb(g, 17, 5, 10)                        # F9 portal perch
    g.put(24, 4, 'O')
    return 'matlab-02', 'Marsh Path', 'reachPortal', 'matlab-variables', g

def lvl3():
    # Reeds & Roots (defeatAll): the finale — a ten-floor tower you must clear top to
    # bottom. Every floor holds a threat (oozes, three Demons, two Mages); the portal
    # only opens once all are down. Full-width base. 6 Ooze + 3 Demon + 2 Mage.
    g = Grid(46, 56)
    g.floor(52, 1, 45); g.floor(53, 1, 45)           # F0 base
    g.put(4, 51, 'P'); g.put(32, 51, 'E')            # base ooze
    g.floor(47, 12, 38); climb(g, 14, 47, 52); g.put(24, 46, 'D')   # F1 demon
    g.floor(42, 2, 28);  climb(g, 26, 42, 47); g.put(8, 41, 'E')    # F2
    g.floor(37, 18, 44); climb(g, 20, 37, 42); g.put(36, 36, 'D')   # F3 demon
    g.floor(32, 4, 30);  climb(g, 28, 32, 37); g.put(10, 31, 'E')   # F4
    g.floor(27, 18, 44); climb(g, 22, 27, 32); g.put(40, 26, 'M')   # F5 mage
    g.floor(22, 4, 30);  climb(g, 24, 22, 27); g.put(10, 21, 'E')   # F6
    g.floor(17, 16, 42); climb(g, 18, 17, 22); g.put(34, 16, 'D')   # F7 demon
    g.floor(12, 2, 28);  climb(g, 27, 12, 17); g.put(8, 11, 'E'); g.put(22, 11, 'E')  # F8
    g.floor(6, 16, 34);  climb(g, 19, 6, 12); g.put(26, 5, 'M')     # F9 mage + portal
    g.put(30, 5, 'O')
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
