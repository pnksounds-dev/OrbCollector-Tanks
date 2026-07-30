/** Movement system: tank movement, shape drift, bullet travel, boundary clamp.
 *
 * - Player tank: WASD sets velocity, normalized × speed. Barrel aims at mouse.
 * - Shapes: drift with their velocity, bounce off arena walls, rotate slowly.
 * - Bullets: travel straight with their velocity, die at arena edge or life end.
 * - Particles: travel with velocity, decelerate, life counts down.
 * - Tank regen: hp regenerates over time up to maxHp.
 */

import { CONFIG } from "../config";
import type { ECWorld, EntityId } from "../ecs/World";
import {
  C,
  type PositionComponent,
  type VelocityComponent,
  type TankComponent,
  type ShapeComponent,
  type BulletComponent,
  type ParticleComponent,
} from "../ecs/components";
import { getClass } from "../game/TankClasses";
import type { Input } from "../game/Input";
import { angleTo, clamp } from "../lib/math";

export class MovementSystem {
  update(world: ECWorld, dt: number, input: typeof Input, playerId: EntityId): void {
    this.updateTank(world, dt, input, playerId);
    this.updateShapes(world, dt);
    this.updateBullets(world, dt);
    this.updateParticles(world, dt);
  }

  private updateTank(
    world: ECWorld,
    dt: number,
    input: typeof Input,
    playerId: EntityId,
  ): void {
    const pos = world.getComponent<PositionComponent>(playerId, C.Position);
    const vel = world.getComponent<VelocityComponent>(playerId, C.Velocity);
    const tank = world.getComponent<TankComponent>(playerId, C.Tank);
    if (!pos || !vel || !tank) return;

    // Aim barrel at mouse (world coords)
    pos.angle = angleTo(pos.x, pos.y, input.world.x, input.world.y);

    // Movement: WASD normalized × speed (modified by Movement Speed stat + class mult)
    const [dx, dy] = input.moveVector();
    const cls = getClass(tank.classId);
    const moveMult = cls ? cls.moveSpeedMult : 1;
    const speed =
      (CONFIG.tank.baseSpeed + tank.stats[7] * CONFIG.tank.statMoveSpeedPerPoint) * moveMult;
    vel.vx = dx * speed;
    vel.vy = dy * speed;

    pos.x += vel.vx * dt;
    pos.y += vel.vy * dt;

    // Boundary clamp (square arena)
    const half = CONFIG.worldHalf - tank.bodyRadius;
    pos.x = clamp(pos.x, -half, half);
    pos.y = clamp(pos.y, -half, half);

    // Regen
    if (tank.hp < tank.maxHp) {
      const regen = tank.regen * dt;
      tank.hp = Math.min(tank.maxHp, tank.hp + regen);
    }

    // Invuln countdown
    if (tank.invuln > 0) {
      tank.invuln = Math.max(0, tank.invuln - dt);
    }

    // Fire cooldown countdown
    if (tank.fireCooldown > 0) {
      tank.fireCooldown = Math.max(0, tank.fireCooldown - dt);
    }
  }

  private updateShapes(world: ECWorld, dt: number): void {
    const half = CONFIG.worldHalf;
    const ids = world.query(C.Position, C.Velocity, C.Shape);
    for (const id of ids) {
      const pos = world.getComponent<PositionComponent>(id, C.Position)!;
      const vel = world.getComponent<VelocityComponent>(id, C.Velocity)!;
      const shape = world.getComponent<ShapeComponent>(id, C.Shape)!;

      pos.x += vel.vx * dt;
      pos.y += vel.vy * dt;
      shape.rotation += shape.rotSpeed * dt;

      // Bounce off arena walls
      const r = shape.radius;
      if (pos.x < -half + r) {
        pos.x = -half + r;
        vel.vx = Math.abs(vel.vx);
      } else if (pos.x > half - r) {
        pos.x = half - r;
        vel.vx = -Math.abs(vel.vx);
      }
      if (pos.y < -half + r) {
        pos.y = -half + r;
        vel.vy = Math.abs(vel.vy);
      } else if (pos.y > half - r) {
        pos.y = half - r;
        vel.vy = -Math.abs(vel.vy);
      }
    }
  }

  private updateBullets(world: ECWorld, dt: number): void {
    const half = CONFIG.worldHalf;
    const toDestroy: EntityId[] = [];
    const ids = world.query(C.Position, C.Velocity, C.Bullet);
    for (const id of ids) {
      const pos = world.getComponent<PositionComponent>(id, C.Position)!;
      const vel = world.getComponent<VelocityComponent>(id, C.Velocity)!;
      const bullet = world.getComponent<BulletComponent>(id, C.Bullet)!;

      pos.x += vel.vx * dt;
      pos.y += vel.vy * dt;
      bullet.life -= dt;

      // Die at arena edge or life end
      if (
        bullet.life <= 0 ||
        pos.x < -half ||
        pos.x > half ||
        pos.y < -half ||
        pos.y > half
      ) {
        toDestroy.push(id);
      }
    }
    for (const id of toDestroy) {
      world.destroyEntity(id);
    }
  }

  private updateParticles(world: ECWorld, dt: number): void {
    const toDestroy: EntityId[] = [];
    const ids = world.query(C.Position, C.Velocity, C.Particle);
    for (const id of ids) {
      const pos = world.getComponent<PositionComponent>(id, C.Position)!;
      const vel = world.getComponent<VelocityComponent>(id, C.Velocity)!;
      const p = world.getComponent<ParticleComponent>(id, C.Particle)!;

      pos.x += vel.vx * dt;
      pos.y += vel.vy * dt;
      // Decelerate
      const drag = 0.92;
      vel.vx *= drag;
      vel.vy *= drag;
      p.life -= dt;
      if (p.life <= 0) {
        toDestroy.push(id);
      }
    }
    for (const id of toDestroy) {
      world.destroyEntity(id);
    }
  }
}
