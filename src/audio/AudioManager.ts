/** Audio manager: lazy-loads and plays sound effects, gated by mute setting.
 *
 * Sounds are loaded on first play from /Audio/... and cached. The mute setting
 * is read from Storage; when muted, play() is a no-op.
 */

import type { Storage } from "../game/Storage";

type SoundName = "shoot" | "hit" | "pickup" | "levelup" | "death";

const SOUND_PATHS: Record<SoundName, string> = {
  shoot: "/Audio/weapons/fire.ogg",
  hit: "/Audio/enemy/hurt.ogg",
  pickup: "/Audio/orb/OrbPickUpSound.ogg",
  levelup: "/Audio/ui/minigame-pass.ogg",
  death: "/Audio/player/Player_Death.ogg",
};

export class AudioManager {
  private storage: Storage;
  private cache: Partial<Record<SoundName, HTMLAudioElement>> = {};
  /** Throttle: minimum ms between plays of the same sound. */
  private lastPlay: Record<string, number> = {};
  private throttleMs = 60;

  constructor(storage: Storage) {
    this.storage = storage;
  }

  play(name: SoundName): void {
    if (this.storage.muted) return;
    const now = performance.now();
    const last = this.lastPlay[name] || 0;
    if (now - last < this.throttleMs) return;
    this.lastPlay[name] = now;

    let el = this.cache[name];
    if (!el) {
      const path = SOUND_PATHS[name];
      el = new Audio(path);
      el.volume = 0.3;
      this.cache[name] = el;
    }
    // Clone for overlapping playback
    const clone = el.cloneNode() as HTMLAudioElement;
    clone.volume = 0.3;
    clone.play().catch(() => {
      // Autoplay policy may block until first user interaction — ignore
    });
  }
}
