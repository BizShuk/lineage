export type MusicThemeId =
  | 'title-theme'
  | 'village-theme'
  | 'surface-theme'
  | 'dungeon-theme';

export type OscillatorWaveform = 'sine' | 'triangle' | 'square' | 'sawtooth';

export interface EnvelopeDefinition {
  readonly attackMs: number;
  readonly decayMs: number;
  readonly sustain: number;
  readonly releaseMs: number;
}

export interface TrackerNote {
  readonly frequencyHz: number;
  readonly beats: number;
  readonly gain: number;
  readonly detuneCents?: number;
}

export interface ProceduralMusicTheme {
  readonly id: MusicThemeId;
  readonly tempoBpm: number;
  readonly waveform: OscillatorWaveform;
  readonly filterHz: number;
  readonly envelope: EnvelopeDefinition;
  readonly sequence: readonly TrackerNote[];
}

const note = (frequencyHz: number, beats: number, gain: number): TrackerNote => ({
  frequencyHz,
  beats,
  gain,
});

export const MUSIC_THEMES = {
  'title-theme': {
    id: 'title-theme',
    tempoBpm: 72,
    waveform: 'triangle',
    filterHz: 1_800,
    envelope: { attackMs: 60, decayMs: 180, sustain: 0.55, releaseMs: 420 },
    sequence: [
      note(196, 1, 0.24),
      note(261.63, 0.5, 0.2),
      note(233.08, 0.5, 0.18),
      note(174.61, 1.5, 0.22),
      note(220, 0.5, 0.18),
      note(293.66, 1, 0.2),
      note(246.94, 1, 0.18),
      note(196, 2, 0.24),
    ],
  },
  'village-theme': {
    id: 'village-theme',
    tempoBpm: 92,
    waveform: 'sine',
    filterHz: 2_600,
    envelope: { attackMs: 35, decayMs: 120, sustain: 0.62, releaseMs: 280 },
    sequence: [
      note(261.63, 0.75, 0.2),
      note(329.63, 0.25, 0.16),
      note(392, 0.5, 0.18),
      note(349.23, 0.5, 0.17),
      note(293.66, 1, 0.2),
      note(369.99, 0.5, 0.16),
      note(329.63, 0.5, 0.18),
      note(261.63, 1, 0.2),
    ],
  },
  'surface-theme': {
    id: 'surface-theme',
    tempoBpm: 104,
    waveform: 'square',
    filterHz: 1_400,
    envelope: { attackMs: 20, decayMs: 90, sustain: 0.42, releaseMs: 190 },
    sequence: [
      note(146.83, 0.5, 0.14),
      note(220, 0.5, 0.15),
      note(174.61, 0.75, 0.14),
      note(246.94, 0.25, 0.13),
      note(196, 0.5, 0.15),
      note(277.18, 0.5, 0.13),
      note(233.08, 1, 0.14),
      note(164.81, 1, 0.15),
    ],
  },
  'dungeon-theme': {
    id: 'dungeon-theme',
    tempoBpm: 58,
    waveform: 'sawtooth',
    filterHz: 720,
    envelope: { attackMs: 120, decayMs: 260, sustain: 0.48, releaseMs: 650 },
    sequence: [
      note(82.41, 1.5, 0.16),
      note(123.47, 0.5, 0.12),
      note(92.5, 1, 0.15),
      note(138.59, 1, 0.12),
      note(77.78, 1.5, 0.17),
      note(116.54, 0.5, 0.12),
      note(87.31, 1, 0.15),
      note(103.83, 1, 0.14),
    ],
  },
} as const satisfies Readonly<Record<MusicThemeId, ProceduralMusicTheme>>;
