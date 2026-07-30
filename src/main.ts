/** Bootstrap: initialize the Game and start the loop. */

import { Game } from "./game/Game";

async function bootstrap(): Promise<void> {
  const canvas = document.getElementById("game") as HTMLCanvasElement | null;
  if (!canvas) {
    console.error("Canvas element #game not found.");
    return;
  }
  const game = new Game(canvas);
  (window as unknown as { __game: Game }).__game = game;
  await game.init();
}

bootstrap().catch((e) => {
  console.error("Failed to start Orb Collector: Tanks:", e);
});
