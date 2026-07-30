/** Menu: death screen with score/level/best/coins display and buttons. */

import type { Game } from "../game/Game";

export class Menu {
  private game: Game;
  private deathScreen: HTMLElement;
  private deathScoreEl: HTMLElement;
  private deathLevelEl: HTMLElement;
  private deathBestEl: HTMLElement;
  private deathCoinsEl: HTMLElement;
  private respawnBtn: HTMLElement;
  private toMenuBtn: HTMLElement;
  private autoRespawnCheck: HTMLInputElement;

  constructor(game: Game) {
    this.game = game;
    this.deathScreen = document.getElementById("deathScreen")!;
    this.deathScoreEl = document.getElementById("deathScore")!;
    this.deathLevelEl = document.getElementById("deathLevel")!;
    this.deathBestEl = document.getElementById("deathBest")!;
    this.deathCoinsEl = document.getElementById("deathCoins")!;
    this.respawnBtn = document.getElementById("respawnBtn")!;
    this.toMenuBtn = document.getElementById("toMenuBtn")!;
    this.autoRespawnCheck = document.getElementById("autoRespawnCheck") as HTMLInputElement;
  }

  init(): void {
    this.respawnBtn.addEventListener("click", () => {
      this.game.respawn();
    });
    this.toMenuBtn.addEventListener("click", () => {
      this.hideDeath();
      this.game.toMenu();
    });
    this.autoRespawnCheck.addEventListener("change", () => {
      this.game.autoRespawn = this.autoRespawnCheck.checked;
    });
  }

  showDeath(score: number, level: number): void {
    this.deathScoreEl.textContent = String(score);
    this.deathLevelEl.textContent = String(level);
    this.deathBestEl.textContent = String(this.game.storage.highScore);
    this.deathCoinsEl.textContent = String(this.game.storage.coins);
    // Sync checkbox with current auto-respawn state
    this.autoRespawnCheck.checked = this.game.autoRespawn;
    this.deathScreen.classList.remove("hidden");
  }

  hideDeath(): void {
    this.deathScreen.classList.add("hidden");
  }
}
