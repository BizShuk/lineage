import {
  applyPanelResult,
  createActionButton,
  createPanelShell,
  type PanelActionResult,
} from './shared';

export interface DialogueChoiceView {
  readonly id: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface DialoguePanelViewModel {
  readonly speaker: string;
  readonly text: string;
  readonly choices: readonly DialogueChoiceView[];
}

export interface DialoguePanelActions {
  readonly choose: (choiceId: string) => PanelActionResult<DialoguePanelViewModel>;
}

export class DialoguePanel {
  readonly element: HTMLElement;
  readonly #document: Document;
  readonly #body: HTMLElement;
  readonly #status: HTMLElement;
  readonly #actions: DialoguePanelActions;
  #state: DialoguePanelViewModel | null = null;

  constructor(document: Document, actions: DialoguePanelActions) {
    this.#document = document;
    this.#actions = actions;
    const shell = createPanelShell(document, 'dialogue', '對話');
    this.element = shell.element;
    this.#body = shell.body;
    this.#status = shell.status;
  }

  get state(): DialoguePanelViewModel | null {
    return this.#state;
  }

  render(viewModel: DialoguePanelViewModel): void {
    this.#state = viewModel;
    const speaker = this.#document.createElement('h3');
    speaker.textContent = viewModel.speaker;
    const text = this.#document.createElement('p');
    text.textContent = viewModel.text;
    const choices = this.#document.createElement('div');
    choices.className = 'dialogue-choices';
    viewModel.choices.forEach((choice) => {
      const button = createActionButton(
        this.#document,
        choice.label,
        `dialogue-choice-${choice.id}`,
        () => {
          this.choose(choice.id);
        },
      );
      button.disabled = choice.disabled ?? false;
      choices.append(button);
    });
    this.#body.replaceChildren(speaker, text, choices);
  }

  choose(choiceId: string): void {
    applyPanelResult(
      this.#actions.choose(choiceId),
      (viewModel) => {
        this.render(viewModel);
      },
      this.#status,
    );
  }
}
