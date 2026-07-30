/** Component name constants, interfaces, and entity factory helpers.
 *
 * Components are plain data objects stored per-entity in the ECWorld. Systems
 * query the world and mutate these. Factories create a fully-wired entity in
 * one call.
 */

import type { ECWorld, EntityId } from "./World";
import type { ShapeKind, StatIndex, BuffAbility, Buff } from "../types";
import { STAT_COUNT } from "../types";
import { CONFIG } from "../config";

// Component name constants
export const EFFECT = "effect";

export const C = {
  Position: "position",
  Velocity: "velocity",
  Tank: "tank",
  Shape: "shape",
  Bullet: "bullet",
  Player: "player",
  Particle: "particle",
  Team: "team",
  Effect: EFFECT,
} as const;

// ---- Component interfaces ----

export interface PositionComponent {
  x: number;
  y: number;
  /** Facing angle in radians (barrel aim for tanks, travel dir for bullets). */
  angle: number;
}

export interface VelocityComponent {
  vx: number;
  vy: number;
}

export interface TankComponent {
  bodyRadius: number;
  barrelLength: number;
  barrelWidth: number;
  hp: number;
  maxHp: number;
  regen: number; // hp per second
  /** Shield HP — absorbs damage before hp. */
  shield: number;
  /** Maximum shield HP. */
  maxShield: number;
  /** Shield regeneration rate (shield per second). */
  shieldRegen: number;
  /** Shield damage flash timer — > 0 means shield was recently hit (shows shield sprite). */
  shieldFlash: number;
  /** Last entity that damaged this tank (for spectating on death). */
  lastDamagerId: EntityId | null;
  /** Active buffs: Map<ability, Buff>. Expired entries are pruned each frame. */
  buffs: Map<string, Buff>;
  /** Contact damage dealt when ramming. */
  bodyDamage: number;
  /** Total XP earned (also the score). */
  xp: number;
  level: number;
  /** Unspent stat points. */
  statPoints: number;
  /** Points spent per stat, indexed 0–7. */
  stats: number[];
  /** Fire cooldown timer in seconds (counts down; fires at 0 if trigger held). */
  fireCooldown: number;
  /** Invulnerability timer after spawn (seconds). */
  invuln: number;
  /** Current tank class id (from TankClasses). Defaults to "basic". */
  classId: string;
}

export interface ShapeComponent {
  kind: ShapeKind;
  radius: number;
  hp: number;
  maxHp: number;
  xp: number;
  /** Current rotation in radians. */
  rotation: number;
  /** Rotation speed in rad/s. */
  rotSpeed: number;
  /** Contact damage dealt to a tank that rams it. */
  bodyDamage: number;
  /** Buff type key this shape carries (null = no buff). Set on pentagons. */
  buffType: BuffAbility | null;
}

export interface BulletComponent {
  radius: number;
  damage: number;
  /** Remaining pierce targets the bullet can hit before dying. */
  penetration: number;
  /** Remaining lifetime in seconds. */
  life: number;
  /** Entity ID of the tank that fired (for XP attribution). */
  ownerId: EntityId;
  /** Team ID of the firing tank (-1 = FFA). Used for base safe-zone checks. */
  ownerTeamId: number;
}

export interface ParticleComponent {
  /** Orb sprite size key: 'tiny' | 'small' | 'medium' | 'large' | 'extraLarge'. */
  size: string;
  /** Remaining lifetime in seconds. */
  life: number;
  maxLife: number;
  /** Visual radius in world units. */
  radius: number;
  /** Tint color (hex). */
  color: string;
}

export interface PlayerComponent {
  /** Marker component — the player-controlled tank. */
}

export interface TeamComponent {
  /** Team index: 0 = blue, 1 = red, 2 = green, 3 = purple. -1 = no team (FFA). */
  id: number;
}

export interface EffectComponent {
  /** Sprite image key (loaded by renderer). */
  sprite: string;
  /** Current life in seconds. */
  life: number;
  /** Maximum life in seconds (for alpha/scale interpolation). */
  maxLife: number;
  /** Velocity X (world units/sec). */
  vx: number;
  /** Velocity Y (world units/sec). */
  vy: number;
  /** Base scale (sprite draw size relative to natural size). */
  scale: number;
  /** Rotation in radians. */
  rotation: number;
  /** Rotation speed (rad/sec). */
  rotSpeed: number;
  /** Whether the effect fades out as life decreases. */
  fadeOut: boolean;
  /** Whether the effect grows as life decreases. */
  growOut: boolean;
}

// ---- Factory helpers ----

/** Create a player tank at the given world position.
 *  teamId: -1 = no team (FFA), 0+ = team index. */
export function createTankEntity(
  world: ECWorld,
  x: number,
  y: number,
  teamId: number = -1,
): EntityId {
  const id = world.createEntity();
  const t = CONFIG.tank;
  const stats = new Array<number>(STAT_COUNT).fill(0);
  world.addComponent<PositionComponent>(id, C.Position, { x, y, angle: 0 });
  world.addComponent<VelocityComponent>(id, C.Velocity, { vx: 0, vy: 0 });
  world.addComponent<TankComponent>(id, C.Tank, {
    bodyRadius: t.baseBodyRadius,
    barrelLength: t.baseBarrelLength,
    barrelWidth: t.baseBarrelWidth,
    hp: t.baseMaxHp,
    maxHp: t.baseMaxHp,
    regen: t.baseRegen,
    shield: t.baseMaxShield,
    maxShield: t.baseMaxShield,
    shieldRegen: t.baseShieldRegen,
    shieldFlash: 0,
    lastDamagerId: null,
    buffs: new Map(),
    bodyDamage: t.baseBodyDamage,
    xp: 0,
    level: 1,
    statPoints: 0,
    stats,
    fireCooldown: 0,
    invuln: t.spawnInvuln,
    classId: "basic",
  });
  world.addComponent<PlayerComponent>(id, C.Player, {});
  world.addComponent<TeamComponent>(id, C.Team, { id: teamId });
  return id;
}

/** Create a shape of the given kind at a world position. */
export function createShapeEntity(
  world: ECWorld,
  kind: ShapeKind,
  x: number,
  y: number,
): EntityId {
  const id = world.createEntity();
  const s = CONFIG.shapes[kind];
  world.addComponent<PositionComponent>(id, C.Position, {
    x,
    y,
    angle: Math.random() * Math.PI * 2,
  });
  world.addComponent<VelocityComponent>(id, C.Velocity, {
    vx: (Math.random() - 0.5) * s.driftSpeed,
    vy: (Math.random() - 0.5) * s.driftSpeed,
  });
  world.addComponent<ShapeComponent>(id, C.Shape, {
    kind,
    radius: s.radius,
    hp: s.hp,
    maxHp: s.hp,
    xp: s.xp,
    rotation: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * s.rotSpeedRange,
    bodyDamage: s.bodyDamage,
    buffType: null,
  });
  return id;
}

/** Create a bullet fired from a tank. */
export function createBulletEntity(
  world: ECWorld,
  x: number,
  y: number,
  angle: number,
  speed: number,
  damage: number,
  penetration: number,
  ownerId: EntityId,
  ownerTeamId: number = -1,
): EntityId {
  const id = world.createEntity();
  world.addComponent<PositionComponent>(id, C.Position, { x, y, angle });
  world.addComponent<VelocityComponent>(id, C.Velocity, {
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
  });
  world.addComponent<BulletComponent>(id, C.Bullet, {
    radius: CONFIG.bullet.radius,
    damage,
    penetration,
    life: CONFIG.bullet.life,
    ownerId,
    ownerTeamId,
  });
  return id;
}

/** Create a particle (XP orb burst) at a position. */
export function createParticleEntity(
  world: ECWorld,
  x: number,
  y: number,
  vx: number,
  vy: number,
  size: string,
  color: string,
  life: number,
  radius: number,
): EntityId {
  const id = world.createEntity();
  world.addComponent<PositionComponent>(id, C.Position, { x, y, angle: 0 });
  world.addComponent<VelocityComponent>(id, C.Velocity, { vx, vy });
  world.addComponent<ParticleComponent>(id, C.Particle, {
    size,
    life,
    maxLife: life,
    radius,
    color,
  });
  return id;
}

/** Create an FX sprite effect at a position. */
export function createEffectEntity(
  world: ECWorld,
  x: number,
  y: number,
  sprite: string,
  vx: number,
  vy: number,
  life: number,
  scale: number,
  rotation: number,
  rotSpeed: number,
  fadeOut: boolean,
  growOut: boolean,
): EntityId {
  const id = world.createEntity();
  world.addComponent<PositionComponent>(id, C.Position, { x, y, angle: rotation });
  world.addComponent<EffectComponent>(id, C.Effect, {
    sprite,
    life,
    maxLife: life,
    vx,
    vy,
    scale,
    rotation,
    rotSpeed,
    fadeOut,
    growOut,
  });
  return id;
}

/** Spend a stat point on the given stat index for a tank entity. */
export function spendStatPoint(
  world: ECWorld,
  tankId: EntityId,
  stat: StatIndex,
): boolean {
  const tank = world.getComponent<TankComponent>(tankId, C.Tank);
  if (!tank) return false;
  if (tank.statPoints <= 0) return false;
  if (tank.stats[stat] >= CONFIG.tank.statMax) return false;
  tank.statPoints--;
  tank.stats[stat]++;
  return true;
}
