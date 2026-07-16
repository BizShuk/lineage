import Phaser from 'phaser';

import { gameConfig } from './gameConfig';

export const createGame = (parent: HTMLElement): Phaser.Game =>
  new Phaser.Game(gameConfig(parent));
