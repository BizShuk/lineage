import type Phaser from 'phaser';

import { loadAssetManifest, type AssetManifest } from '../../content/assets';
import {
  ASSET_MANIFEST_REGISTRY_KEY,
  entityAnimationKey,
  type EntityAnimationState,
} from '../scenes/BootScene';
import { fitSpriteFrame } from './SpriteAtlas';
import type { ProjectionMode, WorldProjection } from './WorldProjection';
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
  readonly state?: EntityAnimationState;
}

type Direction = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

const monsterAnimationState = (aiState: WorldSnapshot['monsters'][number]['aiState']): EntityAnimationState => {
  switch (aiState) {
    case 'chase':
    case 'patrol':
    case 'return':
      return 'walk';
    case 'attack':
      return 'attack';
    case 'dead':
      return 'death';
    case 'idle':
      return 'idle';
  }
};

const directionFromDelta = (dx: number, dy: number, fallback: Direction): Direction => {
  const horizontal = Math.sign(dx);
  const vertical = Math.sign(dy);
  if (horizontal === 0 && vertical === 0) return fallback;
  if (horizontal === 0) return vertical < 0 ? 'n' : 's';
  if (vertical === 0) return horizontal < 0 ? 'w' : 'e';
  if (horizontal > 0) return vertical < 0 ? 'ne' : 'se';
  return vertical < 0 ? 'nw' : 'sw';
};

export class EntityRenderer {
  readonly #scene: Phaser.Scene;
  readonly #manifest: AssetManifest;
  readonly #entities = new Map<string, Phaser.GameObjects.Container>();
  readonly #sprites = new Map<string, Phaser.GameObjects.Sprite>();
  readonly #labels = new Map<string, Phaser.GameObjects.Text>();
  readonly #positions = new Map<string, Readonly<{ x: number; y: number }>>();
  readonly #directions = new Map<string, Direction>();
  #projectionMode: ProjectionMode | null = null;

  constructor(scene: Phaser.Scene) {
    this.#scene = scene;
    this.#manifest =
      (scene.registry.get(ASSET_MANIFEST_REGISTRY_KEY) as AssetManifest | undefined) ??
      loadAssetManifest();
  }

  render(snapshot: WorldSnapshot, projection: WorldProjection): void {
    if (this.#projectionMode !== projection.mode) {
      this.#clearEntities();
      this.#projectionMode = projection.mode;
    }
    const views: RenderEntity[] = [
      {
        id: snapshot.character.id,
        kind: 'player',
        x: snapshot.player.x,
        y: snapshot.player.y,
        textureKey: `class-${snapshot.character.classId}`,
        color: 0x4d8cba,
        label: snapshot.character.name,
        state: snapshot.autoAttackTargetId === null ? 'idle' : 'attack',
      },
      ...snapshot.monsters.map((monster): RenderEntity => ({
        id: monster.id,
        kind: 'monster',
        x: monster.x,
        y: monster.y,
        textureKey: `monster-${monster.monsterId}`,
        color: monster.rank === 'boss' ? 0x9f3b55 : 0x8a563b,
        label: monster.monsterId,
        state: monsterAnimationState(monster.aiState),
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
        this.#sprites.delete(id);
        this.#labels.delete(id);
        this.#positions.delete(id);
        this.#directions.delete(id);
      }
    }
    for (const view of views) this.#renderEntity(view, projection);
  }

  positionOf(id: string): Readonly<{ x: number; y: number }> | null {
    const entity = this.#entities.get(id);
    return entity === undefined ? null : { x: entity.x, y: entity.y };
  }

  destroy(): void {
    this.#clearEntities();
    this.#projectionMode = null;
  }

  #clearEntities(): void {
    for (const entity of this.#entities.values()) entity.destroy(true);
    this.#entities.clear();
    this.#sprites.clear();
    this.#labels.clear();
    this.#positions.clear();
    this.#directions.clear();
  }

  #renderEntity(view: RenderEntity, projection: WorldProjection): void {
    let container = this.#entities.get(view.id);
    if (container === undefined) {
      const entry = this.#manifest[view.textureKey];
      const firstFrame =
        projection.mode === 'isometric-2-1' && view.kind === 'player'
          ? `${view.textureKey}:isometric-idle`
          : `${view.textureKey}:frame:0`;
      let visual: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle;
      let labelY = -11;
      if (
        entry !== undefined &&
        this.#scene.textures.exists(entry.group) &&
        this.#scene.textures.get(entry.group).has(firstFrame)
      ) {
        const sprite = this.#scene.add.sprite(0, 0, entry.group, firstFrame);
        if (projection.mode === 'isometric-2-1') {
          const fit = fitSpriteFrame(sprite.frame.realWidth, sprite.frame.realHeight, 44, 52);
          if (fit !== null) sprite.setDisplaySize(fit.width, fit.height);
          sprite.setOrigin(0.5, 1);
          labelY = -sprite.displayHeight - 2;
        } else {
          sprite.setDisplaySize(28, 36);
        }
        this.#sprites.set(view.id, sprite);
        visual = sprite;
      } else {
        visual = this.#scene.add
          .rectangle(0, 0, 12, 12, view.color)
          .setStrokeStyle(1, 0x080b0a);
      }
      const label = this.#scene.add
        .text(0, labelY, view.label, {
          color: '#f1e7ca',
          fontSize: '8px',
          stroke: '#17120d',
          strokeThickness: projection.mode === 'isometric-2-1' ? 2 : 0,
        })
        .setOrigin(0.5, 1);
      this.#labels.set(view.id, label);
      container = this.#scene.add.container(0, 0, [visual, label]);
      container.setSize(TILE_SIZE, TILE_SIZE).setInteractive();
      container.setData('target-kind', view.kind);
      container.setData('target-id', view.id);
      this.#entities.set(view.id, container);
    }
    const previous = this.#positions.get(view.id) ?? { x: view.x, y: view.y };
    const direction = directionFromDelta(
      view.x - previous.x,
      view.y - previous.y,
      this.#directions.get(view.id) ?? 's',
    );
    const inferredState =
      view.state === 'idle' && (view.x !== previous.x || view.y !== previous.y)
        ? 'walk'
        : view.state;
    const sprite = this.#sprites.get(view.id);
    const usesCompleteIsometricPose =
      projection.mode === 'isometric-2-1' && view.kind === 'player';
    if (sprite !== undefined && inferredState !== undefined && !usesCompleteIsometricPose) {
      const key = entityAnimationKey(view.textureKey, inferredState, direction);
      if (
        this.#scene.anims.exists(key) &&
        (sprite.anims.currentAnim?.key !== key ||
          (!sprite.anims.isPlaying && (inferredState === 'idle' || inferredState === 'walk')))
      ) {
        sprite.play(key);
      }
    }
    this.#positions.set(view.id, { x: view.x, y: view.y });
    this.#directions.set(view.id, direction);
    const point = projection.gridToScreen(view);
    container
      .setPosition(point.x, point.y)
      .setDepth(projection.depthFor(view, view.kind === 'loot' ? -1 : 20));
  }
}
