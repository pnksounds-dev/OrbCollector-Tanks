/** localStorage-backed settings persistence. */

const KEY = "orb_collector_tanks_settings";

export interface Settings {
  muted: boolean;
}

const DEFAULTS: Settings = {
  muted: false,
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
}
