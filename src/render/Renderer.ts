/** Canvas 2D renderer.
 *
 * Draws the background grid, arena boundary, and all entities (shapes, bullets,
 * tank, particles). The camera transform is applied via ctx.translate/scale so
 * entity drawing happens in world coordinates.
 */

import { CONFIG } from "../config";
import type { Camera } from "../game/Camera";
import type { ECWorld, EntityId } from "../ecs/World";
import {
  C,
  type PositionComponent,
  type TankComponent,
  type ShapeComponent,
  type BulletComponent,
  type ParticleComponent,
} from "../ecs/components";
import { BOT, BOT_AI, type BotAIComponent } from "../systems/BotAISystem";
import type { TeamComponent } from "../ecs/components";
import { ALPHA } from "../game/AlphaPentagon";
import { getBarrels } from "../game/TankClasses";

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private orbSprites: Record<string, HTMLImageElement> = {};

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
    this.loadSprites();
  }

  private loadSprites(): void {
    const sizes = ["Tiny", "Small", "Medium", "Large", "ExtraLarge"];
    for (const s of sizes) {
      const img = new Image();
      img.src = `/items/Resources/Orbs/Orb${s}.png`;
      const key = s.charAt(0).toLowerCase() + s.slice(1);
      this.orbSprites[key] = img;
    }
  }

  getOrbSprite(size: string): HTMLImageElement | null {
    const img = this.orbSprites[size];
    return img && img.complete && img.naturalWidth > 0 ? img : null;
  }

  /** Render a full frame. */
  render(world: ECWorld, camera: Camera, playerId: number | null, teamCount: number = 0): void {
    const ctx = this.ctx;
    const w = camera.viewW;
    const h = camera.viewH;

    // Clear with background
    ctx.fillStyle = CONFIG.colors.background;
    ctx.fillRect(0, 0, w, h);

    // Apply camera transform
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(camera.effectiveScale, camera.effectiveScale);
    ctx.translate(-camera.cx, -camera.cy);

    this.drawGrid(camera);
    this.drawArenaBoundary();
    if (teamCount > 0) this.drawTeamBases(teamCount);
    this.drawShapes(world, camera);
    this.drawBullets(world, camera);
    this.drawParticles(world, camera);
    this.drawAllTanks(world, playerId);

    ctx.restore();
  }

  private drawGrid(camera: Camera): void {
    const ctx = this.ctx;
    const g = CONFIG.gridSize;
    const half = CONFIG.worldHalf;
    const scale = camera.effectiveScale;

    // Only draw grid lines that are visible
    const left = camera.cx - camera.viewW / (2 * scale);
    const right = camera.cx + camera.viewW / (2 * scale);
    const top = camera.cy - camera.viewH / (2 * scale);
    const bottom = camera.cy + camera.viewH / (2 * scale);

    const startX = Math.max(-half, Math.floor(left / g) * g);
    const endX = Math.min(half, Math.ceil(right / g) * g);
    const startY = Math.max(-half, Math.floor(top / g) * g);
    const endY = Math.min(half, Math.ceil(bottom / g) * g);

    ctx.strokeStyle = CONFIG.colors.grid;
    ctx.lineWidth = 1 / scale;
    ctx.beginPath();
    for (let x = startX; x <= endX; x += g) {
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
    }
    for (let y = startY; y <= endY; y += g) {
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
    }
    ctx.stroke();
  }

  private drawArenaBoundary(): void {
    const ctx = this.ctx;
    const half = CONFIG.worldHalf;
    // The camera transform (translate + scale) is already applied, so drawing
    // happens in world coordinates. Read the current x-scale from the active
    // transform so stroke widths can be expressed in screen pixels regardless
    // of zoom level.
    const scale = ctx.getTransform().a;

    // 1. Out-of-bounds zone — a semi-transparent dark red/brown tint over
    //    everything outside the playable square that is visible. A single path
    //    holds a huge outer rectangle with the arena square as an inner hole;
    //    the even-odd fill rule paints only the area between them, so the
    //    playable area stays untouched. The outer rect is far larger than any
    //    possible viewport, and the canvas clips rasterization to the screen,
    //    so this stays cheap (one fill call).
    const big = half * 40;
    ctx.fillStyle = "rgba(80, 30, 30, 0.3)";
    ctx.beginPath();
    ctx.rect(-big, -big, big * 2, big * 2);
    ctx.rect(-half, -half, half * 2, half * 2);
    ctx.fill("evenodd");

    // 2. Arena border line — a clear 3px white stroke around the playable square.
    ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    ctx.lineWidth = 3 / scale;
    ctx.strokeRect(-half, -half, half * 2, half * 2);

    // 3. Corner markers — small L-shaped marks at each corner for clarity.
    const arm = 60; // arm length in world units
    ctx.beginPath();
    // top-left
    ctx.moveTo(-half, -half + arm);
    ctx.lineTo(-half, -half);
    ctx.lineTo(-half + arm, -half);
    // top-right
    ctx.moveTo(half - arm, -half);
    ctx.lineTo(half, -half);
    ctx.lineTo(half, -half + arm);
    // bottom-right
    ctx.moveTo(half, half - arm);
    ctx.lineTo(half, half);
    ctx.lineTo(half - arm, half);
    // bottom-left
    ctx.moveTo(-half + arm, half);
    ctx.lineTo(-half, half);
    ctx.lineTo(-half, half - arm);
    ctx.stroke();
  }

  /** Draw team base zones — semi-transparent colored circles at each team's base.
   *  2 teams: top and bottom of the world. 4 teams: four corners. */
  private drawTeamBases(teamCount: number): void {
    const ctx = this.ctx;
    const half = CONFIG.worldHalf * 0.75;
    const bases =
      teamCount === 2
        ? [
            { x: 0, y: -half, color: CONFIG.teams.colors[0] },
            { x: 0, y: half, color: CONFIG.teams.colors[1] },
          ]
        : [
            { x: -half, y: -half, color: CONFIG.teams.colors[0] },
            { x: half, y: -half, color: CONFIG.teams.colors[1] },
            { x: -half, y: half, color: CONFIG.teams.colors[2] },
            { x: half, y: half, color: CONFIG.teams.colors[3] },
          ];

    const baseRadius = teamCount === 2 ? CONFIG.teams.baseRadius2 : CONFIG.teams.baseRadius4;
    for (const base of bases) {
      // Parse hex color to rgba
      const hex = base.color.replace("#", "");
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);

      // Fill the base zone
      ctx.fillStyle = `rgba(${r},${g},${b},0.12)`;
      ctx.beginPath();
      ctx.arc(base.x, base.y, baseRadius, 0, Math.PI * 2);
      ctx.fill();

      // Draw border
      ctx.strokeStyle = `rgba(${r},${g},${b},0.4)`;
      ctx.lineWidth = 4 / (ctx.getTransform().a || 1);
      ctx.beginPath();
      ctx.arc(base.x, base.y, baseRadius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawShapes(world: ECWorld, _camera: Camera): void {
    const ctx = this.ctx;
    const ids = world.query(C.Position, C.Shape);
    for (const id of ids) {
      const pos = world.getComponent<PositionComponent>(id, C.Position)!;
      const shape = world.getComponent<ShapeComponent>(id, C.Shape)!;
      const isAlpha = world.hasComponent(id, ALPHA);
      const cfg = CONFIG.shapes[shape.kind];
      const r = shape.radius;
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.rotate(shape.rotation);
      // Alpha pentagon uses a distinct dark blue/purple color
      ctx.fillStyle = isAlpha ? "#404080" : cfg.color;
      ctx.strokeStyle = isAlpha ? "#202040" : cfg.outline;
      ctx.lineWidth = isAlpha ? 5 : 3;
      ctx.beginPath();
      if (shape.kind === "square") {
        ctx.rect(-r, -r, r * 2, r * 2);
      } else if (shape.kind === "triangle") {
        const a1 = -Math.PI / 2;
        ctx.moveTo(Math.cos(a1) * r, Math.sin(a1) * r);
        ctx.lineTo(Math.cos(a1 + (2 * Math.PI) / 3) * r, Math.sin(a1 + (2 * Math.PI) / 3) * r);
        ctx.lineTo(Math.cos(a1 + (4 * Math.PI) / 3) * r, Math.sin(a1 + (4 * Math.PI) / 3) * r);
        ctx.closePath();
      } else {
        // pentagon
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
          const px = Math.cos(a) * r;
          const py = Math.sin(a) * r;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
      }
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // HP bar if damaged
      if (shape.hp < shape.maxHp) {
        const barW = r * 2;
        const barH = isAlpha ? 10 : 6;
        const bx = pos.x - barW / 2;
        const by = pos.y - r - 12;
        ctx.fillStyle = CONFIG.colors.hpBarBg;
        ctx.fillRect(bx, by, barW, barH);
        ctx.fillStyle = CONFIG.colors.hpBarFg;
        ctx.fillRect(bx, by, barW * (shape.hp / shape.maxHp), barH);
      }
    }
  }

  private drawBullets(world: ECWorld, _camera: Camera): void {
    const ctx = this.ctx;
    const ids = world.query(C.Position, C.Bullet);
    for (const id of ids) {
      const pos = world.getComponent<PositionComponent>(id, C.Position)!;
      const bullet = world.getComponent<BulletComponent>(id, C.Bullet)!;
      ctx.fillStyle = CONFIG.colors.bullet;
      ctx.strokeStyle = CONFIG.colors.bulletOutline;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, bullet.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  private drawParticles(world: ECWorld, _camera: Camera): void {
    const ctx = this.ctx;
    const ids = world.query(C.Position, C.Particle);
    for (const id of ids) {
      const pos = world.getComponent<PositionComponent>(id, C.Position)!;
      const p = world.getComponent<ParticleComponent>(id, C.Particle)!;
      const alpha = p.life / p.maxLife;
      const sprite = this.getOrbSprite(p.size);
      ctx.save();
      ctx.globalAlpha = alpha;
      if (sprite) {
        const s = p.radius * 2;
        ctx.drawImage(sprite, pos.x - p.radius, pos.y - p.radius, s, s);
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /** Draw all tanks (player + bots) with multi-barrel support. */
  private drawAllTanks(world: ECWorld, playerId: EntityId | null): void {
    const ctx = this.ctx;
    const tankIds = world.query(C.Position, C.Tank);
    for (const id of tankIds) {
      const pos = world.getComponent<PositionComponent>(id, C.Position)!;
      const tank = world.getComponent<TankComponent>(id, C.Tank)!;
      const isBot = world.hasComponent(id, BOT);
      const isPlayer = id === playerId;

      // Determine colors — team color takes priority, then bot color, then default
      let bodyColor = CONFIG.colors.tankBody;
      let outlineColor = CONFIG.colors.tankOutline;
      const team = world.getComponent<TeamComponent>(id, C.Team);
      if (team && team.id >= 0) {
        // Team mode: use team color
        bodyColor = CONFIG.teams.colors[team.id] || CONFIG.colors.tankBody;
        outlineColor = bodyColor;
      } else if (isBot) {
        const ai = world.getComponent<BotAIComponent>(id, BOT_AI);
        if (ai) {
          bodyColor = ai.color;
          outlineColor = ai.color;
        }
      }

      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.rotate(pos.angle);

      // Draw barrels (multi-barrel support via TankClasses)
      const barrels = getBarrels(tank.classId, tank.barrelLength, tank.barrelWidth);
      ctx.fillStyle = CONFIG.colors.tankBarrel;
      ctx.strokeStyle = CONFIG.colors.tankBarrelOutline;
      ctx.lineWidth = 3;
      for (const barrel of barrels) {
        ctx.save();
        ctx.rotate(barrel.angle);
        ctx.beginPath();
        ctx.rect(0, -barrel.width / 2, barrel.length, barrel.width);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // Body
      ctx.fillStyle = bodyColor;
      ctx.strokeStyle = outlineColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, tank.bodyRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.restore();

      // HP bar above tank
      if (tank.hp < tank.maxHp) {
        const barW = tank.bodyRadius * 2;
        const barH = 8;
        const bx = pos.x - barW / 2;
        const by = pos.y - tank.bodyRadius - 14;
        ctx.fillStyle = CONFIG.colors.hpBarBg;
        ctx.fillRect(bx, by, barW, barH);
        ctx.fillStyle = CONFIG.colors.hpBarFg;
        ctx.fillRect(bx, by, barW * (tank.hp / tank.maxHp), barH);
      }

      // Bot name label
      if (isBot) {
        const ai = world.getComponent<BotAIComponent>(id, BOT_AI);
        if (ai) {
          ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
          ctx.font = "bold 14px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(ai.name, pos.x, pos.y - tank.bodyRadius - 22);
        }
      }

      // Player label
      if (isPlayer) {
        ctx.fillStyle = "rgba(0, 100, 150, 0.8)";
        ctx.font = "bold 14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("You", pos.x, pos.y - tank.bodyRadius - 22);
      }

      // Invuln glow
      if (tank.invuln > 0) {
        ctx.save();
        ctx.globalAlpha = 0.3 + 0.2 * Math.sin(performance.now() / 80);
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, tank.bodyRadius + 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }
}
