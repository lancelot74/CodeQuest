# CodeQuest — Build Instructions

A single-player, pixel-art, side-scrolling action game that teaches programming.
Three worlds (MATLAB, C, C++), beginner-friendly. Clearing a level unlocks a
programming concept (shown as a pop-up lesson card and saved to a codex/journal).
Every 5th level is a boss that interrupts the fight with a question; answering
correctly makes the next attack a guaranteed critical hit.

This document is the master spec. It is written so an AI coding agent (Claude Code)
can execute it phase by phase. **Build in order. Do not skip phases. After each
phase, the game must run in the browser without errors before moving on.**

---

## 0. Decisions already locked (do not re-litigate)

- **Engine:** Phaser 3 (latest stable, v3.8x) + vanilla JavaScript (ES modules).
- **Bundler/dev server:** Vite.
- **Rendering:** Pixel art. `pixelArt: true` in the Phaser config; integer-scaled.
- **Mode:** Single-player only. No backend, no networking, no accounts.
- **Persistence:** Browser `localStorage` (progress, unlocked codex entries, settings).
- **Art:** Free CC0 / open-license asset packs (see Section 9). Use placeholder
  colored rectangles ONLY where a needed sprite is missing, and clearly TODO it.
- **Study delivery:** Pop-up **lesson card** on level clear **+** a persistent
  **codex/journal** the player can reopen any time.
- **Target:** Desktop browser first. Keyboard controls. 16:9, base resolution
  640×360, integer-scaled up to the window.

---

## 1. High-level architecture

```
Boot → Preload → MainMenu → WorldSelect → Level (gameplay) → LessonCard (overlay)
                                   ↑                              ↓
                                 Codex  ←──────────  progress saved to localStorage
```

- **Scenes** (Phaser Scenes), each in its own file:
  - `BootScene` — set scaling, load tiny boot assets (logo, loading bar gfx).
  - `PreloadScene` — load all sprites/tilesets/audio/JSON; show a loading bar.
  - `MainMenuScene` — title, Start, Continue, Codex, Settings.
  - `WorldSelectScene` — choose MATLAB / C / C++ world; locked until prior world cleared (MATLAB unlocked by default).
  - `LevelSelectScene` — pick a level within a world; locked levels show a lock.
  - `GameScene` — the actual platformer gameplay (one instance, configured per level).
  - `BossScene` — extends/uses GameScene logic but with boss + question hooks (can be the same scene with a `isBoss` flag rather than a separate class — implementer's choice, keep it DRY).
  - `LessonCardScene` — modal overlay shown on level clear.
  - `CodexScene` — browse all unlocked concepts, grouped by world.
  - `HUDScene` — runs in parallel (`scene.launch`), draws HP/MP, level name, score.
  - `PauseScene` / `GameOverScene` — overlays.
- **Systems** (plain JS modules, not scenes):
  - `Player.js` — movement, jump, attack, stats, crit flag.
  - `Enemy.js` — base enemy + simple AI (patrol, aggro, attack).
  - `Boss.js` — extends Enemy; phases; triggers questions at HP thresholds.
  - `CombatSystem.js` — damage calc, crit handling, damage-number popups.
  - `SaveSystem.js` — read/write localStorage; schema + migration guard.
  - `ContentLoader.js` — loads level/lesson/question JSON.
  - `QuestionSystem.js` — picks & validates boss questions, applies crit reward.
- **Data** (JSON, content-driven so non-coders can edit later — see Section 6):
  - `worlds.json`, `levels/*.json`, `lessons.json`, `questions.json`.

Keep gameplay logic out of scene files where practical; scenes orchestrate, systems implement.

---

## 2. Project scaffolding (Phase 0)

Create this structure inside the project folder:

```
codequest/
  index.html
  package.json
  vite.config.js
  /public
    /assets
      /sprites      (player, enemies, bosses, fx)
      /tilesets     (per-world tilesets)
      /maps         (Tiled .json exports)
      /ui           (panels, buttons, fonts)
      /audio        (music, sfx)
  /src
    main.js
    config.js
    /scenes         (one file per scene from Section 1)
    /systems        (Player.js, Enemy.js, ... from Section 1)
    /data
      worlds.json
      lessons.json
      questions.json
      /levels
        matlab-01.json ...
    /utils          (helpers, constants)
  README.md
```

Steps:
1. `npm create vite@latest codequest -- --template vanilla` (then strip the demo).
2. `npm install phaser`.
3. Set up `index.html` with a single `<div id="game">` and `<script type="module" src="/src/main.js">`.
4. `config.js` exports the Phaser game config (640×360 base, `Scale.FIT`,
   `pixelArt: true`, `roundPixels: true`, arcade physics with gravity).
5. `main.js` creates the game with all scenes registered, starting at `BootScene`.
6. **Checkpoint:** `npm run dev` shows a black canvas with a "Loading…" boot text. Commit.

---

## 3. Build phases (execute in order)

Each phase ends with a runnable build. Do not proceed until it runs clean.

### Phase 1 — Core movement & one map
- Implement `Player.js`: left/right walk, jump (with coyote time + jump buffer for good feel), gravity, ground/wall collision via arcade physics.
- Controls: Arrow keys / WASD to move, Space/Up to jump, J or Z to attack (stub for now).
- Build one test map (flat ground + a few platforms) using a placeholder tileset.
- Camera follows the player; world bounds set.
- **Checkpoint:** You can run, jump, and land on platforms smoothly.

### Phase 2 — Combat loop
- Add a melee attack: a short-lived hitbox in front of the player on attack input, with attack animation + cooldown.
- Implement `Enemy.js`: a slime that patrols, takes damage, has HP, dies with a small fx + optional drop.
- `CombatSystem.js`: damage calc `damage = base ± variance`, `isCrit` → ×2 (or ×1.5) damage, floating damage numbers (white normal, yellow/orange crit).
- Player takes contact damage; HP reaches 0 → `GameOverScene`.
- **Checkpoint:** Kill slimes, take damage, die, restart.

### Phase 3 — Progression, HUD, save
- `HUDScene`: HP bar, MP bar (even if MP unused early), current level name, score/XP, and a small "kills / objective" counter.
- XP + level-up on kills (simple curve). Stats (HP, attack) scale on level-up.
- Level objective: e.g. "Reach the portal" and/or "Defeat all enemies" → triggers level clear.
- `SaveSystem.js`: persist player level/stats, which game-levels are cleared, unlocked codex entries, settings. Load on boot; "Continue" in main menu.
- **Checkpoint:** Clear a level, reload the page, progress persists.

### Phase 4 — Worlds, level select, content data
- Implement `worlds.json` (3 worlds) and `levels/*.json` (see Section 6 schema).
- `WorldSelectScene` + `LevelSelectScene` with locking rules:
  - MATLAB unlocked by default; C unlocks when MATLAB fully cleared; C++ when C cleared.
  - Within a world, level N locks until level N-1 is cleared.
- `GameScene` reads a level JSON (map, enemies, objective, isBoss, lessonId) and configures itself. **No hardcoded level data in the scene.**
- **Checkpoint:** Navigate worlds → levels, each loads its own map/enemies from JSON.

### Phase 5 — Study integration (lesson card + codex)  ← core differentiator
- On level clear, look up the level's `lessonId`, mark it unlocked in save, and launch `LessonCardScene` as an overlay:
  - Shows: concept title, a short plain-English explanation (2–4 sentences), a **code snippet** in a monospace box with simple syntax-color styling, and a "Got it" button → returns to level select.
  - Snippet must be readable at pixel scale: render lesson text/code in a normal web/bitmap font layer above the pixel game, or use a crisp bitmap font. (Pixel font for flavor headers, legible font for code.)
- `CodexScene`: list all concepts grouped by world; unlocked ones are readable, locked ones show "???". Reopen any lesson card from here. Accessible from the main menu and pause menu.
- Lessons defined in `lessons.json` (see Section 6).
- **Checkpoint:** Clearing a level pops the lesson; the concept appears in the codex and survives reload.

### Phase 6 — Boss levels & the question-crit mechanic  ← core differentiator
- Every 5th level in a world is a boss (mark `isBoss: true` and list `bossId` in the level JSON).
- `Boss.js`: bigger HP, 2 phases, a telegraphed attack pattern (keep it fair and simple — a charge and a projectile is enough for MVP).
- **Question interrupt:** at defined HP thresholds (e.g. 75%, 50%, 25%) the boss becomes briefly invulnerable, the action pauses, and `QuestionSystem` shows a multiple-choice question drawn from `questions.json` filtered by world + difficulty.
  - The question UI overlays the fight (timer optional for MVP; if used, generous).
  - **Correct →** grant the player a "charged" state: their **next attack is a guaranteed critical hit** (visual cue: weapon/player glows). Resume fight.
  - **Wrong →** no reward (optionally minor penalty later); resume fight. Do not soft-lock.
- Defeating the boss clears the level → triggers the lesson card like any level (boss levels can carry a "milestone" lesson summarizing the last 5 concepts).
- **Checkpoint:** Boss fight pauses for a question; correct answer makes the next hit crit; boss is beatable.

### Phase 7 — Polish & MVP completion
- Title screen, music + sfx (jump, hit, crit, level-up, correct/wrong answer, victory).
- Pause menu, settings (volume, mute), basic transitions/fades between scenes.
- At least: **3 normal levels + 1 boss per world** (so 12 levels total) to prove the full loop end-to-end. Expand content afterward via JSON.
- Pass an editing/QA review (see Section 8 checklist).
- Write `README.md`: how to run, how to add a level/lesson/question (so content can grow without touching engine code).

---

## 4. Player feel & combat details (so it's actually fun)

- Movement: snappy. Add coyote time (~80ms) and jump buffering (~120ms). Variable jump height (release early = shorter hop).
- Attack: fast startup, clear hitbox, short cooldown; hit-stop (freeze a few ms on contact) sells impact.
- Crit (from a correct boss answer): screen shake + bigger yellow number + distinct sfx + glow consumed on the hitting blow.
- Enemies: telegraph attacks; never spawn directly on the player.
- Always give the player a way to recover (potion drops or regen at level start).

---

## 5. The study layer (design rules)

- **Beginner-friendly above all.** Concepts in order of difficulty within each world.
- Lesson cards = one concept each: *what it is*, *why it matters*, *one tiny example*. No walls of text.
- Suggested concept progression (adjust as you like):
  - **MATLAB world:** what MATLAB is → variables & assignment → vectors/arrays → basic operations → `for` loops → (boss milestone) plotting a simple graph.
  - **C world:** `#include` & `main()` → variables & types → `printf` → `if/else` → `for` loops → (boss milestone) a tiny full program.
  - **C++ world:** difference from C → `cout`/`cin` & `iostream` → variables & types → functions → `if/else` & loops → (boss milestone) a first class/struct.
- Boss questions test ONLY concepts already taught in that world. Multiple choice, one correct answer, 3–4 options. Keep wording simple.

---

## 6. Content data schemas (content-driven — keep these stable)

`worlds.json`
```json
[
  { "id": "matlab", "name": "MATLAB Marsh", "order": 1, "unlockedByDefault": true,  "tileset": "matlab", "music": "world1" },
  { "id": "c",      "name": "C Caverns",    "order": 2, "unlockedByDefault": false, "tileset": "c",      "music": "world2" },
  { "id": "cpp",    "name": "C++ Citadel",  "order": 3, "unlockedByDefault": false, "tileset": "cpp",    "music": "world3" }
]
```

`levels/matlab-01.json`
```json
{
  "id": "matlab-01",
  "world": "matlab",
  "index": 1,
  "name": "First Steps",
  "map": "assets/maps/matlab-01.json",
  "isBoss": false,
  "objective": { "type": "reachPortal" },
  "enemies": [ { "type": "slime", "x": 400, "y": 200, "count": 3 } ],
  "lessonId": "matlab-intro",
  "bossId": null
}
```

`lessons.json`
```json
[
  {
    "id": "matlab-intro",
    "world": "matlab",
    "title": "What is MATLAB?",
    "body": "MATLAB is a tool for math and data. You type commands and it computes results instantly.",
    "code": "x = 5\ny = x * 2   % y is now 10"
  }
]
```

`questions.json`
```json
[
  {
    "id": "matlab-q1",
    "world": "matlab",
    "difficulty": 1,
    "concept": "variables",
    "prompt": "In MATLAB, what does  x = 5  do?",
    "options": ["Tests if x equals 5", "Stores 5 in x", "Prints 5", "Deletes x"],
    "answer": 1
  }
]
```

Rule: **the engine never hardcodes content.** Levels, lessons, and questions live in these files so they can be expanded without code changes.

---

## 7. Save data schema (localStorage)

Single key, e.g. `codequest.save.v1`:
```json
{
  "version": 1,
  "player": { "level": 1, "xp": 0, "maxHp": 100, "attack": 10 },
  "progress": { "clearedLevels": ["matlab-01"], "unlockedWorlds": ["matlab"] },
  "codex": { "unlockedLessons": ["matlab-intro"] },
  "settings": { "musicVol": 0.6, "sfxVol": 0.8 }
}
```
Include a version field and a guard so a schema change doesn't crash old saves
(if version mismatches, reset gracefully or migrate). Add a "Reset progress" button in settings.

---

## 8. Quality / verification checklist (run before calling MVP done)

- [ ] `npm run dev` runs with **zero console errors** through a full loop.
- [ ] Full loop works: menu → world → level → kill enemies → clear → lesson card → codex updated → next level unlocked.
- [ ] Reload mid-progress: save restores correctly.
- [ ] Boss: question interrupt fires, correct answer crits next hit, boss is beatable, no soft-lock on wrong answer.
- [ ] World locking is correct (C locked until MATLAB done, etc.).
- [ ] No content hardcoded in scenes — adding a JSON level works without engine edits.
- [ ] Lesson/code text is legible (not blurry pixel-scaled).
- [ ] Build works in a fresh browser profile (no reliance on existing localStorage).
- [ ] README explains run + how to add content.

---

## 9. ASSETS — what YOU (Irwiz) need to do

The agent can write all the code, but **it cannot legally download or create
final pixel art for you.** Here's your shopping list. Drop files into the
matching `/public/assets/...` folders and keep the names the agent expects
(the agent should document exact expected filenames in the README as it builds).

**Where to get free, license-safe pixel art (check each pack's license — prefer CC0):**
- **Kenney.nl** — huge free CC0 packs (platformer tiles, characters, UI, audio). Start here.
- **itch.io** — search "pixel platformer asset pack" / "free" (e.g. packs by Pixel Frog like *Pixel Adventure*, *Treasure Hunters*). Read the license; many are free for commercial use with attribution.
- **OpenGameArt.org** — filter by CC0 / CC-BY. Good for tilesets, enemies, fx.
- **Audio:** Kenney audio packs, freesound.org (check license), or OpenGameArt for music/sfx.

**What to collect, by folder:**
- `/sprites/player` — a character sprite sheet with: idle, run, jump, attack (and hurt if available).
- `/sprites/enemies` — at least a slime (idle/move/die). One per world is nice (marsh creature, cave creature, citadel creature).
- `/sprites/bosses` — one boss sprite per world (bigger). Idle + attack frames.
- `/sprites/fx` — hit spark, crit/glow, level-up sparkle.
- `/tilesets` — one tileset per world theme (marsh/green, cave/blue, citadel/stone). 16×16 or 32×32 tiles, consistent grid.
- `/ui` — panel/box for the lesson card and dialogue, button graphics, a HP/MP bar frame, and a clear **monospace font** for code (a TTF/bitmap font; e.g. a free pixel font + a legible mono like a free "Press Start"-style font for headers and a clean mono for code).
- `/audio` — background music (1 track per world is fine), sfx: jump, hit, crit, enemy death, level-up, correct answer, wrong answer, victory.

**Tools you may want (optional):**
- **Tiled** (free) — to draw/edit the maps and export as JSON (the agent will consume these). If you don't want to make maps, tell the agent to generate simple maps in code for the MVP and you can replace them later.
- **Aseprite** (paid) or **LibreSprite/Piskel** (free) — to edit/clean sprites or make your own.

**Minimum to start:** one player sheet, one slime, one tileset, one UI panel, one font, a couple of sfx. The agent can use placeholder rectangles for anything missing and mark it TODO, so you are never blocked — but the game looks real only once real art is in.

**Content you should write (or let the agent draft, then you check):**
- The actual lesson text + code snippets in `lessons.json`.
- The boss questions in `questions.json`.
You know the teaching goals best; the agent can draft beginner content and you correct it.

---

## 9A. AI sprite workflow (if generating art with AI)

AI is good for a *consistent look* and *single static sprites*, weaker at multi-frame
animation, transparent backgrounds, and tight pixel grids. Treat AI output as a
**starting point you clean up in a pixel editor**, not a finished sprite sheet.

**Recommended tools:**
- **Pixel-specialized (best):** PixelLab, Scenario, Retro Diffusion (SD model tuned for pixel art). Some support animation frames / rotations from one character.
- **General models (concept/single sprite only):** Midjourney, DALL·E, Stable Diffusion — they fake the pixel look; expect off-grid, anti-aliased results needing cleanup.
- **Cleanup (required):** Aseprite (paid) or Piskel / LibreSprite (free) — snap to grid, fix palette, remove background fringe, align frames.

**Process:**
1. Generate ONE reference sprite (idle pose) to lock style + palette + size.
2. Generate other poses/frames matching that reference (or use a tool with animation support).
3. Clean each sprite in a pixel editor; align frames so they don't jitter.
4. Pack into a sprite sheet with a consistent frame size; export atlas JSON for Phaser.

**Hybrid tip:** use free Kenney/itch packs for tiles, UI, and generic enemies;
reserve AI for the hero and the three world bosses (the pieces you want original).

### Ready-to-use generation prompts

Keep a shared style prefix on every prompt so all sprites match. Generate at small
sizes (32–48px), flat colors, no anti-aliasing, transparent background, side view.

**Shared style prefix (paste before each prompt):**
> `pixel art, 32x32, limited 16-color palette, flat colors, no anti-aliasing, clean black outline, transparent background, side-view platformer sprite, full body, centered`

**Player — hero:**
> `…a young programmer adventurer, hooded tunic with a glowing rune, holding a short staff/sword, friendly determined face, idle stance.`
> Then request frames: `idle (4 frames), run (6 frames), jump (2 frames: rise + fall), attack (3 frames), hurt (1 frame) — same character, same palette, consistent across all frames.`

**MATLAB Marsh boss:**
> `…a large swamp guardian boss, mossy green and teal, made of tangled vines and glowing math-symbol runes (∑, matrix brackets), big and imposing but readable, bog/marsh theme, idle and attack poses.`

**C Caverns boss:**
> `…a cave golem boss made of dark blue stone and crystal, glowing cyan cracks shaped like {} braces and a ; semicolon emblem on its chest, heavy and rocky, underground cavern theme, idle and attack poses.`

**C++ Citadel boss:**
> `…a stone-and-gold armored sentinel boss guarding a fortress, regal purple cape, a glowing "++" sigil and class/object motifs etched in armor, larger and more advanced than the cave golem, citadel theme, idle and attack poses.`

**Slime enemy (per world recolor):**
> `…a small blob slime enemy, simple and cute, squishy, idle and move frames.` Recolor per world: green (marsh), blue (caverns), purple/stone (citadel).

After generating: clean up, snap to the grid, then drop into `/public/assets/sprites/...`
using the filenames listed in the README, or hand them to the agent to wire up.

---

## 10. Suggested order of operations for the agent

1. Phase 0 scaffolding → confirm dev server runs.
2. Phases 1–3 with **placeholder art** (rectangles/simple shapes) so gameplay is proven fast.
3. Phase 4 content system.
4. Phases 5–6 (the study + boss-question differentiators) — these are the point of the game; get them right.
5. Phase 7 polish + swap placeholders for real art Irwiz provides.
6. Run the Section 8 checklist. Stop and report what art/content is still needed.

Build incrementally, commit after each phase, and keep the README's "expected
asset filenames" list up to date so Irwiz knows exactly what to drop in.

---

*End of build instructions. Execute top to bottom.*
