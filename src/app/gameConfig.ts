import Phaser from 'phaser';

import { BootScene } from '../game/scenes/BootScene';
import { CharacterCreateScene } from '../game/scenes/CharacterCreateScene';
import { MenuScene } from '../game/scenes/MenuScene';
import { WorldScene } from '../game/scenes/WorldScene';

declare global {
  type ActiveXObject = Document;
}

export const gameConfig = (parent: HTMLElement): Phaser.Types.Core.GameConfig => ({
  type: Phaser.AUTO,
  parent,
  width: 640,
  height: 480,
  pixelArt: true,
  roundPixels: true,
  backgroundColor: '#080b0a',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: 'arcade', arcade: { debug: false } },
  scene: [BootScene, MenuScene, CharacterCreateScene, WorldScene],
});
