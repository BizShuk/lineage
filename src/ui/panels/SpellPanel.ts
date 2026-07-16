import {
  applyPanelResult,
  bindDragPayload,
  createActionButton,
  createPanelShell,
  type PanelActionResult,
} from './shared';

export interface SpellView {
  readonly id: string;
  readonly name: string;
  readonly manaCost: number;
  readonly available: boolean;
}

export interface SpellPanelViewModel {
  readonly currentMP: number;
  readonly spells: readonly SpellView[];
  readonly quickSlots: readonly (string | null)[];
}

export interface SpellPanelActions {
  readonly activateSpell: (spellId: string) => PanelActionResult<SpellPanelViewModel>;
  readonly assignQuickSlot: (
    spellId: string,
    slot: number,
  ) => PanelActionResult<SpellPanelViewModel>;
}

export class SpellPanel {
  readonly element: HTMLElement;
  readonly #document: Document;
  readonly #body: HTMLElement;
  readonly #status: HTMLElement;
  readonly #actions: SpellPanelActions;
  #state: SpellPanelViewModel | null = null;

  constructor(document: Document, actions: SpellPanelActions) {
    this.#document = document;
    this.#actions = actions;
    const shell = createPanelShell(document, 'spells', '魔法與技能');
    this.element = shell.element;
    this.#body = shell.body;
    this.#status = shell.status;
  }

  get state(): SpellPanelViewModel | null {
    return this.#state;
  }

  render(viewModel: SpellPanelViewModel): void {
    this.#state = viewModel;
    const mp = this.#document.createElement('p');
    mp.textContent = `目前魔力：${String(viewModel.currentMP)}`;
    const list = this.#document.createElement('ul');
    viewModel.spells.forEach((spell) => {
      const item = this.#document.createElement('li');
      const button = createActionButton(
        this.#document,
        `${spell.name}（魔力 ${String(spell.manaCost)}）`,
        `spell-${spell.id}`,
        () => {
          this.activateSpell(spell.id);
        },
      );
      button.disabled = !spell.available;
      bindDragPayload(button, spell.id);
      item.append(button);
      list.append(item);
    });
    this.#body.replaceChildren(mp, list);
  }

  activateSpell(spellId: string): void {
    this.#apply(this.#actions.activateSpell(spellId));
  }

  assignQuickSlot(spellId: string, slot: number): void {
    this.#apply(this.#actions.assignQuickSlot(spellId, slot));
  }

  #apply(result: PanelActionResult<SpellPanelViewModel>): void {
    applyPanelResult(
      result,
      (viewModel) => {
        this.render(viewModel);
      },
      this.#status,
    );
  }
}
