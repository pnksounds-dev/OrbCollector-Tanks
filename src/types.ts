/** Shared TypeScript types. */

export type GameState = "menu" | "playing" | "dead";

export type ShapeKind = "square" | "triangle" | "pentagon";

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
