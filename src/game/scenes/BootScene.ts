import Phaser from 'phaser';

import {
  loadAssetManifest,
  type AssetEntry,
  type AssetManifest,
} from '../../content/assets';
import type { GameContent } from '../../content/catalog';
import { loadBundledContent, loadContent } from '../../content/loadContent';
import { SaveRepository } from '../../storage/SaveRepository';

export const CONTENT_REGISTRY_KEY = 'game-content';
export const ASSET_MANIFEST_REGISTRY_KEY = 'asset-manifest';
export const ASSET_LOAD_FAILURES_REGISTRY_KEY = 'asset-load-failures';
export const SAVE_REPOSITORY_REGISTRY_KEY = 'save-repository';

export const ENTITY_ANIMATION_STATES = [
  'idle',
  'walk',
  'attack',
  'hit',
  'cast',
  'death',
] as const;
export const ENTITY_DIRECTIONS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;
export const EFFECT_ANIMATIONS = [
  'melee',
  'projectile',
  'spell',
  'damage',
  'level-up',
  'loot',
] as const;

export type EntityAnimationState = (typeof ENTITY_ANIMATION_STATES)[number];

const frameCounts: Readonly<Record<EntityAnimationState, number>> = {
  idle: 2,
  walk: 6,
  attack: 4,
  hit: 2,
  cast: 4,
  death: 6,
};

const stateOffsets: Readonly<Record<EntityAnimationState, number>> = {
  idle: 0,
  walk: 2,
  attack: 8,
  hit: 12,
  cast: 14,
  death: 18,
};

export const entityAnimationKey = (
  entityKey: string,
  state: EntityAnimationState,
  direction: string,
): string =>
  `${entityKey}:${state}:${direction}`;

const pathToUrl = (path: string): string => path.replace(/^public/, '');

const isDetailedEntity = (entry: AssetEntry): boolean =>
  entry.key.startsWith('class-') || entry.key === 'monster-baphomet';

export class BootScene extends Phaser.Scene {
  #content: GameContent | null = null;
  #manifest: AssetManifest | null = null;
  #criticalError: string | null = null;
  #assetFailures: string[] = [];

  constructor() {
    super('boot');
  }

  init(): void {
    this.#content = null;
    this.#manifest = null;
    this.#criticalError = null;
    this.#assetFailures = [];
  }

  preload(): void {
    const search = new URLSearchParams(window.location.search);
    try {
      this.#content =
        search.get('e2e') === '1' && search.get('contentError') === '1'
          ? loadContent({})
          : loadBundledContent();
      this.#manifest = loadAssetManifest(undefined, this.#content);
      this.registry.set(CONTENT_REGISTRY_KEY, this.#content);
      this.registry.set(ASSET_MANIFEST_REGISTRY_KEY, this.#manifest);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.#criticalError = `遊戲內容驗證失敗，無法開始遊戲。${detail}`;
      return;
    }

    const pathsByGroup = new Map<string, string>();
    for (const entry of Object.values(this.#manifest)) {
      pathsByGroup.set(entry.group, entry.path);
    }
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      this.#assetFailures.push(file.key);
    });
    for (const [group, path] of pathsByGroup) {
      this.load.image(group, pathToUrl(path));
    }
  }

  create(): void {
    const parent = this.game.canvas.parentElement;
    if (parent !== null) parent.dataset.scene = 'boot';

    this.registry.set(
      SAVE_REPOSITORY_REGISTRY_KEY,
      new SaveRepository('talking-island-saves'),
    );
    this.registry.set(ASSET_LOAD_FAILURES_REGISTRY_KEY, [...this.#assetFailures]);

    if (this.#criticalError !== null || this.#manifest === null) {
      this.scene.start('menu', {
        contentError: this.#criticalError ?? '遊戲資產 manifest 驗證失敗，無法開始遊戲。',
      });
      return;
    }

    this.#registerFramesAndAnimations(this.#manifest);
    const search = new URLSearchParams(window.location.search);
    if (search.get('e2e') === '1' && search.get('animationTest') === '1' && parent !== null) {
      this.#createAnimationDiagnostics(parent);
      return;
    }
    this.scene.start('menu');
  }

  #registerFramesAndAnimations(manifest: AssetManifest): void {
    const entriesByGroup = new Map<string, AssetEntry[]>();
    for (const entry of Object.values(manifest)) {
      const entries = entriesByGroup.get(entry.group) ?? [];
      entries.push(entry);
      entriesByGroup.set(entry.group, entries);
    }

    for (const entries of entriesByGroup.values()) {
      for (const entry of entries) {
        if (!this.textures.exists(entry.group)) continue;
        const physicalFrames = this.#registerPhysicalFrames(entry);
        if (
          physicalFrames.length > 0 &&
          (entry.key.startsWith('class-') ||
            entry.key.startsWith('monster-') ||
            entry.key.startsWith('npc-'))
        ) {
          this.#registerEntityAnimations(entry, physicalFrames);
        }
      }
    }
    this.#registerEffectAnimations(manifest);
  }

  #registerPhysicalFrames(entry: AssetEntry): readonly string[] {
    const texture = this.textures.get(entry.group);
    const source = texture.getSourceImage() as { width: number; height: number };
    if (source.width <= 0 || source.height <= 0) return [];

    if (isDetailedEntity(entry)) {
      const columns = 16;
      const rows = 12;
      const width = Math.floor(source.width / columns);
      const height = Math.floor(source.height / rows);
      return Array.from({ length: columns * rows }, (_, index) => {
        const name = `${entry.key}:frame:${String(index)}`;
        this.#addFrame(texture, name, (index % columns) * width, Math.floor(index / columns) * height, width, height);
        return name;
      });
    }

    const groupColumns = 8;
    const groupRows = 8;
    const cellWidth = Math.floor(source.width / groupColumns);
    const cellHeight = Math.floor(source.height / groupRows);
    const cellX = (entry.frame % groupColumns) * cellWidth;
    const cellY = Math.floor(entry.frame / groupColumns) * cellHeight;
    const width = Math.floor(cellWidth / 2);
    const height = Math.floor(cellHeight / 2);
    return Array.from({ length: 4 }, (_, index) => {
      const name = `${entry.key}:frame:${String(index)}`;
      this.#addFrame(
        texture,
        name,
        cellX + (index % 2) * width,
        cellY + Math.floor(index / 2) * height,
        width,
        height,
      );
      return name;
    });
  }

  #addFrame(
    texture: Phaser.Textures.Texture,
    name: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    if (!texture.has(name) && width > 0 && height > 0) {
      texture.add(name, 0, x, y, width, height);
    }
  }

  #registerEntityAnimations(entry: AssetEntry, physicalFrames: readonly string[]): void {
    for (const [directionIndex, direction] of ENTITY_DIRECTIONS.entries()) {
      for (const [stateIndex, state] of ENTITY_ANIMATION_STATES.entries()) {
        const key = entityAnimationKey(entry.key, state, direction);
        if (this.anims.exists(key)) continue;
        const count = frameCounts[state];
        const detailedStart = directionIndex * 24 + stateOffsets[state];
        const start = isDetailedEntity(entry)
          ? detailedStart
          : (directionIndex + stateIndex) % physicalFrames.length;
        const frameNames = Array.from({ length: count }, (_, index) =>
          physicalFrames[(start + index) % physicalFrames.length],
        ).filter((name): name is string => name !== undefined);
        if (frameNames.length === 0) continue;
        this.anims.create({
          key,
          frames: frameNames.map((frame) => ({ key: entry.group, frame })),
          frameRate: 20,
          repeat: state === 'idle' || state === 'walk' ? -1 : 0,
        });
      }
    }
  }

  #registerEffectAnimations(manifest: AssetManifest): void {
    const effectEntries = Object.values(manifest).filter(({ group }) => group === 'effects');
    for (const [index, effect] of EFFECT_ANIMATIONS.entries()) {
      const entry = effectEntries[index];
      if (entry === undefined || !this.textures.exists(entry.group)) continue;
      const key = `effect:${effect}`;
      if (this.anims.exists(key)) continue;
      const texture = this.textures.get(entry.group);
      const frames = Array.from({ length: 4 }, (_, frameIndex) =>
        `${entry.key}:frame:${String(frameIndex)}`,
      ).filter((frame) => texture.has(frame));
      if (frames.length === 0) continue;
      this.anims.create({
        key,
        frames: frames.map((frame) => ({ key: entry.group, frame })),
        frameRate: 20,
        repeat: 0,
      });
    }
  }

  #createAnimationDiagnostics(parent: HTMLElement): void {
    const panel = document.createElement('section');
    panel.dataset.testid = 'animation-diagnostics';
    panel.style.cssText = 'position:absolute;z-index:5;inset:8px;overflow:auto;background:#101510e8;color:#eee;padding:8px';
    const failures = document.createElement('output');
    failures.dataset.testid = 'asset-load-failures';
    failures.textContent = String(this.#assetFailures.length);
    const state = document.createElement('output');
    state.dataset.testid = 'animation-preview-state';
    panel.append(failures, state);

    const keys = [
      ...['class-prince', 'class-knight', 'class-elf', 'class-wizard'].flatMap((entity) =>
        ENTITY_ANIMATION_STATES.map((animationState) =>
          entityAnimationKey(entity, animationState, 's'),
        ),
      ),
      entityAnimationKey('monster-baphomet', 'death', 's'),
      ...EFFECT_ANIMATIONS.map((effect) => `effect:${effect}`),
    ];
    const firstAnimation = this.anims.get(keys[0] ?? '');
    const firstFrame = firstAnimation.frames[0];
    if (firstFrame === undefined) {
      state.textContent = '沒有可用動畫';
      parent.append(panel);
      panel.dataset.ready = 'true';
      return;
    }

    const sprite = this.add.sprite(320, 240, firstFrame.textureKey, firstFrame.textureFrame);
    sprite.setDisplaySize(96, 96);
    const markComplete = (animation: Phaser.Animations.Animation): void => {
      if (state.dataset.animation !== animation.key) return;
      const finalFrame = animation.frames.at(-1);
      if (finalFrame !== undefined) {
        sprite.anims.stop();
        sprite.setTexture(finalFrame.textureKey, finalFrame.textureFrame);
        state.dataset.finalFrame = String(finalFrame.textureFrame);
        state.dataset.currentFrame = sprite.frame.name;
      }
      state.dataset.cycleComplete = 'true';
    };
    sprite.on('animationcomplete', (animation: Phaser.Animations.Animation) => {
      markComplete(animation);
    });
    sprite.on('animationrepeat', (animation: Phaser.Animations.Animation) => {
      markComplete(animation);
    });

    for (const key of keys) {
      const animation = this.anims.get(key);
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.testid = `play-${key}`;
      button.textContent = key;
      button.addEventListener('click', () => {
        state.dataset.animation = key;
        state.dataset.cycleComplete = 'false';
        state.dataset.frameCount = String(animation.frames.length);
        state.dataset.finalFrame = String(animation.frames.at(-1)?.textureFrame ?? '');
        sprite.play(key, true);
      });
      panel.append(button);
    }

    parent.append(panel);
    panel.dataset.ready = 'true';
  }
}
