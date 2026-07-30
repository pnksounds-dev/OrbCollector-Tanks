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
const RETARGET_INTERVAL = 0.6;
const AIM_LERP_RATE = 10;

// Shape collision avoidance
const SHAPE_AVOID_RANGE = 80;
const SHAPE_AVOID_FORCE = 1.5;

// Bot separation
const SEPARATION_RANGE = 70;
const SEPARATION_FORCE = 1.2;

// Base awareness
const ENEMY_BASE_AVOID_RANGE = 600;
const OWN_BASE_HEAL_RANGE = 400;

// Formation spacing is handled via per-bot formationOffset (0..1 random)

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
    retargetTimer: 0,
    name, color,
    preferredRange: profile.range,
    formationOffset: Math.random(),
  });
  return id;
}

// ---- Team base info (set by Game.ts each frame) ----

interface TeamBaseInfo {
  x: number;
  y: number;
  radius: number;
}

/** Team bases for the current game. Index = teamId. Empty = FFA. */
let teamBases: TeamBaseInfo[] = [];

/** Set team base positions (called by Game.ts at start and each frame). */
export function setTeamBases(bases: TeamBaseInfo[]): void {
  teamBases = bases;
}

// ---- System ----

export class BotAISystem {
  private shapeIds: EntityId[] = [];
  private tankIds: EntityId[] = [];
  private botIds: EntityId[] = [];
  private currentSteerAngle = 0;

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

      this.currentSteerAngle = ai.steerAngle;

      // LOD: far bots just drift
      if (distToPlayer > LOD_DISTANCE) {
        this.applyMovement(pos, vel, tank, dt, world, botId);
        continue;
      }

      // Retarget timer
      ai.retargetTimer -= dt;
      if (ai.retargetTimer <= 0) {
        ai.retargetTimer = RETARGET_INTERVAL;
        this.retarget(world, botId, pos, tank, ai, px, py, distToPlayer, playerAlive);
      } else {
        this.updateBehaviorState(world, botId, tank, ai, pos, distToPlayer, playerAlive);
        ai.steerAngle = angleTo(pos.x, pos.y, ai.targetX, ai.targetY);
      }

      // Apply steering corrections (shape avoidance, separation, base avoidance)
      this.applySteeringCorrections(world, botId, pos, tank, ai, dt);

      // Aim & fire
      this.currentSteerAngle = ai.steerAngle;
      this.aim(pos, ai, dt);
      this.handleFiring(world, botId, pos, tank, ai);

      // Movement
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

    const myTeam = world.getComponent<TeamComponent>(botId, C.Team);
    const myTeamId = myTeam ? myTeam.id : -1;
    const enemy = this.findNearestEnemy(world, botId, pos.x, pos.y);
    const enemyDist = enemy ? enemy.dist : Infinity;
    const profile = ROLE_PROFILES[ai.role];
    const fireRange = FIRE_RANGE * profile.fireRangeMult;

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
      const distToBase = dist(pos.x, pos.y, base.x, base.y);

      // If enemy is near base, engage
      if (enemy && enemyDist < HUNT_RANGE) {
        ai.targetId = null;
        ai.targetX = enemy.x;
        ai.targetY = enemy.y;
        ai.steerAngle = angleTo(pos.x, pos.y, enemy.x, enemy.y);
        ai.fireFlag = enemyDist < fireRange;
      } else if (distToBase > base.radius * 0.7) {
        // Return to base
        ai.targetId = null;
        ai.targetX = base.x;
        ai.targetY = base.y;
        ai.steerAngle = angleTo(pos.x, pos.y, base.x, base.y);
        ai.fireFlag = false;
      } else {
        // Patrol near base
        const patrolAngle = ai.formationOffset * Math.PI * 2 + Date.now() * 0.0003;
        const patrolR = base.radius * 0.5;
        ai.targetX = base.x + Math.cos(patrolAngle) * patrolR;
        ai.targetY = base.y + Math.sin(patrolAngle) * patrolR;
        ai.steerAngle = angleTo(pos.x, pos.y, ai.targetX, ai.targetY);
        ai.fireFlag = false;
      }
      return;
    }

    // ---- HUNTING: engage enemy tanks ----
    if (ai.behavior === "hunting") {
      if (enemy && enemyDist < HUNT_ABORT_RANGE) {
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

    // ---- FARMING: seek shapes for XP ----
    // Defenders in team mode farm near their base
    let searchX = pos.x;
    let searchY = pos.y;
    if (profile.defensive && myTeamId >= 0 && teamBases[myTeamId]) {
      const base = teamBases[myTeamId];
      searchX = base.x;
      searchY = base.y;
    }

    const target = this.findNearestShape(world, searchX, searchY);
    if (target !== null) {
      ai.targetId = target;
      const shapePos = world.getComponent<PositionComponent>(target, C.Position);
      if (shapePos) {
        // Approach to preferred range
        const d = dist(pos.x, pos.y, shapePos.x, shapePos.y);
        if (d > ai.preferredRange * 1.2) {
          ai.targetX = shapePos.x;
          ai.targetY = shapePos.y;
          ai.steerAngle = angleTo(pos.x, pos.y, shapePos.x, shapePos.y);
        } else if (d < ai.preferredRange * 0.6) {
          // Too close, back off slightly
          const away = angleTo(shapePos.x, shapePos.y, pos.x, pos.y);
          ai.steerAngle = away;
          ai.targetX = pos.x + Math.cos(away) * 100;
          ai.targetY = pos.y + Math.sin(away) * 100;
        } else {
          // Strafe around the shape
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
      // No shapes nearby — wander toward arena center or team base
      ai.targetId = null;
      if (profile.defensive && myTeamId >= 0 && teamBases[myTeamId]) {
        const base = teamBases[myTeamId];
        ai.targetX = base.x;
        ai.targetY = base.y;
      } else {
        ai.targetX = 0;
        ai.targetY = 0;
      }
      ai.steerAngle = angleTo(pos.x, pos.y, ai.targetX, ai.targetY);
      ai.fireFlag = false;
    }
  }

  /** Find the nearest enemy tank. */
  private findNearestEnemy(
    world: ECWorld,
    botId: EntityId,
    x: number,
    y: number,
  ): { id: EntityId; x: number; y: number; dist: number } | null {
    const myTeam = world.getComponent<TeamComponent>(botId, C.Team);
    const myTeamId = myTeam ? myTeam.id : -1;
    let best: { id: EntityId; x: number; y: number; dist: number } | null = null;
    let bestDistSq = Infinity;

    for (const tid of this.tankIds) {
      if (tid === botId) continue;
      const tpos = world.getComponent<PositionComponent>(tid, C.Position);
      if (!tpos) continue;
      const theirTeam = world.getComponent<TeamComponent>(tid, C.Team);
      const theirTeamId = theirTeam ? theirTeam.id : -1;
      if (myTeamId >= 0 && theirTeamId >= 0 && myTeamId === theirTeamId) continue;
      const theirTank = world.getComponent<TankComponent>(tid, C.Tank);
      if (theirTank && theirTank.hp <= 0) continue;

      const dx = tpos.x - x;
      const dy = tpos.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDistSq) {
        bestDistSq = d2;
        best = { id: tid, x: tpos.x, y: tpos.y, dist: Math.sqrt(d2) };
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

    const enemy = this.findNearestEnemy(world, botId, pos.x, pos.y);
    const enemyDist = enemy ? enemy.dist : Infinity;
    const hasNearbyEnemy = (playerAlive && distToPlayer < HUNT_RANGE) || enemyDist < HUNT_RANGE;

    // DEFENDERS stay in defending mode unless under direct threat
    if (profile.defensive && myTeamId >= 0) {
      if (hasNearbyEnemy && enemyDist < HUNT_RANGE && tank.level >= HUNT_MIN_LEVEL) {
        ai.behavior = "hunting";
      } else {
        ai.behavior = "defending";
      }
      return;
    }

    // HUNTING: engage enemies if close and strong enough
    if (ai.behavior === "hunting") {
      if (!hasNearbyEnemy || tank.level < HUNT_MIN_LEVEL) {
        ai.behavior = "farming";
      }
      return;
    }

    // FARMING: consider switching to hunting
    if (hasNearbyEnemy && tank.level >= HUNT_MIN_LEVEL && hpRatio > FLEE_HP_RATIO) {
      // Hunters and rammers are more eager to fight
      if (profile.aggressive || enemyDist < HUNT_RANGE * 0.5) {
        ai.behavior = "hunting";
      }
    }
  }

  /** Find the nearest shape to (x, y). */
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

  // ---- Steering corrections ----

  /** Apply collision avoidance and separation steering. */
  private applySteeringCorrections(
    world: ECWorld,
    botId: EntityId,
    pos: PositionComponent,
    tank: TankComponent,
    ai: BotAIComponent,
    _dt: number,
  ): void {
    let steerX = Math.cos(ai.steerAngle);
    let steerY = Math.sin(ai.steerAngle);

    // 1. Shape collision avoidance — steer away from nearby shapes
    for (const sid of this.shapeIds) {
      const s = world.getComponent<PositionComponent>(sid, C.Position);
      const shape = world.getComponent<ShapeComponent>(sid, C.Shape);
      if (!s || !shape) continue;
      const dx = pos.x - s.x;
      const dy = pos.y - s.y;
      const d = Math.hypot(dx, dy);
      const avoidDist = SHAPE_AVOID_RANGE + shape.radius;
      if (d < avoidDist && d > 0.1) {
        // Push away from shape
        const force = (1 - d / avoidDist) * SHAPE_AVOID_FORCE;
        steerX += (dx / d) * force;
        steerY += (dy / d) * force;
      }
    }

    // 2. Bot separation — steer away from nearby allies
    const myTeam = world.getComponent<TeamComponent>(botId, C.Team);
    const myTeamId = myTeam ? myTeam.id : -1;
    for (const otherId of this.botIds) {
      if (otherId === botId) continue;
      const otherPos = world.getComponent<PositionComponent>(otherId, C.Position);
      const otherTank = world.getComponent<TankComponent>(otherId, C.Tank);
      if (!otherPos || !otherTank) continue;
      // Only separate from allies (enemies we want to approach)
      const otherTeam = world.getComponent<TeamComponent>(otherId, C.Team);
      const otherTeamId = otherTeam ? otherTeam.id : -1;
      if (myTeamId >= 0 && otherTeamId >= 0 && myTeamId !== otherTeamId) continue;

      const dx = pos.x - otherPos.x;
      const dy = pos.y - otherPos.y;
      const d = Math.hypot(dx, dy);
      const sepDist = SEPARATION_RANGE + tank.bodyRadius + otherTank.bodyRadius;
      if (d < sepDist && d > 0.1) {
        const force = (1 - d / sepDist) * SEPARATION_FORCE;
        steerX += (dx / d) * force;
        steerY += (dy / d) * force;
      }
    }

    // 3. Enemy base avoidance — steer away from enemy bases
    if (myTeamId >= 0) {
      for (let ti = 0; ti < teamBases.length; ti++) {
        if (ti === myTeamId) continue;
        const base = teamBases[ti];
        const dx = pos.x - base.x;
        const dy = pos.y - base.y;
        const d = Math.hypot(dx, dy);
        const avoidDist = base.radius + ENEMY_BASE_AVOID_RANGE;
        if (d < avoidDist && d > 0.1) {
          const force = (1 - d / avoidDist) * 2.0;
          steerX += (dx / d) * force;
          steerY += (dy / d) * force;
        }
      }
    }

    // Normalize the steering vector back to a unit vector
    const mag = Math.hypot(steerX, steerY);
    if (mag > 0.01) {
      ai.steerAngle = Math.atan2(steerY, steerX);
    }
  }

  // ---- Per-bot subsystems ----

  private aim(pos: PositionComponent, ai: BotAIComponent, dt: number): void {
    const desired = angleTo(pos.x, pos.y, ai.targetX, ai.targetY);
    const t = clamp(AIM_LERP_RATE * dt, 0, 1);
    pos.angle = lerpAngle(pos.angle, desired, t);
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

    createBulletEntity(world, tipX, tipY, pos.angle, bulletSpeed, bulletDamage, bulletPenetration, botId);
  }

  // ---- Shared helpers ----

  private tickTimers(tank: TankComponent, dt: number): void {
    if (tank.fireCooldown > 0) tank.fireCooldown = Math.max(0, tank.fireCooldown - dt);
    if (tank.invuln > 0) tank.invuln = Math.max(0, tank.invuln - dt);
  }

  private applyRegen(tank: TankComponent, dt: number): void {
    if (tank.hp < tank.maxHp) {
      tank.hp = Math.min(tank.maxHp, tank.hp + tank.regen * dt);
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

  /** Apply velocity to position with wall bouncing. */
  private applyMovement(
    pos: PositionComponent,
    vel: VelocityComponent,
    tank: TankComponent,
    dt: number,
    _world: ECWorld,
    _botId: EntityId,
  ): void {
    const speed = CONFIG.tank.baseSpeed + tank.stats[7] * CONFIG.tank.statMoveSpeedPerPoint;
    vel.vx = Math.cos(this.currentSteerAngle) * speed;
    vel.vy = Math.sin(this.currentSteerAngle) * speed;

    pos.x += vel.vx * dt;
    pos.y += vel.vy * dt;

    // Bounce off arena walls
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
      const half = CONFIG.worldHalf * 0.75;
      const bases = teamCount === 2
        ? [{ x: -half, y: 0 }, { x: half, y: 0 }]
        : [{ x: -half, y: -half }, { x: half, y: -half }, { x: -half, y: half }, { x: half, y: half }];
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
    createBotEntity(world, bx, by, name, color, botTeam);
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
