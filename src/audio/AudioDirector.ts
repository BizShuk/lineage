import type {
  AudioChannel,
  AudioPort,
  AudioPortError,
  AudioPortOperation,
  AudioPortResult,
} from './AudioPort';
import type { MusicThemeId } from './music';
import type { AmbientLoopId, SoundEffectId } from './sfx';

export interface AudioSettings {
  readonly music: number;
  readonly ambient: number;
  readonly effects: number;
  readonly muted: boolean;
}

export type AudioEvent = SoundEffectId;

export type AudioDirectorPhase =
  | 'locked'
  | 'active'
  | 'suspended'
  | 'silent-fallback'
  | 'disposed';

export interface AudioDirectorState {
  readonly phase: AudioDirectorPhase;
  readonly settings: AudioSettings;
  readonly currentTheme: MusicThemeId | null;
  readonly currentAmbient: AmbientLoopId | null;
  readonly message: string | null;
  readonly failure: AudioPortError | null;
}

interface RegionAudio {
  readonly theme: MusicThemeId;
  readonly ambient: AmbientLoopId | null;
}

const fallbackMessage = '音訊無法啟用，遊戲將以靜音模式繼續。';
const crossfadeDurationMs = 1_200;

const regionAudio: Readonly<Record<string, RegionAudio>> = {
  title: { theme: 'title-theme', ambient: null },
  'talking-island-village': { theme: 'village-theme', ambient: 'village-hearth' },
  'scarecrow-field': { theme: 'surface-theme', ambient: 'forest-insects' },
  'north-field': { theme: 'surface-theme', ambient: 'forest-insects' },
  coast: { theme: 'surface-theme', ambient: 'coast-wind' },
  'black-knight-area': { theme: 'surface-theme', ambient: 'forest-insects' },
  'talking-island-dungeon-1': { theme: 'dungeon-theme', ambient: 'dungeon-drip' },
  'talking-island-dungeon-2': { theme: 'dungeon-theme', ambient: 'dungeon-drip' },
  'baphomet-boss': { theme: 'dungeon-theme', ambient: 'dungeon-drip' },
};

const clampGain = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

const normalizeSettings = (settings: AudioSettings): AudioSettings => ({
  music: clampGain(settings.music),
  ambient: clampGain(settings.ambient),
  effects: clampGain(settings.effects),
  muted: settings.muted,
});

export class AudioDirector {
  readonly #port: AudioPort;
  #phase: AudioDirectorPhase = 'locked';
  #settings: AudioSettings;
  #theme: MusicThemeId | null = null;
  #ambient: AmbientLoopId | null = null;
  #message: string | null = null;
  #failure: AudioPortError | null = null;

  constructor(port: AudioPort, settings: AudioSettings) {
    this.#port = port;
    this.#settings = normalizeSettings(settings);
    this.#applyGains();
  }

  get state(): AudioDirectorState {
    return {
      phase: this.#phase,
      settings: { ...this.#settings },
      currentTheme: this.#theme,
      currentAmbient: this.#ambient,
      message: this.#message,
      failure: this.#failure,
    };
  }

  enterRegion(regionId: string): void {
    if (this.#isTerminal()) {
      return;
    }
    const audio = regionAudio[regionId] ?? regionAudio['north-field'];
    if (audio === undefined) {
      return;
    }

    if (audio.theme !== this.#theme) {
      if (
        !this.#run('crossfade', () =>
          this.#port.crossfadeMusic(this.#theme, audio.theme, crossfadeDurationMs),
        )
      ) {
        return;
      }
      this.#theme = audio.theme;
    }

    if (audio.ambient === this.#ambient) {
      return;
    }
    if (
      this.#ambient !== null &&
      !this.#run('stop-ambient', () => this.#port.stopAmbient(this.#ambient as AmbientLoopId))
    ) {
      return;
    }
    this.#ambient = null;
    if (
      audio.ambient !== null &&
      !this.#run('start-ambient', () => this.#port.startAmbient(audio.ambient as AmbientLoopId))
    ) {
      return;
    }
    this.#ambient = audio.ambient;
  }

  playEvent(event: AudioEvent): void {
    if (!this.#isTerminal()) {
      this.#run('effect', () => this.#port.playEffect(event));
    }
  }

  updateSettings(settings: AudioSettings): void {
    if (this.#phase === 'disposed') {
      return;
    }
    this.#settings = normalizeSettings(settings);
    if (this.#phase !== 'silent-fallback') {
      this.#applyGains();
    }
  }

  resume(): void {
    if (this.#phase === 'active' || this.#isTerminal()) {
      return;
    }
    if (this.#run('resume', () => this.#port.resume())) {
      this.#phase = 'active';
    }
  }

  suspend(): void {
    if (this.#phase !== 'active') {
      return;
    }
    if (this.#run('suspend', () => this.#port.suspend())) {
      this.#phase = 'suspended';
    }
  }

  dispose(): void {
    if (this.#phase === 'disposed') {
      return;
    }
    try {
      this.#port.dispose();
    } catch {
      // Disposal is terminal and must never surface an audio-only failure to gameplay.
    }
    this.#phase = 'disposed';
    this.#theme = null;
    this.#ambient = null;
  }

  #applyGains(): void {
    const channels: readonly AudioChannel[] = ['music', 'ambient', 'effects'];
    for (const channel of channels) {
      if (this.#isTerminal()) {
        return;
      }
      const gain = this.#settings.muted ? 0 : this.#settings[channel];
      if (!this.#run('set-gain', () => this.#port.setChannelGain(channel, gain))) {
        return;
      }
    }
  }

  #run(operation: AudioPortOperation, action: () => AudioPortResult): boolean {
    if (this.#isTerminal()) {
      return false;
    }
    try {
      const result = action();
      if (!result.ok) {
        this.#enterFallback(result.error);
        return false;
      }
      return true;
    } catch (error: unknown) {
      this.#enterFallback({
        code: 'operation-failed',
        operation,
        message: error instanceof Error ? error.message : '未知音訊錯誤',
      });
      return false;
    }
  }

  #enterFallback(error: AudioPortError): void {
    this.#phase = 'silent-fallback';
    this.#message = fallbackMessage;
    this.#failure = error;
  }

  #isTerminal(): boolean {
    return this.#phase === 'silent-fallback' || this.#phase === 'disposed';
  }
}
