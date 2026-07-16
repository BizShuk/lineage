import type Phaser from 'phaser';

import type { WorldSnapshot } from './WorldController';

export const TILE_SIZE = 16;

interface RenderEntity {
  readonly id: string;
  readonly kind: 'player' | 'monster' | 'loot';
  readonly x: number;
  readonly y: number;
  readonly textureKey: string;
  readonly color: number;
  readonly label: string;
  readonly hidden?: boolean;
}

export class EntityRenderer {
  readonly #scene: Phaser.Scene;
  readonly #entities = new Map<string, Phaser.GameObjects.Container>();

  constructor(scene: Phaser.Scene) {
    this.#scene = scene;
  }

  render(snapshot: WorldSnapshot): void {
    const views: RenderEntity[] = [
      {
        id: snapshot.character.id,
        kind: 'player',
        x: snapshot.player.x,
        y: snapshot.player.y,
        textureKey: `player-${snapshot.character.classId}`,
        color: 0x4d8cba,
        label: snapshot.character.name,
      },
      ...snapshot.monsters.map((monster): RenderEntity => ({
        id: monster.id,
        kind: 'monster',
        x: monster.x,
        y: monster.y,
        textureKey: `monster-${monster.monsterId}`,
        color: monster.rank === 'boss' ? 0x9f3b55 : 0x8a563b,
        label: monster.monsterId,
        hidden: monster.hp <= 0,
      })),
      ...snapshot.groundLoot.map((loot): RenderEntity => ({
        id: loot.id,
        kind: 'loot',
        x: loot.x,
        y: loot.y,
        textureKey: `item-${loot.itemId}`,
        color: 0xd9bd69,
        label: loot.itemId,
      })),
    ];
    const liveIds = new Set(views.map(({ id }) => id));
    for (const [id, object] of this.#entities) {
      if (!liveIds.has(id)) {
        object.destroy(true);
        this.#entities.delete(id);
      }
    }
    for (const view of views) this.#renderEntity(view);
  }

  positionOf(id: string): Readonly<{ x: number; y: number }> | null {
    const entity = this.#entities.get(id);
    return entity === undefined ? null : { x: entity.x, y: entity.y };
  }

  destroy(): void {
    for (const entity of this.#entities.values()) entity.destroy(true);
    this.#entities.clear();
  }

  #renderEntity(view: RenderEntity): void {
    let container = this.#entities.get(view.id);
    if (container === undefined) {
      const visual = this.#scene.textures.exists(view.textureKey)
        ? this.#scene.add.image(0, 0, view.textureKey).setDisplaySize(14, 14)
        : this.#scene.add.rectangle(0, 0, 12, 12, view.color).setStrokeStyle(1, 0x080b0a);
      const label = this.#scene.add
        .text(0, -11, view.label, { color: '#f1e7ca', fontSize: '8px' })
        .setOrigin(0.5, 1);
      container = this.#scene.add.container(0, 0, [visual, label]);
      container.setSize(TILE_SIZE, TILE_SIZE).setInteractive();
      container.setData('target-kind', view.kind);
      container.setData('target-id', view.id);
      this.#entities.set(view.id, container);
    }
    container
      .setPosition(view.x * TILE_SIZE + TILE_SIZE / 2, view.y * TILE_SIZE + TILE_SIZE / 2)
      .setDepth(view.y * TILE_SIZE + (view.kind === 'loot' ? -1 : 0))
      .setVisible(view.hidden !== true);
  }
}
