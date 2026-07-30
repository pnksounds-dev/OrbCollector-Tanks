/** Spawn system: maintain shape population across the arena.
 *
 * Each frame, count shapes by kind and spawn new ones up to the target count.
 * New shapes spawn at random positions away from the player so they don't
 * appear on top of the tank.
 */

import { CONFIG } from "../config";
import type { ECWorld } from "../ecs/World";
import { C, createShapeEntity, type ShapeComponent, type PositionComponent } from "../ecs/components";
import type { Camera } from "../game/Camera";
import type { ShapeKind, BuffAbility } from "../types";
import { isInNest, NEST_DEFAULT_RADIUS } from "../game/AlphaPentagon";

/** Pick a random buff type from CONFIG.buffs.types. */
function randomBuffType(): BuffAbility {
  const types = CONFIG.buffs.types;
  return types[Math.floor(Math.random() * types.length)].key;
}

/** Maybe assign a buff to a pentagon shape based on config chance. */
function maybeAssignBuff(world: ECWorld, id: number, chance: number): void {
  if (Math.random() >= chance) return;
  const shape = world.getComponent<ShapeComponent>(id, C.Shape);
  if (shape) {
    shape.buffType = randomBuffType();
  }
}

export class SpawnSystem {
  /** Accumulator for spawn throttling (don't spawn all at once). */
  private spawnAccum = 0;

  init(world: ECWorld): void {
    // Pre-populate the arena with shapes
    const kinds: ShapeKind[] = ["square", "triangle", "pentagon"];
    for (const kind of kinds) {
      const target = CONFIG.shapes[kind].targetCount;
      for (let i = 0; i < target; i++) {
        const [x, y] = this.randomSpawnPos(null, 0, 0);
        const id = createShapeEntity(world, kind, x, y);
        // Pentagons have a chance to carry a buff
        if (kind === "pentagon") {
          maybeAssignBuff(world, id, CONFIG.buffs.pentagonBuffChance);
        }
      }
    }
  }

  update(world: ECWorld, dt: number, _camera: Camera): void {
    this.spawnAccum += dt;
    if (this.spawnAccum < 0.5) return; // check every 0.5s
    this.spawnAccum = 0;

    // Count shapes by kind
    const counts: Record<string, number> = {
      square: 0,
      triangle: 0,
      pentagon: 0,
    };
    const ids = world.query(C.Shape);
    for (const id of ids) {
      const shape = world.getComponent<ShapeComponent>(id, C.Shape)!;
      counts[shape.kind]++;
    }

    // Find player position to avoid spawning on top
    let px = 0;
    let py = 0;
    const players = world.query(C.Player, C.Position);
    if (players.length > 0) {
      const pos = world.getComponent<PositionComponent>(players[0], C.Position);
      if (pos) {
        px = pos.x;
        py = pos.y;
      }
    }

    // Spawn up to target for each kind
    const kinds: ShapeKind[] = ["square", "triangle", "pentagon"];
    for (const kind of kinds) {
      const target = CONFIG.shapes[kind].targetCount;
      const needed = target - counts[kind];
      // Spawn at most 3 per tick per kind to avoid bursts
      const toSpawn = Math.min(needed, 3);
      for (let i = 0; i < toSpawn; i++) {
        // Squares and triangles avoid the pentagon nest; pentagons can spawn anywhere
        const avoidNest = kind === "square" || kind === "triangle";
        const [x, y] = this.randomSpawnPos(null, px, py, avoidNest);
        const id = createShapeEntity(world, kind, x, y);
        // Pentagons have a chance to carry a buff
        if (kind === "pentagon") {
          maybeAssignBuff(world, id, CONFIG.buffs.pentagonBuffChance);
        }
      }
    }
  }

  /** Random position within the arena, at least minDist from the player.
   *  If avoidNest is true, also avoid the pentagon nest area. */
  private randomSpawnPos(
    _camera: Camera | null,
    px: number,
    py: number,
    avoidNest: boolean = false,
  ): [number, number] {
    const half = CONFIG.worldHalf - 100;
    const minDist = 400;
    for (let attempt = 0; attempt < 15; attempt++) {
      const x = (Math.random() * 2 - 1) * half;
      const y = (Math.random() * 2 - 1) * half;
      const dx = x - px;
      const dy = y - py;
      if (dx * dx + dy * dy < minDist * minDist) continue;
      if (avoidNest && isInNest(x, y, NEST_DEFAULT_RADIUS)) continue;
      return [x, y];
    }
    return [(Math.random() * 2 - 1) * half, (Math.random() * 2 - 1) * half];
  }
}
