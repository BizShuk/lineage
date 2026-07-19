import type Phaser from 'phaser';

const PREVIEW_ATLAS = 'isometric-village-preview';
const PREVIEW_ORIGIN_X = 1_024;
const PREVIEW_ORIGIN_Y = 64;
const PREVIEW_TILE_SCALE = 0.25;

export interface PreviewPoint {
  readonly x: number;
  readonly y: number;
}

export interface PreviewFrame {
  readonly player: PreviewPoint;
  readonly objectCount: number;
}

export const previewGridToScreen = (x: number, y: number): PreviewPoint => ({
  x: PREVIEW_ORIGIN_X + (x - y) * 16,
  y: PREVIEW_ORIGIN_Y + (x + y) * 8,
});

export const previewTerrainFrame = (x: number, y: number): number => {
  if (x >= 28 && x < 36) return 2;
  if (x >= 20 && x < 44 && y >= 20 && y < 44) return 1;
  return 0;
};

export const previewDepth = (x: number, y: number, offset = 0): number =>
  (x + y) * 100 + offset;

const props = [
  { frame: 8, x: 27, y: 28, scale: 0.5, anchorY: 0.88 },
  { frame: 9, x: 37, y: 28, scale: 0.5, anchorY: 0.88 },
  { frame: 10, x: 25, y: 26, scale: 0.4, anchorY: 0.9 },
  { frame: 11, x: 29, y: 25, scale: 0.3, anchorY: 0.82 },
  { frame: 12, x: 32, y: 28, scale: 0.35, anchorY: 0.82 },
  { frame: 13, x: 36, y: 26, scale: 0.3, anchorY: 0.84 },
  { frame: 14, x: 30, y: 30, scale: 0.28, anchorY: 0.86 },
  { frame: 15, x: 34, y: 30, scale: 0.28, anchorY: 0.9 },
] as const;

const actors = [
  {
    texture: 'player-knight',
    frame: 'class-knight:frame:0',
    name: '視覺測試',
    x: 32,
    y: 32,
  },
  { texture: 'npcs', frame: 'npc-balsim:frame:0', name: '巴辛', x: 22, y: 32 },
  { texture: 'npcs', frame: 'npc-pandora:frame:0', name: '潘朵拉', x: 42, y: 32 },
  { texture: 'npcs', frame: 'npc-dorin:frame:0', name: '多林', x: 32, y: 38 },
] as const;

export class IsometricVillagePreview {
  readonly #scene: Phaser.Scene;
  readonly #objects: Phaser.GameObjects.GameObject[] = [];
  #frame: PreviewFrame | null = null;

  constructor(scene: Phaser.Scene) {
    this.#scene = scene;
  }

  render(): PreviewFrame {
    if (this.#frame !== null) return this.#frame;

    for (let y = 18; y <= 46; y += 1) {
      for (let x = 18; x <= 46; x += 1) {
        const point = previewGridToScreen(x, y);
        const frame = `${PREVIEW_ATLAS}:frame:${String(previewTerrainFrame(x, y))}`;
        const tile = this.#scene.add
          .image(point.x, point.y, PREVIEW_ATLAS, frame)
          .setOrigin(0.5)
          .setScale(PREVIEW_TILE_SCALE)
          .setDepth(previewDepth(x, y));
        this.#objects.push(tile);
      }
    }

    for (const prop of props) {
      const point = previewGridToScreen(prop.x, prop.y);
      const image = this.#scene.add
        .image(
          point.x,
          point.y,
          PREVIEW_ATLAS,
          `${PREVIEW_ATLAS}:frame:${String(prop.frame)}`,
        )
        .setOrigin(0.5, prop.anchorY)
        .setScale(prop.scale)
        .setDepth(previewDepth(prop.x, prop.y));
      this.#objects.push(image);
    }

    for (const actor of actors) {
      const point = previewGridToScreen(actor.x, actor.y);
      const sprite = this.#scene.add.sprite(0, 0, actor.texture, actor.frame).setOrigin(0.5, 1);
      const width = Math.max(1, sprite.frame.realWidth);
      const height = Math.max(1, sprite.frame.realHeight);
      sprite.setScale(Math.min(44 / width, 52 / height));
      const label = this.#scene.add
        .text(0, -sprite.displayHeight - 2, actor.name, {
          color: '#ffe8b0',
          fontSize: '9px',
          stroke: '#17120d',
          strokeThickness: 2,
        })
        .setOrigin(0.5, 1);
      const container = this.#scene.add
        .container(point.x, point.y, [sprite, label])
        .setDepth(previewDepth(actor.x, actor.y, 20));
      this.#objects.push(container);
    }

    this.#frame = {
      player: previewGridToScreen(32, 32),
      objectCount: this.#objects.length,
    };
    return this.#frame;
  }

  destroy(): void {
    this.#objects.forEach((object) => {
      object.destroy();
    });
    this.#objects.length = 0;
    this.#frame = null;
  }
}
