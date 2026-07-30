/** localStorage-backed settings persistence. */

const KEY = "orb_collector_tanks_settings";

export interface Settings {
  muted: boolean;
  highScore: number;
  coins: number;
  totalGames: number;
  totalKills: number;
}

const DEFAULTS: Settings = {
  muted: false,
  highScore: 0,
  coins: 0,
  totalGames: 0,
  totalKills: 0,
};

export class Storage {
  private settings: Settings = { ...DEFAULTS };

  constructor() {
    this.load();
  }

  load(): void {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Settings>;
        this.settings = { ...DEFAULTS, ...parsed };
      }
    } catch {
      // Ignore parse errors — use defaults
    }
  }

  save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.settings));
    } catch {
      // Ignore write errors (private mode, etc.)
    }
  }

  get muted(): boolean {
    return this.settings.muted;
  }

  setMuted(v: boolean): void {
    this.settings.muted = v;
    this.save();
  }

  get highScore(): number {
    return this.settings.highScore;
  }

  setHighScore(v: number): void {
    if (v > this.settings.highScore) {
      this.settings.highScore = v;
      this.save();
    }
  }

  get coins(): number {
    return this.settings.coins;
  }

  addCoins(v: number): void {
    this.settings.coins += v;
    this.save();
  }

  get totalGames(): number {
    return this.settings.totalGames;
  }

  incrementGames(): void {
    this.settings.totalGames += 1;
    this.save();
  }

  get totalKills(): number {
    return this.settings.totalKills;
  }

  addKill(): void {
    this.settings.totalKills += 1;
    this.save();
  }
}
