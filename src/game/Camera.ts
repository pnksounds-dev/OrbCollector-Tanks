/** Smooth-follow camera with zoom. Converts world↔screen coordinates.
 *
 * follow(x, y) lerps the camera center toward the target. The scale (world units
 * per screen pixel) is set by zoom; wheel adjusts userZoom within bounds.
 */

import { CONFIG } from "../config";
import { clamp, lerp } from "../lib/math";

export class Camera {
  /** Camera center in world units. */
  cx = 0;
  cy = 0;
  /** World units per screen pixel (lower = more zoomed in). */
  scale: number;
  /** User zoom multiplier (adjusted by wheel). */
  userZoom = 1.0;
  /** Viewport width/height in screen pixels (CSS pixels). */
  viewW = window.innerWidth;
  viewH = window.innerHeight;

  constructor() {
    this.scale = CONFIG.baseScale;
  }

  follow(targetX: number, targetY: number): void {
    this.cx = lerp(this.cx, targetX, CONFIG.cameraLerp);
    this.cy = lerp(this.cy, targetY, CONFIG.cameraLerp);
  }

  /** Set viewport size (called on resize). */
  setViewport(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
  }

  zoom(dir: number): void {
    const step = CONFIG.zoomWheelStep;
    this.userZoom = clamp(
      dir > 0 ? this.userZoom * (1 + step) : this.userZoom / (1 + step),
      CONFIG.zoomMin,
      CONFIG.zoomMax,
    );
  }

  /** Effective scale = baseScale × userZoom. */
  get effectiveScale(): number {
    return CONFIG.baseScale * this.userZoom;
  }

  /** Convert world X to screen X. */
  toScreenX(worldX: number): number {
    return (worldX - this.cx) * this.effectiveScale + this.viewW / 2;
  }

  /** Convert world Y to screen Y. */
  toScreenY(worldY: number): number {
    return (worldY - this.cy) * this.effectiveScale + this.viewH / 2;
  }

  /** Convert screen X (CSS px) to world X. */
  toWorldX(screenX: number): number {
    return (screenX - this.viewW / 2) / this.effectiveScale + this.cx;
  }

  /** Convert screen Y (CSS px) to world Y. */
  toWorldY(screenY: number): number {
    return (screenY - this.viewH / 2) / this.effectiveScale + this.cy;
  }
}
