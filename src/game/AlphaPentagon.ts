/** Alpha Pentagon + Pentagon Nest module.
 *
 * The alpha pentagon is a big, high-value central boss shape (~3x a regular
 * pentagon) that multiple tanks may fight over. The pentagon nest is a dense
 * spawn zone of regular pentagons clustered near the center of the arena.
 *
 * The regular SpawnSystem handles arena-wide spawns; the nest adds extra
 * pentagons in the center and manages the alpha pentagon lifecycle.
 */

import type { ECWorld, EntityId } from "../ecs/World";
import {
  C,
  createShapeEntity,
  type PositionComponent,
  type ShapeComponent,
  type VelocityComponent,
} from "../ecs/components";

// ---- Alpha marker component ----

/** Marker component name identifying the alpha pentagon entity. */
export const ALPHA = "alpha";

/** Marker component data (no fields — purely a tag). */
export interface AlphaComponent {}

// ---- Alpha pentagon factory ----

/** Tuned alpha pentagon stats. */
const ALPHA_RADIUS = 120;
const ALPHA_HP = 3000;
const ALPHA_XP = 3000;
const ALPHA_BODY_DAMAGE = 40;
const ALPHA_ROT_SPEED_RANGE = 0.05;
const ALPHA_DRIFT_SPEED = 2;

/** Create the alpha pentagon boss entity at the given world position. */
export function createAlphaPentagonEntity(
  world: ECWorld,
  x: number,
  y: number,
): EntityId {
  const id = world.createEntity();
  world.addComponent<PositionComponent>(id, C.Position, {
    x,
    y,
    angle: Math.random() * Math.PI * 2,
  });
  // Near-zero drift — the alpha barely moves.
  world.addComponent<VelocityComponent>(id, C.Velocity, {
    vx: (Math.random() - 0.5) * ALPHA_DRIFT_SPEED,
    vy: (Math.random() - 0.5) * ALPHA_DRIFT_SPEED,
  });
  world.addComponent<ShapeComponent>(id, C.Shape, {
    kind: "pentagon",
    radius: ALPHA_RADIUS,
    hp: ALPHA_HP,
    maxHp: ALPHA_HP,
    xp: ALPHA_XP,
    rotation: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * ALPHA_ROT_SPEED_RANGE,
    bodyDamage: ALPHA_BODY_DAMAGE,
  });
  world.addComponent<AlphaComponent>(id, ALPHA, {});
  return id;
}

// ---- Nest helpers ----

/** Default nest parameters. */
export const NEST_DEFAULT_X = 0;
export const NEST_DEFAULT_Y = 0;
export const NEST_DEFAULT_RADIUS = 500;
export const NEST_DEFAULT_TARGET_COUNT = 12;

/** Alpha pentagon respawn delay in seconds. */
const ALPHA_RESPAWN_DELAY = 60;

/** Max regular pentagons spawned per nest refill tick. */
const NEST_SPAWN_PER_TICK = 2;

/** Throttle interval (seconds) between nest refill ticks. */
const NEST_SPAWN_INTERVAL = 1;

/** Returns true if a position is within the nest radius of (0,0). */
export function isInNest(
  x: number,
  y: number,
  nestRadius: number = NEST_DEFAULT_RADIUS,
): boolean {
  return x * x + y * y <= nestRadius * nestRadius;
}

/** Random point uniformly distributed inside a disc of the given radius. */
function randomInDisc(cx: number, cy: number, radius: number): { x: number; y: number } {
  // sqrt for uniform area distribution.
  const r = radius * Math.sqrt(Math.random());
  const theta = Math.random() * Math.PI * 2;
  return { x: cx + Math.cos(theta) * r, y: cy + Math.sin(theta) * r };
}

// ---- Pentagon Nest system ----

/** Maintains a dense cluster of pentagons around the arena center and
 *  manages the alpha pentagon boss lifecycle (spawn + respawn). */
export class PentagonNest {
  private nestX: number;
  private nestY: number;
  private nestRadius: number;
  private targetCount: number;
  private alphaAlive: boolean;
  private spawnAccum: number;
  /** Respawn countdown for the alpha pentagon (seconds). 0 = no pending respawn. */
  private alphaRespawnTimer: number;

  constructor(
    nestX: number = NEST_DEFAULT_X,
    nestY: number = NEST_DEFAULT_Y,
    nestRadius: number = NEST_DEFAULT_RADIUS,
    targetCount: number = NEST_DEFAULT_TARGET_COUNT,
  ) {
    this.nestX = nestX;
    this.nestY = nestY;
    this.nestRadius = nestRadius;
    this.targetCount = targetCount;
    this.alphaAlive = false;
    this.spawnAccum = 0;
    this.alphaRespawnTimer = 0;
  }

  /** Called once when a game starts. Spawns the alpha + initial nest population. */
  init(world: ECWorld): void {
    // Spawn the alpha pentagon at the exact nest center.
    createAlphaPentagonEntity(world, this.nestX, this.nestY);
    this.alphaAlive = true;
    this.alphaRespawnTimer = 0;

    // Seed the nest with the target number of regular pentagons.
    for (let i = 0; i < this.targetCount; i++) {
      const p = randomInDisc(this.nestX, this.nestY, this.nestRadius);
      createShapeEntity(world, "pentagon", p.x, p.y);
    }
    world.flush();
  }

  /** Called each frame. Maintains nest population and respawns the alpha. */
  update(world: ECWorld, dt: number): void {
    // ---- Alpha pentagon lifecycle ----
    const alphas = world.query(ALPHA);
    if (alphas.length > 0) {
      this.alphaAlive = true;
      this.alphaRespawnTimer = 0;
    } else {
      // Alpha was alive previously (or just killed) — start respawn timer.
      if (this.alphaAlive || this.alphaRespawnTimer === 0) {
        this.alphaAlive = false;
        this.alphaRespawnTimer = ALPHA_RESPAWN_DELAY;
      }
      this.alphaRespawnTimer -= dt;
      if (this.alphaRespawnTimer <= 0) {
        createAlphaPentagonEntity(world, this.nestX, this.nestY);
        this.alphaAlive = true;
        this.alphaRespawnTimer = 0;
      }
    }

    // ---- Regular pentagon population maintenance ----
    this.spawnAccum += dt;
    if (this.spawnAccum < NEST_SPAWN_INTERVAL) {
      world.flush();
      return;
    }
    // Consume one tick interval.
    this.spawnAccum -= NEST_SPAWN_INTERVAL;

    // Count regular (non-alpha) pentagons currently inside the nest radius.
    let nestCount = 0;
    const shapes = world.query(C.Shape);
    for (const id of shapes) {
      // Skip the alpha pentagon.
      if (world.hasComponent(id, ALPHA)) continue;
      const shape = world.getComponent<ShapeComponent>(id, C.Shape);
      if (!shape || shape.kind !== "pentagon") continue;
      const pos = world.getComponent<PositionComponent>(id, C.Position);
      if (!pos) continue;
      const dx = pos.x - this.nestX;
      const dy = pos.y - this.nestY;
      if (dx * dx + dy * dy <= this.nestRadius * this.nestRadius) {
        nestCount++;
      }
    }

    // Spawn up to NEST_SPAWN_PER_TICK to refill toward the target.
    const deficit = this.targetCount - nestCount;
    if (deficit > 0) {
      const toSpawn = Math.min(NEST_SPAWN_PER_TICK, deficit);
      for (let i = 0; i < toSpawn; i++) {
        const p = randomInDisc(this.nestX, this.nestY, this.nestRadius);
        createShapeEntity(world, "pentagon", p.x, p.y);
      }
    }

    world.flush();
  }
}
