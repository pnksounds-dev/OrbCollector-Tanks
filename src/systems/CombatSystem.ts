/** Combat system: firing, bullet-vs-shape, bullet-vs-tank, body collisions.
 *
 * Phase 2 additions:
 * - Class multipliers: bullet damage/speed/penetration/fire rate are modified
 *   by the tank's current class (from TankClasses).
 * - Multi-barrel firing: tanks with multiple barrels fire from each barrel
 *   at its respective angle.
 * - Bullet-vs-tank: bullets damage any tank that isn't the owner. When a tank
 *   dies, the shooter is awarded XP.
 * - Body-vs-body: overlapping tanks deal body damage to each other.
 */

import { CONFIG } from "../config";
import type { ECWorld, EntityId } from "../ecs/World";
import {
  C,
  createBulletEntity,
  createParticleEntity,
  type PositionComponent,
  type TankComponent,
  type ShapeComponent,
  type BulletComponent,
  type TeamComponent,
} from "../ecs/components";
import { BOT } from "./BotAISystem";
import { getBarrels, getClass } from "../game/TankClasses";
import type { AudioManager } from "../audio/AudioManager";
import type { Storage } from "../game/Storage";
import { Input } from "../game/Input";
import { circlesOverlap } from "../lib/math";
import { EffectSystem } from "./EffectSystem";

export class CombatSystem {
  private audio: AudioManager;
  private storage: Storage;

  constructor(audio: AudioManager, storage: Storage) {
    this.audio = audio;
    this.storage = storage;
  }

  update(world: ECWorld, dt: number, playerId: EntityId): void {
    this.handleFiring(world, playerId);
    this.bulletVsShape(world);
    this.bulletVsTank(world);
    this.bodyVsShape(world, dt, playerId);
    this.bodyVsBody(world, dt);
  }

  private handleFiring(world: ECWorld, playerId: EntityId): void {
    const pos = world.getComponent<PositionComponent>(playerId, C.Position);
    const tank = world.getComponent<TankComponent>(playerId, C.Tank);
    if (!pos || !tank) return;

    if ((Input.fire || Input.autoFire) && tank.fireCooldown <= 0) {
      this.fireTank(world, playerId, pos, tank);
    }
  }

  /** Fire a tank's barrels (supports multi-barrel classes). */
  private fireTank(
    world: ECWorld,
    ownerId: EntityId,
    pos: PositionComponent,
    tank: TankComponent,
  ): void {
    const cls = getClass(tank.classId);
    const classMult = cls
      ? {
          damage: cls.damageMult,
          speed: cls.bulletSpeedMult,
          penetration: cls.penetrationMult,
          fireRate: cls.fireRateMult,
        }
      : { damage: 1, speed: 1, penetration: 1, fireRate: 1 };

    // Fire rate from Reload stat × class multiplier
    const fireRate =
      CONFIG.tank.baseFireRate *
      (1 + tank.stats[6] * CONFIG.tank.statReloadPerPoint) *
      classMult.fireRate;
    tank.fireCooldown = 1 / fireRate;

    // Bullet stats from tank stats × class multipliers
    const bulletSpeed =
      (CONFIG.bullet.baseSpeed + tank.stats[3] * CONFIG.tank.statBulletSpeedPerPoint) *
      classMult.speed;
    const bulletDamage =
      (CONFIG.bullet.baseDamage + tank.stats[5] * CONFIG.tank.statBulletDamagePerPoint) *
      classMult.damage;
    const bulletPenetration =
      (CONFIG.bullet.basePenetration +
        tank.stats[4] * CONFIG.tank.statBulletPenetrationPerPoint) *
      classMult.penetration;

    // Get barrel configs for this class
    const barrels = getBarrels(tank.classId, tank.barrelLength, tank.barrelWidth);

    for (const barrel of barrels) {
      const barrelAngle = pos.angle + barrel.angle;
      // Spawn at barrel tip
      const tipDist = tank.bodyRadius + barrel.length;
      const tipX = pos.x + Math.cos(barrelAngle) * tipDist;
      const tipY = pos.y + Math.sin(barrelAngle) * tipDist;
      createBulletEntity(
        world,
        tipX,
        tipY,
        barrelAngle,
        bulletSpeed,
        bulletDamage,
        bulletPenetration,
        ownerId,
      );
    }

    this.audio.play("shoot");
  }

  private bulletVsShape(world: ECWorld): void {
    const bullets = world.query(C.Position, C.Bullet);
    const shapes = world.query(C.Position, C.Shape);
    const bulletsToDestroy: EntityId[] = [];
    const shapesToDestroy: EntityId[] = [];

    for (const bid of bullets) {
      if (bulletsToDestroy.includes(bid)) continue;
      const bpos = world.getComponent<PositionComponent>(bid, C.Position)!;
      const bullet = world.getComponent<BulletComponent>(bid, C.Bullet)!;

      for (const sid of shapes) {
        if (shapesToDestroy.includes(sid)) continue;
        const spos = world.getComponent<PositionComponent>(sid, C.Position)!;
        const shape = world.getComponent<ShapeComponent>(sid, C.Shape)!;

        if (circlesOverlap(bpos.x, bpos.y, bullet.radius, spos.x, spos.y, shape.radius)) {
          shape.hp -= bullet.damage;
          bullet.penetration -= 1;
          this.audio.play("hit");
          EffectSystem.spawnHit(world, bpos.x, bpos.y);

          if (bullet.penetration < 0) {
            bulletsToDestroy.push(bid);
            break;
          }

          if (shape.hp <= 0) {
            shapesToDestroy.push(sid);
            this.onShapeDeath(world, sid, bullet.ownerId, shape);
          }
        }
      }
    }

    for (const id of bulletsToDestroy) world.destroyEntity(id);
    for (const id of shapesToDestroy) world.destroyEntity(id);
  }

  /** Bullets damage any enemy tank that isn't the owner. Same-team = no friendly fire. */
  private bulletVsTank(world: ECWorld): void {
    const bullets = world.query(C.Position, C.Bullet);
    const tanks = world.query(C.Position, C.Tank);
    const bulletsToDestroy: EntityId[] = [];
    const tanksToDestroy: EntityId[] = [];

    for (const bid of bullets) {
      if (bulletsToDestroy.includes(bid)) continue;
      const bpos = world.getComponent<PositionComponent>(bid, C.Position)!;
      const bullet = world.getComponent<BulletComponent>(bid, C.Bullet)!;

      // Get the owner's team
      const ownerTeam = world.getComponent<TeamComponent>(bullet.ownerId, C.Team);
      const ownerTeamId = ownerTeam ? ownerTeam.id : -1;

      for (const tid of tanks) {
        if (tid === bullet.ownerId) continue; // don't hit self
        if (tanksToDestroy.includes(tid)) continue;
        const tpos = world.getComponent<PositionComponent>(tid, C.Position)!;
        const tank = world.getComponent<TankComponent>(tid, C.Tank)!;

        // Skip invulnerable tanks
        if (tank.invuln > 0) continue;

        // Friendly fire prevention: skip same-team tanks (only if both have valid teams)
        const theirTeam = world.getComponent<TeamComponent>(tid, C.Team);
        const theirTeamId = theirTeam ? theirTeam.id : -1;
        if (ownerTeamId >= 0 && theirTeamId >= 0 && ownerTeamId === theirTeamId) continue;

        if (circlesOverlap(bpos.x, bpos.y, bullet.radius, tpos.x, tpos.y, tank.bodyRadius)) {
          tank.hp -= bullet.damage;
          bullet.penetration -= 1;
          this.audio.play("hit");
          EffectSystem.spawnHit(world, bpos.x, bpos.y);
          EffectSystem.spawnBlood(world, tpos.x, tpos.y);

          if (bullet.penetration < 0) {
            bulletsToDestroy.push(bid);
            break;
          }

          if (tank.hp <= 0) {
            tanksToDestroy.push(tid);
            // Award XP to the killer
            const killer = world.getComponent<TankComponent>(bullet.ownerId, C.Tank);
            if (killer) {
              killer.xp += Math.floor(tank.xp * 0.5) + 50;
            }
            this.onTankDeath(world, tid, tpos, tank);
          }
        }
      }
    }

    for (const id of bulletsToDestroy) world.destroyEntity(id);
    for (const id of tanksToDestroy) {
      // Don't destroy the player here — Game.update checks hp and calls onDeath.
      // Only destroy bot tanks; the player's death is handled by Game.onDeath.
      if (world.hasComponent(id, BOT)) {
        world.destroyEntity(id);
      }
    }
  }

  private bodyVsShape(world: ECWorld, dt: number, playerId: EntityId): void {
    const pos = world.getComponent<PositionComponent>(playerId, C.Position);
    const tank = world.getComponent<TankComponent>(playerId, C.Tank);
    if (!pos || !tank) return;

    const bodyDamage =
      CONFIG.tank.baseBodyDamage + tank.stats[2] * CONFIG.tank.statBodyDamagePerPoint;
    const shapes = world.query(C.Position, C.Shape);
    const shapesToDestroy: EntityId[] = [];

    for (const sid of shapes) {
      const spos = world.getComponent<PositionComponent>(sid, C.Position)!;
      const shape = world.getComponent<ShapeComponent>(sid, C.Shape)!;

      if (circlesOverlap(pos.x, pos.y, tank.bodyRadius, spos.x, spos.y, shape.radius)) {
        shape.hp -= bodyDamage * dt;
        if (tank.invuln <= 0) {
          tank.hp -= shape.bodyDamage * dt;
        }

        if (shape.hp <= 0) {
          shapesToDestroy.push(sid);
          this.onShapeDeath(world, sid, playerId, shape);
        }
      }
    }

    for (const id of shapesToDestroy) world.destroyEntity(id);
  }

  /** Tank-vs-tank body ramming: enemy overlapping tanks damage each other. Same-team = no damage. */
  private bodyVsBody(world: ECWorld, dt: number): void {
    const tanks = world.query(C.Position, C.Tank);
    const tanksToDestroy: EntityId[] = [];

    for (let i = 0; i < tanks.length; i++) {
      const a = tanks[i];
      const apos = world.getComponent<PositionComponent>(a, C.Position)!;
      const atank = world.getComponent<TankComponent>(a, C.Tank)!;
      if (atank.invuln > 0) continue;
      const teamA = world.getComponent<TeamComponent>(a, C.Team);
      const teamIdA = teamA ? teamA.id : -1;

      for (let j = i + 1; j < tanks.length; j++) {
        const b = tanks[j];
        const bpos = world.getComponent<PositionComponent>(b, C.Position)!;
        const btank = world.getComponent<TankComponent>(b, C.Tank)!;
        if (btank.invuln > 0) continue;

        // Friendly fire prevention: skip same-team body damage
        const teamB = world.getComponent<TeamComponent>(b, C.Team);
        const teamIdB = teamB ? teamB.id : -1;
        if (teamIdA >= 0 && teamIdB >= 0 && teamIdA === teamIdB) continue;

        if (circlesOverlap(apos.x, apos.y, atank.bodyRadius, bpos.x, bpos.y, btank.bodyRadius)) {
          // Both deal body damage to each other
          const aDmg =
            (CONFIG.tank.baseBodyDamage + atank.stats[2] * CONFIG.tank.statBodyDamagePerPoint) * dt;
          const bDmg =
            (CONFIG.tank.baseBodyDamage + btank.stats[2] * CONFIG.tank.statBodyDamagePerPoint) * dt;
          atank.hp -= bDmg;
          btank.hp -= aDmg;

          if (atank.hp <= 0 && !tanksToDestroy.includes(a)) {
            tanksToDestroy.push(a);
            btank.xp += Math.floor(atank.xp * 0.5) + 50;
            this.onTankDeath(world, a, apos, atank);
          }
          if (btank.hp <= 0 && !tanksToDestroy.includes(b)) {
            tanksToDestroy.push(b);
            atank.xp += Math.floor(btank.xp * 0.5) + 50;
            this.onTankDeath(world, b, bpos, btank);
          }
        }
      }
    }

    // Only destroy bot tanks; player death is handled by Game.onDeath
    for (const id of tanksToDestroy) {
      if (world.hasComponent(id, BOT)) {
        world.destroyEntity(id);
      }
    }
  }

  private onShapeDeath(
    world: ECWorld,
    shapeId: EntityId,
    ownerId: EntityId,
    shape: ShapeComponent,
  ): void {
    const ownerTank = world.getComponent<TankComponent>(ownerId, C.Tank);
    if (ownerTank) {
      ownerTank.xp += shape.xp;
      // Only count kills for the player
      if (world.hasComponent(ownerId, C.Player)) {
        this.storage.addKill();
      }
    }

    const pos = world.getComponent<PositionComponent>(shapeId, C.Position);
    if (pos) {
      EffectSystem.spawnShapePop(world, pos.x, pos.y);
      const count = CONFIG.particleCount;
      const cfg = CONFIG.shapes[shape.kind];
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
        const speed = CONFIG.particleSpeed * (0.5 + Math.random() * 0.5);
        const size =
          shape.kind === "pentagon" ? "medium" : shape.kind === "triangle" ? "small" : "tiny";
        createParticleEntity(
          world,
          pos.x,
          pos.y,
          Math.cos(a) * speed,
          Math.sin(a) * speed,
          size,
          cfg.color,
          CONFIG.particleLife,
          CONFIG.particleRadius,
        );
      }
    }

    this.audio.play("pickup");
  }

  /** Spawn a death particle burst when a tank dies. */
  private onTankDeath(
    world: ECWorld,
    tankId: EntityId,
    pos: PositionComponent,
    _tank: TankComponent,
  ): void {
    // Determine color: player is blue, bots have their own color
    let color = "#00b2e1";
    const botAi = world.getComponent<{ color: string }>(tankId, "bot_ai");
    if (botAi) color = botAi.color;

    EffectSystem.spawnExplosion(world, pos.x, pos.y, 1.0);

    // Bigger particle burst for tank deaths
    const count = CONFIG.particleCount * 3;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const speed = CONFIG.particleSpeed * (0.8 + Math.random() * 0.8);
      createParticleEntity(
        world,
        pos.x,
        pos.y,
        Math.cos(a) * speed,
        Math.sin(a) * speed,
        "medium",
        color,
        CONFIG.particleLife * 1.5,
        CONFIG.particleRadius * 1.5,
      );
    }

    this.audio.play("death");
  }
}
