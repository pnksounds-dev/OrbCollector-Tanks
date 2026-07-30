# Orb Collector: Tanks — Project Notes

A diep.io clone built as a new entry in the Orb Collector game series.

## Tech stack

- **Language:** TypeScript (`target: ES2020`, `strict`, `noUnusedLocals`,
  `noUnusedParameters`).
- **Build / dev server:** Vite 5. `publicDir: "assets"` serves the existing
  `assets/` folder at the web root so media paths resolve as `/items/...`,
  `/Audio/...`. Dev server runs on port 3000.
- **Rendering:** Canvas 2D. Tanks, shapes, and bullets are drawn procedurally
  with canvas paths (diep.io's flat geometric look). Orb sprites from
  `assets/items/Resources/Orbs/` are used only for kill particle bursts.
- **Architecture:** Entity-Component-System (ECS) — a lightweight, Map-based
  `ECWorld` with string component names and a cached query.

## Project structure

```
index.html              # Vite entry; canvas + HUD DOM + menu
vite.config.ts          # publicDir: "assets", port 3000
tsconfig.json           # strict, ES2020 target
PLAN.md                 # full build plan (read before starting work)

assets/                 # served at web root by Vite (publicDir)
  Audio/                # shoot/hit/pickup/levelup sounds
  items/Resources/Orbs/ # XP drop particle sprites
  items/Weapons/Bullets/# bullet sprite (optional polish)
  ui/hud/               # HUD chrome reference
  splash/               # menu splash art

src/
  main.ts               # bootstrap: new Game(canvas) → game.init()
  config.ts             # CONFIG — all tuning constants + shape/XP tables
  types.ts              # shared types (GameState, StatIndex, STAT_NAMES)

  ecs/
    World.ts            # ECWorld — Map-based entity/component store + cached query
    components.ts       # component name constants + interfaces + factory helpers

  game/
    Game.ts             # main controller: loop, state machine, system wiring
    Camera.ts           # smooth-follow + zoom, world↔screen conversion
    Input.ts            # mouse aim, WASD move, click/Space fire, wheel zoom, dev toggle
    Storage.ts          # localStorage settings (mute)

  systems/
    MovementSystem.ts   # tank movement, shape drift, bullet travel, boundary clamp, regen
    CombatSystem.ts     # firing, bullet-vs-shape, body-vs-shape, shape death + XP
    SpawnSystem.ts      # maintain shape population across the arena
    LevelSystem.ts      # XP accrual, level-up, stat point spend, stat recalculation

  render/
    Renderer.ts         # Canvas 2D: grid, boundary, shapes, bullets, tank, particles
    Minimap.ts          # top-right minimap (arena outline + player dot)

  ui/
    HUD.ts              # bottom score/level/XP bar, left stat panel (DOM)
    Menu.ts             # death screen with respawn button (DOM)
    DevPanel.ts         # tuning sliders (backtick to toggle), live DEV overrides

  audio/
    AudioManager.ts     # lazy sound load + play with mute gate + throttle

  lib/
    math.ts             # clamp, lerp, dist, angle, circle overlap helpers
```

## Path conventions

- TS modules import each other with relative specifiers (`./x.ts`,
  `../game/x.ts`).
- Asset references in **JS/TS** use absolute paths from `assets/` (served at
  root by Vite's `publicDir`): `/items/Resources/Orbs/OrbSmall.png`,
  `/Audio/weapons/fire.ogg`, etc.
- CSS is in `css/style.css` (not `public/`) and loaded via `<link>` in
  `index.html`.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start the Vite dev server (port 3000). |
| `npm run build` | `tsc --noEmit && vite build` — typecheck then build to `dist/`. |
| `npm run preview` | Preview the production build. |
| `npm run typecheck` | `tsc --noEmit` — fast type-only check. |

No test runner. Verification is `typecheck` + `build` + manual playtest.

## Architecture notes

### ECS pattern
- `ECWorld` stores entities (integer IDs) and components (per-name
  `Map<EntityId, T>`). `query(...names)` returns entities having ALL given
  components; the result is **cached** and invalidated on any add/remove/destroy.
- Call `world.flush()` after batch entity changes inside a system so the next
  query sees the new state. `Game.loop` calls `flush()` once per frame as a
  safety net.

### Game loop
`loop()` runs on `requestAnimationFrame`:
1. Compute `dt` (clamped to 50ms / 3 frames).
2. `applyDevValues()` — copy dev panel overrides onto CONFIG.
3. `input.updateWorldMouse()` — convert mouse to world coords.
4. If `playing`: `update(dt)` — movement → combat → spawns → level → camera
   follow → death check.
5. `world.flush()`.
6. `render()` — grid → boundary → shapes → bullets → particles → tank.
7. `hud.update()` + `minimap.update()`.
8. Clear one-shot input edges (dev toggle, stat spend).

### Controls
- **WASD / arrows** — move (world-relative)
- **Mouse** — aim barrel
- **Left click / Space** — fire
- **Mouse wheel** — zoom
- **1–8** — spend stat point
- **Click stat row** — spend stat point
- **Backtick** — toggle dev panel

### Dev panel
Toggled with backtick. Sliders write to a `DEV` object persisted in
`localStorage` (`orb_collector_tanks_dev`). `applyDevValues()` copies non-null
overrides onto `CONFIG` each frame. Double-click a label to reset to default.

## What's NOT in Phase 1

Multiplayer, class upgrades (level 15/30/45), AI enemy tanks, bosses, alpha
pentagon, leaderboard, account/coin persistence, main menu (game auto-starts).
See `PLAN.md` Phase 2+ for the roadmap.

## Phase 2 — Complete

Phase 2 added bot AI, tank class upgrades, alpha pentagon + pentagon nest,
tank-vs-tank combat, a leaderboard, and a start menu.

### Bot AI (`src/systems/BotAISystem.ts`)
- **Components:** `BOT` (marker) + `BOT_AI` (data: behavior, target, steer, name, color)
- **Factory:** `createBotEntity(world, x, y, name, color)` — random level 1–5, random stats
- **System:** `BotAISystem.update(world, dt, playerId)` — behavior state machine:
  - *Farming* (default): seek & shoot nearest shape
  - *Hunting*: chase player when nearby and bot level ≥ 3
  - *Fleeing*: retreat when HP < 30%, return to farming at > 60%
- **LOD:** bots > 1500 units from player skip AI and just drift
- **Bot leveling:** bots level up from XP, grow, spend stat points randomly
- **Population:** `maintainBots(world, targetCount, playerId)` removes dead bots and spawns new ones
- **Integration:** Bot movement is handled inside BotAISystem (not MovementSystem). Bot bullets
  collide with shapes via CombatSystem.bulletVsShape (all bullets). Bot-vs-bot and
  bot-vs-player body ramming via CombatSystem.bodyVsBody.

### Tank classes (`src/game/TankClasses.ts`)
- 20 classes across 4 tiers: basic (L1) → twin/sniper/machine_gun/flank_guard/triple_shot (L15)
  → 10 tier-2 classes (L30) → overseer/booster/fighter/annihilator (L45)
- Each class defines: barrel configs (angle/offset/length/width), firing mode, stat multipliers
- **Helpers:** `getAvailableUpgrades(classId, level)`, `getClass(id)`, `getBarrels(classId, baseLen, baseW)`
- **Integration:** CombatSystem applies class multipliers to bullet damage/speed/penetration/fire rate
  and fires from each barrel at its angle. MovementSystem applies class moveSpeedMult. Renderer
  draws multi-barrel tanks. HUD shows class upgrade buttons when available. TankComponent has
  a `classId` field (defaults to "basic").

### Alpha pentagon + pentagon nest (`src/game/AlphaPentagon.ts`)
- **Alpha pentagon:** radius 120, HP 3000, XP 3000, bodyDamage 40 — a tough central boss
- **PentagonNest class:** maintains 12 regular pentagons within 500 units of center (0,0)
- Alpha respawns 60 seconds after death
- `isInNest(x, y, radius)` helper — SpawnSystem uses this to avoid spawning squares/triangles in the nest
- **Integration:** PentagonNest.init() called in Game.startGame(), PentagonNest.update() in Game.update()
- Alpha pentagon drawn with distinct dark blue/purple color in Renderer

### Tank-vs-tank combat (in `src/systems/CombatSystem.ts`)
- **Bullet-vs-tank:** bullets damage any tank that isn't the owner. Killer gets 50 + 50% of victim's XP.
- **Body-vs-body:** overlapping tanks deal body damage to each other each frame.
- Bot deaths are handled immediately (entity destroyed). Player death is handled by Game.onDeath()
  (which shows the death screen). Tank deaths spawn a colored particle burst.

### Leaderboard (`src/ui/Leaderboard.ts`)
- Top-10 by score (XP), positioned below the minimap (top: 190px, right: 16px)
- Player entry highlighted; bots show their name + color
- Score formatting: < 1000 raw, ≥ 1000 as "1.2k"
- Self-contained: injects its own CSS via a `<style>` tag

### Start menu (`src/ui/StartMenu.ts`)
- Full-screen overlay with splash art background, "ORB COLLECTOR: TANKS" title, Play button,
  collapsible How-to-Play section, mute toggle
- Callback-based: `new StartMenu(onPlay, onMuteToggle, initialMuted)` — no direct Game/Storage import
- Self-contained: all DOM built programmatically, CSS injected via `<style>` tag with `sm-` prefix
- **Integration:** Game.init() creates and shows the StartMenu. Play button calls Game.startGame().
  Game no longer auto-starts — the menu appears first.
