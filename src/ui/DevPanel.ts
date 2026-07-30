/** Dev panel: tuning sliders that write to a live DEV object.
 *
 * Toggled with the backtick key. Values are applied each frame via
 * applyDevValues(), which copies overrides onto CONFIG (mirrors undergrowth's
 * applyDevValues pattern). Persisted to localStorage so tuning survives reloads.
 */

import type { Game } from "../game/Game";
import { CONFIG } from "../config";

interface DevOverrides {
  worldHalf: number | null;
  tankSpeed: number | null;
  squareCount: number | null;
  triangleCount: number | null;
  pentagonCount: number | null;
  xpFactor: number | null;
  bulletDamage: number | null;
  bulletSpeed: number | null;
}

const DEV_KEY = "orb_collector_tanks_dev";

interface SliderDef {
  key: keyof DevOverrides;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

const SLIDERS: SliderDef[] = [
  { key: "worldHalf", label: "World Half", min: 800, max: 6000, step: 100, default: CONFIG.worldHalf },
  { key: "tankSpeed", label: "Tank Speed", min: 50, max: 600, step: 10, default: CONFIG.tank.baseSpeed },
  { key: "squareCount", label: "Squares", min: 0, max: 100, step: 1, default: CONFIG.shapes.square.targetCount },
  { key: "triangleCount", label: "Triangles", min: 0, max: 50, step: 1, default: CONFIG.shapes.triangle.targetCount },
  { key: "pentagonCount", label: "Pentagons", min: 0, max: 30, step: 1, default: CONFIG.shapes.pentagon.targetCount },
  { key: "xpFactor", label: "XP Factor", min: 10, max: 200, step: 5, default: CONFIG.xpFactor },
  { key: "bulletDamage", label: "Bullet Dmg", min: 2, max: 60, step: 1, default: CONFIG.bullet.baseDamage },
  { key: "bulletSpeed", label: "Bullet Spd", min: 200, max: 1200, step: 20, default: CONFIG.bullet.baseSpeed },
];

export class DevPanel {
  private root: HTMLElement;
  private dev: DevOverrides = {
    worldHalf: null,
    tankSpeed: null,
    squareCount: null,
    triangleCount: null,
    pentagonCount: null,
    xpFactor: null,
    bulletDamage: null,
    bulletSpeed: null,
  };
  private valEls: Record<string, HTMLElement> = {};

  constructor(_game: Game) {
    this.root = document.getElementById("devPanel")!;
    this.load();
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(DEV_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<DevOverrides>;
        this.dev = { ...this.dev, ...parsed };
      }
    } catch {
      // Ignore
    }
  }

  private save(): void {
    try {
      localStorage.setItem(DEV_KEY, JSON.stringify(this.dev));
    } catch {
      // Ignore
    }
  }

  init(): void {
    this.build();
  }

  toggle(): void {
    this.root.classList.toggle("hidden");
  }

  private build(): void {
    this.root.innerHTML = "";
    const h = document.createElement("h3");
    h.textContent = "Dev Panel (backtick to toggle)";
    this.root.appendChild(h);

    for (const def of SLIDERS) {
      const row = document.createElement("div");
      row.className = "dev-row";

      const label = document.createElement("label");
      label.textContent = def.label;

      const slider = document.createElement("input");
      slider.type = "range";
      slider.min = String(def.min);
      slider.max = String(def.max);
      slider.step = String(def.step);
      const currentVal = this.dev[def.key];
      slider.value = String(currentVal ?? def.default);

      const val = document.createElement("span");
      val.className = "dev-val";
      val.textContent = slider.value;
      this.valEls[def.key] = val;

      slider.addEventListener("input", () => {
        const v = parseFloat(slider.value);
        this.dev[def.key] = v;
        val.textContent = slider.value;
        this.save();
      });

      // Double-click label to reset to default (null = use CONFIG)
      label.addEventListener("dblclick", () => {
        this.dev[def.key] = null;
        slider.value = String(def.default);
        val.textContent = String(def.default);
        this.save();
      });

      row.appendChild(label);
      row.appendChild(slider);
      row.appendChild(val);
      this.root.appendChild(row);
    }
  }

  /** Copy dev overrides onto CONFIG each frame. */
  applyDevValues(): void {
    if (this.dev.worldHalf !== null) CONFIG.worldHalf = this.dev.worldHalf;
    if (this.dev.tankSpeed !== null) CONFIG.tank.baseSpeed = this.dev.tankSpeed;
    if (this.dev.squareCount !== null) CONFIG.shapes.square.targetCount = this.dev.squareCount;
    if (this.dev.triangleCount !== null) CONFIG.shapes.triangle.targetCount = this.dev.triangleCount;
    if (this.dev.pentagonCount !== null) CONFIG.shapes.pentagon.targetCount = this.dev.pentagonCount;
    if (this.dev.xpFactor !== null) CONFIG.xpFactor = this.dev.xpFactor;
    if (this.dev.bulletDamage !== null) CONFIG.bullet.baseDamage = this.dev.bulletDamage;
    if (this.dev.bulletSpeed !== null) CONFIG.bullet.baseSpeed = this.dev.bulletSpeed;
  }
}
