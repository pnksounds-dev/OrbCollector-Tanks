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
  type EffectComponent,
} from "../ecs/components";
import { BOT, BOT_AI, type BotAIComponent } from "../systems/BotAISystem";
import type { TeamComponent } from "../ecs/components";
import { ALPHA } from "../game/AlphaPentagon";
import { getBarrels } from "../game/TankClasses";

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private orbSprites: Record<string, HTMLImageElement> = {};
  private fxSprites: Record<string, HTMLImageElement> = {};

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
    this.loadSprites();
    this.loadFxSprites();
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

  private loadFxSprites(): void {
    const fxList: { folder: string; name: string }[] = [
      { folder: "explosion", name: "Explosion" },
      { folder: "explosion", name: "Explosion2" },
      { folder: "explosion", name: "small" },
      { folder: "explosion", name: "Debris1" },
      { folder: "explosion", name: "Debris2" },
      { folder: "explosion", name: "Debris3" },
      { folder: "blood", name: "blood_drip1" },
      { folder: "blood", name: "blood_drip2" },
      { folder: "blood", name: "blood_drip3" },
      { folder: "blood", name: "blood_drip4" },
      { folder: "bullet_trail", name: "bulletTrail1" },
      { folder: "bullet_trail", name: "bulletTrail2" },
      { folder: "bullet_trail", name: "bulletTrail3" },
      { folder: "bullet_trail", name: "bulletTrail4" },
      { folder: "bullet_trail", name: "bulletTrail5" },
      { folder: "smoke", name: "smoke1" },
      { folder: "smoke", name: "smoke2" },
      { folder: "smoke", name: "smoke3" },
      { folder: "smoke", name: "smoke4" },
      { folder: "smoke", name: "smoke5" },
      { folder: "smoke", name: "smoke6" },
      { folder: "smoke", name: "smoke7" },
      { folder: "smoke", name: "smoke8" },
      { folder: "smoke", name: "smoke9" },
      { folder: "shield", name: "ShieldDamageEffect" },
      { folder: "phaser", name: "PhaserHit1" },
      { folder: "phaser", name: "PhaserHit2" },
      { folder: "phaser", name: "PhaserHit3" },
      { folder: "phaser", name: "PhaserHit4" },
      { folder: "phaser", name: "PhaserHit5" },
      { folder: "shipengine", name: "Trail1" },
      { folder: "shipengine", name: "Trail2" },
      { folder: "shipengine", name: "Trail3" },
      { folder: "shipengine", name: "Trail4" },
      { folder: "shipengine", name: "Trail5" },
      { folder: "water", name: "WaterDroplet1" },
    ];
    for (const fx of fxList) {
      const img = new Image();
      img.src = `/FX/${fx.folder}/${fx.name}.png`;
      this.fxSprites[fx.name] = img;
    }
  }

  getFxSprite(name: string): HTMLImageElement | null {
    const img = this.fxSprites[name];
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
    this.drawEffects(world, camera);

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

  /** Draw team base zones — semi-transparent colored rectangles spanning edge-to-edge.
   *  2 teams: full-width top and bottom bands. 4 teams: four corner quadrants. */
  private drawTeamBases(teamCount: number): void {
    const ctx = this.ctx;
    const half = CONFIG.worldHalf;
    // Compute rectangle bounds per team (matches Game.getTeamBaseRect geometry)
    const bases: { minX: number; maxX: number; minY: number; maxY: number; color: string }[] = [];
    if (teamCount === 2) {
      const depth = CONFIG.teams.baseDepth2;
      bases.push({ minX: -half, maxX: half, minY: -half, maxY: -half + depth, color: CONFIG.teams.colors[0] });
      bases.push({ minX: -half, maxX: half, minY: half - depth, maxY: half, color: CONFIG.teams.colors[1] });
    } else if (teamCount === 4) {
      const depth = CONFIG.teams.baseDepth4;
      bases.push({ minX: -half, maxX: -half + depth, minY: -half, maxY: -half + depth, color: CONFIG.teams.colors[0] });
      bases.push({ minX: half - depth, maxX: half, minY: -half, maxY: -half + depth, color: CONFIG.teams.colors[1] });
      bases.push({ minX: -half, maxX: -half + depth, minY: half - depth, maxY: half, color: CONFIG.teams.colors[2] });
      bases.push({ minX: half - depth, maxX: half, minY: half - depth, maxY: half, color: CONFIG.teams.colors[3] });
    }

    for (const base of bases) {
      // Parse hex color to rgba
      const hex = base.color.replace("#", "");
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);

      const w = base.maxX - base.minX;
      const h = base.maxY - base.minY;

      // Fill the base zone
      ctx.fillStyle = `rgba(${r},${g},${b},0.12)`;
      ctx.fillRect(base.minX, base.minY, w, h);

      // Draw border (inner edge only — the edge facing the arena center)
      ctx.strokeStyle = `rgba(${r},${g},${b},0.5)`;
      ctx.lineWidth = 4 / (ctx.getTransform().a || 1);
      ctx.beginPath();
      if (teamCount === 2) {
        // Draw the inner horizontal edge
        const innerY = base.minY < 0 ? base.maxY : base.minY;
        ctx.moveTo(base.minX, innerY);
        ctx.lineTo(base.maxX, innerY);
      } else {
        // Draw the two inner edges (facing center)
        if (base.maxX < 0) {
          ctx.moveTo(base.maxX, base.minY);
          ctx.lineTo(base.maxX, base.maxY);
        } else {
          ctx.moveTo(base.minX, base.minY);
          ctx.lineTo(base.minX, base.maxY);
        }
        if (base.maxY < 0) {
          ctx.moveTo(base.minX, base.maxY);
          ctx.lineTo(base.maxX, base.maxY);
        } else {
          ctx.moveTo(base.minX, base.minY);
          ctx.lineTo(base.maxX, base.minY);
        }
      }
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

      // HP bar + shield bar above tank
      if (tank.hp < tank.maxHp || tank.shield < tank.maxShield) {
        const barW = tank.bodyRadius * 2;
        const barH = 8;
        const bx = pos.x - barW / 2;
        // Shield bar (blue) above HP bar (green)
        const shieldBy = pos.y - tank.bodyRadius - 14;
        const hpBy = shieldBy - barH - 2;
        // Shield bar
        if (tank.shield < tank.maxShield) {
          ctx.fillStyle = CONFIG.colors.hpBarBg;
          ctx.fillRect(bx, shieldBy, barW, barH);
          ctx.fillStyle = CONFIG.colors.shieldBarFg;
          ctx.fillRect(bx, shieldBy, barW * (tank.shield / tank.maxShield), barH);
        }
        // HP bar
        if (tank.hp < tank.maxHp) {
          ctx.fillStyle = CONFIG.colors.hpBarBg;
          ctx.fillRect(bx, hpBy, barW, barH);
          ctx.fillStyle = CONFIG.colors.hpBarFg;
          ctx.fillRect(bx, hpBy, barW * (tank.hp / tank.maxHp), barH);
        }
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

      // Invuln glow (white ring only — no shield sprite during spawn invuln)
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

      // Shield damage flash — only show shield sprite when shield is actively absorbing damage
      if (tank.shieldFlash > 0 && tank.shield > 0) {
        const shieldSprite = this.getFxSprite("ShieldDamageEffect");
        if (shieldSprite) {
          const flashAlpha = tank.shieldFlash / 0.3; // fade out over 300ms
          const pulse = 1 + 0.1 * Math.sin(performance.now() / 50);
          const r = (tank.bodyRadius + 8) * pulse;
          const s = r * 2;
          ctx.save();
          ctx.globalAlpha = flashAlpha * 0.7;
          ctx.drawImage(shieldSprite, pos.x - r, pos.y - r, s, s);
          ctx.restore();
        }
      }
    }
  }

  private drawEffects(world: ECWorld, camera: Camera): void {
    const ctx = this.ctx;
    const scale = camera.effectiveScale;
    const halfW = camera.viewW / (2 * scale);
    const halfH = camera.viewH / (2 * scale);
    const left = camera.cx - halfW;
    const right = camera.cx + halfW;
    const top = camera.cy - halfH;
    const bottom = camera.cy + halfH;

    const ids = world.query(C.Position, C.Effect);
    for (const id of ids) {
      const pos = world.getComponent<PositionComponent>(id, C.Position)!;
      const fx = world.getComponent<EffectComponent>(id, C.Effect)!;

      // Cull off-screen effects
      const maxDim = Math.max(fx.scale * 128, 128);
      if (
        pos.x < left - maxDim ||
        pos.x > right + maxDim ||
        pos.y < top - maxDim ||
        pos.y > bottom + maxDim
      ) {
        continue;
      }

      const sprite = this.getFxSprite(fx.sprite);
      if (!sprite) continue;

      const lifeRatio = fx.life / fx.maxLife;
      const alpha = fx.fadeOut ? lifeRatio : 1;
      const drawScale = fx.growOut
        ? fx.scale * (1 + (1 - lifeRatio) * 2)
        : fx.scale;

      const w = sprite.naturalWidth * drawScale;
      const h = sprite.naturalHeight * drawScale;

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.translate(pos.x, pos.y);
      ctx.rotate(fx.rotation);
      ctx.drawImage(sprite, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
  }
}
