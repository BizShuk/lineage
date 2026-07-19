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

export interface PreviewSourceFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const previewGridToScreen = (x: number, y: number): PreviewPoint => ({
  x: PREVIEW_ORIGIN_X + (x - y) * 16,
  y: PREVIEW_ORIGIN_Y + (x + y) * 8,
});

export const previewTerrainFrame = (x: number, y: number): number => {
  const plazaDistance = Math.max(Math.abs(x - 32), Math.abs(y - 29));
  const mainRoadDistance = Math.abs(x - y);
  const branchRoadDistance = Math.abs(x + y - 60);
  const mainRoadActive = x + y >= 48 && x + y <= 84;
  const branchRoadActive = x >= 24 && x <= 38 && y >= 22 && y <= 36;

  if (
    mainRoadActive &&
    branchRoadActive &&
    mainRoadDistance <= 1 &&
    branchRoadDistance <= 1
  ) {
    return 3;
  }
  if (
    (mainRoadActive && mainRoadDistance <= 1) ||
    (branchRoadActive && branchRoadDistance <= 1)
  ) {
    return 2;
  }
  if (
    (mainRoadActive && mainRoadDistance === 2) ||
    (branchRoadActive && branchRoadDistance === 2)
  ) {
    return plazaDistance <= 5 ? 5 : 4;
  }
  if (plazaDistance <= 5) return 1;
  if (plazaDistance === 6) return 6;
  return 0;
};

export const previewKnightFrame = (
  sourceWidth: number,
  sourceHeight: number,
): PreviewSourceFrame | null => {
  if (sourceWidth <= 0 || sourceHeight <= 0) return null;
  const width = Math.floor(sourceWidth / 8);
  const height = Math.floor(sourceHeight / 6);
  if (width <= 0 || height <= 0) return null;
  return { x: width * 4, y: 0, width, height };
};

export const previewDepth = (x: number, y: number, offset = 0): number =>
  (x + y) * 100 + offset;

const props = [
  { frame: 8, x: 27, y: 27, scale: 0.42, anchorY: 0.88 },
  { frame: 9, x: 36, y: 28, scale: 0.42, anchorY: 0.88 },
  { frame: 10, x: 22, y: 27, scale: 0.38, anchorY: 0.9 },
  { frame: 11, x: 34, y: 24, scale: 0.28, anchorY: 0.82 },
  { frame: 12, x: 28, y: 30, scale: 0.3, anchorY: 0.82 },
  { frame: 13, x: 40, y: 25, scale: 0.26, anchorY: 0.84 },
  { frame: 14, x: 29, y: 33, scale: 0.23, anchorY: 0.86 },
  { frame: 15, x: 34, y: 29, scale: 0.23, anchorY: 0.9 },
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

    const knightFrame = this.#knightFrame();
    for (const actor of actors) {
      const point = previewGridToScreen(actor.x, actor.y);
      const frame = actor.texture === 'player-knight' ? knightFrame : actor.frame;
      const sprite = this.#scene.add.sprite(0, 0, actor.texture, frame).setOrigin(0.5, 1);
      const width = Math.max(1, sprite.frame.realWidth);
      const height = Math.max(1, sprite.frame.realHeight);
      sprite.setScale(Math.min(52 / width, 64 / height));
      const label = this.#scene.add
        .text(0, -sprite.displayHeight - 4, actor.name, {
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

  #knightFrame(): string {
    const frameName = 'isometric-village-preview:player-knight';
    const texture = this.#scene.textures.get('player-knight');
    if (!texture.has(frameName)) {
      const source = texture.getSourceImage() as { width: number; height: number };
      const frame = previewKnightFrame(source.width, source.height);
      if (frame !== null) {
        texture.add(frameName, 0, frame.x, frame.y, frame.width, frame.height);
      }
    }
    return texture.has(frameName) ? frameName : 'class-knight:frame:0';
  }

  destroy(): void {
    this.#objects.forEach((object) => {
      object.destroy();
    });
    this.#objects.length = 0;
    this.#frame = null;
  }
}
