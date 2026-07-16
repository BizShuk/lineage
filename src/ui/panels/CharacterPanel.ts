import { createPanelShell, createTextRow } from './shared';

export interface CharacterPanelViewModel {
  readonly name: string;
  readonly className: string;
  readonly level: number;
  readonly hp: number;
  readonly maxHP: number;
  readonly mp: number;
  readonly maxMP: number;
  readonly ac: number;
  readonly weight: number;
  readonly weightLimit: number;
  readonly alignment: number;
  readonly experiencePercent: number;
  readonly equipment: readonly { readonly slot: string; readonly label: string }[];
}

export class CharacterPanel {
  readonly element: HTMLElement;
  readonly #document: Document;
  readonly #body: HTMLElement;
  #state: CharacterPanelViewModel | null = null;

  constructor(document: Document) {
    this.#document = document;
    const shell = createPanelShell(document, 'character', '角色');
    this.element = shell.element;
    this.#body = shell.body;
  }

  get state(): CharacterPanelViewModel | null {
    return this.#state;
  }

  render(viewModel: CharacterPanelViewModel): void {
    this.#state = viewModel;
    const rows = [
      createTextRow(this.#document, '姓名', viewModel.name),
      createTextRow(this.#document, '職業', viewModel.className),
      createTextRow(this.#document, '等級', String(viewModel.level)),
      createTextRow(this.#document, '生命', `${String(viewModel.hp)} / ${String(viewModel.maxHP)}`),
      createTextRow(this.#document, '魔力', `${String(viewModel.mp)} / ${String(viewModel.maxMP)}`),
      createTextRow(this.#document, '防禦', String(viewModel.ac)),
      createTextRow(
        this.#document,
        '負重',
        `${String(viewModel.weight)} / ${String(viewModel.weightLimit)}`,
      ),
      createTextRow(this.#document, '正義', String(viewModel.alignment)),
      createTextRow(this.#document, '經驗', `${String(viewModel.experiencePercent)}%`),
    ];
    const equipment = this.#document.createElement('ul');
    equipment.setAttribute('aria-label', '裝備');
    viewModel.equipment.forEach(({ slot, label }) => {
      const item = this.#document.createElement('li');
      item.textContent = `${slot}：${label}`;
      equipment.append(item);
    });
    this.#body.replaceChildren(...rows, equipment);
  }
}
