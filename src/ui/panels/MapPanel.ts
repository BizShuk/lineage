import {
  applyPanelResult,
  createActionButton,
  createPanelShell,
  type PanelActionResult,
} from './shared';

export interface MapLocationView {
  readonly id: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
}

export interface MapPanelViewModel {
  readonly mapName: string;
  readonly playerX: number;
  readonly playerY: number;
  readonly locations: readonly MapLocationView[];
}

export interface MapPanelActions {
  readonly selectLocation: (locationId: string) => PanelActionResult<MapPanelViewModel>;
}

export class MapPanel {
  readonly element: HTMLElement;
  readonly #document: Document;
  readonly #body: HTMLElement;
  readonly #status: HTMLElement;
  readonly #actions: MapPanelActions;
  #state: MapPanelViewModel | null = null;

  constructor(document: Document, actions: MapPanelActions) {
    this.#document = document;
    this.#actions = actions;
    const shell = createPanelShell(document, 'map', '區域地圖');
    this.element = shell.element;
    this.#body = shell.body;
    this.#status = shell.status;
  }

  get state(): MapPanelViewModel | null {
    return this.#state;
  }

  render(viewModel: MapPanelViewModel): void {
    this.#state = viewModel;
    const position = this.#document.createElement('p');
    position.textContent = `${viewModel.mapName} / 位置 ${String(viewModel.playerX)}, ${String(viewModel.playerY)}`;
    const list = this.#document.createElement('ul');
    list.className = 'map-sheet';
    viewModel.locations.forEach((location) => {
      const item = this.#document.createElement('li');
      const button = createActionButton(
        this.#document,
        `${location.name}（${String(location.x)}, ${String(location.y)}）`,
        `map-location-${location.id}`,
        () => {
          this.selectLocation(location.id);
        },
      );
      button.className = 'panel-action map-location';
      button.setAttribute('data-ui-kind', 'map-location');
      item.append(button);
      list.append(item);
    });
    this.#body.replaceChildren(position, list);
  }

  selectLocation(locationId: string): void {
    applyPanelResult(
      this.#actions.selectLocation(locationId),
      (viewModel) => {
        this.render(viewModel);
      },
      this.#status,
    );
  }
}
