import type { EnvelopeDefinition, OscillatorWaveform } from './music';

export type AmbientLoopId =
  | 'coast-wind'
  | 'forest-insects'
  | 'village-hearth'
  | 'dungeon-drip';

export type SoundEffectId =
  | 'melee'
  | 'bow'
  | 'spell-fire'
  | 'spell-ice'
  | 'spell-lightning'
  | 'spell-heal'
  | 'spell-buff'
  | 'spell-control'
  | 'potion'
  | 'pickup'
  | 'ui-confirm'
  | 'ui-cancel'
  | 'level-up'
  | 'death';

export interface OscillatorLayer {
  readonly source: 'oscillator';
  readonly waveform: OscillatorWaveform;
  readonly frequencyHz: number;
  readonly endFrequencyHz: number;
  readonly durationMs: number;
  readonly gain: number;
  readonly delayMs: number;
  readonly envelope: EnvelopeDefinition;
}

export interface NoiseLayer {
  readonly source: 'noise';
  readonly color: 'white' | 'pink' | 'brown';
  readonly filterHz: number;
  readonly durationMs: number;
  readonly gain: number;
  readonly delayMs: number;
  readonly envelope: EnvelopeDefinition;
}

export type ProceduralLayer = OscillatorLayer | NoiseLayer;

export interface ProceduralSoundDefinition {
  readonly id: AmbientLoopId | SoundEffectId;
  readonly loop: boolean;
  readonly layers: readonly ProceduralLayer[];
}

const envelope = (
  attackMs: number,
  decayMs: number,
  sustain: number,
  releaseMs: number,
): EnvelopeDefinition => ({ attackMs, decayMs, sustain, releaseMs });

const oscillator = (
  waveform: OscillatorWaveform,
  frequencyHz: number,
  endFrequencyHz: number,
  durationMs: number,
  gain: number,
  shape = envelope(4, 30, 0.4, 80),
  delayMs = 0,
): OscillatorLayer => ({
  source: 'oscillator',
  waveform,
  frequencyHz,
  endFrequencyHz,
  durationMs,
  gain,
  delayMs,
  envelope: shape,
});

const noise = (
  color: NoiseLayer['color'],
  filterHz: number,
  durationMs: number,
  gain: number,
  shape = envelope(8, 50, 0.35, 100),
  delayMs = 0,
): NoiseLayer => ({
  source: 'noise',
  color,
  filterHz,
  durationMs,
  gain,
  delayMs,
  envelope: shape,
});

export const AMBIENT_LOOPS = {
  'coast-wind': {
    id: 'coast-wind',
    loop: true,
    layers: [
      noise('pink', 900, 6_400, 0.18, envelope(1_200, 800, 0.7, 1_400)),
      oscillator('sine', 54, 47, 6_400, 0.04, envelope(900, 600, 0.5, 1_200)),
    ],
  },
  'forest-insects': {
    id: 'forest-insects',
    loop: true,
    layers: [
      noise('brown', 2_400, 4_800, 0.08, envelope(600, 400, 0.65, 700)),
      oscillator('square', 3_100, 2_750, 180, 0.025, envelope(2, 20, 0.25, 45), 1_100),
    ],
  },
  'village-hearth': {
    id: 'village-hearth',
    loop: true,
    layers: [
      noise('brown', 1_100, 3_600, 0.1, envelope(300, 500, 0.5, 500)),
      oscillator('sine', 96, 84, 360, 0.035, envelope(10, 80, 0.25, 120), 1_700),
    ],
  },
  'dungeon-drip': {
    id: 'dungeon-drip',
    loop: true,
    layers: [
      noise('brown', 420, 5_200, 0.07, envelope(600, 700, 0.55, 800)),
      oscillator('sine', 1_650, 620, 210, 0.06, envelope(2, 25, 0.18, 160), 2_300),
    ],
  },
} as const satisfies Readonly<Record<AmbientLoopId, ProceduralSoundDefinition>>;

export const SOUND_EFFECTS = {
  melee: {
    id: 'melee',
    loop: false,
    layers: [noise('white', 1_600, 120, 0.22), oscillator('square', 180, 72, 110, 0.12)],
  },
  bow: {
    id: 'bow',
    loop: false,
    layers: [
      noise('white', 3_800, 150, 0.12),
      oscillator('triangle', 520, 210, 170, 0.1),
    ],
  },
  'spell-fire': {
    id: 'spell-fire',
    loop: false,
    layers: [noise('pink', 1_900, 360, 0.2), oscillator('sawtooth', 130, 410, 330, 0.14)],
  },
  'spell-ice': {
    id: 'spell-ice',
    loop: false,
    layers: [noise('white', 5_400, 280, 0.12), oscillator('sine', 1_300, 2_100, 300, 0.13)],
  },
  'spell-lightning': {
    id: 'spell-lightning',
    loop: false,
    layers: [noise('white', 7_200, 180, 0.22), oscillator('square', 240, 1_800, 150, 0.1)],
  },
  'spell-heal': {
    id: 'spell-heal',
    loop: false,
    layers: [
      oscillator('sine', 392, 784, 420, 0.14, envelope(20, 80, 0.65, 220)),
      oscillator('sine', 523.25, 1_046.5, 360, 0.08, envelope(25, 70, 0.55, 200), 90),
    ],
  },
  'spell-buff': {
    id: 'spell-buff',
    loop: false,
    layers: [
      oscillator('triangle', 220, 440, 520, 0.12, envelope(35, 90, 0.6, 240)),
      oscillator('sine', 329.63, 659.25, 420, 0.08, envelope(45, 80, 0.5, 220), 70),
    ],
  },
  'spell-control': {
    id: 'spell-control',
    loop: false,
    layers: [noise('pink', 680, 450, 0.1), oscillator('sawtooth', 310, 98, 480, 0.13)],
  },
  potion: {
    id: 'potion',
    loop: false,
    layers: [noise('white', 2_200, 140, 0.08), oscillator('sine', 280, 560, 240, 0.12)],
  },
  pickup: {
    id: 'pickup',
    loop: false,
    layers: [oscillator('triangle', 660, 990, 130, 0.11), oscillator('sine', 880, 1_320, 110, 0.07, undefined, 55)],
  },
  'ui-confirm': {
    id: 'ui-confirm',
    loop: false,
    layers: [oscillator('sine', 520, 780, 90, 0.08)],
  },
  'ui-cancel': {
    id: 'ui-cancel',
    loop: false,
    layers: [oscillator('triangle', 420, 210, 110, 0.08)],
  },
  'level-up': {
    id: 'level-up',
    loop: false,
    layers: [
      oscillator('triangle', 261.63, 523.25, 620, 0.15, envelope(10, 100, 0.65, 260)),
      oscillator('sine', 392, 783.99, 480, 0.1, envelope(20, 80, 0.55, 240), 160),
    ],
  },
  death: {
    id: 'death',
    loop: false,
    layers: [
      noise('brown', 520, 700, 0.18, envelope(10, 180, 0.45, 360)),
      oscillator('sawtooth', 164.81, 55, 760, 0.16, envelope(15, 140, 0.5, 400)),
    ],
  },
} as const satisfies Readonly<Record<SoundEffectId, ProceduralSoundDefinition>>;
