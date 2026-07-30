/** Top-10 leaderboard UI module.
 *
 * Renders a diep.io-style leaderboard in the top-right corner of the screen
 * (below the minimap). Lists tanks by score (XP), highlighting the local
 * player's entry. Fully self-contained: injects its own CSS and DOM.
 */

import type { ECWorld, EntityId } from "../ecs/World";
import type { TankComponent } from "../ecs/components";
import { C } from "../ecs/components";

/** Shape of the `bot_ai` component (added by the bot module). */
interface BotAIComponent {
  name: string;
  color: string;
}

export interface LeaderboardEntry {
  name: string;
  score: number;
  level: number;
  isPlayer: boolean;
  color: string;
}

const MAX_ENTRIES = 10;
const PLAYER_NAME = "You";
const PLAYER_COLOR = "#00b2e1";

/** Format a score: < 1000 raw, >= 1000 as "1.2k" (1 decimal, no trailing .0). */
function formatScore(score: number): string {
  if (score < 1000) return String(Math.floor(score));
  const k = score / 1000;
  // One decimal place, drop trailing ".0"
  const str = k.toFixed(1);
  return (str.endsWith(".0") ? str.slice(0, -2) : str) + "k";
}

/** Pad `name` with trailing spaces to reach `width` (monospace alignment). */
function padName(name: string, width: number): string {
  if (name.length >= width) return name.slice(0, width);
  return name + " ".repeat(width - name.length);
}

export class Leaderboard {
  private container: HTMLElement;
  private listEl: HTMLElement;

  constructor() {
    this.container = document.createElement("div");
    this.container.id = "leaderboard";
    this.container.className = "leaderboard hidden";

    const title = document.createElement("div");
    title.className = "lb-title";
    title.textContent = "Leaderboard";

    this.listEl = document.createElement("ol");
    this.listEl.className = "lb-list";

    this.container.appendChild(title);
    this.container.appendChild(this.listEl);
  }

  /** Create DOM elements, inject CSS, and append the leaderboard to the body. */
  init(): void {
    this.injectStyles();
    if (!document.getElementById("leaderboard")) {
      document.body.appendChild(this.container);
    }
  }

  /** Show the leaderboard. */
  show(): void {
    this.container.classList.remove("hidden");
  }

  /** Hide the leaderboard. */
  hide(): void {
    this.container.classList.add("hidden");
  }

  /** Refresh the leaderboard contents from live game state. */
  update(world: ECWorld, playerId: EntityId | null): void {
    const entries = this.collectEntries(world, playerId);
    entries.sort((a, b) => b.score - a.score);
    const top = entries.slice(0, MAX_ENTRIES);
    this.render(top);
  }

  /** Gather leaderboard entries for every tank entity in the world. */
  private collectEntries(world: ECWorld, playerId: EntityId | null): LeaderboardEntry[] {
    const tankIds = world.query(C.Tank);
    const entries: LeaderboardEntry[] = [];

    for (const id of tankIds) {
      const tank = world.getComponent<TankComponent>(id, C.Tank);
      if (!tank) continue;

      const isPlayer = playerId !== null && id === playerId;
      if (isPlayer) {
        entries.push({
          name: PLAYER_NAME,
          score: tank.xp,
          level: tank.level,
          isPlayer: true,
          color: PLAYER_COLOR,
        });
        continue;
      }

      // Bot tank: pull name/color from the "bot_ai" component.
      if (world.hasComponent(id, "bot")) {
        const ai = world.getComponent<BotAIComponent>(id, "bot_ai");
        entries.push({
          name: ai?.name ?? "Bot",
          score: tank.xp,
          level: tank.level,
          isPlayer: false,
          color: ai?.color ?? "#999999",
        });
      }
    }

    return entries;
  }

  /** Render the top entries into the list element. */
  private render(entries: LeaderboardEntry[]): void {
    // Clear previous contents.
    while (this.listEl.firstChild) {
      this.listEl.removeChild(this.listEl.firstChild);
    }

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const rank = i + 1;
      const li = document.createElement("li");
      li.className = "lb-row" + (entry.isPlayer ? " lb-self" : "");

      const rankSpan = document.createElement("span");
      rankSpan.className = "lb-rank";
      rankSpan.textContent = `${rank}.`;

      const nameSpan = document.createElement("span");
      nameSpan.className = "lb-name";
      nameSpan.textContent = padName(entry.name, 8);

      const scoreSpan = document.createElement("span");
      scoreSpan.className = "lb-score";
      scoreSpan.textContent = formatScore(entry.score);

      li.appendChild(rankSpan);
      li.appendChild(nameSpan);
      li.appendChild(scoreSpan);
      this.listEl.appendChild(li);
    }
  }

  /** Inject the leaderboard stylesheet once into the document head. */
  private injectStyles(): void {
    if (document.getElementById("lb-styles")) return;

    const style = document.createElement("style");
    style.id = "lb-styles";
    style.textContent = `
.leaderboard {
  position: fixed;
  top: 190px;
  right: 16px;
  width: 160px;
  padding: 6px 8px;
  background: rgba(0, 0, 0, 0.55);
  border: 2px solid rgba(0, 178, 225, 0.35);
  border-radius: 6px;
  color: #ffffff;
  font-family: "Courier New", Consolas, monospace;
  font-size: 12px;
  line-height: 1.35;
  pointer-events: none;
  user-select: none;
  z-index: 50;
  box-sizing: border-box;
}
.leaderboard.hidden {
  display: none;
}
.lb-title {
  text-align: center;
  font-weight: bold;
  font-size: 12px;
  letter-spacing: 0.5px;
  padding-bottom: 4px;
  margin-bottom: 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  color: #00b2e1;
}
.lb-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.lb-row {
  display: flex;
  align-items: center;
  white-space: pre;
  padding: 1px 2px;
  border-radius: 3px;
}
.lb-row.lb-self {
  font-weight: bold;
  background: rgba(0, 178, 225, 0.22);
}
.lb-rank {
  width: 20px;
  flex: 0 0 auto;
  color: #b0b0b0;
}
.lb-name {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lb-score {
  flex: 0 0 auto;
  text-align: right;
  color: #ffd966;
}
.lb-row.lb-self .lb-score {
  color: #ffe699;
}
`;
    document.head.appendChild(style);
  }
}
