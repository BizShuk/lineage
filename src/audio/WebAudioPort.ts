import type {
  AudioChannel,
  AudioPort,
  AudioPortOperation,
  AudioPortResult,
} from './AudioPort';
import {
  MUSIC_THEMES,
  type EnvelopeDefinition,
  type MusicThemeId,
  type ProceduralMusicTheme,
} from './music';
import {
  AMBIENT_LOOPS,
  SOUND_EFFECTS,
  type AmbientLoopId,
  type NoiseLayer,
  type ProceduralLayer,
  type SoundEffectId,
} from './sfx';

export interface WebAudioParamLike {
  value: number;
  cancelScheduledValues(time: number): void;
  setValueAtTime(value: number, time: number): void;
  linearRampToValueAtTime(value: number, time: number): void;
  exponentialRampToValueAtTime(value: number, time: number): void;
}

export interface WebAudioNodeLike {
  connect(destination: WebAudioNodeLike): WebAudioNodeLike;
  disconnect(): void;
}

export interface WebAudioGainLike extends WebAudioNodeLike {
  readonly gain: WebAudioParamLike;
}

export interface WebAudioFilterLike extends WebAudioNodeLike {
  type: string;
  readonly frequency: WebAudioParamLike;
}

interface WebAudioSourceLike extends WebAudioNodeLike {
  onended: (() => void) | null;
  start(time?: number): void;
  stop(time?: number): void;
}

export interface WebAudioOscillatorLike extends WebAudioSourceLike {
  type: string;
  readonly frequency: WebAudioParamLike;
  readonly detune: WebAudioParamLike;
}

export interface WebAudioBufferLike {
  readonly length: number;
  readonly sampleRate: number;
  getChannelData(channel: number): Float32Array;
}

export interface WebAudioBufferSourceLike extends WebAudioSourceLike {
  buffer: WebAudioBufferLike | null;
  loop: boolean;
}

export interface WebAudioContextLike {
  readonly currentTime: number;
  readonly state: 'suspended' | 'running' | 'closed';
  readonly sampleRate: number;
  readonly destination: WebAudioNodeLike;
  createGain(): WebAudioGainLike;
  createBiquadFilter(): WebAudioFilterLike;
  createOscillator(): WebAudioOscillatorLike;
  createBuffer(numberOfChannels: number, length: number, sampleRate: number): WebAudioBufferLike;
  createBufferSource(): WebAudioBufferSourceLike;
  resume(): void | Promise<void>;
  suspend(): void | Promise<void>;
  close(): void | Promise<void>;
}

export type AudioContextFactory = () => WebAudioContextLike | null;

export interface WebAudioClock {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface WebAudioPortOptions {
  readonly contextFactory?: AudioContextFactory;
  readonly clock?: WebAudioClock;
  readonly random?: () => number;
}

interface MusicVoice {
  readonly theme: ProceduralMusicTheme;
  readonly mix: WebAudioGainLike;
  readonly filter: WebAudioFilterLike;
  readonly sources: Set<WebAudioOscillatorLike>;
  phraseEndsAt: number;
  timer: TimerHandle | null;
}

interface TimerHandle {
  readonly value: unknown;
}

interface AmbientVoice {
  readonly sources: Set<WebAudioSourceLike>;
  readonly nodes: Set<WebAudioNodeLike>;
}

const success = (): AudioPortResult => ({ ok: true });

const clampGain = (gain: number): number =>
  Number.isFinite(gain) ? Math.min(1, Math.max(0, gain)) : 0;

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const ignoreRejection = (operation: void | Promise<void>): void => {
  if (operation !== undefined) {
    void Promise.resolve(operation).catch(() => undefined);
  }
};

const defaultContextFactory: AudioContextFactory = () => {
  if (typeof AudioContext === 'undefined') {
    return null;
  }
  return new AudioContext() as unknown as WebAudioContextLike;
};

const defaultClock: WebAudioClock = {
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) => {
    globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};

export class WebAudioPort implements AudioPort {
  readonly #contextFactory: AudioContextFactory;
  readonly #clock: WebAudioClock;
  readonly #random: () => number;
  readonly #gains: Record<AudioChannel, number> = {
    music: 1,
    ambient: 1,
    effects: 1,
  };
  readonly #channelNodes = new Map<AudioChannel, WebAudioGainLike>();
  readonly #requestedAmbient = new Set<AmbientLoopId>();
  readonly #ambientVoices = new Map<AmbientLoopId, AmbientVoice>();
  readonly #effectSources = new Set<WebAudioSourceLike>();
  readonly #effectNodes = new Set<WebAudioNodeLike>();
  #context: WebAudioContextLike | null = null;
  #desiredTheme: MusicThemeId | null = null;
  #desiredCrossfadeMs = 1_200;
  #musicVoice: MusicVoice | null = null;
  #suspended = true;
  #disposed = false;

  constructor(options: WebAudioPortOptions = {}) {
    this.#contextFactory = options.contextFactory ?? defaultContextFactory;
    this.#clock = options.clock ?? defaultClock;
    this.#random = options.random ?? Math.random;
  }

  setChannelGain(channel: AudioChannel, gain: number): AudioPortResult {
    return this.#run('set-gain', () => {
      this.#gains[channel] = clampGain(gain);
      const node = this.#channelNodes.get(channel);
      if (node !== undefined && this.#context !== null) {
        node.gain.cancelScheduledValues(this.#context.currentTime);
        node.gain.setValueAtTime(this.#gains[channel], this.#context.currentTime);
      }
    });
  }

  crossfadeMusic(
    _from: MusicThemeId | null,
    to: MusicThemeId,
    durationMs: number,
  ): AudioPortResult {
    return this.#run('crossfade', () => {
      this.#desiredTheme = to;
      this.#desiredCrossfadeMs = Number.isFinite(durationMs)
        ? Math.max(0, durationMs)
        : 1_200;
      if (this.#context !== null && !this.#suspended) {
        this.#startMusic(to, this.#desiredCrossfadeMs);
      }
    });
  }

  startAmbient(loop: AmbientLoopId): AudioPortResult {
    return this.#run('start-ambient', () => {
      if (this.#requestedAmbient.has(loop)) {
        return;
      }
      this.#requestedAmbient.add(loop);
      if (this.#context !== null && !this.#suspended) {
        this.#startAmbientVoice(loop);
      }
    });
  }

  stopAmbient(loop: AmbientLoopId): AudioPortResult {
    return this.#run('stop-ambient', () => {
      this.#requestedAmbient.delete(loop);
      const voice = this.#ambientVoices.get(loop);
      if (voice !== undefined) {
        this.#stopAmbientVoice(voice);
        this.#ambientVoices.delete(loop);
      }
    });
  }

  playEffect(effect: SoundEffectId): AudioPortResult {
    return this.#run('effect', () => {
      if (this.#context === null || this.#suspended) {
        return;
      }
      const output = this.#requiredChannel('effects');
      SOUND_EFFECTS[effect].layers.forEach((layer) => {
        this.#startLayer(
          layer,
          output,
          false,
          this.#effectSources,
          this.#effectNodes,
        );
      });
    });
  }

  resume(): AudioPortResult {
    if (this.#disposed) {
      return this.#disposedFailure('resume');
    }

    if (this.#context === null) {
      let context: WebAudioContextLike | null;
      try {
        context = this.#contextFactory();
      } catch {
        context = null;
      }
      if (context === null) {
        return {
          ok: false,
          error: {
            code: 'unavailable',
            operation: 'resume',
            message: 'Web Audio API is unavailable',
          },
        };
      }
      try {
        this.#context = context;
        this.#createChannels(context);
      } catch (error) {
        this.#context = null;
        return {
          ok: false,
          error: {
            code: 'unavailable',
            operation: 'resume',
            message: errorMessage(error),
          },
        };
      }
    }

    return this.#run('resume', () => {
      const context = this.#requiredContext();
      ignoreRejection(context.resume());
      const wasSuspended = this.#suspended;
      this.#suspended = false;
      if (this.#musicVoice === null && this.#desiredTheme !== null) {
        this.#startMusic(this.#desiredTheme, this.#desiredCrossfadeMs);
      } else if (wasSuspended && this.#musicVoice !== null) {
        this.#scheduleNextPhrase(this.#musicVoice);
      }
      this.#requestedAmbient.forEach((loop) => {
        if (!this.#ambientVoices.has(loop)) {
          this.#startAmbientVoice(loop);
        }
      });
    });
  }

  suspend(): AudioPortResult {
    return this.#run('suspend', () => {
      this.#suspended = true;
      if (this.#musicVoice?.timer !== null && this.#musicVoice !== null) {
        this.#clock.clearTimeout(this.#musicVoice.timer.value);
        this.#musicVoice.timer = null;
      }
      if (this.#context !== null) {
        ignoreRejection(this.#context.suspend());
      }
    });
  }

  dispose(): AudioPortResult {
    if (this.#disposed) {
      return success();
    }

    return this.#run('dispose', () => {
      this.#disposed = true;
      this.#suspended = true;
      if (this.#musicVoice !== null) {
        this.#stopMusicVoice(this.#musicVoice);
        this.#musicVoice = null;
      }
      this.#ambientVoices.forEach((voice) => {
        this.#stopAmbientVoice(voice);
      });
      this.#ambientVoices.clear();
      this.#effectSources.forEach((source) => {
        this.#stopSource(source);
      });
      this.#effectSources.clear();
      this.#effectNodes.forEach((node) => {
        this.#disconnect(node);
      });
      this.#effectNodes.clear();
      this.#channelNodes.forEach((node) => {
        this.#disconnect(node);
      });
      this.#channelNodes.clear();
      if (this.#context !== null) {
        ignoreRejection(this.#context.close());
      }
    }, true);
  }

  #run(
    operation: AudioPortOperation,
    action: () => void,
    allowDisposed = false,
  ): AudioPortResult {
    if (this.#disposed && !allowDisposed) {
      return this.#disposedFailure(operation);
    }
    try {
      action();
      return success();
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'operation-failed',
          operation,
          message: errorMessage(error),
        },
      };
    }
  }

  #disposedFailure(operation: AudioPortOperation): AudioPortResult {
    return {
      ok: false,
      error: {
        code: 'operation-failed',
        operation,
        message: 'Web Audio port has been disposed',
      },
    };
  }

  #createChannels(context: WebAudioContextLike): void {
    (['music', 'ambient', 'effects'] as const).forEach((channel) => {
      const gain = context.createGain();
      gain.gain.setValueAtTime(this.#gains[channel], context.currentTime);
      gain.connect(context.destination);
      this.#channelNodes.set(channel, gain);
    });
  }

  #requiredContext(): WebAudioContextLike {
    if (this.#context === null) {
      throw new Error('AudioContext has not been resumed');
    }
    return this.#context;
  }

  #requiredChannel(channel: AudioChannel): WebAudioGainLike {
    const node = this.#channelNodes.get(channel);
    if (node === undefined) {
      throw new Error(`Audio channel is unavailable: ${channel}`);
    }
    return node;
  }

  #startMusic(themeId: MusicThemeId, durationMs: number): void {
    const context = this.#requiredContext();
    const theme = MUSIC_THEMES[themeId];
    const now = context.currentTime;
    const fadeSeconds = durationMs / 1_000;
    const previous = this.#musicVoice;
    if (previous?.theme.id === themeId) {
      return;
    }

    const mix = context.createGain();
    mix.gain.cancelScheduledValues(now);
    mix.gain.setValueAtTime(fadeSeconds > 0 ? 0 : 1, now);
    if (fadeSeconds > 0) {
      mix.gain.linearRampToValueAtTime(1, now + fadeSeconds);
    }
    mix.connect(this.#requiredChannel('music'));

    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(theme.filterHz, now);
    filter.connect(mix);
    const voice: MusicVoice = {
      theme,
      mix,
      filter,
      sources: new Set(),
      phraseEndsAt: now,
      timer: null,
    };
    this.#musicVoice = voice;
    this.#scheduleMusicPhrase(voice, now);

    if (previous !== null) {
      if (previous.timer !== null) {
        this.#clock.clearTimeout(previous.timer.value);
        previous.timer = null;
      }
      previous.mix.gain.cancelScheduledValues(now);
      previous.mix.gain.setValueAtTime(previous.mix.gain.value, now);
      previous.mix.gain.linearRampToValueAtTime(0, now + fadeSeconds);
      this.#clock.setTimeout(() => {
        this.#stopMusicVoice(previous);
      }, durationMs);
    }
  }

  #scheduleMusicPhrase(voice: MusicVoice, startsAt: number): void {
    const secondsPerBeat = 60 / voice.theme.tempoBpm;
    let cursor = startsAt;
    voice.theme.sequence.forEach((note) => {
      const durationSeconds = note.beats * secondsPerBeat;
      const source = this.#requiredContext().createOscillator();
      source.type = voice.theme.waveform;
      source.frequency.setValueAtTime(note.frequencyHz, cursor);
      source.detune.setValueAtTime(note.detuneCents ?? 0, cursor);
      const noteGain = this.#requiredContext().createGain();
      this.#scheduleEnvelope(
        noteGain.gain,
        cursor,
        durationSeconds,
        note.gain,
        voice.theme.envelope,
        false,
      );
      source.connect(noteGain);
      noteGain.connect(voice.filter);
      voice.sources.add(source);
      source.onended = () => {
        voice.sources.delete(source);
        this.#disconnect(source);
        this.#disconnect(noteGain);
      };
      source.start(cursor);
      source.stop(cursor + durationSeconds + voice.theme.envelope.releaseMs / 1_000);
      cursor += durationSeconds;
    });
    voice.phraseEndsAt = cursor;
    this.#scheduleNextPhrase(voice);
  }

  #scheduleNextPhrase(voice: MusicVoice): void {
    if (
      this.#suspended ||
      this.#disposed ||
      this.#musicVoice !== voice ||
      voice.timer !== null
    ) {
      return;
    }
    const delayMs = Math.max(
      0,
      (voice.phraseEndsAt - this.#requiredContext().currentTime) * 1_000,
    );
    voice.timer = {
      value: this.#clock.setTimeout(() => {
        voice.timer = null;
        if (!this.#suspended && !this.#disposed && this.#musicVoice === voice) {
          this.#scheduleMusicPhrase(
            voice,
            Math.max(voice.phraseEndsAt, this.#requiredContext().currentTime),
          );
        }
      }, delayMs),
    };
  }

  #stopMusicVoice(voice: MusicVoice): void {
    if (voice.timer !== null) {
      this.#clock.clearTimeout(voice.timer.value);
      voice.timer = null;
    }
    voice.sources.forEach((source) => {
      this.#stopSource(source);
    });
    voice.sources.clear();
    this.#disconnect(voice.filter);
    this.#disconnect(voice.mix);
  }

  #startAmbientVoice(loop: AmbientLoopId): void {
    if (this.#ambientVoices.has(loop)) {
      return;
    }
    const context = this.#requiredContext();
    const group = context.createGain();
    group.gain.setValueAtTime(1, context.currentTime);
    group.connect(this.#requiredChannel('ambient'));
    const voice: AmbientVoice = {
      sources: new Set(),
      nodes: new Set([group]),
    };
    this.#ambientVoices.set(loop, voice);
    AMBIENT_LOOPS[loop].layers.forEach((layer) => {
      this.#startLayer(layer, group, true, voice.sources, voice.nodes);
    });
  }

  #stopAmbientVoice(voice: AmbientVoice): void {
    voice.sources.forEach((source) => {
      this.#stopSource(source);
    });
    voice.sources.clear();
    voice.nodes.forEach((node) => {
      this.#disconnect(node);
    });
    voice.nodes.clear();
  }

  #startLayer(
    layer: ProceduralLayer,
    output: WebAudioNodeLike,
    loop: boolean,
    sources: Set<WebAudioSourceLike>,
    nodes: Set<WebAudioNodeLike> = new Set(),
  ): void {
    const context = this.#requiredContext();
    const startsAt = context.currentTime + layer.delayMs / 1_000;
    const durationSeconds = layer.durationMs / 1_000;
    const gain = context.createGain();
    nodes.add(gain);
    const layerNodes: WebAudioNodeLike[] = [gain];
    this.#scheduleEnvelope(
      gain.gain,
      startsAt,
      durationSeconds,
      layer.gain,
      layer.envelope,
      loop,
    );

    let source: WebAudioSourceLike;
    if (layer.source === 'oscillator') {
      const oscillator = context.createOscillator();
      oscillator.type = layer.waveform;
      oscillator.frequency.setValueAtTime(layer.frequencyHz, startsAt);
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(0.0001, layer.endFrequencyHz),
        startsAt + durationSeconds,
      );
      oscillator.connect(gain);
      source = oscillator;
    } else {
      const bufferSource = context.createBufferSource();
      bufferSource.buffer = this.#noiseBuffer(layer);
      bufferSource.loop = loop;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(layer.filterHz, startsAt);
      bufferSource.connect(filter);
      filter.connect(gain);
      nodes.add(filter);
      layerNodes.push(filter);
      source = bufferSource;
    }

    gain.connect(output);
    sources.add(source);
    source.onended = () => {
      sources.delete(source);
      this.#disconnect(source);
      layerNodes.forEach((node) => {
        nodes.delete(node);
        this.#disconnect(node);
      });
    };
    source.start(startsAt);
    if (!loop) {
      source.stop(startsAt + durationSeconds);
    }
  }

  #noiseBuffer(layer: NoiseLayer): WebAudioBufferLike {
    const context = this.#requiredContext();
    const length = Math.max(
      1,
      Math.ceil(context.sampleRate * (layer.durationMs / 1_000)),
    );
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const samples = buffer.getChannelData(0);
    let brown = 0;
    let pink = 0;
    for (let index = 0; index < samples.length; index += 1) {
      const white = this.#random() * 2 - 1;
      let value = white;
      if (layer.color === 'pink') {
        pink = pink * 0.85 + white * 0.15;
        value = pink;
      } else if (layer.color === 'brown') {
        brown = Math.max(-1, Math.min(1, brown + white * 0.025));
        value = brown;
      }
      samples[index] = value;
    }
    return buffer;
  }

  #scheduleEnvelope(
    param: WebAudioParamLike,
    startsAt: number,
    durationSeconds: number,
    peak: number,
    envelope: EnvelopeDefinition,
    loop: boolean,
  ): void {
    const attackEndsAt = Math.min(
      startsAt + durationSeconds,
      startsAt + envelope.attackMs / 1_000,
    );
    const decayEndsAt = Math.min(
      startsAt + durationSeconds,
      attackEndsAt + envelope.decayMs / 1_000,
    );
    param.cancelScheduledValues(startsAt);
    param.setValueAtTime(0, startsAt);
    param.linearRampToValueAtTime(peak, attackEndsAt);
    param.linearRampToValueAtTime(peak * envelope.sustain, decayEndsAt);
    if (!loop) {
      const endsAt = startsAt + durationSeconds;
      const releaseStartsAt = Math.max(
        decayEndsAt,
        endsAt - envelope.releaseMs / 1_000,
      );
      param.setValueAtTime(peak * envelope.sustain, releaseStartsAt);
      param.linearRampToValueAtTime(0, endsAt);
    }
  }

  #stopSource(source: WebAudioSourceLike): void {
    try {
      source.stop(this.#context?.currentTime ?? 0);
    } catch {
      // A source that already ended is already stopped.
    }
    this.#disconnect(source);
  }

  #disconnect(node: WebAudioNodeLike): void {
    try {
      node.disconnect();
    } catch {
      // Disconnect is best effort during teardown.
    }
  }
}
