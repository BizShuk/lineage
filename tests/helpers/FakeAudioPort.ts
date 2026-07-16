import type {
  AudioChannel,
  AudioPort,
  AudioPortError,
  AudioPortOperation,
  AudioPortResult,
} from '../../src/audio/AudioPort';
import type { MusicThemeId } from '../../src/audio/music';
import type { AmbientLoopId, SoundEffectId } from '../../src/audio/sfx';

export type RecordedAudioCommand =
  | { readonly type: 'gain'; readonly channel: AudioChannel; readonly gain: number }
  | {
      readonly type: 'crossfade';
      readonly from: MusicThemeId | null;
      readonly to: MusicThemeId;
      readonly durationMs: number;
    }
  | { readonly type: 'start-ambient'; readonly loop: AmbientLoopId }
  | { readonly type: 'stop-ambient'; readonly loop: AmbientLoopId }
  | { readonly type: 'effect'; readonly effect: SoundEffectId }
  | { readonly type: 'resume' }
  | { readonly type: 'suspend' }
  | { readonly type: 'dispose' };

const success = (): AudioPortResult => ({ ok: true });

export class FakeAudioPort implements AudioPort {
  readonly commands: RecordedAudioCommand[] = [];
  readonly #gains: Record<AudioChannel, number> = { music: 1, ambient: 1, effects: 1 };
  readonly #failures = new Map<AudioPortOperation, AudioPortError>();

  fail(operation: AudioPortOperation, message = '測試音訊介面失敗'): void {
    this.#failures.set(operation, {
      code: 'operation-failed',
      operation,
      message,
    });
  }

  channelGain(channel: AudioChannel): number {
    return this.#gains[channel];
  }

  setChannelGain(channel: AudioChannel, gain: number): AudioPortResult {
    this.commands.push({ type: 'gain', channel, gain });
    const result = this.#result('set-gain');
    if (result.ok) {
      this.#gains[channel] = gain;
    }
    return result;
  }

  crossfadeMusic(
    from: MusicThemeId | null,
    to: MusicThemeId,
    durationMs: number,
  ): AudioPortResult {
    this.commands.push({ type: 'crossfade', from, to, durationMs });
    return this.#result('crossfade');
  }

  startAmbient(loop: AmbientLoopId): AudioPortResult {
    this.commands.push({ type: 'start-ambient', loop });
    return this.#result('start-ambient');
  }

  stopAmbient(loop: AmbientLoopId): AudioPortResult {
    this.commands.push({ type: 'stop-ambient', loop });
    return this.#result('stop-ambient');
  }

  playEffect(effect: SoundEffectId): AudioPortResult {
    this.commands.push({ type: 'effect', effect });
    return this.#result('effect');
  }

  resume(): AudioPortResult {
    this.commands.push({ type: 'resume' });
    return this.#result('resume');
  }

  suspend(): AudioPortResult {
    this.commands.push({ type: 'suspend' });
    return this.#result('suspend');
  }

  dispose(): AudioPortResult {
    this.commands.push({ type: 'dispose' });
    return this.#result('dispose');
  }

  #result(operation: AudioPortOperation): AudioPortResult {
    const error = this.#failures.get(operation);
    return error === undefined ? success() : { ok: false, error };
  }
}
