/** FX sprite effect system: spawns and updates short-lived sprite particles.
 *
 * Effects are entities with Position + Effect components. Each frame the system
 * decrements life, applies velocity to position, applies rotation, and removes
 * dead effects. Static spawn helpers create effects for combat events
 * (explosions, blood, hits, trails, smoke, shields, water splashes).
 */

import type { ECWorld } from "../ecs/World";
import {
  C,
  createEffectEntity,
  type PositionComponent,
  type TankComponent,
} from "../ecs/components";

const MAX_EFFECTS = 200;

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function effectCount(world: ECWorld): number {
  return world.query(C.Position, C.Effect).length;
}

/** Current smoke frame counter — cycles 1-9 sequentially for animated smoke. */
let smokeFrame = 1;

export class EffectSystem {
  private smokeTimers = new Map<number, number>();

  update(world: ECWorld, dt: number): void {
    this.updateEffects(world, dt);
    this.updateSmoke(world, dt);
  }

  private updateEffects(world: ECWorld, dt: number): void {
    const ids = world.query(C.Position, C.Effect);
    const toDestroy: number[] = [];
    for (const id of ids) {
      const pos = world.getComponent<PositionComponent>(id, C.Position)!;
      const fx = world.getComponent<import("../ecs/components").EffectComponent>(id, C.Effect)!;
      pos.x += fx.vx * dt;
      pos.y += fx.vy * dt;
      fx.rotation += fx.rotSpeed * dt;
      fx.life -= dt;
      if (fx.life <= 0) {
        toDestroy.push(id);
      }
    }
    for (const id of toDestroy) {
      world.destroyEntity(id);
    }
  }

  private updateSmoke(world: ECWorld, dt: number): void {
    const tankIds = world.query(C.Position, C.Tank);
    for (const id of tankIds) {
      const tank = world.getComponent<TankComponent>(id, C.Tank);
      if (!tank) continue;
      if (tank.hp >= tank.maxHp * 0.4) {
        this.smokeTimers.delete(id);
        continue;
      }
      let timer = this.smokeTimers.get(id) ?? 0;
      timer -= dt;
      if (timer <= 0) {
        const pos = world.getComponent<PositionComponent>(id, C.Position);
        if (pos) {
          EffectSystem.spawnSmoke(world, pos.x, pos.y);
        }
        timer = 0.3;
      }
      this.smokeTimers.set(id, timer);
    }
    // Clean up timers for dead tanks
    const alive = new Set(tankIds);
    for (const key of this.smokeTimers.keys()) {
      if (!alive.has(key)) this.smokeTimers.delete(key);
    }
  }

  static spawnExplosion(world: ECWorld, x: number, y: number, scale: number): void {
    if (effectCount(world) >= MAX_EFFECTS) return;
    createEffectEntity(
      world,
      x,
      y,
      Math.random() < 0.5 ? "Explosion" : "Explosion2",
      0,
      0,
      0.6,
      randRange(scale, scale * 1.5),
      0,
      randRange(-2, 2),
      true,
      true,
    );
    const debrisCount = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < debrisCount; i++) {
      if (effectCount(world) >= MAX_EFFECTS) break;
      const a = Math.random() * Math.PI * 2;
      const speed = randRange(80, 200);
      const debrisName = "Debris" + (1 + Math.floor(Math.random() * 3));
      createEffectEntity(
        world,
        x,
        y,
        debrisName,
        Math.cos(a) * speed,
        Math.sin(a) * speed,
        0.6,
        randRange(0.5, 1.0),
        Math.random() * Math.PI * 2,
        randRange(-6, 6),
        true,
        false,
      );
    }
  }

  static spawnShapePop(world: ECWorld, x: number, y: number): void {
    if (effectCount(world) >= MAX_EFFECTS) return;
    createEffectEntity(
      world,
      x,
      y,
      "small",
      0,
      0,
      0.4,
      randRange(0.8, 1.2),
      0,
      randRange(-3, 3),
      true,
      true,
    );
  }

  static spawnBlood(world: ECWorld, x: number, y: number): void {
    const count = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      if (effectCount(world) >= MAX_EFFECTS) break;
      const a = Math.random() * Math.PI * 2;
      const speed = randRange(40, 120);
      const dripName = "blood_drip" + (1 + Math.floor(Math.random() * 4));
      createEffectEntity(
        world,
        x,
        y,
        dripName,
        Math.cos(a) * speed,
        Math.sin(a) * speed,
        0.4,
        0.3,
        Math.random() * Math.PI * 2,
        randRange(-4, 4),
        true,
        false,
      );
    }
  }

  static spawnBulletTrail(world: ECWorld, x: number, y: number, angle: number): void {
    if (effectCount(world) >= MAX_EFFECTS) return;
    const trailName = "bulletTrail" + (1 + Math.floor(Math.random() * 5));
    createEffectEntity(
      world,
      x,
      y,
      trailName,
      0,
      0,
      0.3,
      0.5,
      angle,
      0,
      true,
      false,
    );
  }

  static spawnSmoke(world: ECWorld, x: number, y: number): void {
    if (effectCount(world) >= MAX_EFFECTS) return;
    // Cycle through smoke frames 1-9 sequentially for proper animation order
    const smokeName = "smoke" + smokeFrame;
    smokeFrame++;
    if (smokeFrame > 9) smokeFrame = 1;
    createEffectEntity(
      world,
      x,
      y,
      smokeName,
      randRange(-10, 10),
      randRange(-40, -80),
      1.0,
      randRange(0.5, 1.0),
      0,
      randRange(-1, 1),
      true,
      true,
    );
  }

  static spawnShield(world: ECWorld, x: number, y: number, radius: number): void {
    if (effectCount(world) >= MAX_EFFECTS) return;
    createEffectEntity(
      world,
      x,
      y,
      "ShieldDamageEffect",
      0,
      0,
      3.0,
      radius / 28,
      0,
      0,
      false,
      false,
    );
  }

  static spawnHit(world: ECWorld, x: number, y: number): void {
    if (effectCount(world) >= MAX_EFFECTS) return;
    const hitName = "PhaserHit" + (1 + Math.floor(Math.random() * 5));
    createEffectEntity(
      world,
      x,
      y,
      hitName,
      0,
      0,
      0.2,
      0.5,
      0,
      0,
      true,
      true,
    );
  }

  static spawnEngineTrail(world: ECWorld, x: number, y: number, angle: number): void {
    if (effectCount(world) >= MAX_EFFECTS) return;
    const trailName = "Trail" + (1 + Math.floor(Math.random() * 5));
    createEffectEntity(
      world,
      x,
      y,
      trailName,
      0,
      0,
      0.3,
      0.5,
      angle,
      0,
      true,
      false,
    );
  }

  static spawnWaterSplash(world: ECWorld, x: number, y: number): void {
    if (effectCount(world) >= MAX_EFFECTS) return;
    createEffectEntity(
      world,
      x,
      y,
      "WaterDroplet1",
      randRange(-30, 30),
      randRange(-30, 30),
      0.5,
      0.5,
      0,
      randRange(-2, 2),
      true,
      false,
    );
  }
}
