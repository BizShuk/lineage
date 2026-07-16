import {
  applyPanelResult,
  createActionButton,
  createPanelShell,
  type PanelActionResult,
} from './shared';

export type SettingsScale = 1 | 2 | 3;

export interface SettingsPanelViewModel {
  readonly music: number;
  readonly ambient: number;
  readonly effects: number;
  readonly muted: boolean;
  readonly scale: SettingsScale;
}

export interface SettingsPanelActions {
  readonly preview?: (settings: SettingsPanelViewModel) => void;
  readonly save: (
    settings: SettingsPanelViewModel,
  ) => PanelActionResult<SettingsPanelViewModel>;
}

interface RangeControl {
  readonly wrapper: HTMLElement;
  readonly input: HTMLInputElement;
}

const createRange = (
  document: Document,
  labelText: string,
  testId: string,
): RangeControl => {
  const wrapper = document.createElement('label');
  wrapper.textContent = labelText;
  const input = document.createElement('input');
  input.type = 'range';
  input.min = '0';
  input.max = '1';
  input.step = '0.05';
  input.setAttribute('aria-label', labelText);
  input.setAttribute('data-testid', testId);
  wrapper.append(input);
  return { wrapper, input };
};

const scaleValue = (value: string): SettingsScale => {
  const parsed = Number(value);
  return parsed === 1 || parsed === 2 || parsed === 3 ? parsed : 1;
};

export class SettingsPanel {
  readonly element: HTMLElement;
  readonly #status: HTMLElement;
  readonly #actions: SettingsPanelActions;
  readonly #music: HTMLInputElement;
  readonly #ambient: HTMLInputElement;
  readonly #effects: HTMLInputElement;
  readonly #muted: HTMLInputElement;
  readonly #scale: HTMLSelectElement;
  #state: SettingsPanelViewModel | null = null;

  constructor(document: Document, actions: SettingsPanelActions) {
    this.#actions = actions;
    const shell = createPanelShell(document, 'settings', '設定');
    this.element = shell.element;
    this.#status = shell.status;

    const music = createRange(document, '音樂音量', 'settings-music');
    const ambient = createRange(document, '環境音量', 'settings-ambient');
    const effects = createRange(document, '音效音量', 'settings-effects');
    this.#music = music.input;
    this.#ambient = ambient.input;
    this.#effects = effects.input;

    const muteLabel = document.createElement('label');
    muteLabel.textContent = '全部靜音';
    this.#muted = document.createElement('input');
    this.#muted.type = 'checkbox';
    this.#muted.setAttribute('aria-label', '全部靜音');
    this.#muted.setAttribute('data-testid', 'settings-muted');
    muteLabel.append(this.#muted);

    const scaleLabel = document.createElement('label');
    scaleLabel.textContent = '畫面縮放';
    this.#scale = document.createElement('select');
    this.#scale.setAttribute('aria-label', '畫面縮放');
    this.#scale.setAttribute('data-testid', 'settings-scale');
    ([1, 2, 3] as const).forEach((scale) => {
      const option = document.createElement('option');
      option.value = String(scale);
      option.textContent = `${String(scale)} 倍`;
      this.#scale.append(option);
    });
    scaleLabel.append(this.#scale);

    const preview = (): void => {
      this.#actions.preview?.(this.#controlSettings());
    };
    this.#music.addEventListener('input', preview);
    this.#ambient.addEventListener('input', preview);
    this.#effects.addEventListener('input', preview);
    this.#muted.addEventListener('change', preview);

    const save = createActionButton(document, '套用設定', 'settings-save', () => {
      this.save(this.#controlSettings());
    });
    shell.body.replaceChildren(
      music.wrapper,
      ambient.wrapper,
      effects.wrapper,
      muteLabel,
      scaleLabel,
      save,
    );
  }

  get state(): SettingsPanelViewModel | null {
    return this.#state;
  }

  render(viewModel: SettingsPanelViewModel): void {
    this.#state = viewModel;
    this.#music.value = String(viewModel.music);
    this.#ambient.value = String(viewModel.ambient);
    this.#effects.value = String(viewModel.effects);
    this.#muted.checked = viewModel.muted;
    this.#scale.value = String(viewModel.scale);
  }

  save(settings: SettingsPanelViewModel): void {
    applyPanelResult(
      this.#actions.save(settings),
      (viewModel) => {
        this.render(viewModel);
      },
      this.#status,
    );
  }

  #controlSettings(): SettingsPanelViewModel {
    return {
      music: Number(this.#music.value),
      ambient: Number(this.#ambient.value),
      effects: Number(this.#effects.value),
      muted: this.#muted.checked,
      scale: scaleValue(this.#scale.value),
    };
  }
}
