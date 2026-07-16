import Phaser from 'phaser';

import { loadBundledContent, loadContent } from '../../content/loadContent';
import { SaveRepository } from '../../storage/SaveRepository';

export const CONTENT_REGISTRY_KEY = 'game-content';
export const SAVE_REPOSITORY_REGISTRY_KEY = 'save-repository';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    const parent = this.game.canvas.parentElement;
    if (parent !== null) parent.dataset.scene = 'boot';

    this.registry.set(
      SAVE_REPOSITORY_REGISTRY_KEY,
      new SaveRepository('talking-island-saves'),
    );

    try {
      const search = new URLSearchParams(window.location.search);
      const content =
        search.get('e2e') === '1' && search.get('contentError') === '1'
          ? loadContent({})
          : loadBundledContent();
      this.registry.set(CONTENT_REGISTRY_KEY, content);
      this.scene.start('menu');
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.scene.start('menu', {
        contentError: `遊戲內容驗證失敗，無法開始遊戲。${detail}`,
      });
    }
  }
}
