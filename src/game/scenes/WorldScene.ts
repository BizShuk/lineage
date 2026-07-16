import Phaser from 'phaser';

import { ErrorBoundary, type DiagnosticDownload, type RecoveryView } from '../../app/ErrorBoundary';
import type { AudioDirector } from '../../audio/AudioDirector';
import type { GameContent } from '../../content/catalog';
import {
  addItem,
  buyItem,
  equipItem,
  removeItem,
  sellItem,
  useItem,
  type EquipmentState,
  type InventoryFailureReason,
  type InventoryState,
  type ItemDefinition,
} from '../../core/inventory';
import { experienceFloorForLevel } from '../../core/progression';
import {
  chooseDialogue,
  startQuest,
  type DialogueNode,
  type QuestCatalog,
} from '../../core/quests';
import { deriveStats } from '../../core/stats';
import { AutosaveCoordinator, type AutosaveReason } from '../../storage/AutosaveCoordinator';
import type { SaveRepository } from '../../storage/SaveRepository';
import { sealSaveV1, type SaveGameV1 } from '../../storage/saveSchema';
import { WorldUi, type WorldPanelViewModels } from '../../ui/WorldUi';
import type { HudViewModel } from '../../ui/Hud';
import type { PanelId as UiPanelId } from '../../ui/WindowManager';
import type { SettingsPanelViewModel } from '../../ui/panels/SettingsPanel';
import type { PanelActionResult } from '../../ui/panels/shared';
import type { MonsterState } from '../../world/ai';
import { TileGrid, type GridRectangle } from '../../world/grid';
import { CONTENT_REGISTRY_KEY, SAVE_REPOSITORY_REGISTRY_KEY } from './BootScene';
import { ensureAudioDirector } from './MenuScene';
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

const dialogueNodes: Readonly<Record<string, DialogueNode>> = {
  welcome: {
    id: 'welcome',
    text: '歡迎來到說話之島。',
    choices: [
      {
        id: 'continue',
        text: '請告訴我該從哪裡開始。',
        nextNodeId: 'guide',
        signal: { type: 'npc-talked', npcId: 'village-elder-jered' },
      },
    ],
  },
  guide: {
    id: 'guide',
    text: '先到村莊補給，再前往訓練場。',
    choices: [{ id: 'back', text: '我明白了。', nextNodeId: 'welcome' }],
  },
};

const inventoryFailureText: Readonly<Record<InventoryFailureReason, string>> = {
  overweight: '負重過高',
  'missing-item': '沒有足夠的物品',
  'wrong-class': '目前職業無法使用',
  'quest-item': '任務物品不可出售',
  'insufficient-adena': '金幣不足',
  'invalid-quantity': '數量或操作無效',
};

const domainItem = (content: GameContent, itemId: string): ItemDefinition => {
  const item = content.item(itemId);
  return {
    id: item.id,
    name: item.name,
    kind: item.kind,
    weight: item.weight,
    stackLimit: item.stackLimit,
    buyPrice: item.buyPrice,
    sellPrice: item.sellPrice,
    allowedClasses: item.allowedClasses,
    ...(item.equipmentSlot === undefined ? {} : { equipmentSlot: item.equipmentSlot }),
    ...(item.healAmount === undefined ? {} : { healAmount: item.healAmount }),
  };
};

const inventoryQuantity = (inventory: InventoryState, itemId: string): number =>
  inventory.stacks.find((stack) => stack.itemId === itemId)?.quantity ?? 0;

const experiencePercent = (level: number, experience: number): number => {
  const floor = experienceFloorForLevel(level);
  const ceiling = experienceFloorForLevel(level + 1);
  return Math.floor(((experience - floor) / Math.max(1, ceiling - floor)) * 100);
};

const equipmentAC = (content: GameContent, equipment: EquipmentState): number =>
  Object.values(equipment).reduce(
    (total, itemId) => total + (content.item(itemId).acModifier ?? 0),
    0,
  );

const createE2EUiSave = (save: SaveGameV1, content: GameContent): SaveGameV1 => {
  const stacks = save.inventory.stacks.map((stack) =>
    stack.itemId === 'red-potion' ? { ...stack, quantity: 3 } : stack,
  );
  const carriedWeight = stacks.reduce(
    (weight, stack) => weight + content.item(stack.itemId).weight * stack.quantity,
    0,
  );
  return sealSaveV1({
    ...save,
    checksum: '',
    inventory: { ...save.inventory, stacks, adena: 500, carriedWeight },
    character: { ...save.character, carriedWeight },
  });
};

const panelFailure = <T>(reason: string): PanelActionResult<T> => ({ ok: false, reason });

const equipmentSlotNames: Readonly<Record<string, string>> = {
  weapon: '武器',
  shield: '盾牌',
  helmet: '頭盔',
  armor: '盔甲',
  cloak: '斗篷',
  gloves: '手套',
  boots: '長靴',
  amulet: '項鍊',
  ring: '戒指',
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
  #worldUi: WorldUi | null = null;
  #content: GameContent | null = null;
  #activeSave: SaveGameV1 | null = null;
  #warehouse: InventoryState = {
    stacks: [],
    adena: 0,
    carriedWeight: 0,
    weightLimit: Number.MAX_SAFE_INTEGER,
  };
  #dialogueNodeId = 'welcome';
  #lastFeedback = '';
  #manualE2E = false;
  #audioDirector: AudioDirector | null = null;
  #audioRegion: string | null = null;
  #audioStatus: HTMLOutputElement | null = null;
  #autosave: AutosaveCoordinator | null = null;
  #repository: SaveRepository | null = null;
  #saveControls: HTMLElement | null = null;
  #autosaveStatus: HTMLOutputElement | null = null;
  #recoveryOverlay: HTMLElement | null = null;
  #capturingRuntimeError = false;
  #failNextRenderer = false;

  constructor() {
    super('world');
  }

  create(): void {
    const parent = this.game.canvas.parentElement;
    if (parent === null) return;
    parent.dataset.scene = 'world';
    this.#root = parent;
    this.#audioDirector = ensureAudioDirector(this);
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
    window.addEventListener('error', this.#windowError);
    window.addEventListener('unhandledrejection', this.#unhandledRejection);
    this.game.canvas.addEventListener('wheel', this.#wheel, { passive: false });
    this.game.canvas.addEventListener('pointerdown', this.#focusCanvas);
    void this.#initialize();
  }

  update(_time: number, delta: number): void {
    if (this.#controller === null || this.#manualE2E) return;
    this.#advanceWorld(delta);
  }

  async #initialize(): Promise<void> {
    const content = this.registry.get(CONTENT_REGISTRY_KEY) as GameContent;
    const storedSave = this.registry.get('active-save') as SaveGameV1;
    const save = this.#manualE2E ? createE2EUiSave(storedSave, content) : storedSave;
    this.#content = content;
    this.#activeSave = save;
    this.registry.set('active-save', save);
    this.#audioDirector?.updateSettings(save.settings);
    if (window.__lineageAudioE2E !== undefined) {
      window.__lineageAudioE2E.activeSettings = { ...save.settings };
      window.__lineageAudioE2E.routeRegion = (regionId) => {
        this.#routeAudioRegion(regionId);
      };
    }
    this.#syncAudioStatus();
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
    this.#repository = this.registry.get(SAVE_REPOSITORY_REGISTRY_KEY) as SaveRepository;
    this.#autosave = new AutosaveCoordinator(
      {
        put: async (nextSave) => {
          const repository = this.#repository;
          if (repository === null) throw new Error('找不到存檔資料庫');
          await repository.put(nextSave);
        },
      },
      () => this.#serializableSave(),
    );
    this.#renderer = new EntityRenderer(this);
    this.#combatPresenter = new CombatPresenter(this, (id) => this.#renderer?.positionOf(id) ?? null);
    this.cameras.main.setViewport(0, 0, 512, 432);
    this.#wirePointerInput();
    this.#createWorldUi();
    this.#createSaveControls();
    if (this.#manualE2E) this.#createE2EPanel();
    this.#render();
  }

  #createWorldUi(): void {
    if (this.#root === null || this.#controller === null) return;
    this.#worldUi = new WorldUi(document, this.#root, {
      inventory: {
        activateItem: (itemId) => this.#activateInventoryItem(itemId),
        assignQuickSlot: (itemId, slot) => this.#assignItemQuickSlot(itemId, slot),
      },
      spells: {
        activateSpell: () => panelFailure('請在遊戲世界中選擇施法目標'),
        assignQuickSlot: (spellId, slot) => this.#assignSpellQuickSlot(spellId, slot),
      },
      quests: { activateQuest: (questId) => this.#activateQuest(questId) },
      map: {
        selectLocation: () => ({ ok: true, viewModel: this.#panelModels().map }),
      },
      dialogue: { choose: (choiceId) => this.#chooseDialogue(choiceId) },
      shop: {
        buy: (itemId, quantity) => this.#buyShopItem(itemId, quantity),
        sell: (itemId, quantity) => this.#sellShopItem(itemId, quantity),
      },
      warehouse: {
        deposit: (itemId, quantity) => this.#depositWarehouseItem(itemId, quantity),
        withdraw: (itemId, quantity) => this.#withdrawWarehouseItem(itemId, quantity),
      },
      settings: {
        preview: (settings) => {
          this.#previewSettings(settings);
        },
        save: (settings) => this.#saveSettings(settings),
      },
    });
    this.#worldUi.renderPanels(this.#panelModels());
    this.#worldUi.renderHud(this.#hudViewModel(this.#controller.snapshot));
  }

  #panelModels(): WorldPanelViewModels {
    const content = this.#content;
    const save = this.#activeSave;
    const snapshot = this.#controller?.snapshot;
    if (content === null || save === null || snapshot === undefined) {
      throw new Error('世界 UI 尚未初始化');
    }
    const character = {
      ...snapshot.character,
      carriedWeight: save.inventory.carriedWeight,
      equipmentAC: save.character.equipmentAC,
    };
    const stats = deriveStats(character);
    const classDefinition = content.classes.find(({ id }) => id === character.classId);
    const dialogue = dialogueNodes[this.#dialogueNodeId] ?? dialogueNodes.welcome;
    if (classDefinition === undefined || dialogue === undefined) {
      throw new Error('世界 UI 缺少必要內容');
    }
    const map = content.map(snapshot.player.mapId);
    const shopItemIds = new Set([
      ...content.npc('balsim').shopItemIds,
      ...save.inventory.stacks.map(({ itemId }) => itemId),
    ]);
    const warehouseItemIds = new Set([
      ...save.inventory.stacks.map(({ itemId }) => itemId),
      ...this.#warehouse.stacks.map(({ itemId }) => itemId),
    ]);

    return {
      character: {
        name: character.name,
        className: classDefinition.name,
        level: character.level,
        hp: character.hp,
        maxHP: stats.maxHP,
        mp: character.mp,
        maxMP: stats.maxMP,
        ac: stats.ac,
        weight: save.inventory.carriedWeight,
        weightLimit: save.inventory.weightLimit,
        alignment: character.alignment,
        experiencePercent: experiencePercent(character.level, character.experience),
        equipment: Object.entries(save.equipment).map(([slot, itemId]) => ({
          slot: equipmentSlotNames[slot] ?? slot,
          label: content.item(itemId).name,
        })),
      },
      inventory: {
        adena: save.inventory.adena,
        weight: save.inventory.carriedWeight,
        weightLimit: save.inventory.weightLimit,
        items: save.inventory.stacks.map(({ itemId, quantity }) => ({
          id: itemId,
          name: content.item(itemId).name,
          quantity,
          equipped: false,
        })),
      },
      spells: {
        currentMP: character.mp,
        spells: classDefinition.abilityIds.map((abilityId) => {
          const ability = content.ability(abilityId);
          return {
            id: ability.id,
            name: ability.name,
            manaCost: ability.manaCost,
            available: character.level >= ability.unlockLevel,
          };
        }),
        quickSlots: save.quickSlots,
      },
      quests: {
        quests: content.quests.map((quest) => ({
          id: quest.id,
          name: quest.name,
          stage: save.quests.active[quest.id]?.stage ?? '尚未開始',
          description: quest.description,
          completed: save.quests.completed.includes(quest.id),
        })),
      },
      map: {
        mapName: map.name,
        playerX: snapshot.player.x,
        playerY: snapshot.player.y,
        locations: map.exits.map((exit, index) => ({
          id: `${map.id}-exit-${String(index)}`,
          name: content.map(exit.targetMapId).name,
          x: exit.x,
          y: exit.y,
        })),
      },
      dialogue: {
        speaker: '村莊長老傑瑞德',
        text: dialogue.text,
        choices: dialogue.choices.map((choice) => ({ id: choice.id, label: choice.text })),
      },
      shop: {
        adena: save.inventory.adena,
        items: [...shopItemIds].map((itemId) => {
          const item = content.item(itemId);
          return {
            id: item.id,
            name: item.name,
            buyPrice: item.buyPrice,
            sellPrice: item.sellPrice,
            owned: inventoryQuantity(save.inventory, item.id),
          };
        }),
      },
      warehouse: {
        fee: 0,
        adena: save.inventory.adena,
        items: [...warehouseItemIds].map((itemId) => ({
          id: itemId,
          name: content.item(itemId).name,
          carried: inventoryQuantity(save.inventory, itemId),
          stored: inventoryQuantity(this.#warehouse, itemId),
        })),
      },
      settings: save.settings,
    };
  }

  #hudViewModel(snapshot: WorldSnapshot): HudViewModel {
    const content = this.#content;
    const save = this.#activeSave;
    if (content === null || save === null) {
      throw new Error('世界 HUD 尚未初始化');
    }
    const character = {
      ...snapshot.character,
      carriedWeight: save.inventory.carriedWeight,
      equipmentAC: save.character.equipmentAC,
    };
    const stats = deriveStats(character);
    const target = snapshot.monsters.find(({ id }) => id === snapshot.autoAttackTargetId);
    return {
      hp: character.hp,
      maxHP: stats.maxHP,
      mp: character.mp,
      maxMP: stats.maxMP,
      level: character.level,
      experiencePercent: experiencePercent(character.level, character.experience),
      ac: stats.ac,
      weight: save.inventory.carriedWeight,
      weightLimit: save.inventory.weightLimit,
      alignment: character.alignment,
      target:
        target === undefined
          ? null
          : {
              name: content.monster(target.monsterId).name,
              hpPercent: Math.floor((target.hp / Math.max(1, target.maxHP)) * 100),
            },
      quickSlots: save.quickSlots.map((contentId) => {
        if (contentId === null) return null;
        const item = content.items.find(({ id }) => id === contentId);
        if (item !== undefined) {
          return {
            icon: item.assetKey,
            label: item.name,
            quantity: inventoryQuantity(save.inventory, item.id),
          };
        }
        const ability = content.abilities.find(({ id }) => id === contentId);
        return ability === undefined
          ? null
          : { icon: ability.assetKey, label: ability.name };
      }),
      messages:
        this.#lastFeedback.length === 0
          ? []
          : [{ id: 'latest-feedback', kind: 'combat', text: this.#lastFeedback }],
    };
  }

  #refreshHud(): void {
    if (this.#controller !== null) {
      this.#worldUi?.renderHud(this.#hudViewModel(this.#controller.snapshot));
    }
  }

  #storeSave(save: SaveGameV1): void {
    this.#activeSave = save;
    this.#controller?.syncSerializableState(save);
    this.registry.set('active-save', save);
    if (window.__lineageAudioE2E !== undefined) {
      window.__lineageAudioE2E.activeSettings = { ...save.settings };
    }
    this.#refreshHud();
  }

  #serializableSave(): SaveGameV1 {
    const save = this.#activeSave;
    const snapshot = this.#controller?.snapshot;
    if (save === null || snapshot === undefined) throw new Error('世界存檔尚未準備完成');
    return sealSaveV1({
      ...save,
      character: snapshot.character,
      inventory: snapshot.inventory,
      quests: snapshot.quests,
      world: snapshot.world,
      checksum: '',
    });
  }

  #syncActiveSaveFromController(): void {
    if (this.#activeSave === null || this.#controller === null) return;
    const save = this.#serializableSave();
    this.#activeSave = save;
    this.registry.set('active-save', save);
  }

  #advanceWorld(delta: number): void {
    const controller = this.#controller;
    if (controller === null) return;
    this.#autosave?.setCombatTransactionPending(true);
    try {
      controller.update(delta);
      const reasons = controller.drainPersistenceEvents();
      reasons.forEach((reason) => {
        void this.#requestAutosave(reason);
      });
    } catch (error) {
      void this.#captureRuntimeError(error);
      return;
    } finally {
      this.#autosave?.setCombatTransactionPending(false);
    }
    this.#render();
  }

  async #requestAutosave(reason: AutosaveReason, announce = false): Promise<boolean> {
    const autosave = this.#autosave;
    if (autosave === null) return false;
    const result = await autosave.request(reason);
    if (!result.ok) {
      if (announce && this.#autosaveStatus !== null) {
        this.#autosaveStatus.textContent = '儲存失敗，請稍後再試。';
      }
      return false;
    }
    this.#activeSave = result.save;
    this.registry.set('active-save', result.save);
    if (announce && this.#autosaveStatus !== null) {
      this.#autosaveStatus.textContent = '已儲存目前進度。';
    }
    return true;
  }

  #createSaveControls(): void {
    if (this.#root === null) return;
    const controls = document.createElement('section');
    controls.setAttribute('aria-label', '存檔操作');
    controls.style.cssText =
      'position:absolute;z-index:25;right:8px;top:8px;display:flex;gap:4px;align-items:center';
    const manual = document.createElement('button');
    manual.type = 'button';
    manual.dataset.testid = 'manual-save';
    manual.textContent = '手動儲存';
    manual.addEventListener('click', () => {
      void this.#requestAutosave('manual', true);
    });
    const menu = document.createElement('button');
    menu.type = 'button';
    menu.dataset.testid = 'return-menu';
    menu.textContent = '返回主選單';
    menu.addEventListener('click', () => {
      void this.#returnToMenu();
    });
    const status = document.createElement('output');
    status.dataset.testid = 'autosave-status';
    status.setAttribute('aria-live', 'polite');
    controls.append(manual, menu, status);
    this.#root.append(controls);
    this.#saveControls = controls;
    this.#autosaveStatus = status;
  }

  async #returnToMenu(): Promise<void> {
    const saved = await this.#requestAutosave('return-menu', true);
    if (!saved || !this.scene.isActive()) return;
    this.scene.start('menu');
  }

  #sealedSave(patch: Partial<SaveGameV1>): SaveGameV1 {
    const save = this.#activeSave;
    if (save === null) throw new Error('找不到目前存檔');
    return sealSaveV1({
      ...save,
      ...patch,
      checksum: '',
      updatedAt: new Date().toISOString(),
    });
  }

  #activateInventoryItem(
    itemId: string,
  ): PanelActionResult<WorldPanelViewModels['inventory']> {
    const content = this.#content;
    const save = this.#activeSave;
    if (content === null || save === null) return panelFailure('世界尚未準備完成');
    const item = domainItem(content, itemId);
    if (item.equipmentSlot !== undefined) {
      const result = equipItem(save.inventory, save.equipment, save.character, item);
      if (!result.ok) return panelFailure(inventoryFailureText[result.reason]);
      const character = {
        ...save.character,
        carriedWeight: result.inventory.carriedWeight,
        equipmentAC: equipmentAC(content, result.equipment),
      };
      this.#storeSave(
        this.#sealedSave({
          inventory: result.inventory,
          equipment: result.equipment,
          character,
        }),
      );
      return { ok: true, viewModel: this.#panelModels().inventory };
    }
    if (item.kind === 'consumable') {
      const result = useItem(save.inventory, save.character, item);
      if (!result.ok) return panelFailure(inventoryFailureText[result.reason]);
      this.#storeSave(
        this.#sealedSave({
          inventory: result.inventory,
          character: { ...result.character, carriedWeight: result.inventory.carriedWeight },
        }),
      );
      return { ok: true, viewModel: this.#panelModels().inventory };
    }
    return panelFailure('此物品目前無法直接使用');
  }

  #assignItemQuickSlot(
    itemId: string,
    slot: number,
  ): PanelActionResult<WorldPanelViewModels['inventory']> {
    const content = this.#content;
    const save = this.#activeSave;
    if (content === null || save === null) return panelFailure('世界尚未準備完成');
    if (
      !Number.isInteger(slot) ||
      slot < 0 ||
      slot >= save.quickSlots.length ||
      inventoryQuantity(save.inventory, itemId) < 1 ||
      !content.items.some(({ id }) => id === itemId)
    ) {
      return panelFailure('不可放入快捷列');
    }
    const quickSlots = [...save.quickSlots];
    quickSlots[slot] = itemId;
    this.#storeSave(this.#sealedSave({ quickSlots }));
    return { ok: true, viewModel: this.#panelModels().inventory };
  }

  #assignSpellQuickSlot(
    spellId: string,
    slot: number,
  ): PanelActionResult<WorldPanelViewModels['spells']> {
    const content = this.#content;
    const save = this.#activeSave;
    if (content === null || save === null) return panelFailure('世界尚未準備完成');
    const classDefinition = content.classes.find(({ id }) => id === save.character.classId);
    const ability = content.abilities.find(({ id }) => id === spellId);
    if (
      classDefinition === undefined ||
      ability === undefined ||
      !classDefinition.abilityIds.includes(spellId) ||
      save.character.level < ability.unlockLevel ||
      !Number.isInteger(slot) ||
      slot < 0 ||
      slot >= save.quickSlots.length
    ) {
      return panelFailure('此技能尚未解鎖');
    }
    const quickSlots = [...save.quickSlots];
    quickSlots[slot] = spellId;
    this.#storeSave(this.#sealedSave({ quickSlots }));
    return { ok: true, viewModel: this.#panelModels().spells };
  }

  #activateQuest(
    questId: string,
  ): PanelActionResult<WorldPanelViewModels['quests']> {
    const content = this.#content;
    const save = this.#activeSave;
    if (content === null || save === null) return panelFailure('世界尚未準備完成');
    const catalog: QuestCatalog = Object.fromEntries(
      content.quests.map((quest) => [quest.id, quest]),
    );
    const quests = startQuest(save.quests, questId, save.character.classId, catalog);
    if (quests === save.quests) return panelFailure('目前無法開始此任務');
    this.#storeSave(this.#sealedSave({ quests }));
    void this.#requestAutosave('quest-stage');
    return { ok: true, viewModel: this.#panelModels().quests };
  }

  #chooseDialogue(
    choiceId: string,
  ): PanelActionResult<WorldPanelViewModels['dialogue']> {
    const node = dialogueNodes[this.#dialogueNodeId];
    if (node === undefined) return panelFailure('找不到目前對話');
    const result = chooseDialogue(node, choiceId);
    if (!result.ok) return panelFailure('找不到對話選項');
    this.#dialogueNodeId = result.nextNodeId ?? this.#dialogueNodeId;
    const save = this.#activeSave;
    const content = this.#content;
    if (save !== null && content !== null && choiceId === 'continue') {
      const catalog: QuestCatalog = Object.fromEntries(
        content.quests.map((quest) => [quest.id, quest]),
      );
      const quests = startQuest(
        save.quests,
        'village-registration',
        save.character.classId,
        catalog,
      );
      if (quests !== save.quests) {
        this.#storeSave(this.#sealedSave({ quests }));
        void this.#requestAutosave('quest-stage');
      }
    }
    return { ok: true, viewModel: this.#panelModels().dialogue };
  }

  #buyShopItem(
    itemId: string,
    quantity: number,
  ): PanelActionResult<WorldPanelViewModels['shop']> {
    const content = this.#content;
    const save = this.#activeSave;
    if (content === null || save === null) return panelFailure('世界尚未準備完成');
    if (!content.npc('balsim').shopItemIds.includes(itemId)) {
      return panelFailure('商店沒有販售此物品');
    }
    const result = buyItem(save.inventory, domainItem(content, itemId), quantity);
    if (!result.ok) return panelFailure(inventoryFailureText[result.reason]);
    this.#storeSave(
      this.#sealedSave({
        inventory: result.inventory,
        character: { ...save.character, carriedWeight: result.inventory.carriedWeight },
      }),
    );
    return { ok: true, viewModel: this.#panelModels().shop };
  }

  #sellShopItem(
    itemId: string,
    quantity: number,
  ): PanelActionResult<WorldPanelViewModels['shop']> {
    const content = this.#content;
    const save = this.#activeSave;
    if (content === null || save === null) return panelFailure('世界尚未準備完成');
    const result = sellItem(save.inventory, domainItem(content, itemId), quantity);
    if (!result.ok) return panelFailure(inventoryFailureText[result.reason]);
    this.#storeSave(
      this.#sealedSave({
        inventory: result.inventory,
        character: { ...save.character, carriedWeight: result.inventory.carriedWeight },
      }),
    );
    return { ok: true, viewModel: this.#panelModels().shop };
  }

  #depositWarehouseItem(
    itemId: string,
    quantity: number,
  ): PanelActionResult<WorldPanelViewModels['warehouse']> {
    const content = this.#content;
    const save = this.#activeSave;
    if (content === null || save === null) return panelFailure('世界尚未準備完成');
    const item = domainItem(content, itemId);
    const removed = removeItem(save.inventory, item, quantity);
    if (!removed.ok) return panelFailure(inventoryFailureText[removed.reason]);
    const added = addItem(this.#warehouse, item, quantity);
    if (!added.ok) return panelFailure(inventoryFailureText[added.reason]);
    this.#warehouse = added.inventory;
    this.#storeSave(
      this.#sealedSave({
        inventory: removed.inventory,
        character: { ...save.character, carriedWeight: removed.inventory.carriedWeight },
      }),
    );
    return { ok: true, viewModel: this.#panelModels().warehouse };
  }

  #withdrawWarehouseItem(
    itemId: string,
    quantity: number,
  ): PanelActionResult<WorldPanelViewModels['warehouse']> {
    const content = this.#content;
    const save = this.#activeSave;
    if (content === null || save === null) return panelFailure('世界尚未準備完成');
    const item = domainItem(content, itemId);
    const removed = removeItem(this.#warehouse, item, quantity);
    if (!removed.ok) return panelFailure(inventoryFailureText[removed.reason]);
    const added = addItem(save.inventory, item, quantity);
    if (!added.ok) return panelFailure(inventoryFailureText[added.reason]);
    this.#warehouse = removed.inventory;
    this.#storeSave(
      this.#sealedSave({
        inventory: added.inventory,
        character: { ...save.character, carriedWeight: added.inventory.carriedWeight },
      }),
    );
    return { ok: true, viewModel: this.#panelModels().warehouse };
  }

  #saveSettings(
    settings: SettingsPanelViewModel,
  ): PanelActionResult<WorldPanelViewModels['settings']> {
    if (
      ![settings.music, settings.ambient, settings.effects].every(
        (value) => Number.isFinite(value) && value >= 0 && value <= 1,
      ) ||
      ![1, 2, 3].includes(settings.scale)
    ) {
      return panelFailure('設定值超出範圍');
    }
    this.#previewSettings(settings);
    this.#storeSave(this.#sealedSave({ settings }));
    this.#root?.style.setProperty('--game-scale', String(settings.scale));
    return { ok: true, viewModel: this.#panelModels().settings };
  }

  #previewSettings(settings: SettingsPanelViewModel): void {
    this.#audioDirector?.updateSettings(settings);
    this.#syncAudioStatus();
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
    try {
      if (command.type === 'toggle-panel') {
        this.#worldUi?.renderPanels(this.#panelModels());
        this.#worldUi?.toggle(command.panel);
      } else if (command.type === 'escape') {
        this.#worldUi?.closeTop();
      } else if (command.type === 'interact' && command.targetId === 'e2e-village-elder') {
        this.#worldUi?.renderPanels(this.#panelModels());
        this.#worldUi?.open('dialogue');
      }
      this.#controller.dispatch(command);
      if (this.#root !== null) this.#root.dataset.lastCommand = command.type;
      this.#render();
    } catch (error) {
      void this.#captureRuntimeError(error);
    }
  }

  #render(): void {
    try {
      if (this.#failNextRenderer) {
        this.#failNextRenderer = false;
        throw new Error('E2E renderer exception');
      }
      this.#renderUnsafe();
    } catch (error) {
      void this.#captureRuntimeError(error);
    }
  }

  #renderUnsafe(): void {
    if (this.#controller === null || this.#renderer === null) return;
    this.#syncActiveSaveFromController();
    const snapshot = this.#controller.snapshot;
    this.#routeAudioRegion(snapshot.player.mapId);
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
    this.#worldUi?.renderHud(this.#hudViewModel(snapshot));
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
    this.#inputController.setNearestInteractable(
      loot?.id ?? (this.#manualE2E ? 'e2e-village-elder' : null),
    );
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
      this.#advanceWorld(250);
    });
    const rendererError = document.createElement('button');
    rendererError.type = 'button';
    rendererError.dataset.testid = 'trigger-renderer-error';
    rendererError.textContent = '觸發繪製錯誤';
    rendererError.addEventListener('click', () => {
      this.#failNextRenderer = true;
      this.#render();
    });
    const fixturePanels: readonly (readonly [string, string, UiPanelId])[] = [
      ['open-dialogue', '對話測試', 'dialogue'],
      ['open-shop', '商店測試', 'shop'],
      ['open-warehouse', '倉庫測試', 'warehouse'],
      ['open-settings', '設定測試', 'settings'],
    ];
    const fixtureButtons = fixturePanels.map(([testId, label, panelId]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.testid = testId;
      button.textContent = label;
      button.addEventListener('click', () => {
        this.#worldUi?.renderPanels(this.#panelModels());
        this.#worldUi?.open(panelId);
      });
      return button;
    });
    panel.append(ground, step, rendererError, ...fixtureButtons);
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

  async #captureRuntimeError(error: unknown): Promise<void> {
    if (this.#capturingRuntimeError) return;
    this.#capturingRuntimeError = true;
    const boundary = new ErrorBoundary(
      {
        pause: () => {
          this.#controller?.setPaused(true);
          this.scene.pause();
        },
        save: async () => {
          if (!(await this.#requestAutosave('manual'))) {
            throw new Error('best-effort autosave failed');
          }
        },
        presentRecovery: (view) => {
          this.#presentRecovery(view);
        },
        returnToMenu: () => {
          this.#removeRecovery();
          this.scene.resume();
          this.scene.start('menu');
        },
        loadLatestSave: async () => {
          const repository = this.#repository;
          const slot = this.#activeSave?.slot;
          if (repository === null || slot === undefined) return;
          const save = await repository.get(slot);
          if (save === null) return;
          this.registry.set('active-save', save);
          this.#removeRecovery();
          this.scene.resume();
          this.scene.restart();
        },
        exportDiagnostic: (download) => {
          this.#downloadDiagnostic(download);
        },
      },
      { development: window.location.hostname === 'localhost' },
    );
    try {
      await boundary.capture(error, {
        scene: 'WorldScene',
        mapId: this.#controller?.snapshot.player.mapId ?? null,
      });
    } finally {
      this.#capturingRuntimeError = false;
    }
  }

  #presentRecovery(view: RecoveryView): void {
    if (this.#root === null) return;
    this.#removeRecovery();
    const recovery = document.createElement('section');
    recovery.className = 'scene-overlay';
    recovery.dataset.testid = 'runtime-recovery';
    recovery.setAttribute('role', 'alertdialog');
    recovery.setAttribute('aria-label', view.title);
    recovery.style.cssText = 'z-index:50;padding:20px;display:grid;gap:10px';
    const heading = document.createElement('h2');
    heading.textContent = view.title;
    const message = document.createElement('p');
    message.textContent = view.message;
    recovery.append(heading, message);
    view.actions.forEach((action) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.testid = `recovery-${action.id}`;
      button.textContent = action.label;
      button.addEventListener('click', () => {
        void action.run();
      });
      recovery.append(button);
    });
    this.#root.append(recovery);
    this.#recoveryOverlay = recovery;
  }

  #downloadDiagnostic(download: DiagnosticDownload): void {
    const blob = new Blob([download.contents], { type: download.mediaType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = download.fileName;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  #removeRecovery(): void {
    this.#recoveryOverlay?.remove();
    this.#recoveryOverlay = null;
  }

  #keyDown = (event: KeyboardEvent): void => {
    if (this.#controller === null) return;
    const target = event.target;
    if (
      event.code !== 'Escape' &&
      (target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement)
    ) {
      return;
    }
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
    this.#audioDirector?.resume();
    this.#syncAudioStatus();
  };

  #visibilityChange = (): void => {
    const hidden = window.__lineageAudioE2E?.hidden ?? document.hidden;
    this.#controller?.setPaused(hidden);
    if (hidden) {
      this.#audioDirector?.suspend();
    } else if (this.#audioDirector?.state.phase === 'suspended') {
      this.#audioDirector.resume();
    }
    this.#syncAudioStatus();
  };

  #windowError = (event: ErrorEvent): void => {
    event.preventDefault();
    void this.#captureRuntimeError(event.error ?? event.message);
  };

  #unhandledRejection = (event: PromiseRejectionEvent): void => {
    event.preventDefault();
    void this.#captureRuntimeError(event.reason);
  };

  #pause = (): void => {
    this.#controller?.setPaused(true);
    this.#audioDirector?.suspend();
    this.#syncAudioStatus();
  };

  #resume = (): void => {
    this.#controller?.setPaused(false);
    if (this.#audioDirector?.state.phase === 'suspended') this.#audioDirector.resume();
    this.#syncAudioStatus();
  };

  #routeAudioRegion(regionId: string): void {
    if (regionId === this.#audioRegion) return;
    this.#audioDirector?.enterRegion(regionId);
    this.#audioRegion = regionId;
    this.#syncAudioStatus();
  }

  #syncAudioStatus(): void {
    const message = this.#audioDirector?.state.message ?? null;
    if (message === null || this.#root === null) {
      this.#audioStatus?.remove();
      this.#audioStatus = null;
      return;
    }
    const status = this.#audioStatus ?? document.createElement('output');
    status.dataset.testid = 'audio-status';
    status.setAttribute('role', 'status');
    status.style.cssText =
      'position:absolute;z-index:20;left:50%;bottom:12px;transform:translateX(-50%);pointer-events:none';
    status.textContent = message;
    if (this.#audioStatus === null) this.#root.append(status);
    this.#audioStatus = status;
  }

  #destroy(): void {
    document.removeEventListener('visibilitychange', this.#visibilityChange);
    window.removeEventListener('keydown', this.#keyDown);
    window.removeEventListener('error', this.#windowError);
    window.removeEventListener('unhandledrejection', this.#unhandledRejection);
    this.game.canvas.removeEventListener('wheel', this.#wheel);
    this.game.canvas.removeEventListener('pointerdown', this.#focusCanvas);
    this.events.off(Phaser.Scenes.Events.PAUSE, this.#pause);
    this.events.off(Phaser.Scenes.Events.RESUME, this.#resume);
    this.#renderer?.destroy();
    this.#autosave?.dispose();
    this.#autosave = null;
    this.#repository = null;
    this.#worldUi?.destroy();
    this.#worldUi = null;
    this.#audioDirector?.dispose();
    this.#audioDirector = null;
    this.#audioStatus?.remove();
    this.#audioStatus = null;
    this.#saveControls?.remove();
    this.#saveControls = null;
    this.#autosaveStatus = null;
    this.#removeRecovery();
    if (window.__lineageAudioE2E !== undefined) {
      window.__lineageAudioE2E.routeRegion = null;
    }
    this.#e2ePanel?.remove();
    this.#e2ePanel = null;
  }
}
