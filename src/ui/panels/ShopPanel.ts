import {
  applyPanelResult,
  createActionButton,
  createPanelShell,
  createTextRow,
  type PanelActionResult,
} from './shared';

export interface ShopItemView {
  readonly id: string;
  readonly name: string;
  readonly buyPrice: number;
  readonly sellPrice: number;
  readonly owned: number;
}

export interface ShopPanelViewModel {
  readonly adena: number;
  readonly items: readonly ShopItemView[];
}

export interface ShopPanelActions {
  readonly buy: (itemId: string, quantity: number) => PanelActionResult<ShopPanelViewModel>;
  readonly sell: (itemId: string, quantity: number) => PanelActionResult<ShopPanelViewModel>;
}

export class ShopPanel {
  readonly element: HTMLElement;
  readonly #document: Document;
  readonly #body: HTMLElement;
  readonly #status: HTMLElement;
  readonly #actions: ShopPanelActions;
  #state: ShopPanelViewModel | null = null;

  constructor(document: Document, actions: ShopPanelActions) {
    this.#document = document;
    this.#actions = actions;
    const shell = createPanelShell(document, 'shop', '商店');
    this.element = shell.element;
    this.#body = shell.body;
    this.#status = shell.status;
  }

  get state(): ShopPanelViewModel | null {
    return this.#state;
  }

  render(viewModel: ShopPanelViewModel): void {
    this.#state = viewModel;
    const adena = createTextRow(
      this.#document,
      '金幣',
      String(viewModel.adena),
      'shop-adena',
    );
    const list = this.#document.createElement('ul');
    list.className = 'trade-list';
    viewModel.items.forEach((item) => {
      const row = this.#document.createElement('li');
      row.className = 'trade-row';
      const description = this.#document.createElement('span');
      description.textContent = `${item.name} / 買 ${String(item.buyPrice)}／賣 ${String(item.sellPrice)}／持有 ${String(item.owned)}`;
      const buy = createActionButton(
        this.#document,
        '購買',
        `shop-buy-${item.id}`,
        () => {
          this.buy(item.id);
        },
      );
      const sell = createActionButton(
        this.#document,
        '出售',
        `shop-sell-${item.id}`,
        () => {
          this.sell(item.id);
        },
      );
      row.append(description, buy, sell);
      list.append(row);
    });
    this.#body.replaceChildren(adena, list);
  }

  buy(itemId: string, quantity = 1): void {
    this.#apply(this.#actions.buy(itemId, quantity));
  }

  sell(itemId: string, quantity = 1): void {
    this.#apply(this.#actions.sell(itemId, quantity));
  }

  #apply(result: PanelActionResult<ShopPanelViewModel>): void {
    applyPanelResult(
      result,
      (viewModel) => {
        this.render(viewModel);
      },
      this.#status,
    );
  }
}
