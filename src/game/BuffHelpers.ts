/** Buff helper functions: apply, expire, and query active buffs.
 *
 * Adapted from Undergrowth's SnakeHelpers buff pattern. Buffs are stored
 * in TankComponent.buffs as a Map<ability, Buff> with expiry timestamps.
 */

import { CONFIG } from "../config";
import type { TankComponent } from "../ecs/components";
import type { BuffAbility, BuffType } from "../types";

/** Get the BuffType definition for a given ability key. */
export function getBuffType(ability: BuffAbility): BuffType | undefined {
  return CONFIG.buffs.types.find((t) => t.key === ability);
}

/** Apply a buff to a tank. Instant buffs (duration 0) take effect immediately.
 *  Timed buffs are stored in the buffs Map with an expiry timestamp. */
export function applyBuff(tank: TankComponent, ability: BuffAbility, now: number): void {
  const def = getBuffType(ability);
  if (!def) return;

  // Instant effects
  if (def.duration <= 0) {
    applyInstantEffect(tank, ability);
    return;
  }

  // Timed buff — store in Map (overwrites if already active, refreshing duration)
  tank.buffs.set(ability, {
    ability,
    label: def.label,
    color: def.color,
    icon: def.icon,
    until: now + def.duration * 1000,
  });

  // Some buffs also have an instant component
  if (ability === "shieldCharge") {
    tank.shield = tank.maxShield; // instant refill
  }
}

/** Apply an instant buff effect (no duration, no HUD entry). */
function applyInstantEffect(tank: TankComponent, ability: BuffAbility): void {
  if (ability === "heal") {
    tank.hp = tank.maxHp;
  }
}

/** Prune expired buffs from a tank. Called each frame. */
export function updateBuffs(tank: TankComponent, now: number): void {
  for (const [key, buff] of tank.buffs) {
    if (buff.until <= now) {
      tank.buffs.delete(key);
    }
  }
}

/** Check if a tank has an active buff. */
export function hasBuff(tank: TankComponent, ability: BuffAbility): boolean {
  return tank.buffs.has(ability);
}

/** Get remaining seconds for a buff (0 if not active). */
export function buffTimeLeft(tank: TankComponent, ability: BuffAbility, now: number): number {
  const buff = tank.buffs.get(ability);
  if (!buff) return 0;
  return Math.max(0, (buff.until - now) / 1000);
}

/** Pick a random buff ability from the config. */
export function randomBuffAbility(): BuffAbility {
  const types = CONFIG.buffs.types;
  return types[Math.floor(Math.random() * types.length)].key;
}
