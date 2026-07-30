/** Level system: XP accrual, level-up, stat point spend, stat recalculation.
 *
 * - XP threshold to reach the next level: currentLevel² × xpFactor.
 * - On level-up: increment level, grant 1 stat point, grow body radius,
 *   recompute maxHp and regen from stats.
 * - spendStat: spends a point on a stat (if available and not maxed), then
 *   recalculates derived tank stats.
 */

import { CONFIG } from "../config";
import type { ECWorld, EntityId } from "../ecs/World";
import { C, spendStatPoint, type TankComponent } from "../ecs/components";
import type { StatIndex } from "../types";
import { STAT_MAX } from "../types";
import type { AudioManager } from "../audio/AudioManager";

export class LevelSystem {
  private audio: AudioManager;

  constructor(audio: AudioManager) {
    this.audio = audio;
  }

  update(world: ECWorld, _dt: number, playerId: EntityId): void {
    const tank = world.getComponent<TankComponent>(playerId, C.Tank);
    if (!tank) return;

    // Check for level-up
    while (tank.xp >= this.xpForNextLevel(tank.level) && tank.level < CONFIG.levelCap) {
      tank.xp -= this.xpForNextLevel(tank.level);
      tank.level++;
      tank.statPoints++;
      // Grow body radius
      tank.bodyRadius =
        CONFIG.tank.baseBodyRadius +
        (tank.level - 1) * CONFIG.tank.radiusGrowthPerLevel;
      this.recalcStats(tank);
      // Heal to full on level up
      tank.hp = tank.maxHp;
      tank.shield = tank.maxShield;
      this.audio.play("levelup");
    }
  }

  /** XP required to advance from the given level to the next. */
  xpForNextLevel(level: number): number {
    return Math.floor(level * level * CONFIG.xpFactor);
  }

  /** Spend a stat point on the given stat. */
  spendStat(world: ECWorld, playerId: EntityId, stat: StatIndex): boolean {
    const tank = world.getComponent<TankComponent>(playerId, C.Tank);
    if (!tank) return false;
    if (tank.statPoints <= 0) return false;
    if (tank.stats[stat] >= STAT_MAX) return false;
    const ok = spendStatPoint(world, playerId, stat);
    if (ok) {
      this.recalcStats(tank);
    }
    return ok;
  }

  /** Recalculate derived tank stats from the spent stat points. */
  recalcStats(tank: TankComponent): void {
    const t = CONFIG.tank;
    tank.maxHp = t.baseMaxHp + tank.stats[1] * t.statMaxHpPerPoint;
    tank.maxShield = t.baseMaxShield + tank.stats[1] * t.statMaxHpPerPoint * 0.5;
    tank.shieldRegen = t.baseShieldRegen + tank.stats[0] * t.statRegenPerPoint * 2;
    tank.regen = t.baseRegen + tank.stats[0] * t.statRegenPerPoint;
    tank.bodyDamage = t.baseBodyDamage + tank.stats[2] * t.statBodyDamagePerPoint;
    // Bullet stats are read live in CombatSystem from tank.stats, so no
    // precomputation needed here. Movement speed is read live in MovementSystem.
  }
}
