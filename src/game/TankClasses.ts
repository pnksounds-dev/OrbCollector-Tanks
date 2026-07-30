/**
 * TankClasses.ts — diep.io-style tank class upgrade tree.
 *
 * Self-contained data + helpers. No external imports.
 *
 * Class tiers:
 *   Tier 0 (level 1):  basic
 *   Tier 1 (level 15): twin, sniper, machine_gun, flank_guard, triple_shot
 *   Tier 2 (level 30): triple_twin, quad_twin, assassin, hunter, destroyer,
 *                      gunner, twin_flank, quad_tank, penta_shot, spread_shot
 *   Tier 3 (level 45): overseer, booster, fighter, annihilator
 *
 * Barrel angle convention (radians):
 *   0      = forward (tank facing direction)
 *   PI     = backward
 *   PI/2   = right
 *   -PI/2  = left
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BarrelConfig = {
  /** Angle offset from the tank's facing direction, in radians. */
  angle: number;
  /** X offset from tank center along the barrel direction (for multi-barrel spread). */
  offset: number;
  /** Barrel length multiplier (relative to base). */
  lengthMult: number;
  /** Barrel width multiplier (relative to base). */
  widthMult: number;
};

export type FiringMode = "single" | "spread" | "rapid" | "double" | "sniper" | "flank" | "trap";

export type TankClass = {
  id: string;
  name: string;
  /** Parent class id (null for the base "Basic" tank). */
  parent: string | null;
  /** Level required to upgrade to this class. */
  requiredLevel: number;
  /** Barrel configurations (one entry per barrel). */
  barrels: BarrelConfig[];
  /** Firing behavior. */
  firingMode: FiringMode;
  /** Bullet damage multiplier. */
  damageMult: number;
  /** Bullet speed multiplier. */
  bulletSpeedMult: number;
  /** Fire rate multiplier (higher = faster). */
  fireRateMult: number;
  /** Bullet penetration multiplier. */
  penetrationMult: number;
  /** Movement speed multiplier. */
  moveSpeedMult: number;
  /** Body radius multiplier. */
  bodyRadiusMult: number;
  /** Description shown in the upgrade UI. */
  description: string;
};

// ---------------------------------------------------------------------------
// Class definitions
// ---------------------------------------------------------------------------

const BASE_BARREL: BarrelConfig = {
  angle: 0,
  offset: 0,
  lengthMult: 1.0,
  widthMult: 1.0,
};

export const TANK_CLASSES: TankClass[] = [
  // ---- Tier 0 (base, level 1) -------------------------------------------
  {
    id: "basic",
    name: "Basic Tank",
    parent: null,
    requiredLevel: 1,
    barrels: [{ ...BASE_BARREL }],
    firingMode: "single",
    damageMult: 1.0,
    bulletSpeedMult: 1.0,
    fireRateMult: 1.0,
    penetrationMult: 1.0,
    moveSpeedMult: 1.0,
    bodyRadiusMult: 1.0,
    description: "A standard tank with a single barrel. Balanced in every way.",
  },

  // ---- Tier 1 (level 15, parent: basic) ---------------------------------
  {
    id: "twin",
    name: "Twin",
    parent: "basic",
    requiredLevel: 15,
    barrels: [
      { angle: 0, offset: -0.5, lengthMult: 1.0, widthMult: 0.7 },
      { angle: 0, offset: 0.5, lengthMult: 1.0, widthMult: 0.7 },
    ],
    firingMode: "single",
    damageMult: 0.9,
    bulletSpeedMult: 1.0,
    fireRateMult: 1.0,
    penetrationMult: 1.0,
    moveSpeedMult: 1.0,
    bodyRadiusMult: 1.0,
    description: "Two parallel barrels that fire simultaneously for double the bullets.",
  },
  {
    id: "sniper",
    name: "Sniper",
    parent: "basic",
    requiredLevel: 15,
    barrels: [{ angle: 0, offset: 0, lengthMult: 1.6, widthMult: 0.7 }],
    firingMode: "sniper",
    damageMult: 1.5,
    bulletSpeedMult: 1.8,
    fireRateMult: 0.5,
    penetrationMult: 2.0,
    moveSpeedMult: 0.9,
    bodyRadiusMult: 1.0,
    description: "A long thin barrel that fires fast, high-damage, penetrating rounds.",
  },
  {
    id: "machine_gun",
    name: "Machine Gun",
    parent: "basic",
    requiredLevel: 15,
    barrels: [{ angle: 0, offset: 0, lengthMult: 0.8, widthMult: 1.4 }],
    firingMode: "rapid",
    damageMult: 0.5,
    bulletSpeedMult: 0.8,
    fireRateMult: 3.0,
    penetrationMult: 0.8,
    moveSpeedMult: 1.0,
    bodyRadiusMult: 1.0,
    description: "A short wide barrel that sprays bullets at a furious rate.",
  },
  {
    id: "flank_guard",
    name: "Flank Guard",
    parent: "basic",
    requiredLevel: 15,
    barrels: [
      { angle: 0, offset: 0, lengthMult: 1.0, widthMult: 0.9 },
      { angle: Math.PI, offset: 0, lengthMult: 1.0, widthMult: 0.9 },
    ],
    firingMode: "flank",
    damageMult: 0.8,
    bulletSpeedMult: 1.0,
    fireRateMult: 1.0,
    penetrationMult: 1.0,
    moveSpeedMult: 1.0,
    bodyRadiusMult: 1.0,
    description: "A barrel on both sides — fire forward and backward at the same time.",
  },
  {
    id: "triple_shot",
    name: "Triple Shot",
    parent: "basic",
    requiredLevel: 15,
    barrels: [
      { angle: 0, offset: 0, lengthMult: 1.0, widthMult: 0.8 },
      { angle: Math.PI / 6, offset: 0, lengthMult: 0.9, widthMult: 0.7 },
      { angle: -Math.PI / 6, offset: 0, lengthMult: 0.9, widthMult: 0.7 },
    ],
    firingMode: "spread",
    damageMult: 0.7,
    bulletSpeedMult: 1.0,
    fireRateMult: 1.0,
    penetrationMult: 0.9,
    moveSpeedMult: 1.0,
    bodyRadiusMult: 1.0,
    description: "Three barrels in a forward spread — cover a wide area with fire.",
  },

  // ---- Tier 2 (level 30) ------------------------------------------------
  // Children of twin
  {
    id: "triple_twin",
    name: "Triple Twin",
    parent: "twin",
    requiredLevel: 30,
    barrels: [
      { angle: 0, offset: -0.5, lengthMult: 0.9, widthMult: 0.6 },
      { angle: 0, offset: 0.5, lengthMult: 0.9, widthMult: 0.6 },
      { angle: Math.PI / 4, offset: -0.5, lengthMult: 0.8, widthMult: 0.55 },
      { angle: Math.PI / 4, offset: 0.5, lengthMult: 0.8, widthMult: 0.55 },
      { angle: -Math.PI / 4, offset: -0.5, lengthMult: 0.8, widthMult: 0.55 },
      { angle: -Math.PI / 4, offset: 0.5, lengthMult: 0.8, widthMult: 0.55 },
    ],
    firingMode: "spread",
    damageMult: 0.6,
    bulletSpeedMult: 1.0,
    fireRateMult: 1.0,
    penetrationMult: 0.9,
    moveSpeedMult: 1.0,
    bodyRadiusMult: 1.0,
    description: "Three pairs of barrels fanned out — a wall of bullets in three directions.",
  },
  {
    id: "quad_twin",
    name: "Quad Twin",
    parent: "twin",
    requiredLevel: 30,
    barrels: [
      { angle: 0, offset: -0.5, lengthMult: 0.9, widthMult: 0.55 },
      { angle: 0, offset: 0.5, lengthMult: 0.9, widthMult: 0.55 },
      { angle: Math.PI / 2, offset: -0.5, lengthMult: 0.9, widthMult: 0.55 },
      { angle: Math.PI / 2, offset: 0.5, lengthMult: 0.9, widthMult: 0.55 },
    ],
    firingMode: "spread",
    damageMult: 0.5,
    bulletSpeedMult: 1.0,
    fireRateMult: 1.0,
    penetrationMult: 0.9,
    moveSpeedMult: 1.0,
    bodyRadiusMult: 1.0,
    description: "Four barrels arranged in two pairs — fire in two perpendicular directions.",
  },

  // Children of sniper
  {
    id: "assassin",
    name: "Assassin",
    parent: "sniper",
    requiredLevel: 30,
    barrels: [{ angle: 0, offset: 0, lengthMult: 2.2, widthMult: 0.6 }],
    firingMode: "sniper",
    damageMult: 2.0,
    bulletSpeedMult: 2.5,
    fireRateMult: 0.3,
    penetrationMult: 2.5,
    moveSpeedMult: 0.85,
    bodyRadiusMult: 1.0,
    description: "An even longer barrel for extreme-range, devastating single shots.",
  },
  {
    id: "hunter",
    name: "Hunter",
    parent: "sniper",
    requiredLevel: 30,
    barrels: [
      { angle: 0, offset: 0, lengthMult: 1.8, widthMult: 1.1 },
      { angle: 0, offset: 0, lengthMult: 1.4, widthMult: 0.7 },
    ],
    firingMode: "double",
    damageMult: 1.8,
    bulletSpeedMult: 2.0,
    fireRateMult: 0.6,
    penetrationMult: 2.2,
    moveSpeedMult: 0.9,
    bodyRadiusMult: 1.0,
    description: "Two overlapping barrels fire a big bullet followed by a small one.",
  },

  // Children of machine_gun
  {
    id: "destroyer",
    name: "Destroyer",
    parent: "machine_gun",
    requiredLevel: 30,
    barrels: [{ angle: 0, offset: 0, lengthMult: 1.3, widthMult: 2.2 }],
    firingMode: "single",
    damageMult: 4.0,
    bulletSpeedMult: 0.6,
    fireRateMult: 0.2,
    penetrationMult: 3.0,
    moveSpeedMult: 0.8,
    bodyRadiusMult: 1.2,
    description: "A massive barrel that lobs huge, slow, devastating shells.",
  },
  {
    id: "gunner",
    name: "Gunner",
    parent: "machine_gun",
    requiredLevel: 30,
    barrels: [
      { angle: 0, offset: -0.6, lengthMult: 0.8, widthMult: 0.4 },
      { angle: 0, offset: -0.2, lengthMult: 0.9, widthMult: 0.4 },
      { angle: 0, offset: 0.2, lengthMult: 0.9, widthMult: 0.4 },
      { angle: 0, offset: 0.6, lengthMult: 0.8, widthMult: 0.4 },
    ],
    firingMode: "rapid",
    damageMult: 0.3,
    bulletSpeedMult: 1.1,
    fireRateMult: 4.0,
    penetrationMult: 0.7,
    moveSpeedMult: 1.0,
    bodyRadiusMult: 1.0,
    description: "Four tiny barrels that spit a relentless stream of small bullets.",
  },

  // Children of flank_guard
  {
    id: "twin_flank",
    name: "Twin Flank",
    parent: "flank_guard",
    requiredLevel: 30,
    barrels: [
      { angle: 0, offset: -0.5, lengthMult: 1.0, widthMult: 0.7 },
      { angle: 0, offset: 0.5, lengthMult: 1.0, widthMult: 0.7 },
      { angle: Math.PI, offset: -0.5, lengthMult: 1.0, widthMult: 0.7 },
      { angle: Math.PI, offset: 0.5, lengthMult: 1.0, widthMult: 0.7 },
    ],
    firingMode: "flank",
    damageMult: 0.8,
    bulletSpeedMult: 1.0,
    fireRateMult: 1.0,
    penetrationMult: 1.0,
    moveSpeedMult: 1.0,
    bodyRadiusMult: 1.0,
    description: "Two barrels front and two back — twin fire in both directions.",
  },
  {
    id: "quad_tank",
    name: "Quad Tank",
    parent: "flank_guard",
    requiredLevel: 30,
    barrels: [
      { angle: 0, offset: 0, lengthMult: 0.95, widthMult: 0.8 },
      { angle: Math.PI / 2, offset: 0, lengthMult: 0.95, widthMult: 0.8 },
      { angle: Math.PI, offset: 0, lengthMult: 0.95, widthMult: 0.8 },
      { angle: -Math.PI / 2, offset: 0, lengthMult: 0.95, widthMult: 0.8 },
    ],
    firingMode: "flank",
    damageMult: 0.7,
    bulletSpeedMult: 1.0,
    fireRateMult: 1.0,
    penetrationMult: 1.0,
    moveSpeedMult: 1.0,
    bodyRadiusMult: 1.0,
    description: "Four barrels pointing N/S/E/W — fire in all four cardinal directions.",
  },

  // Children of triple_shot
  {
    id: "penta_shot",
    name: "Penta Shot",
    parent: "triple_shot",
    requiredLevel: 30,
    barrels: [
      { angle: 0, offset: 0, lengthMult: 1.0, widthMult: 0.7 },
      { angle: Math.PI / 8, offset: 0, lengthMult: 0.95, widthMult: 0.65 },
      { angle: -Math.PI / 8, offset: 0, lengthMult: 0.95, widthMult: 0.65 },
      { angle: Math.PI / 4, offset: 0, lengthMult: 0.85, widthMult: 0.6 },
      { angle: -Math.PI / 4, offset: 0, lengthMult: 0.85, widthMult: 0.6 },
    ],
    firingMode: "spread",
    damageMult: 0.5,
    bulletSpeedMult: 1.0,
    fireRateMult: 1.0,
    penetrationMult: 0.9,
    moveSpeedMult: 0.95,
    bodyRadiusMult: 1.0,
    description: "Five barrels in a wide forward spread — saturate the field with bullets.",
  },
  {
    id: "spread_shot",
    name: "Spread Shot",
    parent: "triple_shot",
    requiredLevel: 30,
    barrels: [
      { angle: 0, offset: 0, lengthMult: 1.0, widthMult: 0.6 },
      { angle: Math.PI / 10, offset: 0, lengthMult: 0.9, widthMult: 0.55 },
      { angle: -Math.PI / 10, offset: 0, lengthMult: 0.9, widthMult: 0.55 },
      { angle: Math.PI / 5, offset: 0, lengthMult: 0.85, widthMult: 0.5 },
      { angle: -Math.PI / 5, offset: 0, lengthMult: 0.85, widthMult: 0.5 },
      { angle: (3 * Math.PI) / 10, offset: 0, lengthMult: 0.8, widthMult: 0.5 },
      { angle: -(3 * Math.PI) / 10, offset: 0, lengthMult: 0.8, widthMult: 0.5 },
      { angle: (2 * Math.PI) / 5, offset: 0, lengthMult: 0.75, widthMult: 0.45 },
      { angle: -(2 * Math.PI) / 5, offset: 0, lengthMult: 0.75, widthMult: 0.45 },
    ],
    firingMode: "spread",
    damageMult: 0.3,
    bulletSpeedMult: 0.95,
    fireRateMult: 1.5,
    penetrationMult: 0.7,
    moveSpeedMult: 0.95,
    bodyRadiusMult: 1.0,
    description: "Many barrels across a 180° spread — a shotgun blast of tiny bullets.",
  },

  // ---- Tier 3 (level 45) ------------------------------------------------
  {
    id: "overseer",
    name: "Overseer",
    parent: "assassin",
    requiredLevel: 45,
    barrels: [{ angle: 0, offset: 0, lengthMult: 2.6, widthMult: 0.55 }],
    firingMode: "sniper",
    damageMult: 3.0,
    bulletSpeedMult: 3.0,
    fireRateMult: 0.2,
    penetrationMult: 3.0,
    moveSpeedMult: 0.8,
    bodyRadiusMult: 1.1,
    description: "A super sniper — extreme damage and range at a glacial fire rate.",
  },
  {
    id: "booster",
    name: "Booster",
    parent: "quad_tank",
    requiredLevel: 45,
    barrels: [
      { angle: 0, offset: 0, lengthMult: 1.0, widthMult: 0.8 },
      { angle: Math.PI, offset: -0.5, lengthMult: 0.8, widthMult: 0.6 },
      { angle: Math.PI, offset: 0.5, lengthMult: 0.8, widthMult: 0.6 },
      { angle: Math.PI / 2, offset: 0, lengthMult: 0.7, widthMult: 0.5 },
      { angle: -Math.PI / 2, offset: 0, lengthMult: 0.7, widthMult: 0.5 },
    ],
    firingMode: "flank",
    damageMult: 0.9,
    bulletSpeedMult: 1.1,
    fireRateMult: 1.2,
    penetrationMult: 1.0,
    moveSpeedMult: 2.0,
    bodyRadiusMult: 1.0,
    description: "Four back-facing barrels provide thrust for blistering speed.",
  },
  {
    id: "fighter",
    name: "Fighter",
    parent: "flank_guard",
    requiredLevel: 45,
    barrels: [
      { angle: 0, offset: 0, lengthMult: 1.1, widthMult: 0.8 },
      { angle: Math.PI, offset: 0, lengthMult: 1.0, widthMult: 0.7 },
      { angle: Math.PI / 2, offset: 0, lengthMult: 0.8, widthMult: 0.6 },
      { angle: -Math.PI / 2, offset: 0, lengthMult: 0.8, widthMult: 0.6 },
    ],
    firingMode: "flank",
    damageMult: 1.2,
    bulletSpeedMult: 1.2,
    fireRateMult: 1.1,
    penetrationMult: 1.2,
    moveSpeedMult: 1.5,
    bodyRadiusMult: 1.0,
    description: "A balanced four-barrel design with strong mobility and firepower.",
  },
  {
    id: "annihilator",
    name: "Annihilator",
    parent: "destroyer",
    requiredLevel: 45,
    barrels: [{ angle: 0, offset: 0, lengthMult: 1.5, widthMult: 2.8 }],
    firingMode: "single",
    damageMult: 6.0,
    bulletSpeedMult: 0.7,
    fireRateMult: 0.15,
    penetrationMult: 4.0,
    moveSpeedMult: 0.7,
    bodyRadiusMult: 1.3,
    description: "The ultimate cannon — colossal shells that obliterate everything they touch.",
  },
];

// ---------------------------------------------------------------------------
// Lookup map
// ---------------------------------------------------------------------------

export const TANK_CLASS_MAP: Record<string, TankClass> = TANK_CLASSES.reduce(
  (map, tankClass) => {
    map[tankClass.id] = tankClass;
    return map;
  },
  {} as Record<string, TankClass>,
);

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Get all classes available to upgrade to at the given level, from the given
 * current class. A class is available when the player's level is at least the
 * class's required level AND the class's parent matches the current class id
 * (i.e. it is a direct child in the tree). The base class has no upgrades
 * listed at level 1; upgrades appear once the player reaches the required tier.
 */
export function getAvailableUpgrades(currentClassId: string, level: number): TankClass[] {
  return TANK_CLASSES.filter(
    (tankClass) =>
      tankClass.parent === currentClassId && level >= tankClass.requiredLevel,
  );
}

/** Get a class by id. Returns undefined if not found. */
export function getClass(id: string): TankClass | undefined {
  return TANK_CLASS_MAP[id];
}

/** Get the base class (the tier-0 "basic" tank). */
export function getBaseClass(): TankClass {
  const base = TANK_CLASS_MAP["basic"];
  if (!base) {
    throw new Error("Base tank class 'basic' is missing from TANK_CLASSES.");
  }
  return base;
}

/**
 * Get the barrel configs for a class, resolved to absolute barrel dimensions.
 *
 * @param classId          The tank class id.
 * @param baseBarrelLength The base barrel length (px) to multiply by.
 * @param baseBarrelWidth  The base barrel width (px) to multiply by.
 * @returns Array of resolved barrels with absolute length/width, or an empty
 *          array if the class is not found.
 */
export function getBarrels(
  classId: string,
  baseBarrelLength: number,
  baseBarrelWidth: number,
): Array<{ angle: number; offset: number; length: number; width: number }> {
  const tankClass = TANK_CLASS_MAP[classId];
  if (!tankClass) {
    return [];
  }
  return tankClass.barrels.map((barrel) => ({
    angle: barrel.angle,
    offset: barrel.offset,
    length: barrel.lengthMult * baseBarrelLength,
    width: barrel.widthMult * baseBarrelWidth,
  }));
}
