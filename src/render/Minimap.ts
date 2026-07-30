/** Minimap: top-right canvas showing entities in the arena.
 *
 * Draws the arena outline (scaled to the minimap canvas) plus dots for:
 *  - regular pentagons (tiny blue dots)
 *  - the alpha pentagon (larger dark blue dot)
 *  - bot tanks (small colored dots using each bot's color)
 *  - the player (green/white, slightly larger)
 *
 * Squares and triangles are intentionally omitted for performance. Updated
 * each frame from Game.loop.
 */

import { CONFIG } from "../config";
import type { ECWorld } from "../ecs/World";
import {
  C,
  type PositionComponent,
  type ShapeComponent,
  type TeamComponent,
} from "../ecs/components";
import { BOT, BOT_AI, type BotAIComponent } from "../systems/BotAISystem";
import { ALPHA } from "../game/AlphaPentagon";
import type { Camera } from "../game/Camera";

export class Minimap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor() {
    this.canvas = document.getElementById("minimap") as HTMLCanvasElement;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("Minimap canvas 2D context not available.");
    this.ctx = ctx;
  }

  init(): void {
    // Nothing to init beyond the canvas reference
  }

  update(world: ECWorld, _camera: Camera, playerId: number): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const half = CONFIG.worldHalf;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.fillRect(0, 0, w, h);

    // Arena outline
    const scale = Math.min(w, h) / (half * 2);
    const ox = (w - half * 2 * scale) / 2;
    const oy = (h - half * 2 * scale) / 2;
    ctx.strokeStyle = "rgba(200, 0, 0, 0.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(ox, oy, half * 2 * scale, half * 2 * scale);

    // Helper: world (x, y) → minimap pixel (mx, my)
    const toMap = (x: number, y: number): [number, number] => [
      ox + (x + half) * scale,
      oy + (y + half) * scale,
    ];

    // --- Regular pentagons (tiny blue dots) ---
    // Only pentagons (skip squares/triangles for perf) and exclude the alpha.
    const shapeIds = world.query(C.Position, C.Shape);
    for (const id of shapeIds) {
      if (world.hasComponent(id, ALPHA)) continue;
      const shape = world.getComponent<ShapeComponent>(id, C.Shape);
      if (!shape || shape.kind !== "pentagon") continue;
      const pos = world.getComponent<PositionComponent>(id, C.Position);
      if (!pos) continue;
      const [mx, my] = toMap(pos.x, pos.y);
      ctx.fillStyle = "rgba(40, 80, 200, 0.8)";
      ctx.beginPath();
      ctx.arc(mx, my, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- Alpha pentagon (larger dark blue dot) ---
    const alphaIds = world.query(ALPHA, C.Position);
    for (const id of alphaIds) {
      const pos = world.getComponent<PositionComponent>(id, C.Position);
      if (!pos) continue;
      const [mx, my] = toMap(pos.x, pos.y);
      ctx.fillStyle = "rgba(20, 20, 90, 0.9)";
      ctx.beginPath();
      ctx.arc(mx, my, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- Bot tanks (small colored dots — team color takes priority) ---
    const botIds = world.query(BOT, BOT_AI, C.Position);
    for (const id of botIds) {
      const pos = world.getComponent<PositionComponent>(id, C.Position);
      const ai = world.getComponent<BotAIComponent>(id, BOT_AI);
      if (!pos || !ai) continue;
      const [mx, my] = toMap(pos.x, pos.y);
      const team = world.getComponent<TeamComponent>(id, C.Team);
      const teamId = team ? team.id : -1;
      ctx.fillStyle = teamId >= 0 ? (CONFIG.teams.colors[teamId] ?? ai.color) : ai.color;
      ctx.beginPath();
      ctx.arc(mx, my, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- Player (green/white, slightly larger) ---
    const pos = world.getComponent<PositionComponent>(playerId, C.Position);
    if (pos) {
      const [px, py] = toMap(pos.x, pos.y);
      ctx.fillStyle = CONFIG.colors.tankBody;
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();
      // White outline so the player dot stands out.
      ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
