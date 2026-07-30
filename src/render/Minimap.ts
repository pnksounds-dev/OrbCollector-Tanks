/** Minimap: top-right canvas showing the player's position in the arena.
 *
 * Draws the arena outline (scaled to the minimap canvas) and a dot for the
 * player. Updated each frame from Game.loop.
 */

import { CONFIG } from "../config";
import type { ECWorld } from "../ecs/World";
import { C, type PositionComponent } from "../ecs/components";
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

    // Player dot
    const pos = world.getComponent<PositionComponent>(playerId, C.Position);
    if (pos) {
      const px = ox + (pos.x + half) * scale;
      const py = oy + (pos.y + half) * scale;
      ctx.fillStyle = CONFIG.colors.tankBody;
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
