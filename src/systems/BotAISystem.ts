/** Bot AI system: controls AI enemy tanks.
 *
 * Bots are tank entities (Position, Velocity, Tank) plus a `bot` marker and a
 * `bot_ai` data component defined here. The system runs a simple behavior
 * state machine per bot:
 *
 * - farming  (default): seek & shoot the nearest shape for XP.
 * - hunting: if a player is nearby and the bot is strong enough, chase & fire.
 * - fleeing: when low on HP, retreat from the nearest threat until safe.
 *
 * Bots level up from XP, grow, spend stat points randomly, bounce off arena
 * walls, and fire bullets just like the player. Bots far from the player are
 * left to drift (LOD) to save CPU.
 */

import { CONFIG } from "../config";
import type { ECWorld, EntityId } from "../ecs/World";
import {
  C,
  createBulletEntity,
  type PositionComponent,
  type VelocityComponent,
  type TankComponent,
} from "../ecs/components";
import { STAT_COUNT, STAT_MAX } from "../types";
import { angleTo, clamp, dist, lerpAngle, normalizeAngle } from "../lib/math";

// ---- Component names ----

/** Marker component: present on every AI-controlled tank. */
export const BOT = "bot";
/** Data component: per-bot AI state. */
export const BOT_AI = "bot_ai";

// ---- Component interfaces ----

/** Marker component for bot tanks (no data). */
export interface BotComponent {}

export type BotBehavior = "farming" | "hunting" | "fleeing";

export interface BotAIComponent {
  behavior: BotBehavior;
  /** Currently tracked target entity, or null. */
  targetId: EntityId | null;
  /** World-space point the bot is steering toward / aiming at. */
  targetX: number;
  targetY: number;
  /** Desired travel heading in radians. */
  steerAngle: number;
  /** Whether the bot wants to fire this frame. */
  fireFlag: boolean;
  /** Seconds until the bot re-evaluates its target. */
  retargetTimer: number;
  /** Display name. */
  name: string;
  /** Body color (distinct from the player's blue). */
  color: string;
}

// ---- Name / color pools ----

const BOT_NAMES = [
  "Tanker",
  "Shooter",
  "CircleBot",
  "SquareKing",
  "PentaHunter",
  "DiepFan",
  "BulletStorm",
  "Rambot",
  "SniperWannabe",
  "ChaosTank",
] as const;

const BOT_COLORS = [
  "#e14a4a",
  "#4ae14a",
  "#9b4ae1",
  "#e18a4a",
  "#e14ae1",
  "#4ae1b0",
  "#e1c84a",
  "#b04ae1",
] as const;

// ---- Tuning constants ----

/** Distance within which a bot will consider hunting the player. */
const HUNT_RANGE = 600;
/** Distance at which a hunting bot gives up the chase. */
const HUNT_ABORT_RANGE = 700;
/** Minimum bot level to start hunting. */
const HUNT_MIN_LEVEL = 3;
/** HP ratio (hp/maxHp) below which a bot flees. */
const FLEE_HP_RATIO = 0.3;
/** HP ratio above which a fleeing bot returns to farming. */
const FLEE_RECOVER_RATIO = 0.6;
/** Distance at which the bot will fire at its target. */
const FIRE_RANGE = 650;
/** Beyond this distance from the player, skip AI (LOD drift). */
const LOD_DISTANCE = 1500;
/** How often (seconds) a bot re-targets while farming. */
const RETARGET_INTERVAL = 0.8;
/** How quickly a bot rotates its barrel toward the target (per second). */
const AIM_LERP_RATE = 8;

// ---- Factory ----

/** Create a bot tank entity at the given world position.
 *
 * The bot starts at a random level (1–5) with stat points distributed randomly
 * across the 8 stats, mimicking a low-level player tank. */
export function createBotEntity(
  world: ECWorld,
  x: number,
  y: number,
  name: string,
  color: string,
): EntityId {
  const id = world.createEntity();
  const t = CONFIG.tank;

  const level = 1 + Math.floor(Math.random() * 5); // 1..5
  const stats = new Array<number>(STAT_COUNT).fill(0);

  // Distribute (level - 1) stat points randomly, respecting the per-stat cap.
  let points = level - 1;
  while (points > 0) {
    const idx = Math.floor(Math.random() * STAT_COUNT);
    if (stats[idx] < STAT_MAX) {
      stats[idx]++;
      points--;
    }
  }

  const bodyRadius =
    t.baseBodyRadius + (level - 1) * t.radiusGrowthPerLevel;
  const maxHp = t.baseMaxHp + stats[1] * t.statMaxHpPerPoint;
  const regen = t.baseRegen + stats[0] * t.statRegenPerPoint;
  const bodyDamage =
    t.baseBodyDamage + stats[2] * t.statBodyDamagePerPoint;

  world.addComponent<PositionComponent>(id, C.Position, {
    x,
    y,
    angle: Math.random() * Math.PI * 2,
  });
  world.addComponent<VelocityComponent>(id, C.Velocity, { vx: 0, vy: 0 });
  world.addComponent<TankComponent>(id, C.Tank, {
    bodyRadius,
    barrelLength: t.baseBarrelLength,
    barrelWidth: t.baseBarrelWidth,
    hp: maxHp,
    maxHp,
    regen,
    bodyDamage,
    xp: 0,
    level,
    statPoints: 0,
    stats,
    fireCooldown: 0,
    invuln: t.spawnInvuln,
    classId: "basic",
  });
  world.addComponent<BotComponent>(id, BOT, {});
  world.addComponent<BotAIComponent>(id, BOT_AI, {
    behavior: "farming",
    targetId: null,
    targetX: x,
    targetY: y,
    steerAngle: Math.random() * Math.PI * 2,
    fireFlag: false,
    retargetTimer: 0,
    name,
    color,
  });
  return id;
}

// ---- System ----

export class BotAISystem {
  /** Cached shape ids for the current update tick (avoid re-querying mid-loop). */
  private shapeIds: EntityId[] = [];
  /** Steer angle for the bot currently being processed (stashed for movement). */
  private currentSteerAngle = 0;

  update(world: ECWorld, dt: number, playerId: EntityId): void {
    const botIds = world.query(C.Position, C.Tank, BOT, BOT_AI);
    if (botIds.length === 0) return;

    // Snapshot shape ids up front; spawning bullets dirties the query cache.
    this.shapeIds = world.query(C.Position, C.Shape);

    // Player position (may be missing if the player is dead).
    const playerPos = world.getComponent<PositionComponent>(playerId, C.Position);
    const playerAlive = world.hasComponent(playerId, C.Player);

    for (const botId of botIds) {
      const pos = world.getComponent<PositionComponent>(botId, C.Position);
      const vel = world.getComponent<VelocityComponent>(botId, C.Velocity);
      const tank = world.getComponent<TankComponent>(botId, C.Tank);
      const ai = world.getComponent<BotAIComponent>(botId, BOT_AI);
      if (!pos || !vel || !tank || !ai) continue;

      // --- Per-frame housekeeping (always runs, even at LOD distance) ---
      this.tickTimers(tank, dt);
      this.handleLevelUp(tank);
      this.applyRegen(tank, dt);

      // Distance to the player (use a far-away point if the player is gone).
      const px = playerPos ? playerPos.x : CONFIG.worldHalf * 2;
      const py = playerPos ? playerPos.y : CONFIG.worldHalf * 2;
      const distToPlayer = dist(pos.x, pos.y, px, py);

      // Seed the steer angle from the AI state so drift/LOD keeps its heading.
      this.currentSteerAngle = ai.steerAngle;

      // --- LOD: far bots just drift, no AI computation ---
      if (distToPlayer > LOD_DISTANCE) {
        this.applyMovement(pos, vel, tank, dt);
        continue;
      }

      // --- Retarget timer ---
      ai.retargetTimer -= dt;
      if (ai.retargetTimer <= 0) {
        ai.retargetTimer = RETARGET_INTERVAL;
        this.retarget(world, pos, tank, ai, px, py, distToPlayer, playerAlive);
      } else {
        // Even without a full retarget, keep the hunting/fleeing state fresh.
        this.updateBehaviorState(tank, ai, distToPlayer, playerAlive);
        // Re-derive the steer angle toward the (possibly moving) target.
        ai.steerAngle = angleTo(pos.x, pos.y, ai.targetX, ai.targetY);
      }

      // --- Steering & aiming ---
      this.currentSteerAngle = ai.steerAngle;
      this.aim(pos, ai, dt);

      // --- Firing ---
      this.handleFiring(world, botId, pos, tank, ai);

      // --- Movement & walls ---
      this.applyMovement(pos, vel, tank, dt);
    }
  }

  // ---- Behavior ----

  /** Re-evaluate the bot's target and behavior based on the world. */
  private retarget(
    world: ECWorld,
    pos: PositionComponent,
    tank: TankComponent,
    ai: BotAIComponent,
    px: number,
    py: number,
    distToPlayer: number,
    playerAlive: boolean,
  ): void {
    this.updateBehaviorState(tank, ai, distToPlayer, playerAlive);

    if (ai.behavior === "fleeing") {
      // Steer directly away from the player.
      ai.targetId = null;
      const away = angleTo(px, py, pos.x, pos.y);
      ai.steerAngle = away;
      ai.targetX = pos.x + Math.cos(away) * 500;
      ai.targetY = pos.y + Math.sin(away) * 500;
      ai.fireFlag = false;
      return;
    }

    if (ai.behavior === "hunting" && playerAlive) {
      ai.targetId = null; // tracked via player position, not an entity id
      ai.targetX = px;
      ai.targetY = py;
      ai.steerAngle = angleTo(pos.x, pos.y, px, py);
      ai.fireFlag = distToPlayer < FIRE_RANGE;
      return;
    }

    // Farming: find the nearest shape.
    const target = this.findNearestShape(world, pos.x, pos.y);
    if (target !== null) {
      ai.targetId = target;
      const shapePos = world.getComponent<PositionComponent>(target, C.Position);
      if (shapePos) {
        ai.targetX = shapePos.x;
        ai.targetY = shapePos.y;
        ai.steerAngle = angleTo(pos.x, pos.y, shapePos.x, shapePos.y);
        const d = dist(pos.x, pos.y, shapePos.x, shapePos.y);
        ai.fireFlag = d < FIRE_RANGE;
      } else {
        ai.fireFlag = false;
      }
    } else {
      // No shapes: wander toward the arena center.
      ai.targetId = null;
      ai.targetX = 0;
      ai.targetY = 0;
      ai.steerAngle = angleTo(pos.x, pos.y, 0, 0);
      ai.fireFlag = false;
    }
  }

  /** Update the behavior state from HP ratio and player proximity. */
  private updateBehaviorState(
    tank: TankComponent,
    ai: BotAIComponent,
    distToPlayer: number,
    playerAlive: boolean,
  ): void {
    const hpRatio = tank.maxHp > 0 ? tank.hp / tank.maxHp : 1;

    // Fleeing takes priority when critically wounded.
    if (ai.behavior === "fleeing") {
      if (hpRatio > FLEE_RECOVER_RATIO) {
        ai.behavior = "farming";
      }
      return;
    }

    if (hpRatio < FLEE_HP_RATIO) {
      ai.behavior = "fleeing";
      return;
    }

    // Hunting: engage the player if close and strong enough.
    if (ai.behavior === "hunting") {
      if (
        !playerAlive ||
        distToPlayer > HUNT_ABORT_RANGE ||
        tank.level < HUNT_MIN_LEVEL
      ) {
        ai.behavior = "farming";
      }
      return;
    }

    // Farming: consider switching to hunting.
    if (
      playerAlive &&
      distToPlayer < HUNT_RANGE &&
      tank.level >= HUNT_MIN_LEVEL &&
      hpRatio > FLEE_HP_RATIO
    ) {
      ai.behavior = "hunting";
    }
  }

  /** Find the id of the nearest shape to (x, y), or null if none. */
  private findNearestShape(world: ECWorld, x: number, y: number): EntityId | null {
    let best: EntityId | null = null;
    let bestDistSq = Infinity;
    for (const sid of this.shapeIds) {
      const s = world.getComponent<PositionComponent>(sid, C.Position);
      if (!s) continue;
      const dx = s.x - x;
      const dy = s.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDistSq) {
        bestDistSq = d2;
        best = sid;
      }
    }
    return best;
  }

  // ---- Per-bot subsystems ----

  /** Aim the barrel toward the current target (smoothed). */
  private aim(pos: PositionComponent, ai: BotAIComponent, dt: number): void {
    const desired = angleTo(pos.x, pos.y, ai.targetX, ai.targetY);
    const t = clamp(AIM_LERP_RATE * dt, 0, 1);
    pos.angle = lerpAngle(pos.angle, desired, t);
  }

  /** Fire a bullet if the bot wants to and its cooldown is ready. */
  private handleFiring(
    world: ECWorld,
    botId: EntityId,
    pos: PositionComponent,
    tank: TankComponent,
    ai: BotAIComponent,
  ): void {
    if (!ai.fireFlag || tank.fireCooldown > 0) return;

    const fireRate =
      CONFIG.tank.baseFireRate *
      (1 + tank.stats[6] * CONFIG.tank.statReloadPerPoint);
    tank.fireCooldown = 1 / fireRate;

    const bulletSpeed =
      CONFIG.bullet.baseSpeed + tank.stats[3] * CONFIG.tank.statBulletSpeedPerPoint;
    const bulletDamage =
      CONFIG.bullet.baseDamage + tank.stats[5] * CONFIG.tank.statBulletDamagePerPoint;
    const bulletPenetration =
      CONFIG.bullet.basePenetration +
      tank.stats[4] * CONFIG.tank.statBulletPenetrationPerPoint;

    const tipX =
      pos.x + Math.cos(pos.angle) * (tank.bodyRadius + tank.barrelLength);
    const tipY =
      pos.y + Math.sin(pos.angle) * (tank.bodyRadius + tank.barrelLength);

    createBulletEntity(
      world,
      tipX,
      tipY,
      pos.angle,
      bulletSpeed,
      bulletDamage,
      bulletPenetration,
      botId,
    );
  }

  // ---- Shared helpers (mirror MovementSystem / LevelSystem) ----

  /** Count down fire cooldown and invuln timers. */
  private tickTimers(tank: TankComponent, dt: number): void {
    if (tank.fireCooldown > 0) {
      tank.fireCooldown = Math.max(0, tank.fireCooldown - dt);
    }
    if (tank.invuln > 0) {
      tank.invuln = Math.max(0, tank.invuln - dt);
    }
  }

  /** Regenerate HP up to maxHp. */
  private applyRegen(tank: TankComponent, dt: number): void {
    if (tank.hp < tank.maxHp) {
      tank.hp = Math.min(tank.maxHp, tank.hp + tank.regen * dt);
    }
  }

  /** Level up from XP, grow, and spend stat points randomly (mirrors LevelSystem). */
  private handleLevelUp(tank: TankComponent): void {
    let leveled = false;
    while (
      tank.xp >= this.xpForNextLevel(tank.level) &&
      tank.level < CONFIG.levelCap
    ) {
      tank.xp -= this.xpForNextLevel(tank.level);
      tank.level++;
      tank.statPoints++;
      tank.bodyRadius =
        CONFIG.tank.baseBodyRadius +
        (tank.level - 1) * CONFIG.tank.radiusGrowthPerLevel;
      this.recalcStats(tank);
      tank.hp = tank.maxHp; // heal to full on level up
      leveled = true;
    }
    if (leveled) {
      this.spendRandomStatPoints(tank);
    }
  }

  /** XP required to advance from the given level to the next. */
  private xpForNextLevel(level: number): number {
    return Math.floor(level * level * CONFIG.xpFactor);
  }

  /** Recompute derived tank stats from spent stat points (mirrors LevelSystem). */
  private recalcStats(tank: TankComponent): void {
    const t = CONFIG.tank;
    tank.maxHp = t.baseMaxHp + tank.stats[1] * t.statMaxHpPerPoint;
    tank.regen = t.baseRegen + tank.stats[0] * t.statRegenPerPoint;
    tank.bodyDamage =
      t.baseBodyDamage + tank.stats[2] * t.statBodyDamagePerPoint;
  }

  /** Spend all unspent stat points on random stats (bot "build" choices). */
  private spendRandomStatPoints(tank: TankComponent): void {
    // Bias toward offensive stats so bots feel aggressive.
    const preferred: number[] = [5, 6, 4, 1, 7, 3, 0, 2];
    while (tank.statPoints > 0) {
      let spent = false;
      for (const idx of preferred) {
        if (tank.stats[idx] >= STAT_MAX) continue;
        tank.statPoints--;
        tank.stats[idx]++;
        spent = true;
        this.recalcStats(tank);
        break;
      }
      if (!spent) {
        // All stats maxed: drop remaining points.
        tank.statPoints = 0;
        break;
      }
    }
  }

  /**
   * Apply velocity to position and bounce off arena walls.
   * Velocity is derived from `currentSteerAngle` × bot move speed.
   */
  private applyMovement(
    pos: PositionComponent,
    vel: VelocityComponent,
    tank: TankComponent,
    dt: number,
  ): void {
    const speed =
      CONFIG.tank.baseSpeed + tank.stats[7] * CONFIG.tank.statMoveSpeedPerPoint;
    vel.vx = Math.cos(this.currentSteerAngle) * speed;
    vel.vy = Math.sin(this.currentSteerAngle) * speed;

    pos.x += vel.vx * dt;
    pos.y += vel.vy * dt;

    // Bounce off arena walls (same as shapes).
    const half = CONFIG.worldHalf;
    const r = tank.bodyRadius;
    if (pos.x < -half + r) {
      pos.x = -half + r;
      vel.vx = Math.abs(vel.vx);
      this.currentSteerAngle = normalizeAngle(Math.atan2(vel.vy, vel.vx));
    } else if (pos.x > half - r) {
      pos.x = half - r;
      vel.vx = -Math.abs(vel.vx);
      this.currentSteerAngle = normalizeAngle(Math.atan2(vel.vy, vel.vx));
    }
    if (pos.y < -half + r) {
      pos.y = -half + r;
      vel.vy = Math.abs(vel.vy);
      this.currentSteerAngle = normalizeAngle(Math.atan2(vel.vy, vel.vx));
    } else if (pos.y > half - r) {
      pos.y = half - r;
      vel.vy = -Math.abs(vel.vy);
      this.currentSteerAngle = normalizeAngle(Math.atan2(vel.vy, vel.vx));
    }
  }
}

// ---- Population maintenance ----

/** Maintain the bot population at `targetCount`.
 *
 * Spawns new bots at random positions away from the player when the population
 * is below target, and destroys bots whose HP has dropped to zero. The query
 * cache is flushed when entities are added or removed so subsequent queries in
 * the same frame see the changes.
 */
export function maintainBots(
  world: ECWorld,
  targetCount: number,
  playerId: EntityId,
): void {
  // Remove dead bots.
  const botIds = world.query(C.Tank, BOT);
  let alive = 0;
  const toDestroy: EntityId[] = [];
  for (const id of botIds) {
    const tank = world.getComponent<TankComponent>(id, C.Tank);
    if (!tank || tank.hp <= 0) {
      toDestroy.push(id);
      continue;
    }
    alive++;
  }
  for (const id of toDestroy) {
    world.destroyEntity(id);
  }

  // Player position (to avoid spawning on top of them).
  let px = 0;
  let py = 0;
  const playerPos = world.getComponent<PositionComponent>(playerId, C.Position);
  if (playerPos) {
    px = playerPos.x;
    py = playerPos.y;
  }

  // Spawn up to a few bots per call to avoid bursts.
  const needed = targetCount - alive;
  const toSpawn = Math.min(needed, 2);
  for (let i = 0; i < toSpawn; i++) {
    const [x, y] = randomBotSpawnPos(px, py);
    const name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
    const color = BOT_COLORS[Math.floor(Math.random() * BOT_COLORS.length)];
    createBotEntity(world, x, y, name, color);
  }

  if (toDestroy.length > 0 || toSpawn > 0) {
    world.flush();
  }
}

/** Random position within the arena, at least 500 units from the player. */
function randomBotSpawnPos(px: number, py: number): [number, number] {
  const half = CONFIG.worldHalf - 150;
  const minDist = 500;
  for (let attempt = 0; attempt < 10; attempt++) {
    const x = (Math.random() * 2 - 1) * half;
    const y = (Math.random() * 2 - 1) * half;
    const dx = x - px;
    const dy = y - py;
    if (dx * dx + dy * dy > minDist * minDist) {
      return [x, y];
    }
  }
  return [(Math.random() * 2 - 1) * half, (Math.random() * 2 - 1) * half];
}
