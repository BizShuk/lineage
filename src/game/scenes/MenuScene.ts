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
import type { GameContent } from '../../content/catalog';
import { isEndingUnlocked } from '../../core/quests';
import type { SaveRepository } from '../../storage/SaveRepository';
import { migrateSave } from '../../storage/migrations';
import type { SaveSettings } from '../../storage/saveSchema';
import {
  SavePanel,
  type SaveDownload,
  type SaveImportPreview,
  type SavePanelActions,
  type SavePanelViewModel,
  type SaveSummaryView,
} from '../../ui/panels/SavePanel';
import {
  CONTENT_REGISTRY_KEY,
  SAVE_REPOSITORY_REGISTRY_KEY,
} from './BootScene';

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
  readonly #importPayloads = new WeakMap<object, string>();

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
    overlay.className = 'scene-overlay menu-panel classic-menu';
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
      const model = await this.#savePanelModel(repository);
      if (!this.scene.isActive()) return;

      loading.remove();
      const panel = new SavePanel(
        document,
        this.#savePanelActions(repository),
        (download) => {
          this.#download(download);
        },
      );
      panel.render(model);
      panel.element.classList.add('classic-save-management');
      panel.element.style.position = 'static';
      panel.element.style.width = '100%';
      panel.element.style.height = '300px';
      panel.element.style.transform = 'none';
      panel.element.setAttribute('aria-modal', 'false');
      overlay.append(panel.element);

      const button = document.createElement('button');
      button.type = 'button';
      const occupied = model.slots.filter(({ save }) => save !== null).length;
      button.textContent = occupied < 3 ? '開始新遊戲' : '三個存檔欄皆已使用';
      button.disabled = occupied >= 3;
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

  async #savePanelModel(repository: SaveRepository): Promise<SavePanelViewModel> {
    const summaries = await repository.list();
    const summaryBySlot = new Map(summaries.map((summary) => [summary.slot, summary]));
    const slots = await Promise.all(
      ([1, 2, 3] as const).map(async (slot) => {
        const summary = summaryBySlot.get(slot);
        const backup = await repository.getBackupSummary(slot);
        return {
          slot,
          save: summary === undefined ? null : this.#summaryView(summary),
          backupUpdatedAt: backup?.updatedAt ?? null,
        };
      }),
    );
    return { slots };
  }

  #summaryView(summary: {
    readonly name: string;
    readonly classId: keyof typeof classNames;
    readonly level: number;
    readonly mapId: string;
    readonly updatedAt: string;
    readonly endingComplete: boolean;
  }): SaveSummaryView {
    const content = this.registry.get(CONTENT_REGISTRY_KEY) as GameContent;
    return {
      name: summary.name,
      className: classNames[summary.classId],
      level: summary.level,
      location: content.map(summary.mapId).name,
      updatedAt: summary.updatedAt,
      endingComplete: summary.endingComplete,
    };
  }

  #savePanelActions(repository: SaveRepository): SavePanelActions {
    return {
      load: async (slot) => {
        try {
          const stored = await repository.get(slot);
          if (stored === null) return { ok: false, reason: '此存檔欄沒有可載入的資料。' };
          if (this.scene.isActive()) {
            this.registry.set('active-save', stored);
            this.scene.start('world');
          }
          return { ok: true, viewModel: await this.#savePanelModel(repository) };
        } catch {
          return { ok: false, reason: '載入存檔失敗。' };
        }
      },
      export: async (slot) => {
        try {
          const contents = await repository.export(slot);
          return {
            ok: true,
            viewModel: {
              panel: await this.#savePanelModel(repository),
              download: {
                filename: `talking-island-slot-${String(slot)}.json`,
                mediaType: 'application/json',
                contents,
              },
            },
          };
        } catch {
          return { ok: false, reason: '匯出存檔失敗。' };
        }
      },
      validateImport: (slot, parsedJson) => {
        try {
          const migrated = migrateSave(parsedJson);
          const token = Object.freeze({});
          this.#importPayloads.set(token, JSON.stringify(parsedJson));
          const preview: SaveImportPreview = {
            targetSlot: slot,
            summary: this.#summaryView({
              name: migrated.character.name,
              classId: migrated.character.classId,
              level: migrated.character.level,
              mapId: migrated.world.player.mapId,
              updatedAt: migrated.updatedAt,
              endingComplete: isEndingUnlocked(migrated.world.flags),
            }),
            validationToken: token,
          };
          return Promise.resolve({ ok: true as const, viewModel: preview });
        } catch {
          return Promise.resolve({
            ok: false as const,
            reason: '匯入存檔驗證失敗，資料未變更。',
          });
        }
      },
      confirmImport: async (preview) => {
        const serialized = this.#importPayloads.get(preview.validationToken);
        if (serialized === undefined) {
          return { ok: false, reason: '匯入確認已失效，請重新選擇檔案。' };
        }
        try {
          await repository.import(preview.targetSlot, serialized);
          this.#importPayloads.delete(preview.validationToken);
          return { ok: true, viewModel: await this.#savePanelModel(repository) };
        } catch {
          return { ok: false, reason: '匯入存檔失敗，資料未變更。' };
        }
      },
      restore: async (slot) => {
        try {
          await repository.restoreBackup(slot);
          return { ok: true, viewModel: await this.#savePanelModel(repository) };
        } catch {
          return { ok: false, reason: '找不到可還原的備份。' };
        }
      },
      delete: async (slot, characterNameConfirmation) => {
        try {
          const deleted = await repository.delete(slot, characterNameConfirmation);
          return deleted
            ? { ok: true, viewModel: await this.#savePanelModel(repository) }
            : { ok: false, reason: '角色名稱不符，存檔未刪除。' };
        } catch {
          return { ok: false, reason: '刪除存檔失敗。' };
        }
      },
    };
  }

  #download(download: SaveDownload): void {
    const blob = new Blob([download.contents], { type: download.mediaType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = download.filename;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
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
