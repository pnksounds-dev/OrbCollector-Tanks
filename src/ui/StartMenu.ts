/** StartMenu: main menu / start screen with left sidebar layout.
 *
 * Matches the Undergrowth menu layout: a full-height left sidebar with title,
 * nickname input, Play button, and a Settings button that opens a modal.
 * The center area shows the splash art. All DOM is built programmatically and
 * CSS is injected via a <style> tag — no changes to index.html or style.css.
 *
 * Uses a callback pattern (onPlay, onMuteToggle) so it never imports Game or
 * Storage directly. The onPlay callback receives the selected game mode.
 */

const STYLE_ID = "start-menu-styles";

import type { GameMode } from "../types";

const MENU_CSS = `
/* ---- CSS variables (match Undergrowth dark theme) ---- */
:root {
  --sm-panel: rgba(18, 24, 44, 0.92);
  --sm-panel-border: rgba(120, 160, 255, 0.25);
  --sm-accent: #4ea1ff;
  --sm-accent2: #9d6bff;
  --sm-text: #e8eeff;
  --sm-muted: #9aa6c8;
}

/* ---- Full-screen overlay ---- */
.sm-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Ubuntu,
    "Helvetica Neue", Arial, sans-serif;
  color: var(--sm-text);
  background: radial-gradient(ellipse at 60% 50%, rgba(20,30,60,0.15), rgba(5,8,18,0.55));
  opacity: 1;
  transition: opacity 0.25s ease;
  pointer-events: auto;
}
.sm-overlay.sm-hidden {
  opacity: 0;
  pointer-events: none;
}

/* ---- Splash art in center ---- */
.sm-splash {
  position: absolute;
  inset: 0;
  background-image: url("/splash/splash.png");
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  opacity: 0.35;
  z-index: 0;
}

/* ---- Left sidebar (full height, 260px) ---- */
.sm-sidebar {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 260px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  z-index: 22;
  background: var(--sm-panel);
  border-right: 1px solid var(--sm-panel-border);
  padding: 24px 20px;
  box-shadow: 0 16px 48px rgba(0,0,0,0.45);
  overflow-y: auto;
}

/* ---- Title ---- */
.sm-title-area {
  flex: 0 0 auto;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--sm-panel-border);
  margin-bottom: 4px;
}
.sm-title {
  margin: 0;
  font-size: 22px;
  line-height: 1.15;
  font-weight: 800;
  letter-spacing: 1px;
  color: var(--sm-text);
}
.sm-title-accent {
  display: block;
  font-size: 15px;
  font-weight: 700;
  color: var(--sm-accent);
  letter-spacing: 2px;
}

/* ---- Sidebar sections ---- */
.sm-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sm-section-bottom {
  margin-top: auto;
}

/* ---- Nickname input ---- */
.sm-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sm-field-label {
  font-size: 12px;
  color: var(--sm-muted);
  text-transform: uppercase;
  letter-spacing: 1px;
}
.sm-input {
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--sm-panel-border);
  background: rgba(255,255,255,0.06);
  color: var(--sm-text);
  font-size: 15px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s ease;
  box-sizing: border-box;
}
.sm-input:focus {
  border-color: var(--sm-accent);
}
.sm-input::placeholder {
  color: var(--sm-muted);
}

/* ---- Buttons ---- */
.sm-btn {
  width: 100%;
  padding: 12px 16px;
  border-radius: 10px;
  border: 1px solid var(--sm-panel-border);
  background: rgba(255,255,255,0.04);
  color: var(--sm-text);
  font-size: 15px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: transform 0.06s ease, background 0.15s ease, border-color 0.15s ease;
  box-sizing: border-box;
}
.sm-btn:hover {
  background: rgba(255,255,255,0.09);
  border-color: var(--sm-accent);
}
.sm-btn:active {
  transform: translateY(1px);
}
.sm-btn-primary {
  background: linear-gradient(120deg, var(--sm-accent), var(--sm-accent2));
  border-color: transparent;
  color: #fff;
  font-size: 18px;
  font-weight: 800;
  padding: 14px 16px;
  letter-spacing: 1px;
}
.sm-btn-primary:hover {
  filter: brightness(1.1);
  background: linear-gradient(120deg, var(--sm-accent), var(--sm-accent2));
  border-color: transparent;
}

/* ---- How-to-play collapsible ---- */
.sm-howto-toggle {
  background: none;
  border: none;
  color: var(--sm-muted);
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  padding: 6px 0;
  text-align: left;
  transition: color 0.12s ease;
}
.sm-howto-toggle:hover {
  color: var(--sm-text);
}
.sm-caret {
  display: inline-block;
  margin-left: 6px;
  transition: transform 0.18s ease;
}
.sm-howto-toggle.sm-open .sm-caret {
  transform: rotate(90deg);
}
.sm-howto {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.22s ease;
}
.sm-howto.sm-open {
  max-height: 300px;
}
.sm-howto-list {
  list-style: none;
  margin: 8px 0 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(255,255,255,0.04);
}
.sm-howto-list li {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 4px 0;
  font-size: 13px;
  color: var(--sm-text);
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.sm-howto-list li:last-child {
  border-bottom: none;
}
.sm-key {
  flex: 0 0 100px;
  font-weight: 700;
  color: var(--sm-accent);
  font-variant: small-caps;
}

/* ---- Footer ---- */
.sm-footer {
  font-size: 11px;
  color: var(--sm-muted);
  letter-spacing: 0.3px;
  text-align: center;
  padding-top: 8px;
}

/* ---- Settings modal ---- */
.sm-settings-overlay {
  position: fixed;
  inset: 0;
  z-index: 1010;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.6);
  opacity: 1;
  transition: opacity 0.2s ease;
}
.sm-settings-overlay.sm-hidden {
  opacity: 0;
  pointer-events: none;
}
.sm-settings-panel {
  width: min(420px, 90vw);
  padding: 28px 32px;
  border-radius: 16px;
  background: var(--sm-panel);
  border: 1px solid var(--sm-panel-border);
  box-shadow: 0 12px 40px rgba(0,0,0,0.5);
}
.sm-settings-title {
  margin: 0 0 6px;
  font-size: 24px;
  font-weight: 800;
  color: var(--sm-text);
}
.sm-settings-sub {
  margin: 0 0 20px;
  font-size: 14px;
  color: var(--sm-muted);
}
.sm-settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.sm-settings-row:last-of-type {
  border-bottom: none;
}
.sm-settings-label {
  font-size: 15px;
  font-weight: 600;
  color: var(--sm-text);
}
.sm-settings-desc {
  font-size: 12px;
  color: var(--sm-muted);
  margin-top: 2px;
}
.sm-settings-actions {
  display: flex;
  gap: 10px;
  margin-top: 20px;
}
.sm-settings-actions .sm-btn {
  flex: 1;
}
.sm-checkbox {
  width: 20px;
  height: 20px;
  accent-color: var(--sm-accent);
  cursor: pointer;
}
.sm-select {
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--sm-panel-border);
  background: rgba(255,255,255,0.06);
  color: var(--sm-text);
  font-size: 14px;
  font-family: inherit;
  cursor: pointer;
  outline: none;
}
.sm-select:focus {
  border-color: var(--sm-accent);
}
.sm-select option {
  background: #1a1f35;
  color: var(--sm-text);
}

/* ---- Game mode selector ---- */
.sm-mode-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sm-mode-label {
  font-size: 12px;
  color: var(--sm-muted);
  text-transform: uppercase;
  letter-spacing: 1px;
}
.sm-mode-buttons {
  display: flex;
  gap: 6px;
}
.sm-mode-btn {
  flex: 1;
  padding: 8px 6px;
  border-radius: 8px;
  border: 1px solid var(--sm-panel-border);
  background: rgba(255,255,255,0.04);
  color: var(--sm-muted);
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  text-align: center;
}
.sm-mode-btn:hover {
  background: rgba(255,255,255,0.09);
  color: var(--sm-text);
}
.sm-mode-btn.sm-active {
  background: linear-gradient(120deg, var(--sm-accent), var(--sm-accent2));
  border-color: transparent;
  color: #fff;
}
`;

interface ControlEntry {
  key: string;
  action: string;
}

const CONTROLS: ControlEntry[] = [
  { key: "WASD", action: "Move tank" },
  { key: "Mouse", action: "Aim barrel" },
  { key: "Click / Space", action: "Shoot" },
  { key: "1 – 8", action: "Upgrade stats" },
  { key: "Wheel", action: "Zoom" },
  { key: "Backtick (`)", action: "Dev panel" },
];

export class StartMenu {
  private container: HTMLElement;
  private settingsOverlay: HTMLElement;
  private playBtn: HTMLButtonElement;
  private settingsBtn: HTMLButtonElement;
  private settingsBackBtn: HTMLButtonElement;
  private settingsSaveBtn: HTMLButtonElement;
  private muteCheckbox: HTMLInputElement;
  private nameInput: HTMLInputElement;
  private onPlay: (mode: GameMode) => void;
  private onMuteToggle: (muted: boolean) => void;
  private onNameChange: (name: string) => void;
  private selectedMode: GameMode = "2teams";
  private modeButtons: HTMLButtonElement[] = [];

  constructor(
    onPlay: (mode: GameMode) => void,
    onMuteToggle: (muted: boolean) => void,
    initialMuted: boolean,
    onNameChange?: (name: string) => void,
  ) {
    this.onPlay = onPlay;
    this.onMuteToggle = onMuteToggle;
    this.onNameChange = onNameChange ?? (() => {});

    // Build the overlay root
    this.container = document.createElement("div");
    this.container.className = "sm-overlay sm-hidden";

    // Splash art background
    const splash = document.createElement("div");
    splash.className = "sm-splash";

    // ---- Left sidebar ----
    const sidebar = document.createElement("div");
    sidebar.className = "sm-sidebar";

    // Title
    const titleArea = document.createElement("div");
    titleArea.className = "sm-title-area";
    const title = document.createElement("h1");
    title.className = "sm-title";
    title.textContent = "ORB COLLECTOR";
    const titleAccent = document.createElement("span");
    titleAccent.className = "sm-title-accent";
    titleAccent.textContent = ": TANKS";
    title.appendChild(titleAccent);
    titleArea.appendChild(title);
    sidebar.appendChild(titleArea);

    // Nickname input
    const nameSection = document.createElement("div");
    nameSection.className = "sm-section";
    const nameField = document.createElement("div");
    nameField.className = "sm-field";
    const nameLabel = document.createElement("span");
    nameLabel.className = "sm-field-label";
    nameLabel.textContent = "Nickname";
    this.nameInput = document.createElement("input");
    this.nameInput.type = "text";
    this.nameInput.className = "sm-input";
    this.nameInput.maxLength = 14;
    this.nameInput.placeholder = "Player";
    this.nameInput.value = this.loadName();
    nameField.appendChild(nameLabel);
    nameField.appendChild(this.nameInput);
    nameSection.appendChild(nameField);
    sidebar.appendChild(nameSection);

    // Play button section
    const playSection = document.createElement("div");
    playSection.className = "sm-section";
    this.playBtn = document.createElement("button");
    this.playBtn.type = "button";
    this.playBtn.className = "sm-btn sm-btn-primary";
    this.playBtn.textContent = "Play";
    playSection.appendChild(this.playBtn);

    // Game mode selector
    const modeSection = document.createElement("div");
    modeSection.className = "sm-section sm-mode-section";
    const modeLabel = document.createElement("span");
    modeLabel.className = "sm-mode-label";
    modeLabel.textContent = "Game Mode";
    const modeButtons = document.createElement("div");
    modeButtons.className = "sm-mode-buttons";
    const modes: { id: GameMode; label: string }[] = [
      { id: "2teams", label: "2 Teams" },
      { id: "ffa", label: "FFA" },
      { id: "4teams", label: "4 Teams" },
    ];
    for (const mode of modes) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sm-mode-btn" + (mode.id === this.selectedMode ? " sm-active" : "");
      btn.textContent = mode.label;
      btn.addEventListener("click", () => {
        this.selectedMode = mode.id;
        for (const b of this.modeButtons) {
          b.classList.toggle("sm-active", b === btn);
        }
      });
      this.modeButtons.push(btn);
      modeButtons.appendChild(btn);
    }
    modeSection.appendChild(modeLabel);
    modeSection.appendChild(modeButtons);
    playSection.appendChild(modeSection);
    sidebar.appendChild(playSection);

    // How to Play collapsible
    const howtoToggle = document.createElement("button");
    howtoToggle.type = "button";
    howtoToggle.className = "sm-howto-toggle";
    howtoToggle.textContent = "How to Play";
    const caret = document.createElement("span");
    caret.className = "sm-caret";
    caret.textContent = "\u25B6";
    howtoToggle.appendChild(caret);

    const howto = document.createElement("div");
    howto.className = "sm-howto";
    const list = document.createElement("ul");
    list.className = "sm-howto-list";
    for (const entry of CONTROLS) {
      const li = document.createElement("li");
      const key = document.createElement("span");
      key.className = "sm-key";
      key.textContent = entry.key;
      const action = document.createElement("span");
      action.textContent = entry.action;
      li.appendChild(key);
      li.appendChild(action);
      list.appendChild(li);
    }
    howto.appendChild(list);
    sidebar.appendChild(howtoToggle);
    sidebar.appendChild(howto);

    // Bottom section: Settings + footer
    const bottomSection = document.createElement("div");
    bottomSection.className = "sm-section sm-section-bottom";
    this.settingsBtn = document.createElement("button");
    this.settingsBtn.type = "button";
    this.settingsBtn.className = "sm-btn";
    this.settingsBtn.textContent = "Settings";
    bottomSection.appendChild(this.settingsBtn);

    const footer = document.createElement("div");
    footer.className = "sm-footer";
    footer.textContent = "A diep.io clone in the Orb Collector series";
    bottomSection.appendChild(footer);
    sidebar.appendChild(bottomSection);

    // Assemble overlay
    this.container.appendChild(splash);
    this.container.appendChild(sidebar);

    // ---- Settings modal ----
    this.settingsOverlay = document.createElement("div");
    this.settingsOverlay.className = "sm-settings-overlay sm-hidden";

    const settingsPanel = document.createElement("div");
    settingsPanel.className = "sm-settings-panel";

    const settingsTitle = document.createElement("h2");
    settingsTitle.className = "sm-settings-title";
    settingsTitle.textContent = "Settings";
    const settingsSub = document.createElement("p");
    settingsSub.className = "sm-settings-sub";
    settingsSub.textContent = "Adjust your preferences.";
    settingsPanel.appendChild(settingsTitle);
    settingsPanel.appendChild(settingsSub);

    // Mute row
    const muteRow = document.createElement("div");
    muteRow.className = "sm-settings-row";
    const muteLabel = document.createElement("div");
    const muteLabelText = document.createElement("div");
    muteLabelText.className = "sm-settings-label";
    muteLabelText.textContent = "Mute Audio";
    const muteDesc = document.createElement("div");
    muteDesc.className = "sm-settings-desc";
    muteDesc.textContent = "Silence all game sounds";
    muteLabel.appendChild(muteLabelText);
    muteLabel.appendChild(muteDesc);
    this.muteCheckbox = document.createElement("input");
    this.muteCheckbox.type = "checkbox";
    this.muteCheckbox.className = "sm-checkbox";
    this.muteCheckbox.checked = initialMuted;
    muteRow.appendChild(muteLabel);
    muteRow.appendChild(this.muteCheckbox);
    settingsPanel.appendChild(muteRow);

    // Actions
    const actions = document.createElement("div");
    actions.className = "sm-settings-actions";
    this.settingsBackBtn = document.createElement("button");
    this.settingsBackBtn.type = "button";
    this.settingsBackBtn.className = "sm-btn";
    this.settingsBackBtn.textContent = "Back";
    this.settingsSaveBtn = document.createElement("button");
    this.settingsSaveBtn.type = "button";
    this.settingsSaveBtn.className = "sm-btn sm-btn-primary";
    this.settingsSaveBtn.textContent = "Save";
    actions.appendChild(this.settingsBackBtn);
    actions.appendChild(this.settingsSaveBtn);
    settingsPanel.appendChild(actions);

    this.settingsOverlay.appendChild(settingsPanel);

    // ---- Wire events ----
    this.playBtn.addEventListener("click", () => {
      this.onPlay(this.selectedMode);
    });
    howtoToggle.addEventListener("click", () => {
      const open = howtoToggle.classList.toggle("sm-open");
      howto.classList.toggle("sm-open", open);
    });
    this.settingsBtn.addEventListener("click", () => {
      this.settingsOverlay.classList.remove("sm-hidden");
    });
    this.settingsBackBtn.addEventListener("click", () => {
      this.settingsOverlay.classList.add("sm-hidden");
    });
    this.settingsSaveBtn.addEventListener("click", () => {
      this.onMuteToggle(this.muteCheckbox.checked);
      this.saveName(this.nameInput.value);
      this.onNameChange(this.nameInput.value);
      this.settingsOverlay.classList.add("sm-hidden");
    });
    this.nameInput.addEventListener("change", () => {
      this.saveName(this.nameInput.value);
      this.onNameChange(this.nameInput.value);
    });
    // Enter key in name input triggers Play
    this.nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        this.playBtn.click();
      }
    });
  }

  /** Inject CSS and append overlay + settings to <body>. Idempotent. */
  init(): void {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = MENU_CSS;
      document.head.appendChild(style);
    }
    if (!this.container.parentElement) {
      document.body.appendChild(this.container);
    }
    if (!this.settingsOverlay.parentElement) {
      document.body.appendChild(this.settingsOverlay);
    }
  }

  show(): void {
    this.container.classList.remove("sm-hidden");
  }

  hide(): void {
    this.container.classList.add("sm-hidden");
    this.settingsOverlay.classList.add("sm-hidden");
  }

  /** Get the current nickname. */
  getName(): string {
    return this.nameInput.value.trim() || "Player";
  }

  /** Get the currently selected game mode. */
  getMode(): GameMode {
    return this.selectedMode;
  }

  private loadName(): string {
    try {
      return localStorage.getItem("orb_collector_tanks_name") || "Player";
    } catch {
      return "Player";
    }
  }

  private saveName(name: string): void {
    try {
      localStorage.setItem("orb_collector_tanks_name", name.trim() || "Player");
    } catch {
      // Ignore
    }
  }
}
