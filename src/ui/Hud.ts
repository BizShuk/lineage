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

interface HudGauge {
  readonly element: HTMLElement;
  readonly text: HTMLElement;
  readonly meter: HTMLElement;
  readonly label: string;
}

const createGauge = (document: Document, testId: string, label: string): HudGauge => {
  const wrapper = document.createElement('div');
  wrapper.className = `hud-gauge ${testId}`;
  wrapper.setAttribute('data-testid', testId);
  const text = document.createElement('span');
  text.textContent = label;
  const meter = document.createElement('meter');
  meter.setAttribute('aria-label', label);
  meter.setAttribute('min', '0');
  wrapper.append(text, meter);
  return { element: wrapper, text, meter, label };
};

const updateGauge = (
  gauge: HudGauge,
  value: number,
  maximum: number,
  displayValue?: string,
): void => {
  const boundedMaximum = Math.max(1, maximum);
  gauge.text.textContent = `${gauge.label} ${displayValue ?? `${String(value)} / ${String(maximum)}`}`;
  gauge.meter.setAttribute('max', String(boundedMaximum));
  gauge.meter.setAttribute(
    'value',
    String(Math.min(Math.max(0, value), boundedMaximum)),
  );
};

export class Hud {
  readonly element: HTMLElement;
  readonly #statusRail: HTMLElement;
  readonly #hpGauge: HudGauge;
  readonly #mpGauge: HudGauge;
  readonly #experienceGauge: HudGauge;
  readonly #stats: HTMLElement;
  readonly #target: HTMLElement;
  readonly #quickSlots: HTMLElement;
  readonly #messages: HTMLElement;
  readonly #quickSlotItems: readonly HTMLElement[];
  readonly #messageItems: readonly HTMLElement[];

  constructor(document: Document) {
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
    this.#hpGauge = createGauge(document, 'hud-hp', '生命');
    this.#mpGauge = createGauge(document, 'hud-mp', '魔力');
    this.#experienceGauge = createGauge(document, 'hud-exp', '經驗');
    this.#stats = document.createElement('p');
    this.#stats.className = 'hud-stats';
    this.#statusRail.append(
      this.#hpGauge.element,
      this.#mpGauge.element,
      this.#experienceGauge.element,
      this.#stats,
    );

    const bottom = document.createElement('footer');
    bottom.className = 'hud-bottom-bar';

    const consoleRegion = document.createElement('section');
    consoleRegion.className = 'hud-console';
    consoleRegion.setAttribute('aria-label', '訊息紀錄');

    const vitals = document.createElement('section');
    vitals.className = 'hud-vitals';
    vitals.setAttribute('data-testid', 'hud-vitals');
    vitals.setAttribute('aria-label', '角色狀態');

    const actions = document.createElement('section');
    actions.className = 'hud-actions';
    actions.setAttribute('aria-label', '目標與快捷列');

    this.#target = document.createElement('p');
    this.#target.className = 'hud-target';
    this.#target.setAttribute('data-testid', 'hud-target');

    this.#messages = document.createElement('ol');
    this.#messages.className = 'hud-messages';
    this.#messages.setAttribute('data-testid', 'hud-messages');
    this.#messages.setAttribute('aria-label', '訊息紀錄');
    this.#quickSlots = document.createElement('ol');
    this.#quickSlots.className = 'hud-quick-slots';
    this.#quickSlots.setAttribute('data-testid', 'hud-quick-slots');
    this.#quickSlots.setAttribute('aria-label', '快捷列');

    this.#quickSlotItems = Array.from({ length: 8 }, (_, index) => {
      const item = document.createElement('li');
      item.className = 'quick-slot';
      item.setAttribute('data-testid', `quick-slot-${String(index)}`);
      item.hidden = true;
      return item;
    });
    this.#messageItems = Array.from({ length: 8 }, () => {
      const item = document.createElement('li');
      item.hidden = true;
      return item;
    });

    consoleRegion.append(this.#messages);
    vitals.append(this.#statusRail);
    actions.append(this.#target, this.#quickSlots);
    bottom.append(consoleRegion, vitals, actions);
    this.element.append(viewport, bottom);
    this.#messages.append(...this.#messageItems);
    this.#quickSlots.append(...this.#quickSlotItems);
  }

  render(viewModel: HudViewModel): void {
    const experiencePercent = boundedPercent(viewModel.experiencePercent);
    updateGauge(this.#hpGauge, viewModel.hp, viewModel.maxHP);
    updateGauge(this.#mpGauge, viewModel.mp, viewModel.maxMP);
    updateGauge(this.#experienceGauge, experiencePercent, 100, `${String(experiencePercent)}%`);
    this.#stats.textContent = [
      `等級 ${String(viewModel.level)}`,
      `經驗 ${String(experiencePercent)}%`,
      `防禦 ${String(viewModel.ac)}`,
      `負重 ${String(viewModel.weight)} / ${String(viewModel.weightLimit)}`,
      `正義 ${String(viewModel.alignment)}`,
    ].join('　');
    this.#target.textContent =
      viewModel.target === null
        ? '目標：無'
        : `目標：${viewModel.target.name} ${String(boundedPercent(viewModel.target.hpPercent))}%`;
    this.#quickSlotItems.forEach((item, index) => {
      const slot = viewModel.quickSlots[index];
      item.hidden = slot === undefined;
      if (slot === undefined) {
        item.textContent = '';
        return;
      }
      item.textContent =
        slot === null
          ? `${String(index + 1)}：空`
          : `${String(index + 1)}：${slot.label}${slot.quantity === undefined ? '' : ` ×${String(slot.quantity)}`}`;
    });
    this.#messageItems.forEach((item, index) => {
      const message = viewModel.messages[index];
      item.hidden = message === undefined;
      if (message === undefined) {
        item.textContent = '';
        return;
      }
      item.className = `message-${message.kind}`;
      item.setAttribute('data-message-id', message.id);
      item.textContent = message.text;
    });
  }
}
