import {
  applyPanelResult,
  createActionButton,
  createPanelShell,
  type PanelActionResult,
} from './shared';

export interface WarehouseItemView {
  readonly id: string;
  readonly name: string;
  readonly carried: number;
  readonly stored: number;
}

export interface WarehousePanelViewModel {
  readonly fee: number;
  readonly adena: number;
  readonly items: readonly WarehouseItemView[];
}

export interface WarehousePanelActions {
  readonly deposit: (
    itemId: string,
    quantity: number,
  ) => PanelActionResult<WarehousePanelViewModel>;
  readonly withdraw: (
    itemId: string,
    quantity: number,
  ) => PanelActionResult<WarehousePanelViewModel>;
}

export class WarehousePanel {
  readonly element: HTMLElement;
  readonly #document: Document;
  readonly #body: HTMLElement;
  readonly #status: HTMLElement;
  readonly #actions: WarehousePanelActions;
  #state: WarehousePanelViewModel | null = null;

  constructor(document: Document, actions: WarehousePanelActions) {
    this.#document = document;
    this.#actions = actions;
    const shell = createPanelShell(document, 'warehouse', '倉庫');
    this.element = shell.element;
    this.#body = shell.body;
    this.#status = shell.status;
  }

  get state(): WarehousePanelViewModel | null {
    return this.#state;
  }

  render(viewModel: WarehousePanelViewModel): void {
    this.#state = viewModel;
    const summary = this.#document.createElement('p');
    summary.textContent = `金幣 ${String(viewModel.adena)} / 手續費 ${String(viewModel.fee)}`;
    const list = this.#document.createElement('ul');
    viewModel.items.forEach((item) => {
      const row = this.#document.createElement('li');
      const description = this.#document.createElement('span');
      description.textContent = `${item.name} / 身上 ${String(item.carried)}／倉庫 ${String(item.stored)}`;
      const deposit = createActionButton(
        this.#document,
        '存入',
        `warehouse-deposit-${item.id}`,
        () => {
          this.deposit(item.id);
        },
      );
      const withdraw = createActionButton(
        this.#document,
        '取出',
        `warehouse-withdraw-${item.id}`,
        () => {
          this.withdraw(item.id);
        },
      );
      row.append(description, deposit, withdraw);
      list.append(row);
    });
    this.#body.replaceChildren(summary, list);
  }

  deposit(itemId: string, quantity = 1): void {
    this.#apply(this.#actions.deposit(itemId, quantity));
  }

  withdraw(itemId: string, quantity = 1): void {
    this.#apply(this.#actions.withdraw(itemId, quantity));
  }

  #apply(result: PanelActionResult<WarehousePanelViewModel>): void {
    applyPanelResult(
      result,
      (viewModel) => {
        this.render(viewModel);
      },
      this.#status,
    );
  }
}
