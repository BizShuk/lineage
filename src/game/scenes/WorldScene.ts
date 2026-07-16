import Phaser from 'phaser';

export class WorldScene extends Phaser.Scene {
  constructor() {
    super('world');
  }

  create(): void {
    const parent = this.game.canvas.parentElement;
    if (parent !== null) parent.dataset.scene = 'world';
    this.add.rectangle(256, 216, 512, 432, 0x172019);
    this.add.text(256, 216, '進入說話之島', {
      color: '#e8dfc5',
      fontSize: '16px',
    }).setOrigin(0.5);
  }
}
