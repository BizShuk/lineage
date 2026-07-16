import { Hud, type HudViewModel } from './Hud';
import {
  WindowManager,
  createElementFocusScope,
  type PanelId,
} from './WindowManager';
import {
  CharacterPanel,
  type CharacterPanelViewModel,
} from './panels/CharacterPanel';
import {
  DialoguePanel,
  type DialoguePanelActions,
  type DialoguePanelViewModel,
} from './panels/DialoguePanel';
import {
  InventoryPanel,
  type InventoryPanelActions,
  type InventoryPanelViewModel,
} from './panels/InventoryPanel';
import { MapPanel, type MapPanelActions, type MapPanelViewModel } from './panels/MapPanel';
import {
  QuestPanel,
  type QuestPanelActions,
  type QuestPanelViewModel,
} from './panels/QuestPanel';
import {
  SettingsPanel,
  type SettingsPanelActions,
  type SettingsPanelViewModel,
} from './panels/SettingsPanel';
import { ShopPanel, type ShopPanelActions, type ShopPanelViewModel } from './panels/ShopPanel';
import {
  SpellPanel,
  type SpellPanelActions,
  type SpellPanelViewModel,
} from './panels/SpellPanel';
import {
  WarehousePanel,
  type WarehousePanelActions,
  type WarehousePanelViewModel,
} from './panels/WarehousePanel';

export interface WorldUiActions {
  readonly inventory: InventoryPanelActions;
  readonly spells: SpellPanelActions;
  readonly quests: QuestPanelActions;
  readonly map: MapPanelActions;
  readonly dialogue: DialoguePanelActions;
  readonly shop: ShopPanelActions;
  readonly warehouse: WarehousePanelActions;
  readonly settings: SettingsPanelActions;
}

export interface WorldPanelViewModels {
  readonly character: CharacterPanelViewModel;
  readonly inventory: InventoryPanelViewModel;
  readonly spells: SpellPanelViewModel;
  readonly quests: QuestPanelViewModel;
  readonly map: MapPanelViewModel;
  readonly dialogue: DialoguePanelViewModel;
  readonly shop: ShopPanelViewModel;
  readonly warehouse: WarehousePanelViewModel;
  readonly settings: SettingsPanelViewModel;
}

export class WorldUi {
  readonly windows = new WindowManager();
  readonly #root: HTMLElement;
  readonly #hud: Hud;
  readonly #character: CharacterPanel;
  readonly #inventory: InventoryPanel;
  readonly #spells: SpellPanel;
  readonly #quests: QuestPanel;
  readonly #map: MapPanel;
  readonly #dialogue: DialoguePanel;
  readonly #shop: ShopPanel;
  readonly #warehouse: WarehousePanel;
  readonly #settings: SettingsPanel;
  readonly #panels: Readonly<Record<PanelId, HTMLElement>>;

  constructor(document: Document, root: HTMLElement, actions: WorldUiActions) {
    this.#root = root;
    this.#hud = new Hud(document);
    this.#character = new CharacterPanel(document);
    this.#inventory = new InventoryPanel(document, actions.inventory);
    this.#spells = new SpellPanel(document, actions.spells);
    this.#quests = new QuestPanel(document, actions.quests);
    this.#map = new MapPanel(document, actions.map);
    this.#dialogue = new DialoguePanel(document, actions.dialogue);
    this.#shop = new ShopPanel(document, actions.shop);
    this.#warehouse = new WarehousePanel(document, actions.warehouse);
    this.#settings = new SettingsPanel(document, actions.settings);
    this.#panels = {
      character: this.#character.element,
      inventory: this.#inventory.element,
      spells: this.#spells.element,
      quests: this.#quests.element,
      map: this.#map.element,
      dialogue: this.#dialogue.element,
      shop: this.#shop.element,
      warehouse: this.#warehouse.element,
      settings: this.#settings.element,
    };
    Object.values(this.#panels).forEach((panel) => {
      panel.hidden = true;
    });
    root.append(this.#hud.element, ...Object.values(this.#panels));
  }

  renderHud(viewModel: HudViewModel): void {
    this.#hud.render(viewModel);
  }

  renderPanels(viewModels: WorldPanelViewModels): void {
    this.#character.render(viewModels.character);
    this.#inventory.render(viewModels.inventory);
    this.#spells.render(viewModels.spells);
    this.#quests.render(viewModels.quests);
    this.#map.render(viewModels.map);
    this.#dialogue.render(viewModels.dialogue);
    this.#shop.render(viewModels.shop);
    this.#warehouse.render(viewModels.warehouse);
    this.#settings.render(viewModels.settings);
  }

  open(id: PanelId): void {
    const panel = this.#panels[id];
    const active = panel.ownerDocument.activeElement;
    const restoreTarget = active instanceof HTMLElement ? active : null;
    this.windows.open(id, createElementFocusScope(panel, restoreTarget));
    this.#syncPanels();
  }

  toggle(id: PanelId): void {
    if (this.windows.isOpen(id)) {
      this.windows.close(id);
      this.#syncPanels();
      return;
    }
    this.open(id);
  }

  closeTop(): void {
    this.windows.handleEscape();
    this.#syncPanels();
  }

  destroy(): void {
    this.#hud.element.remove();
    Object.values(this.#panels).forEach((panel) => {
      panel.remove();
    });
  }

  #syncPanels(): void {
    const stack = this.windows.stack;
    Object.entries(this.#panels).forEach(([id, panel]) => {
      const stackIndex = stack.indexOf(id as PanelId);
      panel.hidden = stackIndex < 0;
      panel.style.zIndex = String(20 + Math.max(0, stackIndex));
    });
    this.#root.dataset.topPanel = this.windows.top() ?? '';
  }
}
