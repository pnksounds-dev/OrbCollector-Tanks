/** In-game HUD: bottom score/level/XP bar, left stat panel, class upgrades.
 *
 * DOM-based overlay. Updated each frame from the live player tank component.
 * The stat panel rows are clickable and also respond to number keys 1–8
 * (handled via Input.statSpend in Game).
 *
 * Phase 2: class upgrade panel appears when the player reaches level 15/30/45
 * and has available class upgrades. Clicking a class button upgrades the tank.
 */

import type { Game } from "../game/Game";
import { C, type TankComponent } from "../ecs/components";
import { STAT_NAMES, STAT_MAX, type StatIndex } from "../types";
import { getAvailableUpgrades } from "../game/TankClasses";

export class HUD {
  private game: Game;
  private root: HTMLElement;
  private levelEl: HTMLElement;
  private xpFillEl: HTMLElement;
  private scoreEl: HTMLElement;
  private bestEl: HTMLElement;
  private statsEl: HTMLElement;
  private statRows: HTMLElement[] = [];
  private classPanel: HTMLElement;
  private lastShownUpgrades: string = "";

  constructor(game: Game) {
    this.game = game;
    this.root = document.getElementById("hud")!;
    this.levelEl = document.getElementById("hudLevel")!;
    this.xpFillEl = document.getElementById("hudXpFill")!;
    this.scoreEl = document.getElementById("hudScore")!;
    this.bestEl = document.getElementById("hudBest")!;
    this.statsEl = document.getElementById("hudStats")!;
    this.classPanel = document.createElement("div");
    this.classPanel.className = "class-panel hidden";
    this.injectClassPanelStyles();
  }

  init(): void {
    this.buildStatPanel();
    // Class panel positioned below the stat panel
    this.classPanel.style.position = "absolute";
    this.classPanel.style.bottom = "16px";
    this.classPanel.style.left = "16px";
    this.classPanel.style.pointerEvents = "auto";
    this.root.appendChild(this.classPanel);
  }

  show(): void {
    this.root.classList.remove("hidden");
    // Show best score if there is one
    if (this.game.storage.highScore > 0) {
      this.bestEl.classList.remove("hidden");
    } else {
      this.bestEl.classList.add("hidden");
    }
  }

  hide(): void {
    this.root.classList.add("hidden");
  }

  private injectClassPanelStyles(): void {
    if (document.getElementById("hud-class-styles")) return;
    const style = document.createElement("style");
    style.id = "hud-class-styles";
    style.textContent = `
      .class-panel {
        background: rgba(255, 255, 255, 0.92);
        border: 1px solid #555;
        border-radius: 8px;
        padding: 10px 12px;
        max-width: 240px;
        z-index: 11;
      }
      .class-panel.hidden { display: none !important; }
      .class-panel-title {
        font-size: 13px;
        font-weight: 700;
        margin-bottom: 8px;
        color: #333;
      }
      .class-btn {
        display: block;
        width: 100%;
        padding: 8px 10px;
        margin-bottom: 4px;
        font-size: 13px;
        font-weight: 600;
        border: 1px solid #555;
        border-radius: 5px;
        background: #00b2e1;
        color: #fff;
        cursor: pointer;
        text-align: left;
      }
      .class-btn:hover { background: #0099cc; }
      .class-btn .class-desc {
        display: block;
        font-size: 11px;
        font-weight: 400;
        opacity: 0.85;
        margin-top: 2px;
      }
    `;
    document.head.appendChild(style);
  }

  private buildStatPanel(): void {
    this.statsEl.innerHTML = "";
    this.statRows = [];
    for (let i = 0; i < STAT_NAMES.length; i++) {
      const row = document.createElement("div");
      row.className = "stat-row";
      row.dataset.stat = String(i);

      const key = document.createElement("span");
      key.className = "stat-key";
      key.textContent = String(i + 1);

      const label = document.createElement("span");
      label.className = "stat-label";
      label.textContent = STAT_NAMES[i];

      const pips = document.createElement("span");
      pips.className = "stat-pips";
      for (let p = 0; p < STAT_MAX; p++) {
        const pip = document.createElement("span");
        pip.className = "stat-pip";
        pips.appendChild(pip);
      }

      row.appendChild(key);
      row.appendChild(label);
      row.appendChild(pips);

      row.addEventListener("click", () => {
        if (this.game.playerId !== null) {
          this.game.level.spendStat(
            this.game.world,
            this.game.playerId,
            i as StatIndex,
          );
        }
      });

      this.statsEl.appendChild(row);
      this.statRows.push(row);
    }
  }

  /** Called each frame from Game.loop to sync the HUD with the live tank. */
  update(): void {
    if (this.game.playerId === null) return;
    const tank = this.game.world.getComponent<TankComponent>(
      this.game.playerId,
      C.Tank,
    );
    if (!tank) return;

    this.levelEl.textContent = "L" + tank.level;
    this.scoreEl.textContent = String(Math.floor(tank.xp));
    this.bestEl.textContent = "Best: " + this.game.storage.highScore;

    // XP bar: progress toward next level
    const needed = this.game.level.xpForNextLevel(tank.level);
    const pct = Math.min(100, (tank.xp / needed) * 100);
    this.xpFillEl.style.width = pct + "%";

    // Stat pips
    for (let i = 0; i < this.statRows.length; i++) {
      const pips = this.statRows[i].querySelectorAll(".stat-pip");
      const spent = tank.stats[i];
      for (let p = 0; p < pips.length; p++) {
        if (p < spent) {
          pips[p].classList.add("filled");
        } else {
          pips[p].classList.remove("filled");
        }
      }
      // Dim row if no points to spend or stat maxed
      if (tank.statPoints <= 0 || spent >= STAT_MAX) {
        this.statRows[i].style.opacity = "0.5";
      } else {
        this.statRows[i].style.opacity = "1";
      }
    }

    // Class upgrade panel
    this.updateClassPanel(tank);
  }

  private updateClassPanel(tank: TankComponent): void {
    const available = getAvailableUpgrades(tank.classId, tank.level);
    const upgradeKey = available.map((c) => c.id).join(",");

    if (available.length === 0) {
      this.classPanel.classList.add("hidden");
      this.lastShownUpgrades = "";
      return;
    }

    // Only rebuild the panel if the available upgrades changed
    if (upgradeKey === this.lastShownUpgrades) return;
    this.lastShownUpgrades = upgradeKey;

    this.classPanel.classList.remove("hidden");
    this.classPanel.innerHTML = "";

    const title = document.createElement("div");
    title.className = "class-panel-title";
    title.textContent = "Upgrade your tank:";
    this.classPanel.appendChild(title);

    for (const cls of available) {
      const btn = document.createElement("button");
      btn.className = "class-btn";
      btn.textContent = cls.name;
      const desc = document.createElement("span");
      desc.className = "class-desc";
      desc.textContent = cls.description;
      btn.appendChild(desc);
      btn.addEventListener("click", () => {
        this.game.upgradeClass(cls.id);
        // Force a refresh next frame
        this.lastShownUpgrades = "";
      });
      this.classPanel.appendChild(btn);
    }
  }
}
