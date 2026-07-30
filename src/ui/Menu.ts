/** Menu: death screen with score/level display and respawn / main menu buttons. */

import type { Game } from "../game/Game";

export class Menu {
  private game: Game;
  private deathScreen: HTMLElement;
  private deathScoreEl: HTMLElement;
  private deathLevelEl: HTMLElement;
  private respawnBtn: HTMLElement;
  private toMenuBtn: HTMLElement;

  constructor(game: Game) {
    this.game = game;
    this.deathScreen = document.getElementById("deathScreen")!;
    this.deathScoreEl = document.getElementById("deathScore")!;
    this.deathLevelEl = document.getElementById("deathLevel")!;
    this.respawnBtn = document.getElementById("respawnBtn")!;
    this.toMenuBtn = document.getElementById("toMenuBtn")!;
  }

  init(): void {
    this.respawnBtn.addEventListener("click", () => {
      this.game.respawn();
    });
    this.toMenuBtn.addEventListener("click", () => {
      this.hideDeath();
      this.game.toMenu();
    });
  }

  showDeath(score: number, level: number): void {
    this.deathScoreEl.textContent = String(score);
    this.deathLevelEl.textContent = String(level);
    this.deathScreen.classList.remove("hidden");
  }

  hideDeath(): void {
    this.deathScreen.classList.add("hidden");
  }
}
