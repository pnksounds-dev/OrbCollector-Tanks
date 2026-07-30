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
import { getBaseTeamAt } from "./BotAISystem";
import { getClass } from "../game/TankClasses";
import type { Input } from "../game/Input";
import { angleTo, clamp } from "../lib/math";
import { EffectSystem } from "./EffectSystem";
import { hasBuff, updateBuffs } from "../game/BuffHelpers";

const AUTO_SPIN_RATE = Math.PI * 2 / 6;

export class MovementSystem {
  private splashTimer = 0;

  update(world: ECWorld, dt: number, input: typeof Input, playerId: EntityId): void {
    this.updateTank(world, dt, input, playerId);
    this.updateShapes(world, dt);
    this.updateBullets(world, dt);
    this.updateParticles(world, dt);
    if (this.splashTimer > 0) this.splashTimer -= dt;
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

    // Aim barrel at mouse (world coords) or auto-spin
    if (input.autoSpin) {
      pos.angle += AUTO_SPIN_RATE * dt;
    } else {
      pos.angle = angleTo(pos.x, pos.y, input.world.x, input.world.y);
    }

    // Movement: WASD normalized × speed (modified by Movement Speed stat + class mult + Speed buff)
    const [dx, dy] = input.moveVector();
    const cls = getClass(tank.classId);
    const moveMult = cls ? cls.moveSpeedMult : 1;
    const speedBuffMult = hasBuff(tank, "speed") ? 1.6 : 1.0;
    const speed =
      (CONFIG.tank.baseSpeed + tank.stats[7] * CONFIG.tank.statMoveSpeedPerPoint) * moveMult * speedBuffMult;
    vel.vx = dx * speed;
    vel.vy = dy * speed;

    pos.x += vel.vx * dt;
    pos.y += vel.vy * dt;

    // Boundary clamp (square arena)
    const half = CONFIG.worldHalf - tank.bodyRadius;
    const prevX = pos.x;
    const prevY = pos.y;
    pos.x = clamp(pos.x, -half, half);
    pos.y = clamp(pos.y, -half, half);
    if ((pos.x !== prevX || pos.y !== prevY) && this.splashTimer <= 0) {
      EffectSystem.spawnWaterSplash(world, pos.x, pos.y);
      this.splashTimer = 0.2;
    }

    // Regen
    if (tank.hp < tank.maxHp) {
      const regen = tank.regen * dt;
      tank.hp = Math.min(tank.maxHp, tank.hp + regen);
    }

    // Shield regen (only when not recently hit; Shield Charge buff doubles regen)
    if (tank.shieldFlash > 0) {
      tank.shieldFlash = Math.max(0, tank.shieldFlash - dt);
    } else if (tank.shield < tank.maxShield) {
      const regenMult = hasBuff(tank, "shieldCharge") ? 2.0 : 1.0;
      tank.shield = Math.min(tank.maxShield, tank.shield + tank.shieldRegen * regenMult * dt);
    }

    // Prune expired buffs
    updateBuffs(tank, performance.now());

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

      // Die at arena edge, life end, or entering an enemy team's base safe zone
      const baseTeam = getBaseTeamAt(pos.x, pos.y);
      const inEnemyBase = baseTeam >= 0 && baseTeam !== bullet.ownerTeamId;
      if (
        bullet.life <= 0 ||
        pos.x < -half ||
        pos.x > half ||
        pos.y < -half ||
        pos.y > half ||
        inEnemyBase
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
