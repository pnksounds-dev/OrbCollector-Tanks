# Orb Collector: Tanks — diep.io Clone Build Plan

A new entry in the Orb Collector game series. This one clones the **basic concept
of diep.io**: a tank that drives around an arena, shoots geometric shapes for XP,
levels up, and spends stat points. The first milestone covers only the core loop —
tank + shapes + bullets + basic UI + controls. Multiplayer, class upgrades, bosses,
and the leaderboard come later.

---

## 1. The original game — diep.io concept canvas

diep.io is a top-down 2D arena shooter. The player is a **tank**: a circular body
with a rectangular barrel that rotates to aim at the mouse cursor.

**Core loop:**
1. Move with WASD. The tank drives in the direction of the keys, independent of
   where the barrel points.
2. Aim with the mouse. The barrel rotates to point at the cursor.
3. Fire by holding left mouse or Space. Bullets spawn at the barrel tip and travel
   straight in the aim direction.
4. The arena is scattered with **shapes** — passive geometric entities that deal
   contact damage and give XP when destroyed:
   - **Squares** (yellow) — common, low HP, ~10 XP
   - **Triangles** (red) — less common, medium HP, ~25 XP
   - **Pentagons** (blue) — rare, high HP, ~130 XP
5. Shapes have HP. Bullets and body collisions both damage them. When a shape's
   HP hits zero it dies and awards XP.
6. Filling the XP bar levels the tank up. Each level grants **one stat point** and
   grows the tank slightly (bigger body, more HP).
7. Spend stat points on 8 stats (left-side panel, click or number keys 1–8):
   - Health Regen · Max Health · Body Damage · Bullet Speed
   - Bullet Penetration · Bullet Damage · Reload · Movement Speed
8. Score = total XP earned. Shown in the bottom bar alongside level.
9. The arena has a hard boundary. Crossing it pushes the tank back (red out-of-bounds
   zone in the original).
10. A minimap sits in the top-right corner showing the player's position in the arena.

**Visual identity:** flat geometric shapes, solid fills with a subtle outline, a
grid-textured background, and a clean sans-serif HUD. No sprite art for the tanks
or shapes — everything is drawn procedurally with canvas paths. This is what makes
the game feel like diep.io and is the look we will match.

**What this milestone does NOT include:** multiplayer, class upgrades (level 15/30/45
branching), AI enemy tanks, bosses, the alpha pentagon, spawn protection, diep's
score-based leaderboard, account/coin persistence. Those are future phases.

---

## 2. Architecture — what we draw from each reference

Two existing projects inform this build. We pick the cleanest pattern from each.

### From `orb-c-undergrowth` (Slither2) — the engine template

Undergrowth is the cleaner, more modern codebase and is the primary structural
template:

- **TypeScript strict + Vite 5.** Matches the globalskills default. `publicDir:
  "assets"` serves the existing `assets/` folder at the web root so media paths
  resolve as `/items/...`, `/Audio/...` without moving files.
- **ECS architecture.** A lightweight Map-based `ECWorld` with string component
  names and a cached query. Entities are integer IDs; components are per-name
  `Map<EntityId, T>`. Systems query the world and mutate components; they do not
  own entities. This scales cleanly as we add shape types, bullet variants, and
  eventually enemy tanks.
- **Game loop on `requestAnimationFrame`** with `dt` clamped to 3 frames.
  `loop()` → `update(dt, now)` (systems in fixed order) → `world.flush()` →
  `render(now)`.
- **A single `CONFIG` object** holding all tuning constants (world size, tank
  stats, shape HP/XP, bullet speed, spawn rates). One file to balance the game.
- **`Camera` with smooth-follow + auto-zoom.** Lerp position toward the target;
  zoom derived from a base scale. `toScreenX/Y` and `scale` convert world→screen.
- **`Input` module** — mouse position, mouse-down state, keyboard state, wheel
  zoom. Adapted: WASD for movement, mouse for aim, click/Space for fire.
- **`Storage` via `localStorage`** — settings persistence (mute, quality).
- **Entry point:** `index.html` → `src/main.ts` → `new Game(canvas)` →
  `await game.init()`. `Game` exposed on `window.__game` for debugging.

### From `OrbCollector-Demo` — the content + rendering reference

The demo is richer but messier (legacy JS, Svelte migration in progress). We take
specific ideas, not the structure:

- **Canvas 2D rendering** (not WebGL2). diep.io's aesthetic is simple geometric
  shapes — circles, squares, triangles, pentagons — which Canvas 2D handles
  perfectly and is far simpler to implement and debug than a custom WebGL2
  renderer. Undergrowth uses WebGL2 because it renders thousands of orb sprites;
  a tank game with dozens of shapes and bullets does not need it.
- **Procedural entity drawing.** Tanks and shapes are drawn with canvas paths
  (`arc`, `rect`, `moveTo`/`lineTo`), matching diep.io's clean look. No sprite
  art for gameplay entities.
- **The asset library.** We reuse the imported assets for non-gameplay elements:
  - `assets/items/Resources/Orbs/` (OrbTiny → OrbExtraLarge) — XP drop particles
    when a shape dies (a brief burst of orbs that fly out and fade).
  - `assets/items/Weapons/Bullets/Bullet.png` — optional bullet sprite (we start
    with procedural bullet drawing; sprite is a future polish).
  - `assets/ui/hud/` (Level1-5, ProgressBarBackground, hud_bottom) — HUD chrome
    reference for styling, though we draw the HUD with canvas + CSS to match
    diep.io's minimal look.
  - `assets/Audio/` — shoot, hit, pickup, level-up sounds for feedback.
  - `assets/splash/` — main menu splash art.
- **Audio manager pattern** — a small wrapper that loads sounds lazily and plays
  them with volume/pitch control, gated by a mute setting.

### What we deliberately do NOT carry over

- **Svelte.** The demo's Svelte UI is great for a complex menu-driven game, but
  diep.io's UI is minimal (a stat panel, a score bar, a minimap) and is faster to
  build and iterate with plain DOM + canvas. We can migrate to Svelte later if the
  UI grows (class upgrade trees, account panels).
- **WebGL2.** Overkill for this milestone. Canvas 2D keeps the renderer under 300
  lines and trivial to debug.
- **The demo's relative-import JS module graph.** We use TypeScript with proper
  ESM imports from the start.

---

## 3. Project structure

```
orb-c-tanks/
  index.html              # Vite entry; canvas + HUD DOM + menu
  vite.config.ts          # publicDir: "assets", port 3000
  tsconfig.json           # strict, ES2020 target
  package.json            # type: module, scripts: dev/build/preview/typecheck
  PLAN.md                 # this file
  AGENTS.md               # project notes (created as we learn conventions)

  assets/                 # (existing) served at web root by Vite
    Audio/                # shoot/hit/pickup/levelup sounds
    items/Resources/Orbs/ # XP drop particle sprites
    items/Weapons/Bullets/# bullet sprite (optional polish)
    ui/hud/               # HUD chrome reference
    splash/               # menu splash art

  src/
    main.ts               # bootstrap: new Game(canvas) → game.init()
    config.ts             # CONFIG — all tuning constants + shape/XP tables
    types.ts              # shared TypeScript types (GameState, component shapes)

    ecs/
      World.ts            # ECWorld — Map-based entity/component store + cached query
      components.ts       # component name constants + interfaces + factory helpers

    game/
      Game.ts             # main controller: loop, state machine, system wiring, render bridge
      Camera.ts           # smooth-follow + zoom, world↔screen conversion
      Input.ts            # mouse aim, WASD move, click/Space fire, wheel zoom
      Storage.ts          # localStorage settings (mute, quality)

    systems/
      MovementSystem.ts   # tank movement (WASD), shape drift, bullet travel, boundary clamp
      CombatSystem.ts     # bullet-vs-shape, bullet-vs-boundary, body-vs-shape collision + damage
      SpawnSystem.ts      # maintain shape population across the arena (respawn on death)
      LevelSystem.ts      # XP accrual, level-up, stat point spend, stat recalculation

    render/
      Renderer.ts         # Canvas 2D renderer: background grid, shapes, bullets, tank, particles
      Minimap.ts          # top-right minimap (player dot in arena outline)

    ui/
      HUD.ts              # bottom score/level/XP bar, left stat panel (DOM + canvas)
      Menu.ts             # main menu / spawn screen / death screen (DOM)
      DevPanel.ts         # tuning sliders (world size, speed, shape counts, XP, bullets)

    audio/
      AudioManager.ts     # lazy sound load + play with mute gate

    lib/
      math.ts             # clamp, lerp, dist, angle, vector helpers
      colors.ts           # diep.io palette (tank blue, square yellow, triangle red, pentagon blue)
```

---

## 4. Implementation phases

The user asked for the **basic concept** as the start. This plan covers Phase 1
only in detail; later phases are sketched so the architecture supports them.

### Phase 1 — Core loop (this milestone)

A playable single-player arena where you drive a tank, shoot shapes, gain XP,
level up, and spend stat points. No menus beyond a spawn button and a death
respawn.

**1.1 Scaffold + bootstrap**
- `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`
- `src/main.ts` → `new Game(canvas)` → `game.init()`
- `Game` exposed on `window.__game`
- Verify: `npm run dev` serves a blank canvas at `localhost:3000` with no errors

**1.2 ECS core + CONFIG**
- `ecs/World.ts` — `ECWorld` with `createEntity`, `addComponent`, `getComponent`,
  `query(...names)`, `destroyEntity`, `flush()` (invalidates query cache)
- `ecs/components.ts` — component names + interfaces:
  - `Position` { x, y, angle }
  - `Tank` { bodyRadius, barrelLength, barrelWidth, speed, hp, maxHp, regen, xp, level, statPoints, stats[] }
  - `Shape` { kind: 'square'|'triangle'|'pentagon', radius, hp, maxHp, xp, rotation, rotSpeed }
  - `Bullet` { radius, speed, damage, penetration, life, owner }
  - `Player` { } (marker)
  - `Velocity` { vx, vy } (for bullets; shapes drift slowly)
  - `Particle` { sprite, life, maxLife, vx, vy } (XP orb burst on shape death)
- `config.ts` — `CONFIG` with world size, tank base stats, shape tables, bullet
  params, spawn counts, XP-per-level curve, stat max values

**1.3 Camera + Input + Renderer shell**
- `Camera` — follow player, base zoom, `toScreenX/Y`, wheel zoom
- `Input` — track mouse screen pos, mouse-down, WASD key state, Space, wheel
- `Renderer` — clear + draw background grid (diep.io's faint square grid); camera
  transform applied via `ctx.translate/scale`
- Verify: grid renders, camera follows a placeholder player circle

**1.4 The tank (player entity)**
- `createTankEntity(world, x, y)` — Position + Tank + Player + Velocity
- Draw: blue circle body + grey rectangle barrel rotated to aim angle
- Aim: barrel angle = `atan2(mouseWorldY - tankY, mouseWorldX - tankX)`
- Move: WASD sets velocity vector, normalized × speed; boundary clamp at arena edge
- Verify: tank drives with WASD, barrel tracks mouse, stays in bounds

**1.5 Shapes + spawning**
- `createShapeEntity(world, kind, x, y)` — Position + Shape + Velocity (slow drift)
- `SpawnSystem` — maintain target counts (e.g. 30 squares, 15 triangles, 5
  pentagons) by spawning at random positions away from the player; respawn on death
- Draw: square = `rect` rotated, triangle = 3-point path, pentagon = 5-point path;
  solid fill + darker outline; HP bar above when damaged
- Shapes drift slowly and rotate gently; bounce off the arena boundary
- Verify: arena populated with shapes that drift and stay in bounds

**1.6 Bullets + combat**
- Fire on mouse-down or Space, rate-limited by Reload stat (fire cooldown)
- `createBulletEntity` — Position + Bullet + Velocity; spawns at barrel tip,
  velocity = aim direction × bullet speed
- `CombatSystem`:
  - Bullet-vs-shape: circle overlap test; apply bullet damage to shape HP,
    decrement bullet penetration; bullet dies when penetration ≤ 0 or life expires
  - Body-vs-shape: circle overlap; apply body damage to shape, apply shape contact
    damage to tank
  - Shape death → award XP to player → spawn XP orb particle burst
- Bullets die at arena boundary
- Draw: bullet = small grey circle (procedural); optional sprite later
- Verify: shooting destroys shapes, XP accrues, contact damages the tank

**1.7 Leveling + stats**
- `LevelSystem` — XP threshold per level (e.g. `level² × 100`); on level-up:
  increment level, grant 1 stat point, grow body radius, recompute maxHp from stats
- 8 stats with max caps (0–7 points each, max 7 in basic diep):
  Health Regen, Max Health, Body Damage, Bullet Speed, Bullet Penetration,
  Bullet Damage, Reload, Movement Speed
- Stat effect mapping (applied to the Tank component each level-up):
  - Health Regen → regen rate
  - Max Health → maxHp
  - Body Damage → contact damage dealt
  - Bullet Speed → bullet velocity
  - Bullet Penetration → bullet HP/pierce count
  - Bullet Damage → bullet damage
  - Reload → fire cooldown reduction
  - Movement Speed → tank speed
- Verify: leveling up grants points, spending points changes tank behavior

**1.8 HUD + minimap**
- `HUD` (DOM overlay, bottom-center): score (total XP), level, XP progress bar
- `HUD` (DOM overlay, left side): 8 stat rows, each with label + filled/empty
  pips + click handler and number-key 1–8 handler to spend a point
- `Minimap` (canvas, top-right): arena outline + player dot
- Verify: HUD reflects live score/level/XP; stat panel spends points; minimap
  tracks position

**1.9 Audio + particles + death/respawn**
- `AudioManager` — load shoot/hit/pickup/levelup from `assets/Audio/`; play on
  fire, shape hit, shape death, level-up; mute toggle persisted to Storage
- XP orb particle burst on shape death — 3–6 orb sprites from
  `assets/items/Resources/Orbs/` that fly out and fade over ~600ms
- Tank death when HP ≤ 0 → death screen (score + level) → respawn button resets
  the tank at arena center, level 1, zero stats
- Verify: sounds play, particles burst on kills, death → respawn works

**1.10 Dev panel**
- `DevPanel` (DOM overlay, toggled with backtick) — sliders for world size, tank
  speed, shape counts (square/triangle/pentagon), XP multiplier, bullet damage/speed
- Values write to a live `DEV` object; `Game.loop` calls `applyDevValues()` each
  frame to copy overrides onto `CONFIG` (mirrors undergrowth's pattern)
- Persisted to `localStorage` so tuning survives reloads

**1.11 Polish + verify**
- Background grid that scrolls with camera (diep.io's signature look)
- Arena boundary drawn as a red-tinted zone outside the playable square
- `npm run typecheck` passes; `npm run build` passes; manual playtest confirms
  the full loop: drive → shoot → kill shapes → level up → spend stats → die → respawn

### Phase 2+ (future, not built now)

- **Class upgrades** at level 15/30/45 (twin, sniper, machine gun, flank guard…)
- **AI enemy tanks** (bots that farm shapes and hunt the player)
- **Alpha pentagon + pentagon nest** (high-value central zone)
- **Multiplayer** via the undergrowth relay pattern (RoomClient + state sync)
- **Account + coin persistence** via the demo's forum-OAuth + Supabase pattern
- **Svelte UI migration** if the menu/stat panel grows complex
- **Leaderboard** (top 10 by score this session)

---

## 5. Controls + UI spec (Phase 1)

| Input | Action |
|---|---|
| W / A / S / D | Move tank (world-relative, not aim-relative) |
| Mouse move | Aim barrel toward cursor |
| Left mouse (hold) | Fire bullets |
| Space (hold) | Fire bullets (alt) |
| Mouse wheel | Zoom in/out (clamped) |
| 1 – 8 | Spend a stat point on stat N |
| Click stat row | Spend a point on that stat |
| Esc | Pause (future) |

**HUD layout:**
- Bottom-center: `[Level N]  [XP bar]  [Score]`
- Left side: 8 stat rows, each `[icon] [label] [●●●●○○○]` (filled/empty pips)
- Top-right: minimap (arena outline + player dot)
- Center on death: `[You died]  [Score: N]  [Level: N]  [Respawn]`

---

## 6. Asset usage plan

| Asset | Used for | How |
|---|---|---|
| `assets/items/Resources/Orbs/OrbTiny..ExtraLarge` | XP particle burst on shape kill | Sprite drawn as particle, scales by XP value |
| `assets/Audio/player/*`, `assets/Audio/orb/*`, `assets/Audio/ui/*` | Shoot, hit, pickup, level-up feedback | AudioManager lazy-loads + plays |
| `assets/ui/hud/*` | Visual reference for HUD styling | Reference only; HUD drawn with DOM/CSS |
| `assets/splash/*` | Main menu / death screen background | DOM `<img>` behind menu |
| `assets/items/Weapons/Bullets/Bullet.png` | Optional bullet sprite (polish) | Drawn instead of procedural circle if enabled |
| Tanks, shapes, bullets | Gameplay entities | **Procedural canvas drawing** (diep.io look) |

Tanks and shapes are NOT sprite-based. They are drawn with canvas paths to match
diep.io's flat geometric aesthetic. The orb sprites are used only for the kill
particle burst, giving the game an Orb Collector series flavor without breaking
the diep.io look.

### 6.1 FX Sprite Effects (Phase 9 — planned)

The `assets/FX/` folder contains sprite sheets that can be used for combat and
environmental visual effects. These are drawn as short-lived particles on top of
the procedural canvas rendering, adding visual feedback without changing the
diep.io aesthetic.

| FX Folder | Sprites | Planned Use |
|---|---|---|
| `assets/FX/explosion/` | `Explosion.png`, `Explosion2.png`, `small.png`, `Debris1-3.png` | **Tank death explosion** — burst of explosion sprite + debris particles when a tank's HP hits 0. `small.png` for shape death pop. |
| `assets/FX/blood/` | `blood_drip1-4.png` | **Tank damage splatter** — small blood drip particles fly off a tank when it takes bullet or body damage. Tinted by team color. |
| `assets/FX/bullet_trail/` | `bulletTrail1-5.png` | **Bullet trail effect** — faint trail sprite drawn behind each bullet as it travels, fading over ~300ms. Gives bullets a visual streak. |
| `assets/FX/smoke/` | `smoke1-9.png` | **Damaged tank smoke** — when a tank is below 40% HP, emit slow-rising smoke particles from its body. Intensifies as HP drops lower. |
| `assets/FX/shield/` | `ShieldDamageEffect.png` | **Spawn invulnerability shield** — pulsing shield sprite drawn around tanks during their spawn invuln period. |
| `assets/FX/phaser/` | `PhaserHit1-5.png` | **Bullet impact hit** — brief phaser hit sprite at the point where a bullet strikes a tank or shape. Quick flash + fade. |
| `assets/FX/shipengine/` | `Trail1-5.png` | **Tank movement trail** — faint engine trail particles behind a tank when moving at high speed. Subtle motion feedback. |
| `assets/FX/water/` | `WaterDroplet1.png` | **Arena boundary splash** — water droplet effect when a tank hits the arena wall. Small splash burst. |

**Implementation plan:**
1. Add an `EffectComponent` to the ECS (`{ sprite, life, maxLife, vx, vy, scale, rotation, alpha }`)
2. Add an `EffectSystem` that spawns effect particles on combat events (bullet hit, tank damage, tank death, shape death, wall hit)
3. Renderer draws effect sprites with alpha fading + scale animation
4. Effect particles are short-lived (~200ms–800ms) and capped to prevent performance issues
5. All FX sprites are loaded lazily by the Renderer (like orb sprites already are)

### 6.2 Team base layout (Phase 5 update)

Team bases match diep.io's world layout:
- **2 teams**: bases at **top and bottom** of the world (team 0 = top, team 1 = bottom), centered on the X axis at `y = ±worldHalf * 0.75`
- **4 teams**: bases at the **four corners** of the world (TL, TR, BL, BR) at `(±worldHalf * 0.75, ±worldHalf * 0.75)`
- Bases are drawn as semi-transparent colored circles with team-colored borders
- Bots spawn near their team's base and retreat to it when wounded

---

## 7. Verification

- `npm run typecheck` — `tsc --noEmit`, must pass with zero errors
- `npm run build` — `tsc --noEmit && vite build`, must produce `dist/`
- Manual playtest: drive, shoot, kill shapes, level up, spend stats, die, respawn
- No test runner in Phase 1 (matches undergrowth); the build + playtest is the gate

---

## 8. Locked decisions

1. **Arena shape: square.** Matches diep.io's current sandbox. Boundary math is a
   simple x/y clamp to a box; out-of-bounds zone is a red tint outside the box.
2. **Theme: pure diep.io look.** Flat geometric shapes, solid fills, grid
   background. Orb sprites used only for the kill particle burst. No space reskin.
3. **Dev panel: included in Phase 1.** An undergrowth-style panel with sliders for
   world size, tank speed, shape counts, XP rates, and bullet params. Lives in
   `src/ui/DevPanel.ts` and is toggled with a key (default: backtick). Values
   write to a live `DEV` object that systems read each frame, mirroring
   undergrowth's `applyDevValues()` pattern.
