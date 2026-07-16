import Phaser from 'phaser';

import type { SaveRepository } from '../../storage/SaveRepository';
import type { SaveSummary } from '../../storage/saveSchema';
import { SAVE_REPOSITORY_REGISTRY_KEY } from './BootScene';

interface MenuSceneData {
  readonly contentError?: string;
}

const classNames = {
  prince: '王族',
  knight: '騎士',
  elf: '妖精',
  wizard: '法師',
} as const;

export class MenuScene extends Phaser.Scene {
  #contentError: string | undefined;
  #overlay: HTMLElement | null = null;

  constructor() {
    super('menu');
  }

  init(data: MenuSceneData): void {
    this.#contentError = data.contentError;
  }

  create(): void {
    const parent = this.game.canvas.parentElement;
    if (parent === null) return;

    parent.dataset.scene = this.#contentError === undefined ? 'menu' : 'menu-error';
    this.add.rectangle(320, 240, 640, 480, 0x080b0a);
    this.add.text(320, 96, '說話之島', {
      color: '#d9bd7a',
      fontFamily: 'serif',
      fontSize: '36px',
    }).setOrigin(0.5);

    const overlay = document.createElement('section');
    overlay.className = 'scene-overlay menu-panel';
    overlay.setAttribute('aria-label', '主選單');
    parent.append(overlay);
    this.#overlay = overlay;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.#removeOverlay();
    });

    if (this.#contentError !== undefined) {
      const error = document.createElement('p');
      error.className = 'error-message';
      error.setAttribute('role', 'alert');
      error.textContent = this.#contentError;
      overlay.append(error);
      return;
    }

    const loading = document.createElement('p');
    loading.textContent = '讀取存檔中……';
    overlay.append(loading);
    void this.#renderReadyMenu(overlay, loading);
  }

  async #renderReadyMenu(overlay: HTMLElement, loading: HTMLElement): Promise<void> {
    try {
      const repository = this.registry.get(SAVE_REPOSITORY_REGISTRY_KEY) as SaveRepository;
      const saves = await repository.list();
      if (!this.scene.isActive()) return;

      loading.remove();
      const slots = document.createElement('div');
      slots.className = 'save-slot-list';
      for (const save of saves) slots.append(this.#createSaveButton(save));
      overlay.append(slots);

      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = saves.length < 3 ? '開始新遊戲' : '三個存檔欄皆已使用';
      button.disabled = saves.length >= 3;
      button.addEventListener('click', () => {
        this.scene.start('character-create');
      });
      overlay.append(button);
    } catch (error) {
      loading.setAttribute('role', 'alert');
      loading.className = 'error-message';
      loading.textContent = `讀取存檔失敗：${error instanceof Error ? error.message : String(error)}`;
    }
  }

  #createSaveButton(save: SaveSummary): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `繼續 ${save.name} / ${classNames[save.classId]} Lv.${String(save.level)}`;
    button.addEventListener('click', () => {
      void this.#loadSave(save);
    });
    return button;
  }

  async #loadSave(save: SaveSummary): Promise<void> {
    const repository = this.registry.get(SAVE_REPOSITORY_REGISTRY_KEY) as SaveRepository;
    const stored = await repository.get(save.slot);
    if (stored === null || !this.scene.isActive()) return;
    this.registry.set('active-save', stored);
    this.scene.start('world');
  }

  #removeOverlay(): void {
    this.#overlay?.remove();
    this.#overlay = null;
  }
}
