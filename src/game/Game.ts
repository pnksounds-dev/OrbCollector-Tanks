/** Main game controller: loop, state machine, system wiring, render bridge.
 *
 * The loop runs on requestAnimationFrame: compute dt → update (systems) →
 * world.flush() → render. State machine: menu → playing → dead → playing.
 *
 * Phase 2 additions: bot AI, pentagon nest + alpha pentagon, tank class
 * upgrades, leaderboard, start menu, tank-vs-tank combat.
 */

import { CONFIG } from "../config";
import type { GameState, StatIndex } from "../types";
import { ECWorld, type EntityId } from "../ecs/World";
import {
  C,
  createTankEntity,
  type PositionComponent,
  type TankComponent,
} from "../ecs/components";
import { Camera } from "./Camera";
import { Input } from "./Input";
import { Renderer } from "../render/Renderer";
import { MovementSystem } from "../systems/MovementSystem";
import { CombatSystem } from "../systems/CombatSystem";
import { SpawnSystem } from "../systems/SpawnSystem";
import { LevelSystem } from "../systems/LevelSystem";
import {
  BotAISystem,
  createBotEntity,
  maintainBots,
} from "../systems/BotAISystem";
import { PentagonNest } from "./AlphaPentagon";
import { getAvailableUpgrades, getClass } from "./TankClasses";
import { Storage } from "./Storage";
import { AudioManager } from "../audio/AudioManager";
import { HUD } from "../ui/HUD";
import { Menu } from "../ui/Menu";
import { DevPanel } from "../ui/DevPanel";
import { Minimap } from "../render/Minimap";
import { Leaderboard } from "../ui/Leaderboard";
import { StartMenu } from "../ui/StartMenu";

/** Target number of AI bots maintained in the arena. */
const BOT_TARGET_COUNT = 8;

/** Bot name pool. */
const BOT_NAMES = [
  "Tanker", "Shooter", "CircleBot", "SquareKing", "PentaHunter",
  "DiepFan", "BulletStorm", "Rambot", "SniperWannabe", "ChaosTank",
];

/** Bot color pool (distinct from the player's blue #00b2e1). */
const BOT_COLORS = [
  "#e14a4a", "#4ae14a", "#9b4ae1", "#e18a4a", "#e14ae1",
  "#4ae1b0", "#e1c84a", "#b04ae1",
];

export class Game {
  state: GameState = "menu";
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private rafId = 0;
  private running = false;
  private lastTime = 0;

  world: ECWorld;
  camera: Camera;
  renderer: Renderer;
  input = Input;
  storage: Storage;
  audio: AudioManager;
  hud: HUD;
  menu: Menu;
  devPanel: DevPanel;
  minimap: Minimap;
  leaderboard: Leaderboard;
  startMenu: StartMenu;
  pentagonNest: PentagonNest;

  // Systems
  movement: MovementSystem;
  combat: CombatSystem;
  spawns: SpawnSystem;
  level: LevelSystem;
  botAI: BotAISystem;

  playerId: EntityId | null = null;
  playerName: string = "Player";

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context not available.");
    this.ctx = ctx;

    this.world = new ECWorld();
    this.camera = new Camera();
    this.renderer = new Renderer(ctx);
    this.storage = new Storage();
    this.audio = new AudioManager(this.storage);
    this.minimap = new Minimap();
    this.pentagonNest = new PentagonNest();

    this.movement = new MovementSystem();
    this.combat = new CombatSystem(this.audio, this.storage);
    this.spawns = new SpawnSystem();
    this.level = new LevelSystem(this.audio);
    this.botAI = new BotAISystem();

    this.hud = new HUD(this);
    this.menu = new Menu(this);
    this.devPanel = new DevPanel(this);
    this.leaderboard = new Leaderboard();
    this.startMenu = new StartMenu(
      () => {
        this.startGame();
        this.startMenu.hide();
      },
      (muted) => this.storage.setMuted(muted),
      this.storage.muted,
      (name) => {
        this.playerName = name;
      },
    );
  }

  async init(): Promise<void> {
    this.resize();
    window.addEventListener("resize", () => this.resize());
    this.input.init();
    this.input.camera = this.camera;
    this.devPanel.init();
    this.hud.init();
    this.menu.init();
    this.minimap.init();
    this.leaderboard.init();
    this.startMenu.init();
    this.startMenu.show();
    this.running = true;
    this.lastTime = performance.now();
    this.loop();
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.camera.setViewport(w, h);
  }

  /** Start a new game: spawn the player, bots, shapes, and pentagon nest. */
  startGame(): void {
    this.world = new ECWorld();
    this.playerId = createTankEntity(this.world, 0, 0);
    this.spawns.init(this.world);
    this.pentagonNest.init(this.world);
    // Spawn initial bots in a ring around the player
    for (let i = 0; i < BOT_TARGET_COUNT; i++) {
      const angle = (i / BOT_TARGET_COUNT) * Math.PI * 2;
      const dist = 800 + Math.random() * 600;
      const x = Math.cos(angle) * dist;
      const y = Math.sin(angle) * dist;
      createBotEntity(
        this.world,
        x,
        y,
        BOT_NAMES[i % BOT_NAMES.length],
        BOT_COLORS[i % BOT_COLORS.length],
      );
    }
    // Track game count
    this.storage.incrementGames();
    // Set player name from start menu
    if (this.playerName && this.playerName !== "Player") {
      // Could be used for display in future
    }
    this.state = "playing";
    this.hud.show();
    this.leaderboard.show();
    this.menu.hideDeath();
  }

  /** Respawn the player after death (reset to level 1). */
  respawn(): void {
    this.startGame();
  }

  /** Return to the start menu (from death screen). */
  toMenu(): void {
    this.state = "menu";
    this.world = new ECWorld();
    this.playerId = null;
    this.startMenu.show();
  }

  private loop = (): void => {
    if (!this.running) return;
    const now = performance.now();
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    // Clamp dt to 3 frames (50ms) to avoid huge jumps after tab switch
    dt = Math.min(dt, 0.05);

    this.devPanel.applyDevValues();
    this.input.updateWorldMouse();

    if (this.state === "playing" && this.playerId !== null) {
      this.update(dt);
    }

    this.world.flush();
    this.renderer.render(this.world, this.camera, this.playerId);

    if (this.state === "playing" && this.playerId !== null) {
      this.hud.update();
      this.minimap.update(this.world, this.camera, this.playerId);
      this.leaderboard.update(this.world, this.playerId);
    }

    this.handleInputEdges();

    this.rafId = requestAnimationFrame(this.loop);
  };

  private update(dt: number): void {
    if (this.playerId === null) return;

    // Handle stat spend from number keys
    if (this.input.statSpend >= 0) {
      this.level.spendStat(this.world, this.playerId, this.input.statSpend as StatIndex);
    }

    this.movement.update(this.world, dt, this.input, this.playerId);
    this.combat.update(this.world, dt, this.playerId);
    this.botAI.update(this.world, dt, this.playerId);
    this.spawns.update(this.world, dt, this.camera);
    this.pentagonNest.update(this.world, dt);
    this.level.update(this.world, dt, this.playerId);

    // Maintain bot population (remove dead, spawn new)
    maintainBots(this.world, BOT_TARGET_COUNT, this.playerId);

    // Camera follows player
    const pos = this.world.getComponent<PositionComponent>(this.playerId, C.Position);
    if (pos) {
      this.camera.follow(pos.x, pos.y);
    }

    // Check death
    const tank = this.world.getComponent<TankComponent>(this.playerId, C.Tank);
    if (tank && tank.hp <= 0) {
      this.onDeath();
    }
  }

  private onDeath(): void {
    if (this.playerId === null) return;
    const tank = this.world.getComponent<TankComponent>(this.playerId, C.Tank);
    const score = tank ? Math.floor(tank.xp) : 0;
    const level = tank ? tank.level : 1;
    // Persist stats
    this.storage.setHighScore(score);
    this.storage.addCoins(Math.floor(score / 10));
    this.state = "dead";
    this.hud.hide();
    this.leaderboard.hide();
    this.menu.showDeath(score, level);
    this.world.destroyEntity(this.playerId);
    this.playerId = null;
  }

  /** Upgrade the player's tank to a new class. Called from HUD. */
  upgradeClass(classId: string): void {
    if (this.playerId === null) return;
    const tank = this.world.getComponent<TankComponent>(this.playerId, C.Tank);
    if (!tank) return;
    const cls = getClass(classId);
    if (!cls) return;
    const available = getAvailableUpgrades(tank.classId, tank.level);
    if (!available.some((c) => c.id === classId)) return;
    tank.classId = classId;
    // Apply body radius multiplier from the class
    const baseRadius =
      CONFIG.tank.baseBodyRadius + (tank.level - 1) * CONFIG.tank.radiusGrowthPerLevel;
    tank.bodyRadius = baseRadius * cls.bodyRadiusMult;
  }

  /** Clear one-shot input edges after systems have consumed them. */
  private handleInputEdges(): void {
    if (this.input.devToggle) {
      this.devPanel.toggle();
      this.input.devToggle = false;
    }
    if (this.input.statSpend >= 0) {
      this.input.statSpend = -1;
    }
  }

  stop(): void {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }
}
