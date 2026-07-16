import Phaser from 'phaser';

import { AudioDirector } from '../../audio/AudioDirector';
import type {
  AudioChannel,
  AudioPort,
  AudioPortOperation,
  AudioPortResult,
} from '../../audio/AudioPort';
import { WebAudioPort } from '../../audio/WebAudioPort';
import type { MusicThemeId } from '../../audio/music';
import type { AmbientLoopId, SoundEffectId } from '../../audio/sfx';
import type { SaveRepository } from '../../storage/SaveRepository';
import type { SaveSettings, SaveSummary } from '../../storage/saveSchema';
import { SAVE_REPOSITORY_REGISTRY_KEY } from './BootScene';

interface MenuSceneData {
  readonly contentError?: string;
}

const classNames = {
  prince: '王族',
  knight: '騎士',
  elf: '妖精',
  wizard: '法師',
} as const;

const AUDIO_DIRECTOR_REGISTRY_KEY = 'audio-director';

export interface AudioE2ECommand {
  readonly type: AudioPortOperation;
  readonly channel?: AudioChannel;
  readonly value?: number;
  readonly from?: MusicThemeId | null;
  readonly to?: MusicThemeId;
  readonly durationMs?: number;
  readonly sound?: AmbientLoopId | SoundEffectId;
}

export interface AudioE2EDebug {
  readonly commands: AudioE2ECommand[];
  readonly gains: Record<AudioChannel, number>;
  hidden: boolean | null;
  activeSettings: SaveSettings | null;
  routeRegion: ((regionId: string) => void) | null;
}

declare global {
  interface Window {
    __lineageAudioE2E?: AudioE2EDebug;
  }
}

const success = (): AudioPortResult => ({ ok: true });

class RecordingAudioPort implements AudioPort {
  readonly #debug: AudioE2EDebug;
  readonly #failure: AudioPortOperation | null;

  constructor(debug: AudioE2EDebug, failure: AudioPortOperation | null) {
    this.#debug = debug;
    this.#failure = failure;
  }

  setChannelGain(channel: AudioChannel, value: number): AudioPortResult {
    this.#debug.commands.push({ type: 'set-gain', channel, value });
    this.#debug.gains[channel] = value;
    return this.#result('set-gain');
  }

  crossfadeMusic(
    from: MusicThemeId | null,
    to: MusicThemeId,
    durationMs: number,
  ): AudioPortResult {
    this.#debug.commands.push({ type: 'crossfade', from, to, durationMs });
    return this.#result('crossfade');
  }

  startAmbient(sound: AmbientLoopId): AudioPortResult {
    this.#debug.commands.push({ type: 'start-ambient', sound });
    return this.#result('start-ambient');
  }

  stopAmbient(sound: AmbientLoopId): AudioPortResult {
    this.#debug.commands.push({ type: 'stop-ambient', sound });
    return this.#result('stop-ambient');
  }

  playEffect(sound: SoundEffectId): AudioPortResult {
    this.#debug.commands.push({ type: 'effect', sound });
    return this.#result('effect');
  }

  resume(): AudioPortResult {
    this.#debug.commands.push({ type: 'resume' });
    return this.#result('resume');
  }

  suspend(): AudioPortResult {
    this.#debug.commands.push({ type: 'suspend' });
    return this.#result('suspend');
  }

  dispose(): AudioPortResult {
    this.#debug.commands.push({ type: 'dispose' });
    return this.#result('dispose');
  }

  #result(operation: AudioPortOperation): AudioPortResult {
    return this.#failure === operation
      ? {
          ok: false,
          error: {
            code: 'operation-failed',
            operation,
            message: `E2E ${operation} failure`,
          },
        }
      : success();
  }
}

const audioOperations: readonly AudioPortOperation[] = [
  'set-gain',
  'crossfade',
  'start-ambient',
  'stop-ambient',
  'effect',
  'resume',
  'suspend',
  'dispose',
];

const audioFailureFromUrl = (search: URLSearchParams): AudioPortOperation | null => {
  const value = search.get('audioFailure');
  return audioOperations.find((operation) => operation === value) ?? null;
};

export const ensureAudioDirector = (scene: Phaser.Scene): AudioDirector => {
  const current = scene.registry.get(AUDIO_DIRECTOR_REGISTRY_KEY) as AudioDirector | undefined;
  if (current !== undefined && current.state.phase !== 'disposed') return current;

  const search = new URLSearchParams(window.location.search);
  let port: AudioPort;
  if (search.get('e2e') === '1') {
    const debug: AudioE2EDebug = {
      commands: [],
      gains: { music: 0, ambient: 0, effects: 0 },
      hidden: null,
      activeSettings: null,
      routeRegion: null,
    };
    window.__lineageAudioE2E = debug;
    port = new RecordingAudioPort(debug, audioFailureFromUrl(search));
  } else {
    port = new WebAudioPort();
  }
  const director = new AudioDirector(port, {
    music: 0.7,
    ambient: 0.5,
    effects: 0.8,
    muted: false,
  });
  scene.registry.set(AUDIO_DIRECTOR_REGISTRY_KEY, director);
  return director;
};

export class MenuScene extends Phaser.Scene {
  #contentError: string | undefined;
  #overlay: HTMLElement | null = null;
  #audioDirector: AudioDirector | null = null;
  #audioStatus: HTMLOutputElement | null = null;

  constructor() {
    super('menu');
  }

  init(data: MenuSceneData): void {
    this.#contentError = data.contentError;
  }

  create(): void {
    const parent = this.game.canvas.parentElement;
    if (parent === null) return;

    parent.dataset.scene = this.#contentError === undefined ? 'menu' : 'menu-error';
    this.#audioDirector = ensureAudioDirector(this);
    this.#audioDirector.enterRegion('title');
    this.add.rectangle(320, 240, 640, 480, 0x080b0a);
    this.add.text(320, 96, '說話之島', {
      color: '#d9bd7a',
      fontFamily: 'serif',
      fontSize: '36px',
    }).setOrigin(0.5);

    const overlay = document.createElement('section');
    overlay.className = 'scene-overlay menu-panel';
    overlay.setAttribute('aria-label', '主選單');
    parent.append(overlay);
    this.#overlay = overlay;
    overlay.addEventListener('pointerdown', this.#resumeAudio, { once: true });
    this.game.canvas.addEventListener('pointerdown', this.#resumeAudio, { once: true });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.#removeOverlay();
    });

    if (this.#contentError !== undefined) {
      const error = document.createElement('p');
      error.className = 'error-message';
      error.setAttribute('role', 'alert');
      error.textContent = this.#contentError;
      overlay.append(error);
      return;
    }

    const loading = document.createElement('p');
    loading.textContent = '讀取存檔中……';
    overlay.append(loading);
    void this.#renderReadyMenu(overlay, loading);
  }

  async #renderReadyMenu(overlay: HTMLElement, loading: HTMLElement): Promise<void> {
    try {
      const repository = this.registry.get(SAVE_REPOSITORY_REGISTRY_KEY) as SaveRepository;
      const saves = await repository.list();
      if (!this.scene.isActive()) return;

      loading.remove();
      const slots = document.createElement('div');
      slots.className = 'save-slot-list';
      for (const save of saves) slots.append(this.#createSaveButton(save));
      overlay.append(slots);

      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = saves.length < 3 ? '開始新遊戲' : '三個存檔欄皆已使用';
      button.disabled = saves.length >= 3;
      button.addEventListener('click', () => {
        this.scene.start('character-create');
      });
      overlay.append(button);
    } catch (error) {
      loading.setAttribute('role', 'alert');
      loading.className = 'error-message';
      loading.textContent = `讀取存檔失敗：${error instanceof Error ? error.message : String(error)}`;
    }
  }

  #createSaveButton(save: SaveSummary): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `繼續 ${save.name} / ${classNames[save.classId]} Lv.${String(save.level)}`;
    button.addEventListener('click', () => {
      void this.#loadSave(save);
    });
    return button;
  }

  async #loadSave(save: SaveSummary): Promise<void> {
    const repository = this.registry.get(SAVE_REPOSITORY_REGISTRY_KEY) as SaveRepository;
    const stored = await repository.get(save.slot);
    if (stored === null || !this.scene.isActive()) return;
    this.registry.set('active-save', stored);
    this.scene.start('world');
  }

  #removeOverlay(): void {
    this.#overlay?.removeEventListener('pointerdown', this.#resumeAudio);
    this.game.canvas.removeEventListener('pointerdown', this.#resumeAudio);
    this.#overlay?.remove();
    this.#overlay = null;
    this.#audioStatus?.remove();
    this.#audioStatus = null;
  }

  #resumeAudio = (): void => {
    this.#audioDirector?.resume();
    const message = this.#audioDirector?.state.message ?? null;
    if (message === null || this.#overlay === null) return;
    const status = document.createElement('output');
    status.dataset.testid = 'audio-status';
    status.setAttribute('role', 'status');
    status.textContent = message;
    this.#overlay.append(status);
    this.#audioStatus = status;
  };
}
