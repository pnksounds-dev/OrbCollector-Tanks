/** Bot AI system: controls AI enemy tanks with sophisticated military-style behavior.
 *
 * ## Bot Roles
 * Each bot is assigned a role at creation that shapes its behavior:
 * - **farmer**:   focuses on farming shapes for XP, avoids combat
 * - **hunter**:   aggressive frontline, seeks enemies and pushes
 * - **defender**: stays near own base, guards territory
 * - **sniper**:   keeps distance, attacks from range, fragile
 * - **rammer**:   body-damage focused, charges enemies at close range
 * - **support**:  stays behind allies, provides cover fire
 *
 * ## Military Tactics
 * - Bots maintain separation from each other (no clumping)
 * - Bots avoid shapes in their path (collision avoidance steering)
 * - Bots avoid enemy base zones
 * - Wounded bots retreat toward own base
 * - Defenders hold position near base
 * - Hunters push toward enemy territory
 * - Snipers maintain optimal range
 *
 * ## Behavior States
 * - farming:   seek & shoot nearest shape for XP
 * - hunting:   engage enemy tanks
 * - fleeing:   retreat to own base when low HP
 * - defending: hold position near own base, engage approaching enemies
 * - regrouping: move to team rally point
 */

import { CONFIG } from "../config";
import type { ECWorld, EntityId } from "../ecs/World";
import {
  C,
  createBulletEntity,
  type PositionComponent,
  type VelocityComponent,
  type TankComponent,
  type TeamComponent,
  type ShapeComponent,
} from "../ecs/components";
import type { GameMode } from "../types";
import { STAT_COUNT, STAT_MAX } from "../types";
import { angleTo, clamp, dist, lerpAngle, normalizeAngle } from "../lib/math";

// ---- Component names ----

export const BOT = "bot";
export const BOT_AI = "bot_ai";

// ---- Component interfaces ----

export interface BotComponent {}

export type BotBehavior = "farming" | "hunting" | "fleeing" | "defending" | "regrouping";

export type BotRole = "farmer" | "hunter" | "defender" | "sniper" | "rammer" | "support";

export interface BotAIComponent {
  behavior: BotBehavior;
  role: BotRole;
  targetId: EntityId | null;
  targetX: number;
  targetY: number;
  steerAngle: number;
  fireFlag: boolean;
  retargetTimer: number;
  name: string;
  color: string;
  /** Desired engagement distance (varies by role). */
  preferredRange: number;
  /** Random personality offset for formation positioning (0..1). */
  formationOffset: number;
  // ---- Smooth steering state ----
  /** Current wander angle (drifts smoothly via noise). */
  wanderAngle: number;
  /** Current desired velocity X (accelerated toward, not instant). */
  desiredVx: number;
  /** Current desired velocity Y. */
  desiredVy: number;
  /** Aim jitter phase (for human-like imprecision). */
  aimJitterPhase: number;
  /** Aim tracking speed (varies per bot for personality). */
  aimSpeed: number;
  // ---- Individual territory ----
  /** Home territory center X — bot farms near here, returns here when idle. */
  homeX: number;
  /** Home territory center Y. */
  homeY: number;
  /** How often this bot re-targets (varies per bot for desync). */
  retargetInterval: number;
}

// ---- Name / color pools ----

const BOT_NAMES = [
  "Tanker", "Shooter", "CircleBot", "SquareKing", "PentaHunter",
  "DiepFan", "BulletStorm", "Rambot", "SniperWannabe", "ChaosTank",
  "Vanguard", "Sentinel", "Recon", "HeavyGun", "Striker",
  "Guardian", "Marauder", "Picket", "Outrider", "Bastion",
] as const;

const BOT_COLORS = [
  "#e14a4a", "#4ae14a", "#9b4ae1", "#e18a4a", "#e14ae1",
  "#4ae1b0", "#e1c84a", "#b04ae1",
] as const;

// ---- Role definitions ----

interface RoleProfile {
  /** Preferred engagement distance (world units). */
  range: number;
  /** Weight for this role in random assignment (higher = more common). */
  weight: number;
  /** Stat priority order (index into stats[]). */
  statPriority: number[];
  /** Fire range multiplier (relative to base FIRE_RANGE). */
  fireRangeMult: number;
  /** Whether this role prefers to stay near base. */
  defensive: boolean;
  /** Whether this role charges enemies (body damage focus). */
  aggressive: boolean;
}

const ROLE_PROFILES: Record<BotRole, RoleProfile> = {
  farmer: {
    range: 400,
    weight: 3,
    statPriority: [5, 6, 4, 1, 3, 0, 7, 2],
    fireRangeMult: 1.0,
    defensive: false,
    aggressive: false,
  },
  hunter: {
    range: 500,
    weight: 4,
    statPriority: [5, 6, 1, 4, 7, 3, 0, 2],
    fireRangeMult: 1.0,
    defensive: false,
    aggressive: true,
  },
  defender: {
    range: 450,
    weight: 2,
    statPriority: [1, 0, 5, 6, 4, 2, 3, 7],
    fireRangeMult: 1.0,
    defensive: true,
    aggressive: false,
  },
  sniper: {
    range: 800,
    weight: 2,
    statPriority: [3, 5, 4, 6, 1, 0, 7, 2],
    fireRangeMult: 1.5,
    defensive: false,
    aggressive: false,
  },
  rammer: {
    range: 100,
    weight: 2,
    statPriority: [2, 1, 7, 0, 5, 6, 4, 3],
    fireRangeMult: 0.5,
    defensive: false,
    aggressive: true,
  },
  support: {
    range: 600,
    weight: 1,
    statPriority: [6, 4, 5, 1, 0, 3, 7, 2],
    fireRangeMult: 1.2,
    defensive: false,
    aggressive: false,
  },
};

/** Pick a random role based on weights. */
function pickRole(): BotRole {
  const roles = Object.keys(ROLE_PROFILES) as BotRole[];
  let totalWeight = 0;
  for (const r of roles) totalWeight += ROLE_PROFILES[r].weight;
  let roll = Math.random() * totalWeight;
  for (const r of roles) {
    roll -= ROLE_PROFILES[r].weight;
    if (roll <= 0) return r;
  }
  return "hunter";
}

// ---- Tuning constants ----

const HUNT_RANGE = 700;
const HUNT_ABORT_RANGE = 900;
const HUNT_MIN_LEVEL = 3;
const FLEE_HP_RATIO = 0.3;
const FLEE_RECOVER_RATIO = 0.7;
const FIRE_RANGE = 650;
const LOD_DISTANCE = 1800;

// ---- Smooth steering parameters ----

/** How fast velocity accelerates toward desired velocity (0..1 per frame, scaled by dt). */
const ACCEL_RATE = 4.0;
/** How fast velocity decelerates when no steering input (friction). */
const DECEL_RATE = 2.5;
/** Wander: how much random heading drift to apply (rad/s). */
const WANDER_RATE = 0.8;
/** Wander: maximum angle offset from desired heading. */
const WANDER_MAX_OFFSET = 0.35;
/** Arrive: start decelerating within this distance of target. */
const ARRIVE_RANGE = 250;
/** Arrive: minimum speed factor when at target (0 = full stop). */
const ARRIVE_MIN_SPEED = 0.15;
/** Predictive avoidance: how far ahead to look (in seconds of travel). */
const AVOID_LOOK_AHEAD = 1.2;
/** Predictive avoidance: steering force magnitude. */
const AVOID_FORCE = 3.0;
/** Bot separation: range beyond body radii. */
const SEPARATION_RANGE = 90;
/** Bot separation: steering force magnitude. */
const SEPARATION_FORCE = 4.0;
/** Enemy base avoidance range beyond base radius. */
const ENEMY_BASE_AVOID_RANGE = 500;
/** Own base heal range. */
const OWN_BASE_HEAL_RANGE = 400;
/** Aim jitter amplitude (radians) — human-like imprecision. */
const AIM_JITTER_AMP = 0.04;
/** Aim jitter frequency. */
const AIM_JITTER_FREQ = 3.0;

// ---- Factory ----

export function createBotEntity(
  world: ECWorld,
  x: number,
  y: number,
  name: string,
  color: string,
  teamId: number = -1,
  role: BotRole | null = null,
): EntityId {
  const id = world.createEntity();
  const t = CONFIG.tank;

  const level = 1 + Math.floor(Math.random() * 5);
  const stats = new Array<number>(STAT_COUNT).fill(0);

  // Distribute stat points using role priority
  const assignedRole = role ?? pickRole();
  const profile = ROLE_PROFILES[assignedRole];
  let points = level - 1;
  const priority = profile.statPriority;
  let pi = 0;
  while (points > 0 && pi < priority.length) {
    const idx = priority[pi];
    if (stats[idx] < STAT_MAX) {
      stats[idx]++;
      points--;
    } else {
      pi++;
    }
  }
  // Distribute remaining randomly
  while (points > 0) {
    const idx = Math.floor(Math.random() * STAT_COUNT);
    if (stats[idx] < STAT_MAX) {
      stats[idx]++;
      points--;
    }
  }

  const bodyRadius = t.baseBodyRadius + (level - 1) * t.radiusGrowthPerLevel;
  const maxHp = t.baseMaxHp + stats[1] * t.statMaxHpPerPoint;
  const regen = t.baseRegen + stats[0] * t.statRegenPerPoint;
  const bodyDamage = t.baseBodyDamage + stats[2] * t.statBodyDamagePerPoint;

  world.addComponent<PositionComponent>(id, C.Position, {
    x, y, angle: Math.random() * Math.PI * 2,
  });
  world.addComponent<VelocityComponent>(id, C.Velocity, { vx: 0, vy: 0 });
  world.addComponent<TankComponent>(id, C.Tank, {
    bodyRadius, barrelLength: t.baseBarrelLength, barrelWidth: t.baseBarrelWidth,
    hp: maxHp, maxHp, regen, bodyDamage,
    shield: t.baseMaxShield, maxShield: t.baseMaxShield,
    shieldRegen: t.baseShieldRegen, shieldFlash: 0,
    lastDamagerId: null,
    xp: 0, level, statPoints: 0, stats,
    fireCooldown: 0, invuln: t.spawnInvuln, classId: "basic",
  });
  world.addComponent<BotComponent>(id, BOT, {});
  world.addComponent<TeamComponent>(id, C.Team, { id: teamId });
  world.addComponent<BotAIComponent>(id, BOT_AI, {
    behavior: "farming",
    role: assignedRole,
    targetId: null,
    targetX: x, targetY: y,
    steerAngle: Math.random() * Math.PI * 2,
    fireFlag: false,
    retargetTimer: Math.random() * 0.6, // desync retargeting
    name, color,
    preferredRange: profile.range,
    formationOffset: Math.random(),
    wanderAngle: Math.random() * Math.PI * 2,
    desiredVx: 0,
    desiredVy: 0,
    aimJitterPhase: Math.random() * Math.PI * 2,
    aimSpeed: 6 + Math.random() * 6,
    homeX: x,
    homeY: y,
    retargetInterval: 0.4 + Math.random() * 0.6, // 0.4–1.0s per bot
  });
  return id;
}

// ---- Team base info (set by Game.ts each frame) ----

interface TeamBaseInfo {
  /** Base center (retreat target). */
  x: number;
  y: number;
  /** Rectangle bounds of the base zone. */
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Team bases for the current game. Index = teamId. Empty = FFA. */
let teamBases: TeamBaseInfo[] = [];

/** Set team base positions (called by Game.ts at start and each frame). */
export function setTeamBases(bases: TeamBaseInfo[]): void {
  teamBases = bases;
}

/** True if (x,y) is inside the given team's base zone. */
export function isInBaseZone(x: number, y: number, teamId: number): boolean {
  const base = teamBases[teamId];
  if (!base) return false;
  return x >= base.minX && x <= base.maxX && y >= base.minY && y <= base.maxY;
}

/** True if (x,y) is inside ANY team's base zone. */
export function isInAnyBaseZone(x: number, y: number): boolean {
  for (const base of teamBases) {
    if (x >= base.minX && x <= base.maxX && y >= base.minY && y <= base.maxY) return true;
  }
  return false;
}

/** Returns the team ID whose base zone contains (x,y), or -1 if none. */
export function getBaseTeamAt(x: number, y: number): number {
  for (let i = 0; i < teamBases.length; i++) {
    const base = teamBases[i];
    if (x >= base.minX && x <= base.maxX && y >= base.minY && y <= base.maxY) return i;
  }
  return -1;
}

/** Distance from (x,y) to the nearest edge of a base rectangle (0 if inside). */
function distToBaseRect(x: number, y: number, base: TeamBaseInfo): number {
  const dx = Math.max(base.minX - x, 0, x - base.maxX);
  const dy = Math.max(base.minY - y, 0, y - base.maxY);
  return Math.hypot(dx, dy);
}

// ---- System ----

export class BotAISystem {
  private shapeIds: EntityId[] = [];
  private tankIds: EntityId[] = [];
  private botIds: EntityId[] = [];
  /** Desired velocity for the bot currently being processed (stashed for applyMovement). */
  private desiredVx = 0;
  private desiredVy = 0;

  update(world: ECWorld, dt: number, playerId: EntityId): void {
    this.botIds = world.query(C.Position, C.Tank, BOT, BOT_AI);
    if (this.botIds.length === 0) return;

    this.shapeIds = world.query(C.Position, C.Shape);
    this.tankIds = world.query(C.Position, C.Tank, C.Team);

    const playerPos = world.getComponent<PositionComponent>(playerId, C.Position);
    const playerAlive = world.hasComponent(playerId, C.Player);

    for (const botId of this.botIds) {
      const pos = world.getComponent<PositionComponent>(botId, C.Position);
      const vel = world.getComponent<VelocityComponent>(botId, C.Velocity);
      const tank = world.getComponent<TankComponent>(botId, C.Tank);
      const ai = world.getComponent<BotAIComponent>(botId, BOT_AI);
      if (!pos || !vel || !tank || !ai) continue;

      // Per-frame housekeeping
      this.tickTimers(tank, dt);
      this.handleLevelUp(tank, ai);
      this.applyRegen(tank, dt);

      const px = playerPos ? playerPos.x : CONFIG.worldHalf * 2;
      const py = playerPos ? playerPos.y : CONFIG.worldHalf * 2;
      const distToPlayer = dist(pos.x, pos.y, px, py);

      // LOD: far bots use simplified steering (wander only, no expensive queries)
      if (distToPlayer > LOD_DISTANCE) {
        // Gentle wander for far bots — they drift organically
        ai.wanderAngle += (Math.random() - 0.5) * WANDER_RATE * dt;
        const maxSpeed = CONFIG.tank.baseSpeed + tank.stats[7] * CONFIG.tank.statMoveSpeedPerPoint;
        this.desiredVx = Math.cos(ai.wanderAngle) * maxSpeed * 0.4;
        this.desiredVy = Math.sin(ai.wanderAngle) * maxSpeed * 0.4;
        this.applyMovement(pos, vel, tank, dt, world, botId);
        continue;
      }

      // Retarget timer (per-bot interval for desync)
      ai.retargetTimer -= dt;
      if (ai.retargetTimer <= 0) {
        ai.retargetTimer = ai.retargetInterval;
        this.retarget(world, botId, pos, tank, ai, px, py, distToPlayer, playerAlive);
      } else {
        this.updateBehaviorState(world, botId, tank, ai, pos, distToPlayer, playerAlive);
        ai.steerAngle = angleTo(pos.x, pos.y, ai.targetX, ai.targetY);
      }

      // Compute desired velocity (seek + wander + avoidance + separation + base avoid)
      const desired = this.computeDesiredVelocity(world, botId, pos, vel, tank, ai, dt);
      this.desiredVx = desired.dx;
      this.desiredVy = desired.dy;

      // Aim & fire
      this.aim(pos, ai, dt);
      this.handleFiring(world, botId, pos, tank, ai);

      // Movement — acceleration-based, smooth
      this.applyMovement(pos, vel, tank, dt, world, botId);
    }
  }

  // ---- Behavior ----

  private retarget(
    world: ECWorld,
    botId: EntityId,
    pos: PositionComponent,
    tank: TankComponent,
    ai: BotAIComponent,
    px: number,
    py: number,
    distToPlayer: number,
    playerAlive: boolean,
  ): void {
    this.updateBehaviorState(world, botId, tank, ai, pos, distToPlayer, playerAlive);

    // Slowly drift home territory so bots explore new areas over time (prevents static clusters)
    ai.homeX += (Math.random() - 0.5) * 60;
    ai.homeY += (Math.random() - 0.5) * 60;
    // Clamp home to arena bounds
    const homeBound = CONFIG.worldHalf - 200;
    ai.homeX = clamp(ai.homeX, -homeBound, homeBound);
    ai.homeY = clamp(ai.homeY, -homeBound, homeBound);

    const myTeam = world.getComponent<TeamComponent>(botId, C.Team);
    const myTeamId = myTeam ? myTeam.id : -1;
    const enemy = this.findBestEnemy(world, botId, pos.x, pos.y);
    const enemyDist = enemy ? enemy.dist : Infinity;
    const profile = ROLE_PROFILES[ai.role];
    const fireRange = FIRE_RANGE * profile.fireRangeMult;
    // Personal abort range — each bot gives up the chase at a different distance
    const personalAbortRange = HUNT_ABORT_RANGE * (0.7 + ai.formationOffset * 0.4);

    // ---- FLEEING: retreat to own base ----
    if (ai.behavior === "fleeing") {
      ai.targetId = null;
      // Retreat toward own base if in team mode
      if (myTeamId >= 0 && teamBases[myTeamId]) {
        const base = teamBases[myTeamId];
        ai.targetX = base.x;
        ai.targetY = base.y;
        ai.steerAngle = angleTo(pos.x, pos.y, base.x, base.y);
      } else {
        // FFA: flee away from threat
        const threatX = enemy ? enemy.x : px;
        const threatY = enemy ? enemy.y : py;
        const away = angleTo(threatX, threatY, pos.x, pos.y);
        ai.steerAngle = away;
        ai.targetX = pos.x + Math.cos(away) * 500;
        ai.targetY = pos.y + Math.sin(away) * 500;
      }
      // Fire backward at pursuer if close
      ai.fireFlag = enemyDist < fireRange;
      if (ai.fireFlag && enemy) {
        ai.targetX = enemy.x;
        ai.targetY = enemy.y;
      }
      return;
    }

    // ---- DEFENDING: hold near base, engage approaching enemies ----
    if (ai.behavior === "defending" && myTeamId >= 0 && teamBases[myTeamId]) {
      const base = teamBases[myTeamId];
      const distToBase = distToBaseRect(pos.x, pos.y, base);

      // If enemy is near base, engage
      if (enemy && enemyDist < personalAbortRange) {
        ai.targetId = null;
        ai.targetX = enemy.x;
        ai.targetY = enemy.y;
        ai.steerAngle = angleTo(pos.x, pos.y, enemy.x, enemy.y);
        ai.fireFlag = enemyDist < fireRange;
      } else if (distToBase > 200) {
        // Return to base
        ai.targetId = null;
        ai.targetX = base.x;
        ai.targetY = base.y;
        ai.steerAngle = angleTo(pos.x, pos.y, base.x, base.y);
        ai.fireFlag = false;
      } else {
        // Patrol near base
        const patrolAngle = ai.formationOffset * Math.PI * 2 + Date.now() * 0.0003;
        const patrolR = 300;
        ai.targetX = base.x + Math.cos(patrolAngle) * patrolR;
        ai.targetY = base.y + Math.sin(patrolAngle) * patrolR;
        ai.steerAngle = angleTo(pos.x, pos.y, ai.targetX, ai.targetY);
        ai.fireFlag = false;
      }
      return;
    }

    // ---- HUNTING: engage enemy tanks ----
    if (ai.behavior === "hunting") {
      if (enemy && enemyDist < personalAbortRange) {
        ai.targetId = null;
        // Role-specific positioning
        if (ai.role === "sniper") {
          // Snipers maintain distance — kite the enemy
          const idealDist = ai.preferredRange;
          if (enemyDist < idealDist * 0.7) {
            // Too close, back away
            const away = angleTo(enemy.x, enemy.y, pos.x, pos.y);
            ai.steerAngle = away;
            ai.targetX = pos.x + Math.cos(away) * 300;
            ai.targetY = pos.y + Math.sin(away) * 300;
          } else if (enemyDist > idealDist * 1.3) {
            // Too far, approach
            ai.targetX = enemy.x;
            ai.targetY = enemy.y;
            ai.steerAngle = angleTo(pos.x, pos.y, enemy.x, enemy.y);
          } else {
            // Sweet spot — strafe
            const strafeAngle = angleTo(pos.x, pos.y, enemy.x, enemy.y) + Math.PI / 2;
            ai.steerAngle = strafeAngle;
            ai.targetX = pos.x + Math.cos(strafeAngle) * 200;
            ai.targetY = pos.y + Math.sin(strafeAngle) * 200;
          }
          ai.fireFlag = enemyDist < fireRange;
        } else if (ai.role === "rammer") {
          // Rams charge straight at the enemy
          ai.targetX = enemy.x;
          ai.targetY = enemy.y;
          ai.steerAngle = angleTo(pos.x, pos.y, enemy.x, enemy.y);
          ai.fireFlag = enemyDist < fireRange;
        } else if (ai.role === "support") {
          // Support stays behind, fires from range
          const away = angleTo(enemy.x, enemy.y, pos.x, pos.y);
          const idealDist = ai.preferredRange;
          if (enemyDist < idealDist * 0.8) {
            ai.steerAngle = away;
            ai.targetX = pos.x + Math.cos(away) * 200;
            ai.targetY = pos.y + Math.sin(away) * 200;
          } else {
            ai.targetX = enemy.x;
            ai.targetY = enemy.y;
            ai.steerAngle = angleTo(pos.x, pos.y, enemy.x, enemy.y);
          }
          ai.fireFlag = enemyDist < fireRange;
        } else {
          // Hunter/farmer: approach and fire
          // Flanking: offset approach angle slightly based on formation offset
          const baseAngle = angleTo(pos.x, pos.y, enemy.x, enemy.y);
          const flankOffset = (ai.formationOffset - 0.5) * 0.6; // ±0.3 rad
          ai.steerAngle = normalizeAngle(baseAngle + flankOffset);
          ai.targetX = enemy.x + Math.cos(flankOffset) * 100;
          ai.targetY = enemy.y + Math.sin(flankOffset) * 100;
          ai.fireFlag = enemyDist < fireRange;
        }
        return;
      }
      // No enemy in range — fall back to farming
      ai.behavior = "farming";
    }

    // ---- FARMING: seek shapes for XP near individual territory ----
    // Each bot farms near its own home territory, not all converging to center.
    // Defenders farm near their base; others farm near their assigned home zone.
    let territoryX = ai.homeX;
    let territoryY = ai.homeY;
    if (profile.defensive && myTeamId >= 0 && teamBases[myTeamId]) {
      const base = teamBases[myTeamId];
      territoryX = base.x;
      territoryY = base.y;
    }

    // Find a shape near the bot's territory that isn't being targeted by nearby allies
    const target = this.findBestShape(world, botId, pos.x, pos.y, territoryX, territoryY);
    if (target !== null) {
      ai.targetId = target;
      const shapePos = world.getComponent<PositionComponent>(target, C.Position);
      if (shapePos) {
        const d = dist(pos.x, pos.y, shapePos.x, shapePos.y);
        if (d > ai.preferredRange * 1.2) {
          ai.targetX = shapePos.x;
          ai.targetY = shapePos.y;
          ai.steerAngle = angleTo(pos.x, pos.y, shapePos.x, shapePos.y);
        } else if (d < ai.preferredRange * 0.6) {
          const away = angleTo(shapePos.x, shapePos.y, pos.x, pos.y);
          ai.steerAngle = away;
          ai.targetX = pos.x + Math.cos(away) * 100;
          ai.targetY = pos.y + Math.sin(away) * 100;
        } else {
          const strafe = angleTo(pos.x, pos.y, shapePos.x, shapePos.y) + Math.PI / 2;
          ai.steerAngle = strafe;
          ai.targetX = pos.x + Math.cos(strafe) * 150;
          ai.targetY = pos.y + Math.sin(strafe) * 150;
        }
        ai.fireFlag = d < fireRange;
      } else {
        ai.fireFlag = false;
      }
    } else {
      // No shapes nearby — drift toward home territory (not arena center)
      ai.targetId = null;
      ai.targetX = territoryX;
      ai.targetY = territoryY;
      ai.steerAngle = angleTo(pos.x, pos.y, territoryX, territoryY);
      ai.fireFlag = false;
    }
  }

  /**
   * Find the best enemy to engage — considers distance, enemy HP (weaker = easier prey),
   * and whether other allies are already targeting the same enemy.
   * This distributes attacks across multiple enemies instead of all bots focusing one.
   */
  private findBestEnemy(
    world: ECWorld,
    botId: EntityId,
    x: number,
    y: number,
  ): { id: EntityId; x: number; y: number; dist: number } | null {
    const myTeam = world.getComponent<TeamComponent>(botId, C.Team);
    const myTeamId = myTeam ? myTeam.id : -1;

    // Count how many allies are targeting each enemy
    const enemyTargetCounts = new Map<EntityId, number>();
    for (const otherId of this.botIds) {
      if (otherId === botId) continue;
      const otherAi = world.getComponent<BotAIComponent>(otherId, BOT_AI);
      if (otherAi && otherAi.behavior === "hunting") {
        // Check if this ally is on our team
        const otherTeam = world.getComponent<TeamComponent>(otherId, C.Team);
        const otherTeamId = otherTeam ? otherTeam.id : -1;
        if (myTeamId >= 0 && otherTeamId >= 0 && myTeamId === otherTeamId) {
          // Same team — track their target
          const otherPos = world.getComponent<PositionComponent>(otherId, C.Position);
          if (otherPos) {
            const d = dist(x, y, otherPos.x, otherPos.y);
            if (d < 800) {
              // Find what enemy they're closest to
              for (const tid of this.tankIds) {
                if (tid === otherId) continue;
                const tpos = world.getComponent<PositionComponent>(tid, C.Position);
                if (tpos) {
                  const ed = dist(otherPos.x, otherPos.y, tpos.x, tpos.y);
                  if (ed < 500) {
                    enemyTargetCounts.set(tid, (enemyTargetCounts.get(tid) ?? 0) + 1);
                  }
                }
              }
            }
          }
        }
      }
    }

    let best: { id: EntityId; x: number; y: number; dist: number } | null = null;
    let bestScore = -Infinity;

    for (const tid of this.tankIds) {
      if (tid === botId) continue;
      const tpos = world.getComponent<PositionComponent>(tid, C.Position);
      if (!tpos) continue;
      const theirTeam = world.getComponent<TeamComponent>(tid, C.Team);
      const theirTeamId = theirTeam ? theirTeam.id : -1;
      if (myTeamId >= 0 && theirTeamId >= 0 && myTeamId === theirTeamId) continue;
      const theirTank = world.getComponent<TankComponent>(tid, C.Tank);
      if (theirTank && theirTank.hp <= 0) continue;

      const d = dist(x, y, tpos.x, tpos.y);
      // Score: closer is better, weaker enemies are easier prey
      let score = -d;
      if (theirTank) {
        const hpRatio = theirTank.maxHp > 0 ? theirTank.hp / theirTank.maxHp : 1;
        score += (1 - hpRatio) * 200; // prefer wounded enemies
        score -= theirTank.level * 5; // avoid high-level enemies
      }
      // Penalize enemies that many allies are already targeting
      const allyCount = enemyTargetCounts.get(tid) ?? 0;
      score -= allyCount * 300;
      // Add randomness for variety
      score += (Math.random() - 0.5) * 80;

      if (score > bestScore) {
        bestScore = score;
        best = { id: tid, x: tpos.x, y: tpos.y, dist: d };
      }
    }
    return best;
  }

  /** Update behavior state based on role, HP, and enemy proximity. */
  private updateBehaviorState(
    world: ECWorld,
    botId: EntityId,
    tank: TankComponent,
    ai: BotAIComponent,
    pos: PositionComponent,
    distToPlayer: number,
    playerAlive: boolean,
  ): void {
    const hpRatio = tank.maxHp > 0 ? tank.hp / tank.maxHp : 1;
    const myTeam = world.getComponent<TeamComponent>(botId, C.Team);
    const myTeamId = myTeam ? myTeam.id : -1;
    const profile = ROLE_PROFILES[ai.role];

    // FLEEING takes priority when critically wounded
    if (ai.behavior === "fleeing") {
      // Stay fleeing until healed significantly, or near own base
      const nearOwnBase = myTeamId >= 0 && teamBases[myTeamId]
        ? dist(pos.x, pos.y, teamBases[myTeamId].x, teamBases[myTeamId].y) < OWN_BASE_HEAL_RANGE
        : false;
      if (hpRatio > FLEE_RECOVER_RATIO || (nearOwnBase && hpRatio > 0.5)) {
        // Recovered — return to role default
        ai.behavior = profile.defensive ? "defending" : "farming";
      }
      return;
    }

    if (hpRatio < FLEE_HP_RATIO) {
      ai.behavior = "fleeing";
      return;
    }

    const enemy = this.findBestEnemy(world, botId, pos.x, pos.y);
    const enemyDist = enemy ? enemy.dist : Infinity;
    // Individual aggression threshold — each bot has a different "comfort zone"
    const personalHuntRange = HUNT_RANGE * (0.6 + ai.formationOffset * 0.6);
    const hasNearbyEnemy = (playerAlive && distToPlayer < personalHuntRange) || enemyDist < personalHuntRange;

    // DEFENDERS stay in defending mode unless under direct threat
    if (profile.defensive && myTeamId >= 0) {
      if (hasNearbyEnemy && enemyDist < personalHuntRange && tank.level >= HUNT_MIN_LEVEL) {
        ai.behavior = "hunting";
      } else {
        ai.behavior = "defending";
      }
      return;
    }

    // HUNTING: disengage if enemy too far or bot too weak
    if (ai.behavior === "hunting") {
      if (!hasNearbyEnemy || tank.level < HUNT_MIN_LEVEL) {
        ai.behavior = "farming";
      }
      return;
    }

    // FARMING: consider switching to hunting — only if enemy is within personal range
    if (hasNearbyEnemy && tank.level >= HUNT_MIN_LEVEL && hpRatio > FLEE_HP_RATIO) {
      // Aggressive roles (hunter, rammer) switch eagerly; others need closer enemy
      const switchThreshold = profile.aggressive ? personalHuntRange : personalHuntRange * 0.5;
      if (enemyDist < switchThreshold) {
        ai.behavior = "hunting";
      }
    }
  }

  /**
   * Find the best shape to farm — considers distance to bot, distance to territory,
   * and whether other nearby allies are already targeting the same shape.
   * This distributes bots across different shapes instead of all converging on one.
   */
  private findBestShape(
    world: ECWorld,
    botId: EntityId,
    botX: number,
    botY: number,
    terrX: number,
    terrY: number,
  ): EntityId | null {
    // Collect what other bots are targeting
    const claimedShapes = new Set<EntityId>();
    for (const otherId of this.botIds) {
      if (otherId === botId) continue;
      const otherAi = world.getComponent<BotAIComponent>(otherId, BOT_AI);
      if (otherAi && otherAi.targetId !== null && otherAi.behavior === "farming") {
        // Only count allies near us — far-away claims don't matter
        const otherPos = world.getComponent<PositionComponent>(otherId, C.Position);
        if (otherPos) {
          const d = dist(botX, botY, otherPos.x, otherPos.y);
          if (d < 600) {
            claimedShapes.add(otherAi.targetId);
          }
        }
      }
    }

    let best: EntityId | null = null;
    let bestScore = -Infinity;

    for (const sid of this.shapeIds) {
      const s = world.getComponent<PositionComponent>(sid, C.Position);
      if (!s) continue;

      // Distance from bot to shape
      const distToShape = dist(botX, botY, s.x, s.y);
      // Distance from shape to territory center
      const distToTerr = dist(terrX, terrY, s.x, s.y);

      // Score: closer to bot is better, closer to territory is better,
      // and shapes claimed by nearby allies are penalized
      let score = -distToShape - distToTerr * 0.3;
      if (claimedShapes.has(sid)) {
        score -= 400; // big penalty for shapes allies are already farming
      }
      // Add small random factor for variety
      score += (Math.random() - 0.5) * 50;

      if (score > bestScore) {
        bestScore = score;
        best = sid;
      }
    }
    return best;
  }

  // ---- Smooth steering engine ----
  //
  // Professional steering behavior pipeline:
  // 1. Compute a DESIRED velocity from the behavior (seek/arrive/flee)
  // 2. Add wander noise (smooth organic drift, not random snapping)
  // 3. Add predictive obstacle avoidance (ray-cast ahead, steer around)
  // 4. Add separation (push away from nearby allies)
  // 5. Add enemy base avoidance
  // 6. Accelerate current velocity toward desired velocity (no instant snaps)
  // 7. Apply velocity to position with wall clamping

  /** Compute the blended desired velocity for this bot this frame. */
  private computeDesiredVelocity(
    world: ECWorld,
    botId: EntityId,
    pos: PositionComponent,
    vel: VelocityComponent,
    tank: TankComponent,
    ai: BotAIComponent,
    dt: number,
  ): { dx: number; dy: number } {
    const maxSpeed = CONFIG.tank.baseSpeed + tank.stats[7] * CONFIG.tank.statMoveSpeedPerPoint;
    const myTeam = world.getComponent<TeamComponent>(botId, C.Team);
    const myTeamId = myTeam ? myTeam.id : -1;

    // --- 1. Base desired velocity: seek or arrive at target ---
    const toTargetX = ai.targetX - pos.x;
    const toTargetY = ai.targetY - pos.y;
    const targetDist = Math.hypot(toTargetX, toTargetY);

    let speedFactor = 1.0;
    // Arrive behavior: decelerate when approaching target (unless fleeing or ramming)
    if (ai.behavior !== "fleeing" && ai.role !== "rammer" && targetDist < ARRIVE_RANGE) {
      speedFactor = clamp(targetDist / ARRIVE_RANGE, ARRIVE_MIN_SPEED, 1.0);
    }

    let desX = 0;
    let desY = 0;
    if (targetDist > 1) {
      desX = (toTargetX / targetDist) * maxSpeed * speedFactor;
      desY = (toTargetY / targetDist) * maxSpeed * speedFactor;
    }

    // --- 2. Wander: smooth organic heading drift ---
    // Advance the wander angle with smooth noise (not random snapping)
    ai.wanderAngle += (Math.random() - 0.5) * WANDER_RATE * dt;
    // Clamp wander angle drift
    const wanderDx = Math.cos(ai.wanderAngle) * WANDER_MAX_OFFSET;
    const wanderDy = Math.sin(ai.wanderAngle) * WANDER_MAX_OFFSET;
    // Apply wander as a small perturbation to the desired direction
    if (targetDist > 1) {
      const wanderForce = maxSpeed * 0.15;
      desX += wanderDx * wanderForce;
      desY += wanderDy * wanderForce;
    } else {
      // At target — use wander for gentle drift
      desX = Math.cos(ai.wanderAngle) * maxSpeed * 0.3;
      desY = Math.sin(ai.wanderAngle) * maxSpeed * 0.3;
    }

    // --- 3. Predictive obstacle avoidance ---
    // Cast a ray ahead along current velocity; if a shape is in the path, steer around it
    const velMag = Math.hypot(vel.vx, vel.vy);
    if (velMag > 10) {
      const lookAhead = AVOID_LOOK_AHEAD; // seconds
      const aheadX = pos.x + vel.vx * lookAhead;
      const aheadY = pos.y + vel.vy * lookAhead;
      let avoidX = 0;
      let avoidY = 0;
      let avoidStrength = 0;

      for (const sid of this.shapeIds) {
        const s = world.getComponent<PositionComponent>(sid, C.Position);
        const shape = world.getComponent<ShapeComponent>(sid, C.Shape);
        if (!s || !shape) continue;
        // Distance from shape to the look-ahead ray segment
        const distToAhead = this.pointToSegmentDist(s.x, s.y, pos.x, pos.y, aheadX, aheadY);
        const collisionRadius = shape.radius + tank.bodyRadius + 20;
        if (distToAhead < collisionRadius) {
          // Also check actual proximity
          const dx = s.x - pos.x;
          const dy = s.y - pos.y;
          const d = Math.hypot(dx, dy);
          const proxRange = collisionRadius + 100;
          if (d < proxRange) {
            // Steer perpendicular to the obstacle direction
            const awayX = pos.x - s.x;
            const awayY = pos.y - s.y;
            const awayDist = Math.hypot(awayX, awayY);
            if (awayDist > 0.1) {
              const force = (1 - d / proxRange) * AVOID_FORCE;
              avoidX += (awayX / awayDist) * force;
              avoidY += (awayY / awayDist) * force;
              avoidStrength = Math.max(avoidStrength, force);
            }
          }
        }
      }

      if (avoidStrength > 0) {
        const avoidMag = Math.hypot(avoidX, avoidY);
        if (avoidMag > 0.01) {
          desX += (avoidX / avoidMag) * maxSpeed * Math.min(avoidStrength, 1.0);
          desY += (avoidY / avoidMag) * maxSpeed * Math.min(avoidStrength, 1.0);
        }
      }
    }

    // --- 4. Separation: push away from nearby allies ---
    for (const otherId of this.botIds) {
      if (otherId === botId) continue;
      const otherPos = world.getComponent<PositionComponent>(otherId, C.Position);
      const otherTank = world.getComponent<TankComponent>(otherId, C.Tank);
      if (!otherPos || !otherTank) continue;
      const otherTeam = world.getComponent<TeamComponent>(otherId, C.Team);
      const otherTeamId = otherTeam ? otherTeam.id : -1;
      if (myTeamId >= 0 && otherTeamId >= 0 && myTeamId !== otherTeamId) continue;

      const dx = pos.x - otherPos.x;
      const dy = pos.y - otherPos.y;
      const d = Math.hypot(dx, dy);
      const sepDist = SEPARATION_RANGE + tank.bodyRadius + otherTank.bodyRadius;
      if (d < sepDist && d > 0.1) {
        const force = (1 - d / sepDist) * SEPARATION_FORCE;
        desX += (dx / d) * maxSpeed * force;
        desY += (dy / d) * maxSpeed * force;
      }
    }

    // --- 5. Enemy base avoidance (rectangle zones) ---
    if (myTeamId >= 0) {
      for (let ti = 0; ti < teamBases.length; ti++) {
        if (ti === myTeamId) continue;
        const base = teamBases[ti];
        const d = distToBaseRect(pos.x, pos.y, base);
        const avoidDist = ENEMY_BASE_AVOID_RANGE;
        if (d < avoidDist && d > 0.1) {
          // Push away from the nearest point on the rectangle
          const nx = pos.x < base.minX ? pos.x - base.minX : pos.x > base.maxX ? pos.x - base.maxX : 0;
          const ny = pos.y < base.minY ? pos.y - base.minY : pos.y > base.maxY ? pos.y - base.maxY : 0;
          const len = Math.hypot(nx, ny) || 1;
          const force = (1 - d / avoidDist) * 2.5;
          desX += (nx / len) * maxSpeed * force;
          desY += (ny / len) * maxSpeed * force;
        }
      }
    }

    return { dx: desX, dy: desY };
  }

  /** Distance from point (px,py) to line segment (ax,ay)-(bx,by). */
  private pointToSegmentDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 0.001) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = clamp(t, 0, 1);
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    return Math.hypot(px - cx, py - cy);
  }

  // ---- Per-bot subsystems ----

  /** Human-like aim: smooth tracking with slight jitter for imprecision. */
  private aim(pos: PositionComponent, ai: BotAIComponent, dt: number): void {
    const desired = angleTo(pos.x, pos.y, ai.targetX, ai.targetY);
    // Add subtle jitter — humans don't track perfectly
    ai.aimJitterPhase += AIM_JITTER_FREQ * dt;
    const jitter = Math.sin(ai.aimJitterPhase + ai.formationOffset * 7) * AIM_JITTER_AMP;
    const t = clamp(ai.aimSpeed * dt, 0, 1);
    pos.angle = lerpAngle(pos.angle, desired + jitter, t);
  }

  private handleFiring(
    world: ECWorld,
    botId: EntityId,
    pos: PositionComponent,
    tank: TankComponent,
    ai: BotAIComponent,
  ): void {
    if (!ai.fireFlag || tank.fireCooldown > 0) return;

    const fireRate = CONFIG.tank.baseFireRate * (1 + tank.stats[6] * CONFIG.tank.statReloadPerPoint);
    tank.fireCooldown = 1 / fireRate;

    const bulletSpeed = CONFIG.bullet.baseSpeed + tank.stats[3] * CONFIG.tank.statBulletSpeedPerPoint;
    const bulletDamage = CONFIG.bullet.baseDamage + tank.stats[5] * CONFIG.tank.statBulletDamagePerPoint;
    const bulletPenetration = CONFIG.bullet.basePenetration + tank.stats[4] * CONFIG.tank.statBulletPenetrationPerPoint;

    const tipX = pos.x + Math.cos(pos.angle) * (tank.bodyRadius + tank.barrelLength);
    const tipY = pos.y + Math.sin(pos.angle) * (tank.bodyRadius + tank.barrelLength);

    const team = world.getComponent<TeamComponent>(botId, C.Team);
    const teamId = team ? team.id : -1;
    createBulletEntity(world, tipX, tipY, pos.angle, bulletSpeed, bulletDamage, bulletPenetration, botId, teamId);
  }

  // ---- Shared helpers ----

  private tickTimers(tank: TankComponent, dt: number): void {
    if (tank.fireCooldown > 0) tank.fireCooldown = Math.max(0, tank.fireCooldown - dt);
    if (tank.invuln > 0) tank.invuln = Math.max(0, tank.invuln - dt);
    if (tank.shieldFlash > 0) tank.shieldFlash = Math.max(0, tank.shieldFlash - dt);
  }

  private applyRegen(tank: TankComponent, dt: number): void {
    if (tank.hp < tank.maxHp) {
      tank.hp = Math.min(tank.maxHp, tank.hp + tank.regen * dt);
    }
    if (tank.shieldFlash <= 0 && tank.shield < tank.maxShield) {
      tank.shield = Math.min(tank.maxShield, tank.shield + tank.shieldRegen * dt);
    }
  }

  private handleLevelUp(tank: TankComponent, ai: BotAIComponent): void {
    let leveled = false;
    while (tank.xp >= this.xpForNextLevel(tank.level) && tank.level < CONFIG.levelCap) {
      tank.xp -= this.xpForNextLevel(tank.level);
      tank.level++;
      tank.statPoints++;
      tank.bodyRadius = CONFIG.tank.baseBodyRadius + (tank.level - 1) * CONFIG.tank.radiusGrowthPerLevel;
      this.recalcStats(tank);
      tank.hp = tank.maxHp;
      tank.shield = tank.maxShield;
      leveled = true;
    }
    if (leveled) this.spendStatPoints(tank, ai);
  }

  private xpForNextLevel(level: number): number {
    return Math.floor(level * level * CONFIG.xpFactor);
  }

  private recalcStats(tank: TankComponent): void {
    const t = CONFIG.tank;
    tank.maxHp = t.baseMaxHp + tank.stats[1] * t.statMaxHpPerPoint;
    tank.maxShield = t.baseMaxShield + tank.stats[1] * t.statMaxHpPerPoint * 0.5;
    tank.shieldRegen = t.baseShieldRegen + tank.stats[0] * t.statRegenPerPoint * 2;
    tank.regen = t.baseRegen + tank.stats[0] * t.statRegenPerPoint;
    tank.bodyDamage = t.baseBodyDamage + tank.stats[2] * t.statBodyDamagePerPoint;
  }

  /** Spend stat points using role-specific priority. */
  private spendStatPoints(tank: TankComponent, ai: BotAIComponent): void {
    const priority = ROLE_PROFILES[ai.role].statPriority;
    while (tank.statPoints > 0) {
      let spent = false;
      for (const idx of priority) {
        if (tank.stats[idx] >= STAT_MAX) continue;
        tank.statPoints--;
        tank.stats[idx]++;
        spent = true;
        this.recalcStats(tank);
        break;
      }
      if (!spent) {
        // Try remaining stats randomly
        for (let i = 0; i < STAT_COUNT; i++) {
          if (tank.stats[i] < STAT_MAX) {
            tank.statPoints--;
            tank.stats[i]++;
            this.recalcStats(tank);
            spent = true;
            break;
          }
        }
        if (!spent) {
          tank.statPoints = 0;
          break;
        }
      }
    }
  }

  /**
   * Acceleration-based movement: velocity lerps toward desired velocity,
   * giving smooth starts, stops, and turns — no instant direction snaps.
   * Position is updated from the smoothed velocity, with wall clamping.
   */
  private applyMovement(
    pos: PositionComponent,
    vel: VelocityComponent,
    tank: TankComponent,
    dt: number,
    _world: ECWorld,
    _botId: EntityId,
  ): void {
    // Accelerate current velocity toward desired velocity
    const desVx = this.desiredVx;
    const desVy = this.desiredVy;
    const dvx = desVx - vel.vx;
    const dvy = desVy - vel.vy;
    const dvMag = Math.hypot(dvx, dvy);

    if (dvMag > 1) {
      // Accelerating toward desired
      const accel = ACCEL_RATE * dt;
      vel.vx += dvx * Math.min(accel, 1);
      vel.vy += dvy * Math.min(accel, 1);
    } else {
      // Near target velocity — apply gentle friction for stability
      const decel = DECEL_RATE * dt;
      vel.vx *= 1 - Math.min(decel, 0.1);
      vel.vy *= 1 - Math.min(decel, 0.1);
    }

    // Clamp to max speed
    const maxSpeed = CONFIG.tank.baseSpeed + tank.stats[7] * CONFIG.tank.statMoveSpeedPerPoint;
    const speed = Math.hypot(vel.vx, vel.vy);
    if (speed > maxSpeed) {
      vel.vx = (vel.vx / speed) * maxSpeed;
      vel.vy = (vel.vy / speed) * maxSpeed;
    }

    // Update position
    pos.x += vel.vx * dt;
    pos.y += vel.vy * dt;

    // Wall clamping — smooth bounce by reflecting velocity
    const half = CONFIG.worldHalf;
    const r = tank.bodyRadius;
    if (pos.x < -half + r) {
      pos.x = -half + r;
      vel.vx = Math.abs(vel.vx) * 0.7; // dampened bounce
    } else if (pos.x > half - r) {
      pos.x = half - r;
      vel.vx = -Math.abs(vel.vx) * 0.7;
    }
    if (pos.y < -half + r) {
      pos.y = -half + r;
      vel.vy = Math.abs(vel.vy) * 0.7;
    } else if (pos.y > half - r) {
      pos.y = half - r;
      vel.vy = -Math.abs(vel.vy) * 0.7;
    }

  }
}

// ---- Population maintenance ----

export function maintainBots(
  world: ECWorld,
  targetCount: number,
  playerId: EntityId,
  gameMode: GameMode = "ffa",
): void {
  const botIds = world.query(C.Tank, BOT);
  let alive = 0;
  const toDestroy: EntityId[] = [];
  const teamCounts: Map<number, number> = new Map();
  for (const id of botIds) {
    const tank = world.getComponent<TankComponent>(id, C.Tank);
    if (!tank || tank.hp <= 0) {
      toDestroy.push(id);
      continue;
    }
    alive++;
    const team = world.getComponent<TeamComponent>(id, C.Team);
    const teamId = team ? team.id : -1;
    teamCounts.set(teamId, (teamCounts.get(teamId) ?? 0) + 1);
  }
  for (const id of toDestroy) {
    world.destroyEntity(id);
  }

  let px = 0;
  let py = 0;
  const playerPos = world.getComponent<PositionComponent>(playerId, C.Position);
  if (playerPos) {
    px = playerPos.x;
    py = playerPos.y;
  }

  const teamCount = gameMode === "ffa" ? 0 : (gameMode === "2teams" ? 2 : 4);

  const needed = targetCount - alive;
  const toSpawn = Math.min(needed, 3);
  for (let i = 0; i < toSpawn; i++) {
    let botTeam = -1;
    let bx = 0;
    let by = 0;
    if (teamCount > 0) {
      let minCount = Infinity;
      for (let t = 0; t < teamCount; t++) {
        const count = teamCounts.get(t) ?? 0;
        if (count < minCount) {
          minCount = count;
          botTeam = t;
        }
      }
      // Base centers match Game.getTeamBase (rectangle-based, edge-to-edge zones)
      const half = CONFIG.worldHalf;
      let bases: { x: number; y: number }[];
      if (teamCount === 2) {
        const depth = CONFIG.teams.baseDepth2;
        bases = [{ x: 0, y: -(half - depth / 2) }, { x: 0, y: half - depth / 2 }];
      } else {
        const depth = CONFIG.teams.baseDepth4;
        const c = half - depth / 2;
        bases = [{ x: -c, y: -c }, { x: c, y: -c }, { x: -c, y: c }, { x: c, y: c }];
      }
      const base = bases[botTeam % bases.length];
      const spread = 400;
      bx = base.x + (Math.random() - 0.5) * spread * 2;
      by = base.y + (Math.random() - 0.5) * spread * 2;
      teamCounts.set(botTeam, (teamCounts.get(botTeam) ?? 0) + 1);
    } else {
      const [x, y] = randomBotSpawnPos(px, py);
      bx = x;
      by = y;
    }
    const half = CONFIG.worldHalf - 150;
    bx = Math.max(-half, Math.min(half, bx));
    by = Math.max(-half, Math.min(half, by));
    const name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
    const color = teamCount > 0
      ? CONFIG.teams.colors[botTeam]
      : BOT_COLORS[Math.floor(Math.random() * BOT_COLORS.length)];
    const botId = createBotEntity(world, bx, by, name, color, botTeam);
    // Assign an individual home territory spread across the team's half of the arena
    const ai = world.getComponent<BotAIComponent>(botId, BOT_AI);
    if (ai) {
      if (teamCount > 0) {
        // Spread home territories around the team's base area
        const base = teamCount === 2
          ? (botTeam === 0 ? { x: 0, y: -CONFIG.worldHalf * 0.75 } : { x: 0, y: CONFIG.worldHalf * 0.75 })
          : [{ x: -CONFIG.worldHalf * 0.75, y: -CONFIG.worldHalf * 0.75 }, { x: CONFIG.worldHalf * 0.75, y: -CONFIG.worldHalf * 0.75 }, { x: -CONFIG.worldHalf * 0.75, y: CONFIG.worldHalf * 0.75 }, { x: CONFIG.worldHalf * 0.75, y: CONFIG.worldHalf * 0.75 }][botTeam % 4];
        // Spread in a wide area around the base — each bot gets a unique zone
        const angle = Math.random() * Math.PI * 2;
        const radius = 300 + Math.random() * 1200;
        ai.homeX = Math.max(-half, Math.min(half, base.x + Math.cos(angle) * radius));
        ai.homeY = Math.max(-half, Math.min(half, base.y + Math.sin(angle) * radius));
      } else {
        // FFA: spread across the whole arena
        ai.homeX = (Math.random() - 0.5) * CONFIG.worldHalf * 1.5;
        ai.homeY = (Math.random() - 0.5) * CONFIG.worldHalf * 1.5;
      }
    }
  }

  if (toDestroy.length > 0 || toSpawn > 0) {
    world.flush();
  }
}

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
