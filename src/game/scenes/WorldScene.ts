import Phaser from 'phaser';

import type { GameContent } from '../../content/catalog';
import type { SaveGameV1 } from '../../storage/saveSchema';
import type { MonsterState } from '../../world/ai';
import { TileGrid, type GridRectangle } from '../../world/grid';
import { CONTENT_REGISTRY_KEY } from './BootScene';
import { CombatPresenter } from '../systems/CombatPresenter';
import { EntityRenderer, TILE_SIZE } from '../systems/EntityRenderer';
import {
  InputController,
  type PlayerCommand,
  type PointerTarget,
} from '../systems/InputController';
import { WorldController, type WorldSnapshot } from '../systems/WorldController';

interface MapAsset {
  readonly width: number;
  readonly height: number;
  readonly collisionLayer: { readonly blockedRectangles: readonly GridRectangle[] };
}

const mapAssetNames: Readonly<Record<string, string>> = {
  'talking-island-village': 'village',
  'scarecrow-field': 'scarecrow-field',
  'north-field': 'north-field',
  coast: 'coast',
  'black-knight-area': 'black-knight-area',
  'talking-island-dungeon-1': 'dungeon-floor-1',
  'talking-island-dungeon-2': 'dungeon-floor-2',
};

const createE2EMonster = (save: SaveGameV1, content: GameContent): MonsterState => {
  const definition = content.monster('goblin');
  const x = save.world.player.x + 3;
  const y = save.world.player.y;
  return {
    id: 'e2e-goblin',
    monsterId: 'goblin',
    rank: definition.rank,
    mapId: save.world.player.mapId,
    x,
    y,
    homeX: x,
    homeY: y,
    hp: definition.hp,
    maxHP: definition.hp,
    aiState: 'idle',
    alertRadius: 5,
    leashRange: 10,
    patrolRadius: 3,
    attackRange: 1,
    attackCooldownMs: 1_000,
    nextAttackAtMs: 0,
    respawnDelayMs: 20_000,
    defeatedAtMs: null,
    defeatedMapEntry: null,
  };
};

export class WorldScene extends Phaser.Scene {
  readonly #inputController = new InputController();
  #controller: WorldController | null = null;
  #renderer: EntityRenderer | null = null;
  #combatPresenter: CombatPresenter | null = null;
  #root: HTMLElement | null = null;
  #e2ePanel: HTMLElement | null = null;
  #lastFeedback = '';
  #manualE2E = false;

  constructor() {
    super('world');
  }

  create(): void {
    const parent = this.game.canvas.parentElement;
    if (parent === null) return;
    parent.dataset.scene = 'world';
    this.#root = parent;
    this.#manualE2E = new URLSearchParams(window.location.search).get('e2e') === '1';
    this.game.canvas.tabIndex = 0;
    this.game.canvas.setAttribute('aria-label', '說話之島遊戲畫面');
    this.add.rectangle(0, 0, 2048, 2048, 0x172019).setOrigin(0);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.#destroy();
    });
    this.events.on(Phaser.Scenes.Events.PAUSE, this.#pause);
    this.events.on(Phaser.Scenes.Events.RESUME, this.#resume);
    document.addEventListener('visibilitychange', this.#visibilityChange);
    window.addEventListener('keydown', this.#keyDown);
    this.game.canvas.addEventListener('wheel', this.#wheel, { passive: false });
    this.game.canvas.addEventListener('pointerdown', this.#focusCanvas);
    void this.#initialize();
  }

  update(_time: number, delta: number): void {
    if (this.#controller === null || this.#manualE2E) return;
    this.#controller.update(delta);
    this.#render();
  }

  async #initialize(): Promise<void> {
    const content = this.registry.get(CONTENT_REGISTRY_KEY) as GameContent;
    const save = this.registry.get('active-save') as SaveGameV1;
    const grids = new Map(
      await Promise.all(
        content.maps.map(async ({ id }) => [id, await this.#loadGrid(content, id)] as const),
      ),
    );
    if (!this.scene.isActive()) return;

    const monsters = this.#manualE2E ? [createE2EMonster(save, content)] : undefined;
    this.#controller = new WorldController({
      content,
      save,
      grids,
      ...(monsters === undefined ? {} : { monsters }),
      seed: 7,
    });
    this.#renderer = new EntityRenderer(this);
    this.#combatPresenter = new CombatPresenter(this, (id) => this.#renderer?.positionOf(id) ?? null);
    this.#wirePointerInput();
    if (this.#manualE2E) this.#createE2EPanel();
    this.#render();
  }

  async #loadGrid(content: GameContent, mapId: string): Promise<TileGrid> {
    const definition = content.map(mapId);
    const assetName = mapAssetNames[mapId];
    if (assetName === undefined) {
      return TileGrid.fromBlockedRectangles(definition.width, definition.height, []);
    }
    try {
      const response = await fetch(`/assets/maps/${assetName}.map.json`);
      if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
      const asset = (await response.json()) as MapAsset;
      return TileGrid.fromBlockedRectangles(
        asset.width,
        asset.height,
        asset.collisionLayer.blockedRectangles,
      );
    } catch {
      return TileGrid.fromBlockedRectangles(definition.width, definition.height, []);
    }
  }

  #wirePointerInput(): void {
    this.input.on(
      'gameobjectdown',
      (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
        const kind = gameObject.getData('target-kind') as string | undefined;
        const id = gameObject.getData('target-id') as string | undefined;
        if (id === undefined) return;
        if (kind === 'monster') this.#issue({ targetKind: 'monster', targetId: id });
        if (kind === 'loot') this.#issue({ targetKind: 'loot', targetId: id });
        if (kind === 'npc') this.#issue({ targetKind: 'npc', targetId: id });
      },
    );
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.input.hitTestPointer(pointer).length > 0) return;
      this.#issue({
        targetKind: 'ground',
        tileX: Math.floor(pointer.worldX / TILE_SIZE),
        tileY: Math.floor(pointer.worldY / TILE_SIZE),
      });
    });
  }

  #issue(target: PointerTarget): void {
    this.#dispatch(this.#inputController.pointerDown(target));
  }

  #dispatch(command: PlayerCommand | null): void {
    if (command === null || this.#controller === null) return;
    this.#controller.dispatch(command);
    if (this.#root !== null) this.#root.dataset.lastCommand = command.type;
    this.#render();
  }

  #render(): void {
    if (this.#controller === null || this.#renderer === null) return;
    const snapshot = this.#controller.snapshot;
    this.#renderer.render(snapshot);
    const feedback = this.#combatPresenter?.present(this.#controller.drainEvents()) ?? [];
    if (feedback.length > 0) {
      this.#lastFeedback = [this.#lastFeedback, ...feedback].filter(Boolean).slice(-8).join(' / ');
    }
    this.cameras.main.centerOn(
      snapshot.player.x * TILE_SIZE + TILE_SIZE / 2,
      snapshot.player.y * TILE_SIZE + TILE_SIZE / 2,
    );
    this.#syncInputContext(snapshot);
    this.#renderE2EState(snapshot);
  }

  #syncInputContext(snapshot: WorldSnapshot): void {
    this.#inputController.setAutoAttackTarget(snapshot.autoAttackTargetId);
    const loot = snapshot.groundLoot.find(
      (candidate) =>
        Math.max(
          Math.abs(candidate.x - snapshot.player.x),
          Math.abs(candidate.y - snapshot.player.y),
        ) <= 1,
    );
    this.#inputController.setNearestInteractable(loot?.id ?? null);
  }

  #createE2EPanel(): void {
    if (this.#root === null) return;
    const panel = document.createElement('section');
    panel.style.cssText = 'position:absolute;z-index:5;left:8px;top:8px;display:flex;gap:4px;flex-wrap:wrap;max-width:620px';
    panel.dataset.testid = 'world-state';
    const ground = document.createElement('button');
    ground.type = 'button';
    ground.dataset.testid = 'ground-target';
    ground.textContent = '移動測試點';
    ground.addEventListener('click', () => {
      const snapshot = this.#controller?.snapshot;
      if (snapshot === undefined) return;
      this.#issue({
        targetKind: 'ground',
        tileX: snapshot.player.x + 1,
        tileY: snapshot.player.y,
      });
    });
    const step = document.createElement('button');
    step.type = 'button';
    step.dataset.testid = 'simulation-step';
    step.textContent = '步進模擬';
    step.addEventListener('click', () => {
      this.#controller?.update(250);
      this.#render();
    });
    panel.append(ground, step);
    this.#root.append(panel);
    this.#e2ePanel = panel;
  }

  #renderE2EState(snapshot: WorldSnapshot): void {
    const panel = this.#e2ePanel;
    if (panel === null) return;
    panel.dataset.ready = 'true';
    panel.dataset.autoAttack = snapshot.autoAttackTargetId ?? '';
    for (const element of panel.querySelectorAll('[data-ephemeral="true"]')) element.remove();

    const player = document.createElement('output');
    player.dataset.testid = 'player-state';
    player.dataset.ephemeral = 'true';
    player.dataset.x = String(snapshot.player.x);
    player.dataset.y = String(snapshot.player.y);
    player.textContent = `玩家 ${String(snapshot.player.x)},${String(snapshot.player.y)}`;
    const feedback = document.createElement('output');
    feedback.dataset.testid = 'combat-feedback';
    feedback.dataset.ephemeral = 'true';
    feedback.textContent = this.#lastFeedback;
    const inventory = document.createElement('output');
    inventory.dataset.testid = 'inventory-state';
    inventory.dataset.ephemeral = 'true';
    inventory.textContent = snapshot.inventory.stacks.map(({ itemId }) => itemId).join(',');
    panel.append(player, feedback, inventory);

    const goblin = snapshot.monsters.find(({ monsterId }) => monsterId === 'goblin');
    if (goblin !== undefined) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.testid = 'monster-goblin';
      button.dataset.ephemeral = 'true';
      button.dataset.dead = String(goblin.hp <= 0);
      button.textContent = `哥布林 HP ${String(goblin.hp)}`;
      button.addEventListener('click', () => {
        this.#issue({ targetKind: 'monster', targetId: goblin.id });
      });
      panel.append(button);
    }
    for (const loot of snapshot.groundLoot) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.testid = 'ground-loot';
      button.dataset.ephemeral = 'true';
      button.textContent = loot.itemId;
      button.addEventListener('click', () => {
        this.#issue({ targetKind: 'loot', targetId: loot.id });
      });
      panel.append(button);
    }
  }

  #keyDown = (event: KeyboardEvent): void => {
    if (this.#controller === null) return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
    const snapshot = this.#controller.snapshot;
    const command = this.#inputController.keyDown(event.code, snapshot.player, {
      shiftKey: event.shiftKey,
    });
    if (command === null) return;
    if (document.activeElement === this.game.canvas && this.#inputController.isBoundKey(event.code)) {
      event.preventDefault();
    }
    this.#dispatch(command);
  };

  #wheel = (event: WheelEvent): void => {
    const command = this.#inputController.wheel(event.deltaY);
    if (command === null) return;
    if (document.activeElement === this.game.canvas) event.preventDefault();
    if (command.type === 'adjust-scale') {
      this.cameras.main.setZoom(
        Phaser.Math.Clamp(this.cameras.main.zoom + command.direction * 0.25, 0.75, 2),
      );
    }
    this.#dispatch(command);
  };

  #focusCanvas = (): void => {
    this.game.canvas.focus();
  };

  #visibilityChange = (): void => {
    this.#controller?.setPaused(document.hidden);
  };

  #pause = (): void => {
    this.#controller?.setPaused(true);
  };

  #resume = (): void => {
    this.#controller?.setPaused(false);
  };

  #destroy(): void {
    document.removeEventListener('visibilitychange', this.#visibilityChange);
    window.removeEventListener('keydown', this.#keyDown);
    this.game.canvas.removeEventListener('wheel', this.#wheel);
    this.game.canvas.removeEventListener('pointerdown', this.#focusCanvas);
    this.events.off(Phaser.Scenes.Events.PAUSE, this.#pause);
    this.events.off(Phaser.Scenes.Events.RESUME, this.#resume);
    this.#renderer?.destroy();
    this.#e2ePanel?.remove();
    this.#e2ePanel = null;
  }
}
