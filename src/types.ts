/** Shared TypeScript types. */

export type GameState = "menu" | "playing" | "dead";

export type ShapeKind = "square" | "triangle" | "pentagon";

/** Game mode selection. */
export type GameMode = "ffa" | "2teams" | "4teams";

/** Team identifiers. -1 = no team (FFA), 0+ = team index. */
export type TeamId = number;

/** The 8 diep.io stats, indexed by position 0–7. */
export type StatIndex =
  | 0 // Health Regen
  | 1 // Max Health
  | 2 // Body Damage
  | 3 // Bullet Speed
  | 4 // Bullet Penetration
  | 5 // Bullet Damage
  | 6 // Reload
  | 7; // Movement Speed

export const STAT_NAMES = [
  "Health Regen",
  "Max Health",
  "Body Damage",
  "Bullet Speed",
  "Bullet Penetration",
  "Bullet Damage",
  "Reload",
  "Movement Speed",
] as const;

export const STAT_COUNT = 8;
export const STAT_MAX = 7; // max points per stat in basic diep

// ---- Buff system ----

/** Buff ability identifiers. */
export type BuffAbility =
  | "speed" // +60% movement speed
  | "rapidFire" // +100% fire rate
  | "damage" // +50% bullet damage
  | "shieldCharge" // instant shield refill + 2x regen
  | "heal" // instant full HP (no duration)
  | "vampiric" // lifesteal: heal 50% of damage dealt
  | "damageResist"; // -50% damage taken

/** An active buff on a tank. Stored in TankComponent.buffs Map. */
export interface Buff {
  ability: BuffAbility;
  label: string;
  color: string;
  icon: string;
  /** Expiry timestamp (performance.now() in ms). 0 = instant (already applied). */
  until: number;
}

/** A buff type definition (config-level). */
export interface BuffType {
  key: BuffAbility;
  icon: string;
  color: string;
  /** Duration in seconds. 0 = instant effect. */
  duration: number;
  label: string;
}
