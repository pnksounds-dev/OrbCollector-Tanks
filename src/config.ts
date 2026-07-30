/** All tuning constants and content tables for Orb Collector: Tanks.
 *
 * A single CONFIG object holds every balanceable value. The dev panel writes
 * overrides to a live DEV object; Game.applyDevValues() copies those onto
 * CONFIG each frame (mirrors undergrowth's pattern).
 */

import type { ShapeKind, BuffType } from "./types";

interface ShapeConfig {
  radius: number;
  hp: number;
  xp: number;
  bodyDamage: number;
  driftSpeed: number;
  rotSpeedRange: number;
  /** Target population maintained by SpawnSystem. */
  targetCount: number;
  /** Color (hex). */
  color: string;
  /** Outline color (hex). */
  outline: string;
}

interface BulletConfig {
  radius: number;
  /** Base lifetime in seconds. */
  life: number;
  /** Base damage per hit (before Bullet Damage stat). */
  baseDamage: number;
  /** Base penetration (pierce count) before Bullet Penetration stat. */
  basePenetration: number;
  /** Base speed in world units/s before Bullet Speed stat. */
  baseSpeed: number;
}

interface TankConfig {
  baseBodyRadius: number;
  baseBarrelLength: number;
  baseBarrelWidth: number;
  baseMaxHp: number;
  baseRegen: number; // hp/s
  baseMaxShield: number;
  baseShieldRegen: number; // shield/s
  baseBodyDamage: number;
  baseSpeed: number; // world units/s
  baseFireRate: number; // shots per second
  /** Seconds of invulnerability after spawn. */
  spawnInvuln: number;
  /** Max points per stat. */
  statMax: number;
  /** Per-stat effect per point (multiplier or flat, applied in LevelSystem). */
  statRegenPerPoint: number;
  statMaxHpPerPoint: number;
  statBodyDamagePerPoint: number;
  statBulletSpeedPerPoint: number;
  statBulletPenetrationPerPoint: number;
  statBulletDamagePerPoint: number;
  statReloadPerPoint: number; // fire rate multiplier per point
  statMoveSpeedPerPoint: number;
  /** Body radius growth per level. */
  radiusGrowthPerLevel: number;
}

export const CONFIG = {
  // ---- World ----
  /** Half-width of the square arena (world extends -SIZE..+SIZE on both axes). */
  worldHalf: 2500,
  /** Background grid spacing in world units. */
  gridSize: 50,
  /** Out-of-bounds red zone thickness in world units (visual). */
  redZoneThickness: 200,

  // ---- Camera ----
  /** Base zoom: world units per screen pixel at zoom 1. Lower = more zoomed in. */
  baseScale: 1.0,
  cameraLerp: 0.12,
  zoomMin: 0.4,
  zoomMax: 2.5,
  zoomWheelStep: 0.1,

  // ---- Tank ----
  tank: {
    baseBodyRadius: 28,
    baseBarrelLength: 36,
    baseBarrelWidth: 18,
    baseMaxHp: 100,
    baseRegen: 1.0,
    baseMaxShield: 50,
    baseShieldRegen: 5.0,
    baseBodyDamage: 10,
    baseSpeed: 220,
    baseFireRate: 1.5, // shots per second at reload 0
    spawnInvuln: 3.0,
    statMax: 7,
    statRegenPerPoint: 2.0,
    statMaxHpPerPoint: 20,
    statBodyDamagePerPoint: 6,
    statBulletSpeedPerPoint: 60,
    statBulletPenetrationPerPoint: 1.0,
    statBulletDamagePerPoint: 8,
    statReloadPerPoint: 0.18, // fire rate multiplier per point
    statMoveSpeedPerPoint: 12,
    radiusGrowthPerLevel: 1.2,
  } satisfies TankConfig,

  // ---- Bullet ----
  bullet: {
    radius: 11,
    life: 3.0,
    baseDamage: 12,
    basePenetration: 2,
    baseSpeed: 480,
  } satisfies BulletConfig,

  // ---- Shapes ----
  shapes: {
    square: {
      radius: 22,
      hp: 12,
      xp: 10,
      bodyDamage: 8,
      driftSpeed: 20,
      rotSpeedRange: 0.4,
      targetCount: 35,
      color: "#ffe869",
      outline: "#d4b800",
    },
    triangle: {
      radius: 26,
      hp: 30,
      xp: 25,
      bodyDamage: 12,
      driftSpeed: 18,
      rotSpeedRange: 0.3,
      targetCount: 14,
      color: "#fc7677",
      outline: "#c04040",
    },
    pentagon: {
      radius: 40,
      hp: 100,
      xp: 130,
      bodyDamage: 18,
      driftSpeed: 12,
      rotSpeedRange: 0.2,
      targetCount: 5,
      color: "#768dfc",
      outline: "#4060c0",
    },
  } satisfies Record<ShapeKind, ShapeConfig>,

  // ---- XP / Leveling ----
  /** XP needed to reach the NEXT level from the given level: level² × factor. */
  xpFactor: 50,
  levelCap: 45,

  // ---- Particles ----
  /** Number of orb particles spawned on shape death. */
  particleCount: 5,
  particleLife: 0.6,
  particleSpeed: 120,
  particleRadius: 8,

  // ---- Colors ----
  colors: {
    tankBody: "#00b2e1",
    tankOutline: "#0088b0",
    tankBarrel: "#999999",
    tankBarrelOutline: "#666666",
    bullet: "#4a4a4a",
    bulletOutline: "#222222",
    grid: "#c8c8c8",
    background: "#cdcdcd",
    redZone: "rgba(255, 0, 0, 0.15)",
    hpBarBg: "rgba(0,0,0,0.4)",
    hpBarFg: "#8fce1e",
    shieldBarFg: "#00b2e1",
  },

  // ---- Teams ----
  teams: {
    /** Team colors (body fill). Index 0 = blue, 1 = red, 2 = green, 3 = purple. */
    colors: ["#00b2e1", "#e14a4a", "#4ae14a", "#9b4ae1"],
    /** 2-team base band depth (height of top/bottom bands, in world units). */
    baseDepth2: 1800,
    /** 4-team base quadrant size (edge length of each corner quadrant). */
    baseDepth4: 2400,
  },

  // ---- Game modes ----
  gameModes: {
    ffa: {
      worldHalf: 2500,
      botCount: 8,
      teamCount: 0,
    },
    "2teams": {
      worldHalf: 6000,
      botCount: 100,
      teamCount: 2,
    },
    "4teams": {
      worldHalf: 6000,
      botCount: 100,
      teamCount: 4,
    },
  } satisfies Record<string, { worldHalf: number; botCount: number; teamCount: number }>,

  // ---- Buffs (temporary powerups from destroying buffed shapes) ----
  buffs: {
    /** Chance a pentagon spawns with a buff (0–1). */
    pentagonBuffChance: 0.10,
    /** Chance the alpha pentagon spawns with a buff (0–1). */
    alphaBuffChance: 0.50,
    /** All buff type definitions. */
    types: [
      { key: "speed", icon: "/items/ShipUpgrade/SpeedUpgrade.png", color: "#4ae14a", duration: 15, label: "Speed Boost" },
      { key: "rapidFire", icon: "/items/Consumables/OverdriveInjector.png", color: "#e1c84a", duration: 12, label: "Rapid Fire" },
      { key: "damage", icon: "/items/ShipUpgrade/TargetingArray.png", color: "#e14a4a", duration: 12, label: "Damage Boost" },
      { key: "shieldCharge", icon: "/items/Consumables/ShieldBomb.png", color: "#00b2e1", duration: 10, label: "Shield Charge" },
      { key: "heal", icon: "/items/Consumables/HealthIncrease.png", color: "#4ae1b0", duration: 0, label: "Instant Heal" },
      { key: "vampiric", icon: "/items/Passive/VampiricSiphon.png", color: "#9b4ae1", duration: 15, label: "Vampiric" },
      { key: "damageResist", icon: "/items/ShipUpgrade/KevlarPlating.png", color: "#b08a4a", duration: 12, label: "Damage Resist" },
    ] satisfies BuffType[],
  },
};

export type Config = typeof CONFIG;
