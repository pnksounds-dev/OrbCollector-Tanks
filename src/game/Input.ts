/** Mouse + keyboard input for the tank game.
 *
 * Tracks: mouse screen position, mouse-down (fire), WASD key state, Space
 * (fire), wheel zoom, and the backtick key (dev panel toggle). A reference to
 * the Camera is set after construction so mouse position can be converted to
 * world coordinates.
 */

import type { Camera } from "./Camera";

export const Input = {
  mouse: { x: 0, y: 0 },
  world: { x: 0, y: 0 },
  /** Fire trigger (left mouse or Space). */
  fire: false,
  /** Auto-fire toggle (E key). When true, tank fires continuously. */
  autoFire: false,
  /** Auto-spin toggle (C key). When true, barrel rotates at 60°/sec. */
  autoSpin: false,
  /** Secondary fire/special (Shift or right mouse). */
  secondary: false,
  /** Enter key edge (set on keydown, cleared by Game after handling). */
  enterPressed: false,
  /** Movement keys held. */
  up: false,
  down: false,
  left: false,
  right: false,
  /** Dev panel toggle edge (set on keydown, cleared by Game after handling). */
  devToggle: false,
  /** Stat-spend edge: 1–8 keys. Set on keydown, cleared by Game after handling. */
  statSpend: -1,
  camera: null as Camera | null,
  _initialized: false,

  init(): void {
    if (this._initialized) return;
    this._initialized = true;

    window.addEventListener("mousemove", (e) => {
      if (isDevUI(e.target)) return;
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });

    window.addEventListener("mousedown", (e) => {
      if (isDevUI(e.target)) return;
      if (e.button === 0) this.fire = true;
      if (e.button === 2) this.secondary = true;
    });

    window.addEventListener("mouseup", (e) => {
      if (isDevUI(e.target)) return;
      if (e.button === 0) this.fire = false;
      if (e.button === 2) this.secondary = false;
    });

    window.addEventListener("contextmenu", (e) => {
      e.preventDefault();
    });

    window.addEventListener("keydown", (e) => {
      if (isDevUI(e.target)) return;
      switch (e.code) {
        case "KeyW":
        case "ArrowUp":
          this.up = true;
          break;
        case "KeyS":
        case "ArrowDown":
          this.down = true;
          break;
        case "KeyA":
        case "ArrowLeft":
          this.left = true;
          break;
        case "KeyD":
        case "ArrowRight":
          this.right = true;
          break;
        case "Space":
          this.fire = true;
          e.preventDefault();
          break;
        case "KeyE":
          this.autoFire = !this.autoFire;
          break;
        case "KeyC":
          this.autoSpin = !this.autoSpin;
          break;
        case "ShiftLeft":
        case "ShiftRight":
          this.secondary = true;
          break;
        case "Enter":
          this.enterPressed = true;
          break;
        case "Backquote":
          this.devToggle = true;
          break;
        case "Digit1":
        case "Digit2":
        case "Digit3":
        case "Digit4":
        case "Digit5":
        case "Digit6":
        case "Digit7":
        case "Digit8":
          this.statSpend = parseInt(e.code.slice(5), 10) - 1;
          break;
      }
    });

    window.addEventListener("keyup", (e) => {
      switch (e.code) {
        case "KeyW":
        case "ArrowUp":
          this.up = false;
          break;
        case "KeyS":
        case "ArrowDown":
          this.down = false;
          break;
        case "KeyA":
        case "ArrowLeft":
          this.left = false;
          break;
        case "KeyD":
        case "ArrowRight":
          this.right = false;
          break;
        case "Space":
          this.fire = false;
          break;
        case "ShiftLeft":
        case "ShiftRight":
          this.secondary = false;
          break;
      }
    });

    window.addEventListener("wheel", (e) => {
      if (!this.camera) return;
      if (e.deltaY < 0) this.camera.zoom(1);
      else if (e.deltaY > 0) this.camera.zoom(-1);
      e.preventDefault();
    }, { passive: false });
  },

  /** Update world-space mouse coords from the camera. Call each frame. */
  updateWorldMouse(): void {
    if (!this.camera) return;
    this.world.x = this.camera.toWorldX(this.mouse.x);
    this.world.y = this.camera.toWorldY(this.mouse.y);
  },

  /** Movement as a normalized vector [dx, dy]. */
  moveVector(): [number, number] {
    let dx = 0;
    let dy = 0;
    if (this.left) dx -= 1;
    if (this.right) dx += 1;
    if (this.up) dy -= 1;
    if (this.down) dy += 1;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      dx /= len;
      dy /= len;
    }
    return [dx, dy];
  },
};

function isDevUI(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.id === "devPanel" || target.closest(".dev-panel") !== null;
}
