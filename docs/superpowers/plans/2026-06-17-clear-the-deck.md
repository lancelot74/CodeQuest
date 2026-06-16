# Clear the Deck — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Story Mode, Age of War, and Codex so Night Hunt is the whole game, and repurpose GameSelect into a FOREST / CHALLENGE picker (Challenge = an inert "coming soon" stub until sub-project D).

**Architecture:** Rewire the menu first (so nothing reaches the doomed scenes), then unregister + delete the scenes, then their data/assets, then grep-gated orphan cleanup. Build stays green at every commit. No test framework here — verification is `npm run build` + `grep` sweeps + a Playwright headless smoke (dev server on `:5173`, `window.__game` handle, `#wanderer` hash all already exist).

**Tech Stack:** Phaser 3.90, Vite 5, vanilla JS ES modules; Playwright headless chromium for the smoke.

---

## File Structure

| File | Change |
|---|---|
| `src/scenes/GameSelect.js` | Repurpose → FOREST + CHALLENGE picker; drop `buildSmallCard` |
| `src/scenes/MainMenu.js` | Remove CODEX button; recenter remaining two |
| `src/scenes/ModePage.js` | Remove `story`/`war` from `MODE_INFO` |
| `src/main.js` | Unregister the 7 removed scenes |
| `src/scenes/{Game,WorldSelect,LevelSelect,HUD,GameOver,AgeOfWar,Codex}.js` | **Delete** |
| `src/systems/ContentLoader.js` | **Delete** |
| `public/data/{worlds,lessons,questions}.json`, `public/data/levels/` | **Delete** |
| `public/assets/game/tiles/kenney-platformer.png`, `public/assets/game/bg/{green,blue,gray,purple}.png` | **Delete** |
| `src/scenes/Preload.js` | Remove the `terrain`, `bg-*`, and 3 `json` loads |
| `src/ui/widgets.js` | Remove orphaned `addBackdrop` (grep-gated) |
| `src/systems/SaveSystem.js` | Trim Story/War/Codex methods + save fields (grep-gated) |

---

## Task 1: Rewire the menu (Forest / Challenge)

Do this first: after it, the doomed scenes are unreachable from the UI but still registered, so the build stays green.

**Files:** Modify `src/scenes/GameSelect.js`, `src/scenes/MainMenu.js`, `src/scenes/ModePage.js`

- [ ] **Step 1: GameSelect — swap the two game cards for one Challenge stub**

In `src/scenes/GameSelect.js` `create()`, replace:

```js
    pixelText(this, GAME_WIDTH / 2, 28, 'CHOOSE A GAME', 18, '#ffe066')

    this.buildHuntCard()
    this.buildSmallCard(GAME_WIDTH / 2 - 102, 'STORY MODE', ['code puzzles,', 'platforming'], 'story')
    this.buildSmallCard(GAME_WIDTH / 2 + 102, 'AGE OF WAR', ['lane battles,', 'code prompts'], 'war')
```

with:

```js
    pixelText(this, GAME_WIDTH / 2, 28, 'CHOOSE YOUR HUNT', 18, '#ffe066')

    this.buildHuntCard()
    this.buildChallengeCard(GAME_WIDTH / 2, 254)
```

- [ ] **Step 2: GameSelect — replace `buildSmallCard` with `buildChallengeCard`**

Replace the entire `buildSmallCard(cx, title, blurb, mode) { ... }` method with:

```js
  // Challenge (dungeon crawl) — shown but inert until the dungeon mode ships (sub-project D).
  buildChallengeCard(cx, cy) {
    const w = 240
    const h = 86
    uiPanel(this, cx, cy, w, h, { originX: 0.5, originY: 0.5 }).setTint(0x4a4f63)
    this.add.rectangle(cx, cy, w - 8, h - 8, 0x141a30, 0.9)
    pixelText(this, cx, cy - 22, 'CHALLENGE', 12, '#7c84a0')
    pixelText(this, cx, cy + 2, 'descend the dungeon', 7, '#6f7db0')
    pixelText(this, cx, cy + 20, 'COMING SOON', 8, '#c98a4a')
  }
```

(The featured `buildHuntCard()` is unchanged — it is the FOREST entry and already routes to `ModePage{mode:'hunt'}`.)

- [ ] **Step 3: MainMenu — remove the CODEX button, recenter the two that remain**

In `src/scenes/MainMenu.js`, replace:

```js
    panelButton(this, GAME_WIDTH / 2, 214, 'GAME', () => this.scene.start('GameSelect'), { width: W })
    panelButton(this, GAME_WIDTH / 2, 256, 'CODEX', () => this.scene.start('Codex'), { width: W })
    panelButton(this, GAME_WIDTH / 2, 298, 'SETTINGS', () => this.scene.start('Settings'), { width: W })
```

with:

```js
    panelButton(this, GAME_WIDTH / 2, 232, 'GAME', () => this.scene.start('GameSelect'), { width: W })
    panelButton(this, GAME_WIDTH / 2, 278, 'SETTINGS', () => this.scene.start('Settings'), { width: W })
```

- [ ] **Step 4: ModePage — drop the `story` and `war` entries**

In `src/scenes/ModePage.js`, replace the whole `const MODE_INFO = { ... }` block with:

```js
const MODE_INFO = {
  hunt: {
    title: 'NIGHT HUNT',
    play: 'NightHunt',
    hero: 'all',
    blurb: ['Open the chests and escape the forest', 'while the hunters stalk you.'],
  },
}
```

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: `✓ built` (only the pre-existing chunk-size warning).

- [ ] **Step 6: Playwright smoke — Forest flow still works**

Dev server is already running on `:5173` (else `npm run dev`). Create `/tmp/wanderer/deck1.mjs`:

```js
import { chromium } from 'playwright'
const errs = []
const b = await chromium.launch(); const p = await b.newPage()
p.on('console', m => m.type()==='error' && errs.push(m.text()))
p.on('pageerror', e => errs.push(String(e)))
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await p.waitForTimeout(1200)
await p.evaluate(() => window.__game.scene.start('GameSelect')); await p.waitForTimeout(500)
await p.evaluate(() => window.__game.scene.start('ModePage', { mode: 'hunt' })); await p.waitForTimeout(500)
await p.evaluate(() => window.__game.scene.start('NightHunt')); await p.waitForTimeout(2000)
const ok = await p.evaluate(() => !!window.__game.scene.getScene('NightHunt').player)
await b.close()
console.log('forest playable =', ok, '| errors =', errs.length, errs.slice(0,3))
if (!ok || errs.length) process.exit(1)
```

Run: `cd /tmp/wanderer && node deck1.mjs`
Expected: `forest playable = true | errors = 0`.

- [ ] **Step 7: Commit**

```bash
git add src/scenes/GameSelect.js src/scenes/MainMenu.js src/scenes/ModePage.js
git commit -m "$(printf 'Repurpose menu into Forest / Challenge picker\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 2: Unregister and delete the 7 scenes + ContentLoader

**Files:** Modify `src/main.js`; delete 7 scene files + `src/systems/ContentLoader.js`

- [ ] **Step 1: Remove the scene imports from `main.js`**

Delete these 7 import lines:

```js
import WorldSelectScene from './scenes/WorldSelect.js'
import LevelSelectScene from './scenes/LevelSelect.js'
import GameScene from './scenes/Game.js'
import HUDScene from './scenes/HUD.js'
import GameOverScene from './scenes/GameOver.js'
import CodexScene from './scenes/Codex.js'
import AgeOfWarScene from './scenes/AgeOfWar.js'
```

- [ ] **Step 2: Remove those scenes from the registration array in `main.js`**

In the `createConfig([ ... ])` array, delete the lines `WorldSelectScene,` `LevelSelectScene,` `GameScene,` `HUDScene,` `GameOverScene,` `CodexScene,` `AgeOfWarScene,`. The array should be exactly:

```js
  createConfig([
    BootScene,
    PreloadScene,
    MainMenuScene,
    GameSelectScene,
    ModePageScene,
    SettingsScene,
    NightHuntScene,
    FinaleScene,
  ]),
```

- [ ] **Step 3: Delete the scene files + ContentLoader**

```bash
cd /home/yurin/.claude/GameDevelopment
git rm src/scenes/Game.js src/scenes/WorldSelect.js src/scenes/LevelSelect.js \
  src/scenes/HUD.js src/scenes/GameOver.js src/scenes/AgeOfWar.js src/scenes/Codex.js \
  src/systems/ContentLoader.js
```

- [ ] **Step 4: Grep — nothing live still imports them**

Run: `grep -rnE "ContentLoader|scenes/(Game|WorldSelect|LevelSelect|HUD|GameOver|AgeOfWar|Codex)\b" src/`
Expected: **no output** (zero references).

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: `✓ built`, no unresolved-import errors.

- [ ] **Step 6: Commit**

```bash
git add -A src/main.js
git commit -m "$(printf 'Remove Story, Age of War, and Codex scenes\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 3: Delete Story/War data + assets and their Preload loads

**Files:** Modify `src/scenes/Preload.js`; delete data json + `levels/` + bg/tiles assets

- [ ] **Step 1: Remove the loads from `Preload.js`**

Delete the `terrain` spritesheet load:

```js
    this.load.spritesheet('terrain', 'assets/game/tiles/kenney-platformer.png', {
      frameWidth: 21,
      frameHeight: 21,
    })
```

Delete the four bg image loads:

```js
    this.load.image('bg-green', 'assets/game/bg/green.png')
    this.load.image('bg-blue', 'assets/game/bg/blue.png')
    this.load.image('bg-gray', 'assets/game/bg/gray.png')
    this.load.image('bg-purple', 'assets/game/bg/purple.png')
```

Delete the three json loads:

```js
    this.load.json('worlds', 'data/worlds.json')
    this.load.json('lessons', 'data/lessons.json')
    this.load.json('questions', 'data/questions.json')
```

- [ ] **Step 2: Confirm those keys aren't used by survivors**

Run: `grep -rnE "'terrain'|\"terrain\"|bg-green|bg-blue|bg-gray|bg-purple|cache\.json|'worlds'|'lessons'|'questions'" src/`
Expected: **no output**. (If `terrain` appears in a surviving file, stop and keep that load — but per analysis only the deleted `Game.js` used it.)

- [ ] **Step 3: Delete the data + assets**

```bash
cd /home/yurin/.claude/GameDevelopment
git rm -r public/data/worlds.json public/data/lessons.json public/data/questions.json public/data/levels
git rm public/assets/game/tiles/kenney-platformer.png \
  public/assets/game/bg/green.png public/assets/game/bg/blue.png \
  public/assets/game/bg/gray.png public/assets/game/bg/purple.png
```

(Leave `public/assets/game/tiles/terrain.png` — it is not loaded by `Preload` and may be referenced elsewhere; Step 4 confirms.)

- [ ] **Step 4: Grep for any lingering asset reference**

Run: `grep -rnE "kenney-platformer|assets/game/bg/|data/levels|terrain\.png" src/`
Expected: **no output**.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: `✓ built`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(printf 'Remove Story/War data and assets\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 4: Orphan cleanup — `addBackdrop` + dead SaveSystem surface (grep-gated)

Both are now referenced only by deleted code. Each removal is gated on a grep showing zero surviving callers — **if a grep finds a survivor, keep that piece.**

**Files:** Modify `src/ui/widgets.js`, `src/systems/SaveSystem.js`

- [ ] **Step 1: Confirm `addBackdrop` has no surviving caller**

Run: `grep -rn "addBackdrop" src/ | grep -v "widgets.js"`
Expected: **no output**.

- [ ] **Step 2: Remove `addBackdrop` from `widgets.js`**

Open `src/ui/widgets.js`, delete the entire `export function addBackdrop(...) { ... }` definition (it builds the `bg-green/blue/gray/purple` scrolling backdrop for the old story/war scenes). Leave `nightBackdrop` and every other export untouched.

- [ ] **Step 3: Confirm the dead SaveSystem methods have no surviving caller**

Run: `grep -rnE "isWorldUnlocked|unlockWorld|isLevelCleared|markLevelCleared|isLessonUnlocked|unlockLesson|xpForLevel|addXp\b" src/ | grep -v "SaveSystem.js"`
Expected: **no output**.

- [ ] **Step 4: Trim `SaveSystem.js`**

Remove the now-unused Story/War/Codex surface, keeping `character`/`setCharacter` and the `hunt` block:
- In `defaultSave()`, delete the `player`, `progress`, and `codex` keys (keep `character` and `hunt`).
- Delete the methods `xpForLevel`, `isWorldUnlocked`, `unlockWorld`, `isLevelCleared`, `markLevelCleared`, `isLessonUnlocked`, `unlockLesson`, and the XP/level-up method (the `while (p.xp >= xpForLevel(p.level))` one).

(The `{ ...defaultSave(), ...data }` merge means existing saves with leftover keys still load fine.)

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: `✓ built`. If it errors on a removed symbol, a survivor used it — restore that symbol and re-grep.

- [ ] **Step 6: Commit**

```bash
git add src/ui/widgets.js src/systems/SaveSystem.js
git commit -m "$(printf 'Trim orphaned backdrop and save fields\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 5: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full reference sweep**

Run: `grep -rnE "Story|AgeOfWar|WorldSelect|LevelSelect|Codex|ContentLoader|GameOver\b" src/ | grep -viE "history|story\b.*comment" || echo CLEAN`
Review any hits — they must be unrelated words, not live references to removed code.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: `✓ built`.

- [ ] **Step 3: Playwright — scene registry + full menu flow, 0 errors**

Create `/tmp/wanderer/deck_final.mjs`:

```js
import { chromium } from 'playwright'
const errs = []
const b = await chromium.launch(); const p = await b.newPage()
p.on('console', m => m.type()==='error' && errs.push(m.text()))
p.on('pageerror', e => errs.push(String(e)))
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await p.waitForTimeout(1500)
const keys = await p.evaluate(() => window.__game.scene.scenes.map(s => s.scene.key))
const gone = ['Game','WorldSelect','LevelSelect','HUD','GameOver','AgeOfWar','Codex'].filter(k => keys.includes(k))
const kept = ['MainMenu','GameSelect','ModePage','NightHunt','Finale','Settings'].every(k => keys.includes(k))
// forest path still boots
await p.evaluate(() => window.__game.scene.start('ModePage', { mode: 'hunt' })); await p.waitForTimeout(400)
await p.evaluate(() => window.__game.scene.start('NightHunt')); await p.waitForTimeout(2000)
const forest = await p.evaluate(() => !!window.__game.scene.getScene('NightHunt').player)
await b.close()
console.log('removed still registered:', gone, '| all kept:', kept, '| forest:', forest, '| errors:', errs.length, errs.slice(0,3))
if (gone.length || !kept || !forest || errs.length) process.exit(1)
```

Run: `cd /tmp/wanderer && node deck_final.mjs`
Expected: `removed still registered: [] | all kept: true | forest: true | errors: 0`.

- [ ] **Step 4: Hand off the push**

`git push` is blocked from Claude's side. Tell the user to push:
`! git -C /home/yurin/.claude/GameDevelopment push`

---

## Self-Review (against the spec)

- **Remove Story/War/Codex scenes** → Task 2 (delete + unregister). ✓
- **Delete content systems/data** → Task 2 (ContentLoader), Task 3 (json + levels). ✓
- **Delete Story/War-only assets** → Task 3 (kenney-platformer, bg-*); `terrain.png` left + grep-checked. ✓
- **Trim SaveSystem lesson/level logic, keep character + hunt** → Task 4 Step 4 (grep-gated). ✓
- **Remove orphaned widgets helper** → Task 4 Steps 1–2 (`addBackdrop`). ✓
- **MainMenu: drop CODEX, keep GAME + SETTINGS** → Task 1 Step 3. ✓
- **GameSelect → FOREST / CHALLENGE; Forest unchanged flow; Challenge stub** → Task 1 Steps 1–2. ✓
- **ModePage keeps only hunt** → Task 1 Step 4. ✓
- **Verify build + no dangling refs + Forest still plays** → Tasks 1/2/3/5 (build, greps, Playwright). ✓

No placeholders: every code step shows exact old→new; every command has expected output. Names consistent: `buildChallengeCard`, `MODE_INFO.hunt`, the kept scene list `[Boot, Preload, MainMenu, GameSelect, ModePage, Settings, NightHunt, Finale]` used identically in Task 2 and Task 5.
