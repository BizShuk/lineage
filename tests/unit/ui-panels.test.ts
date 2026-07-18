import { describe, expect, it } from 'vitest';
import { Hud, type HudViewModel } from '../../src/ui/Hud';
import { CharacterPanel } from '../../src/ui/panels/CharacterPanel';
import { DialoguePanel } from '../../src/ui/panels/DialoguePanel';
import { InventoryPanel, type InventoryPanelViewModel } from '../../src/ui/panels/InventoryPanel';
import { MapPanel } from '../../src/ui/panels/MapPanel';
import { QuestPanel } from '../../src/ui/panels/QuestPanel';
import { SettingsPanel } from '../../src/ui/panels/SettingsPanel';
import { ShopPanel, type ShopPanelViewModel } from '../../src/ui/panels/ShopPanel';
import { SpellPanel } from '../../src/ui/panels/SpellPanel';
import { WarehousePanel } from '../../src/ui/panels/WarehousePanel';

class FakeElement extends EventTarget {
  readonly tagName: string;
  readonly ownerDocument: FakeDocument;
  readonly children: FakeElement[] = [];
  readonly #attributes = new Map<string, string>();
  #ownText = '';
  parentElement: FakeElement | null = null;
  className = '';
  value = '';
  type = '';
  min = '';
  max = '';
  step = '';
  checked = false;
  disabled = false;
  draggable = false;
  tabIndex = 0;

  constructor(tagName: string, ownerDocument: FakeDocument) {
    super();
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
  }

  get textContent(): string {
    return this.#ownText + this.children.map(({ textContent }) => textContent).join('');
  }

  set textContent(value: string) {
    this.#ownText = value;
    this.children.length = 0;
  }

  setAttribute(name: string, value: string): void {
    this.#attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.#attributes.get(name) ?? null;
  }

  append(...nodes: readonly (FakeElement | string)[]): void {
    for (const node of nodes) {
      if (typeof node === 'string') {
        this.#ownText += node;
      } else {
        node.parentElement = this;
        this.children.push(node);
      }
    }
  }

  replaceChildren(...nodes: readonly FakeElement[]): void {
    this.#ownText = '';
    this.children.length = 0;
    this.append(...nodes);
  }

  focus(): void {
    this.ownerDocument.activeElement = this;
  }
}

class FakeDocument {
  activeElement: FakeElement | null = null;

  createElement(tagName: string): HTMLElement {
    return new FakeElement(tagName, this) as unknown as HTMLElement;
  }
}

const fakeElement = (element: HTMLElement): FakeElement => element as unknown as FakeElement;

const findByTestId = (root: HTMLElement, testId: string): FakeElement => {
  const queue = [fakeElement(root)];
  while (queue.length > 0) {
    const element = queue.shift();
    if (element === undefined) {
      break;
    }
    if (element.getAttribute('data-testid') === testId) {
      return element;
    }
    queue.push(...element.children);
  }
  throw new Error(`找不到 data-testid=${testId}`);
};

const documentForTest = (): Document => new FakeDocument() as unknown as Document;

describe('HUD and panels', () => {
  it('renders the fixed 640x480 HUD from an immutable view model', () => {
    const model = Object.freeze({
      hp: 37,
      maxHP: 50,
      mp: 12,
      maxMP: 20,
      level: 7,
      experiencePercent: 42,
      ac: -3,
      weight: 48,
      weightLimit: 100,
      alignment: 120,
      target: { name: '哥布林', hpPercent: 60 },
      quickSlots: [{ icon: 'red-potion', label: '紅色藥水', quantity: 3 }, null],
      messages: [{ id: 'm1', kind: 'loot', text: '取得金幣。' }],
    } satisfies HudViewModel);
    const hud = new Hud(documentForTest());

    hud.render(model);

    expect(findByTestId(hud.element, 'hud-root').getAttribute('aria-label')).toBe('遊戲狀態介面');
    expect(findByTestId(hud.element, 'world-viewport').getAttribute('aria-label')).toBe(
      '遊戲世界 512 乘 432',
    );
    expect(findByTestId(hud.element, 'hud-hp').textContent).toContain('37 / 50');
    expect(findByTestId(hud.element, 'hud-mp').textContent).toContain('12 / 20');
    expect(findByTestId(hud.element, 'hud-exp').textContent).toContain('經驗 42%');
    expect(findByTestId(hud.element, 'hud-target').textContent).toContain('哥布林');
    expect(findByTestId(hud.element, 'hud-stats').getAttribute('aria-label')).toBe('角色狀態');
    expect(findByTestId(hud.element, 'hud-messages').getAttribute('aria-label')).toBe('訊息紀錄');
    expect(findByTestId(hud.element, 'hud-quick-slots').getAttribute('aria-label')).toBe('快捷列');
    expect(findByTestId(hud.element, 'hud-stats').textContent).toContain('防禦 -3');
    expect(findByTestId(hud.element, 'hud-quick-slots').textContent).toContain('紅色藥水 ×3');
    expect(findByTestId(hud.element, 'hud-messages').textContent).toContain('取得金幣。');
    expect(model.hp).toBe(37);
  });

  it('reuses live HUD nodes when the view model changes', () => {
    const hud = new Hud(documentForTest());
    const initial = {
      hp: 37,
      maxHP: 50,
      mp: 12,
      maxMP: 20,
      level: 7,
      experiencePercent: 42,
      ac: -3,
      weight: 48,
      weightLimit: 100,
      alignment: 120,
      target: null,
      quickSlots: [{ icon: 'red-potion', label: '紅色藥水', quantity: 3 }, null],
      messages: [{ id: 'm1', kind: 'loot' as const, text: '取得金幣。' }],
    } satisfies HudViewModel;
    hud.render(initial);
    const hp = findByTestId(hud.element, 'hud-hp');
    const quickSlot = findByTestId(hud.element, 'quick-slot-0');
    const message = findByTestId(hud.element, 'hud-messages').children[0];
    if (message === undefined) throw new Error('HUD 訊息節點未建立');

    hud.render({
      ...initial,
      hp: 25,
      target: { name: '哥布林', hpPercent: 60 },
      quickSlots: [{ icon: 'red-potion', label: '紅色藥水', quantity: 2 }, null],
      messages: [{ id: 'm2', kind: 'combat', text: '造成傷害。' }],
    });

    expect(findByTestId(hud.element, 'hud-hp')).toBe(hp);
    expect(findByTestId(hud.element, 'quick-slot-0')).toBe(quickSlot);
    expect(findByTestId(hud.element, 'hud-messages').children[0]).toBe(message);
    expect(findByTestId(hud.element, 'hud-hp').textContent).toContain('25 / 50');
    expect(findByTestId(hud.element, 'hud-target').textContent).toContain('哥布林');
  });

  it('creates every approved panel as a labelled, operable dialog', () => {
    const doc = documentForTest();
    const failed = { ok: false as const, reason: '尚未連接' };
    const panels = [
      new CharacterPanel(doc),
      new InventoryPanel(doc, {
        activateItem: () => failed,
        assignQuickSlot: () => failed,
      }),
      new SpellPanel(doc, { activateSpell: () => failed, assignQuickSlot: () => failed }),
      new QuestPanel(doc, { activateQuest: () => failed }),
      new MapPanel(doc, { selectLocation: () => failed }),
      new DialoguePanel(doc, { choose: () => failed }),
      new ShopPanel(doc, { buy: () => failed, sell: () => failed }),
      new WarehousePanel(doc, { deposit: () => failed, withdraw: () => failed }),
      new SettingsPanel(doc, { save: () => failed }),
    ];

    expect(panels.map(({ element }) => fakeElement(element).getAttribute('role'))).toEqual(
      Array.from({ length: 9 }, () => 'dialog'),
    );
    expect(
      panels.map(({ element }) => fakeElement(element).getAttribute('aria-label')),
    ).toEqual(['角色', '物品欄', '魔法與技能', '任務', '區域地圖', '對話', '商店', '倉庫', '設定']);
    const inventory = panels[1];
    if (inventory === undefined) throw new Error('物品欄 panel 未建立');
    expect(fakeElement(inventory.element).className).toContain('panel-frame');
    expect(fakeElement(inventory.element).children[0]?.className).toContain('panel-header');
    expect(fakeElement(inventory.element).children[1]?.className).toContain('panel-scroll');
    expect(fakeElement(inventory.element).children[2]?.className).toContain('panel-status');
    panels.forEach(({ element }) => {
      expect(fakeElement(element).textContent.length).toBeGreaterThan(0);
    });
  });

  it('marks quest entries with the classic list contract', () => {
    const doc = documentForTest();
    const quest = new QuestPanel(doc, { activateQuest: () => ({ ok: false, reason: '尚未連接' }) });

    quest.render({
      quests: [
        {
          id: 'training',
          name: '稻草人訓練',
          stage: '尚未開始',
          description: '完成訓練。',
          completed: false,
        },
      ],
    });

    expect(findByTestId(quest.element, 'quest-list').className).toContain('quest-list');
    expect(findByTestId(quest.element, 'quest-training').getAttribute('data-ui-kind')).toBe(
      'quest-entry',
    );
  });

  it('updates shop inventory only after a successful domain result', () => {
    const item = { id: 'sword', name: '短劍', buyPrice: 80, sellPrice: 40, owned: 0 };
    const initial: ShopPanelViewModel = {
      adena: 100,
      items: [item],
    };
    const success: ShopPanelViewModel = {
      adena: 20,
      items: [{ ...item, owned: 1 }],
    };
    let succeeds = false;
    const panel = new ShopPanel(documentForTest(), {
      buy: () => (succeeds ? { ok: true, viewModel: success } : { ok: false, reason: '金幣不足' }),
      sell: () => ({ ok: false, reason: '沒有可出售的物品' }),
    });
    panel.render(initial);

    panel.buy('sword');
    expect(panel.state).toBe(initial);
    expect(findByTestId(panel.element, 'shop-status').textContent).toBe('金幣不足');
    expect(findByTestId(panel.element, 'shop-adena').textContent).toContain('100');

    succeeds = true;
    panel.buy('sword');
    expect(panel.state).toBe(success);
    expect(findByTestId(panel.element, 'shop-adena').textContent).toContain('20');
  });

  it('routes keyboard activation and drag/drop through the same inventory action', () => {
    const calls: string[] = [];
    const model: InventoryPanelViewModel = {
      adena: 50,
      weight: 2,
      weightLimit: 100,
      items: [{ id: 'sword', name: '短劍', quantity: 1, equipped: false }],
    };
    const panel = new InventoryPanel(documentForTest(), {
      activateItem: (itemId) => {
        calls.push(itemId);
        return { ok: true, viewModel: model };
      },
      assignQuickSlot: () => ({ ok: false, reason: '不可放入快捷列' }),
    });
    panel.render(model);

    expect(findByTestId(panel.element, 'inventory-item-sword').getAttribute('data-ui-kind')).toBe(
      'item-slot',
    );
    expect(findByTestId(panel.element, 'inventory-item-sword').textContent).toContain('短劍');

    panel.handleItemKeyboard('sword');
    panel.handleItemDrop('sword');

    expect(calls).toEqual(['sword', 'sword']);
  });

  it('persists independent settings and updates controls only after success', () => {
    const initial = { music: 0.7, ambient: 0.5, effects: 0.8, muted: false, scale: 2 as const };
    const next = { music: 0.2, ambient: 0.3, effects: 0.4, muted: true, scale: 3 as const };
    let succeeds = false;
    const panel = new SettingsPanel(documentForTest(), {
      save: () => (succeeds ? { ok: true, viewModel: next } : { ok: false, reason: '儲存失敗' }),
    });
    panel.render(initial);

    panel.save(next);
    expect(panel.state).toBe(initial);
    expect(findByTestId(panel.element, 'settings-status').textContent).toBe('儲存失敗');

    succeeds = true;
    panel.save(next);
    expect(panel.state).toBe(next);
    expect(findByTestId(panel.element, 'settings-music').getAttribute('aria-label')).toBe('音樂音量');
    expect(findByTestId(panel.element, 'settings-ambient').getAttribute('aria-label')).toBe(
      '環境音量',
    );
    expect(findByTestId(panel.element, 'settings-effects').getAttribute('aria-label')).toBe(
      '音效音量',
    );
    expect(findByTestId(panel.element, 'settings-muted').getAttribute('aria-label')).toBe('全部靜音');
    expect(findByTestId(panel.element, 'settings-scale').getAttribute('aria-label')).toBe('畫面縮放');
  });
});
