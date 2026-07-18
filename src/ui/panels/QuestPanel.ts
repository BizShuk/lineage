import {
  applyPanelResult,
  createActionButton,
  createPanelShell,
  type PanelActionResult,
} from './shared';

export interface QuestPanelView {
  readonly id: string;
  readonly name: string;
  readonly stage: string;
  readonly description: string;
  readonly completed: boolean;
}

export interface QuestPanelViewModel {
  readonly quests: readonly QuestPanelView[];
}

export interface QuestPanelActions {
  readonly activateQuest: (questId: string) => PanelActionResult<QuestPanelViewModel>;
}

export class QuestPanel {
  readonly element: HTMLElement;
  readonly #document: Document;
  readonly #body: HTMLElement;
  readonly #status: HTMLElement;
  readonly #actions: QuestPanelActions;
  #state: QuestPanelViewModel | null = null;

  constructor(document: Document, actions: QuestPanelActions) {
    this.#document = document;
    this.#actions = actions;
    const shell = createPanelShell(document, 'quests', '任務');
    this.element = shell.element;
    this.#body = shell.body;
    this.#status = shell.status;
  }

  get state(): QuestPanelViewModel | null {
    return this.#state;
  }

  render(viewModel: QuestPanelViewModel): void {
    this.#state = viewModel;
    const list = this.#document.createElement('ul');
    list.className = 'quest-list';
    list.setAttribute('data-testid', 'quest-list');
    viewModel.quests.forEach((quest) => {
      const item = this.#document.createElement('li');
      const button = createActionButton(
        this.#document,
        `${quest.name}－${quest.stage}${quest.completed ? '（已完成）' : ''}`,
        `quest-${quest.id}`,
        () => {
          this.activateQuest(quest.id);
        },
      );
      button.className = 'panel-action quest-entry';
      button.setAttribute('data-ui-kind', 'quest-entry');
      button.setAttribute('aria-description', quest.description);
      item.append(button);
      list.append(item);
    });
    this.#body.replaceChildren(list);
  }

  activateQuest(questId: string): void {
    applyPanelResult(
      this.#actions.activateQuest(questId),
      (viewModel) => {
        this.render(viewModel);
      },
      this.#status,
    );
  }
}
