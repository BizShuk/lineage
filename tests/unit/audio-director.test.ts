import { describe, expect, it } from 'vitest';
import { AudioDirector, type AudioEvent } from '../../src/audio/AudioDirector';
import { MUSIC_THEMES } from '../../src/audio/music';
import { AMBIENT_LOOPS, SOUND_EFFECTS } from '../../src/audio/sfx';
import { FakeAudioPort } from '../helpers/FakeAudioPort';

const settings = { music: 0.5, ambient: 0.25, effects: 0.75, muted: false } as const;

describe('AudioDirector', () => {
  it('crossfades region music and applies independent channel gains', () => {
    const port = new FakeAudioPort();
    const director = new AudioDirector(port, settings);

    director.enterRegion('talking-island-dungeon-1');

    expect(port.commands).toContainEqual({
      type: 'crossfade',
      from: null,
      to: 'dungeon-theme',
      durationMs: 1_200,
    });
    expect(port.channelGain('music')).toBe(0.5);
    expect(port.channelGain('ambient')).toBe(0.25);
    expect(port.channelGain('effects')).toBe(0.75);
  });

  it('mutes effective gains while preserving and updating slider values', () => {
    const port = new FakeAudioPort();
    const director = new AudioDirector(port, settings);

    director.updateSettings({ music: 0.2, ambient: 0.4, effects: 0.6, muted: true });

    expect(port.channelGain('music')).toBe(0);
    expect(port.channelGain('ambient')).toBe(0);
    expect(port.channelGain('effects')).toBe(0);
    expect(director.state.settings).toEqual({
      music: 0.2,
      ambient: 0.4,
      effects: 0.6,
      muted: true,
    });

    director.updateSettings({ ...director.state.settings, muted: false });
    expect(port.channelGain('music')).toBe(0.2);
    expect(port.channelGain('ambient')).toBe(0.4);
    expect(port.channelGain('effects')).toBe(0.6);
  });

  it('resumes on the first gesture once and suspends while the page is hidden', () => {
    const port = new FakeAudioPort();
    const director = new AudioDirector(port, settings);

    director.resume();
    director.resume();
    director.suspend();
    director.suspend();
    director.resume();

    expect(port.commands.filter(({ type }) => type === 'resume')).toHaveLength(2);
    expect(port.commands.filter(({ type }) => type === 'suspend')).toHaveLength(1);
    expect(director.state.phase).toBe('active');
  });

  it('keeps one ambient loop and avoids duplicate music for related regions', () => {
    const port = new FakeAudioPort();
    const director = new AudioDirector(port, settings);

    director.enterRegion('north-field');
    director.enterRegion('scarecrow-field');
    director.enterRegion('coast');
    director.enterRegion('coast');

    expect(port.commands.filter(({ type }) => type === 'crossfade')).toEqual([
      { type: 'crossfade', from: null, to: 'surface-theme', durationMs: 1_200 },
    ]);
    expect(port.commands.filter(({ type }) => type === 'start-ambient')).toEqual([
      { type: 'start-ambient', loop: 'forest-insects' },
      { type: 'start-ambient', loop: 'coast-wind' },
    ]);
    expect(port.commands.filter(({ type }) => type === 'stop-ambient')).toEqual([
      { type: 'stop-ambient', loop: 'forest-insects' },
    ]);
  });

  it('routes every combat, spell, item, UI, progression, and death event', () => {
    const port = new FakeAudioPort();
    const director = new AudioDirector(port, settings);
    const events: readonly AudioEvent[] = [
      'melee',
      'bow',
      'spell-fire',
      'spell-ice',
      'spell-lightning',
      'spell-heal',
      'spell-buff',
      'spell-control',
      'potion',
      'pickup',
      'ui-confirm',
      'ui-cancel',
      'level-up',
      'death',
    ];

    events.forEach((event) => {
      director.playEvent(event);
    });

    expect(
      port.commands
        .filter((command) => command.type === 'effect')
        .map(({ effect }) => effect),
    ).toEqual(events);
  });

  it('disposes once and ignores later gameplay audio calls', () => {
    const port = new FakeAudioPort();
    const director = new AudioDirector(port, settings);

    director.dispose();
    director.dispose();
    director.enterRegion('coast');
    director.playEvent('melee');
    director.resume();

    expect(port.commands.filter(({ type }) => type === 'dispose')).toHaveLength(1);
    expect(port.commands.some(({ type }) => type === 'effect')).toBe(false);
    expect(director.state.phase).toBe('disposed');
  });

  it('enters a nonthrowing silent fallback when the port reports Web Audio failure', () => {
    const port = new FakeAudioPort();
    const director = new AudioDirector(port, settings);
    port.fail('effect', 'AudioContext 建立失敗');

    expect(() => {
      director.playEvent('melee');
    }).not.toThrow();

    expect(director.state).toMatchObject({
      phase: 'silent-fallback',
      message: '音訊無法啟用，遊戲將以靜音模式繼續。',
      failure: {
        code: 'operation-failed',
        operation: 'effect',
        message: 'AudioContext 建立失敗',
      },
      settings,
    });
    const commandCount = port.commands.length;
    expect(() => {
      director.enterRegion('coast');
    }).not.toThrow();
    expect(() => {
      director.resume();
    }).not.toThrow();
    expect(port.commands).toHaveLength(commandCount);
  });

  it('provides complete original procedural theme, ambience, and effect definitions', () => {
    expect(Object.keys(MUSIC_THEMES).sort()).toEqual([
      'dungeon-theme',
      'surface-theme',
      'title-theme',
      'village-theme',
    ]);
    Object.values(MUSIC_THEMES).forEach((theme) => {
      expect(theme.sequence.length).toBeGreaterThan(0);
      expect(theme.sequence.every(({ frequencyHz }) => frequencyHz > 0)).toBe(true);
      expect(theme.envelope.releaseMs).toBeGreaterThan(0);
    });

    expect(Object.keys(AMBIENT_LOOPS).sort()).toEqual([
      'coast-wind',
      'dungeon-drip',
      'forest-insects',
      'village-hearth',
    ]);
    expect(Object.keys(SOUND_EFFECTS).sort()).toEqual([
      'bow',
      'death',
      'level-up',
      'melee',
      'pickup',
      'potion',
      'spell-buff',
      'spell-control',
      'spell-fire',
      'spell-heal',
      'spell-ice',
      'spell-lightning',
      'ui-cancel',
      'ui-confirm',
    ]);
    [...Object.values(AMBIENT_LOOPS), ...Object.values(SOUND_EFFECTS)].forEach(
      (definition) => {
        expect(definition.layers.length).toBeGreaterThan(0);
        expect(
          definition.layers.every(({ durationMs, gain }) => durationMs > 0 && gain > 0),
        ).toBe(true);
      },
    );
  });
});
