import type { MusicThemeId } from './music';
import type { AmbientLoopId, SoundEffectId } from './sfx';

export type AudioChannel = 'music' | 'ambient' | 'effects';

export type AudioPortOperation =
  | 'set-gain'
  | 'crossfade'
  | 'start-ambient'
  | 'stop-ambient'
  | 'effect'
  | 'resume'
  | 'suspend'
  | 'dispose';

export interface AudioPortError {
  readonly code: 'unavailable' | 'operation-failed';
  readonly operation: AudioPortOperation;
  readonly message: string;
}

export type AudioPortResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: AudioPortError };

export interface AudioPort {
  readonly setChannelGain: (channel: AudioChannel, gain: number) => AudioPortResult;
  readonly crossfadeMusic: (
    from: MusicThemeId | null,
    to: MusicThemeId,
    durationMs: number,
  ) => AudioPortResult;
  readonly startAmbient: (loop: AmbientLoopId) => AudioPortResult;
  readonly stopAmbient: (loop: AmbientLoopId) => AudioPortResult;
  readonly playEffect: (effect: SoundEffectId) => AudioPortResult;
  readonly resume: () => AudioPortResult;
  readonly suspend: () => AudioPortResult;
  readonly dispose: () => AudioPortResult;
}
