export interface HudQuickSlot {
  readonly icon: string;
  readonly label: string;
  readonly quantity?: number;
}

export interface HudMessage {
  readonly id: string;
  readonly kind: 'combat' | 'loot' | 'quest' | 'system';
  readonly text: string;
}

export interface HudViewModel {
  readonly hp: number;
  readonly maxHP: number;
  readonly mp: number;
  readonly maxMP: number;
  readonly level: number;
  readonly experiencePercent: number;
  readonly ac: number;
  readonly weight: number;
  readonly weightLimit: number;
  readonly alignment: number;
  readonly target: { readonly name: string; readonly hpPercent: number } | null;
  readonly quickSlots: readonly (HudQuickSlot | null)[];
  readonly messages: readonly HudMessage[];
}

const boundedPercent = (value: number): number => Math.min(100, Math.max(0, value));

const createGauge = (
  document: Document,
  testId: string,
  label: string,
  value: number,
  maximum: number,
): HTMLElement => {
  const wrapper = document.createElement('div');
  wrapper.className = `hud-gauge ${testId}`;
  wrapper.setAttribute('data-testid', testId);
  const text = document.createElement('span');
  text.textContent = `${label} ${String(value)} / ${String(maximum)}`;
  const meter = document.createElement('meter');
  meter.setAttribute('aria-label', label);
  meter.setAttribute('min', '0');
  meter.setAttribute('max', String(Math.max(1, maximum)));
  meter.setAttribute('value', String(Math.min(Math.max(0, value), Math.max(1, maximum))));
  wrapper.append(text, meter);
  return wrapper;
};

export class Hud {
  readonly element: HTMLElement;
  readonly #document: Document;
  readonly #statusRail: HTMLElement;
  readonly #quickSlots: HTMLElement;
  readonly #messages: HTMLElement;

  constructor(document: Document) {
    this.#document = document;
    this.element = document.createElement('section');
    this.element.className = 'classic-hud';
    this.element.setAttribute('data-testid', 'hud-root');
    this.element.setAttribute('aria-label', '遊戲狀態介面');

    const viewport = document.createElement('div');
    viewport.className = 'world-viewport';
    viewport.setAttribute('data-testid', 'world-viewport');
    viewport.setAttribute('aria-label', '遊戲世界 512 乘 432');
    this.#statusRail = document.createElement('aside');
    this.#statusRail.className = 'status-rail';
    this.#statusRail.setAttribute('data-testid', 'hud-stats');
    this.#statusRail.setAttribute('aria-label', '角色狀態');
    const bottom = document.createElement('footer');
    bottom.className = 'hud-bottom-bar';
    this.#messages = document.createElement('ol');
    this.#messages.className = 'hud-messages';
    this.#messages.setAttribute('data-testid', 'hud-messages');
    this.#messages.setAttribute('aria-label', '訊息紀錄');
    this.#quickSlots = document.createElement('ol');
    this.#quickSlots.className = 'hud-quick-slots';
    this.#quickSlots.setAttribute('data-testid', 'hud-quick-slots');
    this.#quickSlots.setAttribute('aria-label', '快捷列');
    bottom.append(this.#messages, this.#quickSlots);
    this.element.append(viewport, this.#statusRail, bottom);
  }

  render(viewModel: HudViewModel): void {
    const hp = createGauge(
      this.#document,
      'hud-hp',
      '生命',
      viewModel.hp,
      viewModel.maxHP,
    );
    const mp = createGauge(
      this.#document,
      'hud-mp',
      '魔力',
      viewModel.mp,
      viewModel.maxMP,
    );
    const stats = this.#document.createElement('p');
    stats.textContent = [
      `等級 ${String(viewModel.level)}`,
      `經驗 ${String(boundedPercent(viewModel.experiencePercent))}%`,
      `防禦 ${String(viewModel.ac)}`,
      `負重 ${String(viewModel.weight)} / ${String(viewModel.weightLimit)}`,
      `正義 ${String(viewModel.alignment)}`,
    ].join('　');
    const target = this.#document.createElement('p');
    target.textContent =
      viewModel.target === null
        ? '目標：無'
        : `目標：${viewModel.target.name} ${String(boundedPercent(viewModel.target.hpPercent))}%`;
    this.#statusRail.replaceChildren(hp, mp, stats, target);

    const quickSlots = viewModel.quickSlots.map((slot, index) => {
      const item = this.#document.createElement('li');
      item.setAttribute('data-testid', `quick-slot-${String(index)}`);
      item.textContent =
        slot === null
          ? `${String(index + 1)}：空`
          : `${String(index + 1)}：${slot.label}${slot.quantity === undefined ? '' : ` ×${String(slot.quantity)}`}`;
      return item;
    });
    this.#quickSlots.replaceChildren(...quickSlots);

    const messages = viewModel.messages.map((message) => {
      const item = this.#document.createElement('li');
      item.className = `message-${message.kind}`;
      item.setAttribute('data-message-id', message.id);
      item.textContent = message.text;
      return item;
    });
    this.#messages.replaceChildren(...messages);
  }
}
