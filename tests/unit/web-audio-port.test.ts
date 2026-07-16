import { describe, expect, it } from 'vitest';

import type { AudioPortResult } from '../../src/audio/AudioPort';
import { MUSIC_THEMES } from '../../src/audio/music';
import {
  WebAudioPort,
  type WebAudioBufferLike,
  type WebAudioBufferSourceLike,
  type WebAudioClock,
  type WebAudioContextLike,
  type WebAudioFilterLike,
  type WebAudioGainLike,
  type WebAudioNodeLike,
  type WebAudioOscillatorLike,
  type WebAudioParamLike,
} from '../../src/audio/WebAudioPort';

interface ParamEvent {
  readonly type: 'set' | 'linear' | 'exponential' | 'cancel';
  readonly value?: number;
  readonly time: number;
}

class FakeParam implements WebAudioParamLike {
  value = 0;
  readonly events: ParamEvent[] = [];

  cancelScheduledValues(time: number): void {
    this.events.push({ type: 'cancel', time });
  }

  setValueAtTime(value: number, time: number): void {
    this.value = value;
    this.events.push({ type: 'set', value, time });
  }

  linearRampToValueAtTime(value: number, time: number): void {
    this.value = value;
    this.events.push({ type: 'linear', value, time });
  }

  exponentialRampToValueAtTime(value: number, time: number): void {
    this.value = value;
    this.events.push({ type: 'exponential', value, time });
  }
}

class FakeNode implements WebAudioNodeLike {
  readonly connections: WebAudioNodeLike[] = [];
  disconnected = false;

  connect(destination: WebAudioNodeLike): WebAudioNodeLike {
    this.connections.push(destination);
    return destination;
  }

  disconnect(): void {
    this.disconnected = true;
  }
}

class FakeGain extends FakeNode implements WebAudioGainLike {
  readonly gain = new FakeParam();
}

class FakeFilter extends FakeNode implements WebAudioFilterLike {
  type = 'lowpass';
  readonly frequency = new FakeParam();
}

class FakeOscillator extends FakeNode implements WebAudioOscillatorLike {
  type = 'sine';
  readonly frequency = new FakeParam();
  readonly detune = new FakeParam();
  readonly starts: number[] = [];
  readonly stops: number[] = [];
  onended: (() => void) | null = null;

  start(time = 0): void {
    this.starts.push(time);
  }

  stop(time = 0): void {
    this.stops.push(time);
  }
}

class FakeBuffer implements WebAudioBufferLike {
  readonly channelData: Float32Array[];

  constructor(numberOfChannels: number, readonly length: number, readonly sampleRate: number) {
    this.channelData = Array.from(
      { length: numberOfChannels },
      () => new Float32Array(length),
    );
  }

  getChannelData(channel: number): Float32Array {
    const data = this.channelData[channel];
    if (data === undefined) {
      throw new RangeError('missing channel');
    }
    return data;
  }
}

class FakeBufferSource extends FakeNode implements WebAudioBufferSourceLike {
  buffer: WebAudioBufferLike | null = null;
  loop = false;
  readonly starts: number[] = [];
  readonly stops: number[] = [];
  onended: (() => void) | null = null;

  start(time = 0): void {
    this.starts.push(time);
  }

  stop(time = 0): void {
    this.stops.push(time);
  }
}

class FakeAudioContext implements WebAudioContextLike {
  currentTime = 10;
  state: 'suspended' | 'running' | 'closed' = 'suspended';
  readonly sampleRate = 8_000;
  readonly destination = new FakeNode();
  readonly gains: FakeGain[] = [];
  readonly filters: FakeFilter[] = [];
  readonly oscillators: FakeOscillator[] = [];
  readonly buffers: FakeBuffer[] = [];
  readonly bufferSources: FakeBufferSource[] = [];
  resumeCalls = 0;
  suspendCalls = 0;
  closeCalls = 0;
  throwOnOscillator = false;

  createGain(): FakeGain {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }

  createBiquadFilter(): FakeFilter {
    const filter = new FakeFilter();
    this.filters.push(filter);
    return filter;
  }

  createOscillator(): FakeOscillator {
    if (this.throwOnOscillator) {
      throw new Error('oscillator unavailable');
    }
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  }

  createBuffer(numberOfChannels: number, length: number, sampleRate: number): FakeBuffer {
    const buffer = new FakeBuffer(numberOfChannels, length, sampleRate);
    this.buffers.push(buffer);
    return buffer;
  }

  createBufferSource(): FakeBufferSource {
    const source = new FakeBufferSource();
    this.bufferSources.push(source);
    return source;
  }

  resume(): Promise<void> {
    this.resumeCalls += 1;
    this.state = 'running';
    return Promise.resolve();
  }

  suspend(): Promise<void> {
    this.suspendCalls += 1;
    this.state = 'suspended';
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.closeCalls += 1;
    this.state = 'closed';
    return Promise.resolve();
  }
}

class FakeClock implements WebAudioClock {
  nowMs = 0;
  #nextHandle = 1;
  readonly #timers = new Map<
    number,
    { readonly dueAt: number; readonly callback: () => void }
  >();

  setTimeout(callback: () => void, delayMs: number): unknown {
    const handle = this.#nextHandle;
    this.#nextHandle += 1;
    this.#timers.set(handle, { dueAt: this.nowMs + delayMs, callback });
    return handle;
  }

  clearTimeout(handle: unknown): void {
    if (typeof handle === 'number') {
      this.#timers.delete(handle);
    }
  }

  advance(delayMs: number): void {
    this.nowMs += delayMs;
    const ready = [...this.#timers.entries()]
      .filter(([, timer]) => timer.dueAt <= this.nowMs)
      .sort((left, right) => left[1].dueAt - right[1].dueAt);
    ready.forEach(([handle, timer]) => {
      this.#timers.delete(handle);
      timer.callback();
    });
  }
}

const expectSuccess = (result: AudioPortResult): void => {
  expect(result).toEqual({ ok: true });
};

const createHarness = () => {
  const context = new FakeAudioContext();
  const clock = new FakeClock();
  let factoryCalls = 0;
  const port = new WebAudioPort({
    contextFactory: () => {
      factoryCalls += 1;
      return context;
    },
    clock,
  });
  return { clock, context, port, factoryCalls: () => factoryCalls };
};

describe('WebAudioPort', () => {
  it('creates AudioContext lazily on resume and reports unavailable without throwing', () => {
    let factoryCalls = 0;
    const port = new WebAudioPort({
      contextFactory: () => {
        factoryCalls += 1;
        return null;
      },
      clock: new FakeClock(),
    });

    expectSuccess(port.setChannelGain('music', 0.4));
    expectSuccess(port.crossfadeMusic(null, 'title-theme', 1_200));
    expectSuccess(port.startAmbient('village-hearth'));
    expectSuccess(port.playEffect('ui-confirm'));
    expect(factoryCalls).toBe(0);

    expect(() => port.resume()).not.toThrow();
    expect(port.resume()).toEqual({
      ok: false,
      error: {
        code: 'unavailable',
        operation: 'resume',
        message: 'Web Audio API is unavailable',
      },
    });
    expect(factoryCalls).toBe(2);
  });

  it('creates and updates three independent channel gain nodes', () => {
    const harness = createHarness();
    expectSuccess(harness.port.setChannelGain('music', 0.4));
    expectSuccess(harness.port.setChannelGain('ambient', 0.25));
    expectSuccess(harness.port.setChannelGain('effects', 0.8));

    expectSuccess(harness.port.resume());

    expect(harness.factoryCalls()).toBe(1);
    expect(harness.context.gains.slice(0, 3).map(({ gain }) => gain.value)).toEqual([
      0.4,
      0.25,
      0.8,
    ]);
    expect(harness.context.gains.slice(0, 3).every(({ connections }) =>
      connections.includes(harness.context.destination))).toBe(true);

    expectSuccess(harness.port.setChannelGain('music', 0.6));
    expect(harness.context.gains[0]?.gain.events.at(-1)).toMatchObject({
      type: 'set',
      value: 0.6,
      time: 10,
    });
  });

  it('schedules tracker notes and crossfades music over 1200ms', () => {
    const harness = createHarness();
    expectSuccess(harness.port.resume());

    expectSuccess(harness.port.crossfadeMusic(null, 'title-theme', 1_200));
    expect(harness.context.oscillators).toHaveLength(
      MUSIC_THEMES['title-theme'].sequence.length,
    );
    expect(harness.context.oscillators[0]).toMatchObject({ type: 'triangle' });
    expect(harness.context.oscillators[0]?.frequency.events[0]).toMatchObject({
      type: 'set',
      value: 196,
      time: 10,
    });
    const titleMix = harness.context.gains[3];
    expect(titleMix?.gain.events).toContainEqual({ type: 'linear', value: 1, time: 11.2 });

    expectSuccess(
      harness.port.crossfadeMusic('title-theme', 'village-theme', 1_200),
    );
    const villageMix = harness.context.gains.find((gain) =>
      gain.gain.events.some(({ type, value, time }) =>
        type === 'linear' && value === 1 && time === 11.2),
    );
    expect(villageMix).toBeDefined();
    expect(titleMix?.gain.events).toContainEqual({ type: 'linear', value: 0, time: 11.2 });

    harness.clock.advance(1_200);
    expect(
      harness.context.oscillators
        .slice(0, MUSIC_THEMES['title-theme'].sequence.length)
        .every(({ stops }) => stops.length > 0),
    ).toBe(true);
  });

  it('starts oscillator and looping filtered noise ambience once per ID', () => {
    const harness = createHarness();
    expectSuccess(harness.port.resume());

    expectSuccess(harness.port.startAmbient('coast-wind'));
    const oscillatorCount = harness.context.oscillators.length;
    const bufferSourceCount = harness.context.bufferSources.length;
    expectSuccess(harness.port.startAmbient('coast-wind'));

    expect(harness.context.oscillators).toHaveLength(oscillatorCount);
    expect(harness.context.bufferSources).toHaveLength(bufferSourceCount);
    expect(harness.context.bufferSources[0]?.loop).toBe(true);
    expect(harness.context.filters).toContainEqual(
      expect.objectContaining({ type: 'lowpass' }),
    );
    expect(
      harness.context.filters.some(({ frequency }) => frequency.value === 900),
    ).toBe(true);

    expectSuccess(harness.port.stopAmbient('coast-wind'));
    expect(harness.context.bufferSources[0]?.stops).toHaveLength(1);
    expect(harness.context.oscillators.at(-1)?.stops).toHaveLength(1);
  });

  it('builds oscillator, noise, filter, and envelope nodes from effect definitions', () => {
    const harness = createHarness();
    expectSuccess(harness.port.resume());

    expectSuccess(harness.port.playEffect('melee'));

    expect(harness.context.bufferSources).toHaveLength(1);
    expect(harness.context.bufferSources[0]?.loop).toBe(false);
    expect(harness.context.filters.some(({ frequency }) => frequency.value === 1_600)).toBe(
      true,
    );
    expect(harness.context.oscillators).toHaveLength(1);
    expect(harness.context.oscillators[0]).toMatchObject({ type: 'square' });
    expect(harness.context.oscillators[0]?.frequency.events).toEqual([
      { type: 'set', value: 180, time: 10 },
      { type: 'exponential', value: 72, time: 10.11 },
    ]);
    expect(
      harness.context.gains
        .slice(3)
        .some(({ gain }) => gain.events.some(({ type }) => type === 'linear')),
    ).toBe(true);
  });

  it('suspends and resumes without restarting the scheduled phrase', () => {
    const harness = createHarness();
    expectSuccess(harness.port.resume());
    expectSuccess(harness.port.crossfadeMusic(null, 'surface-theme', 1_200));
    const scheduledNotes = harness.context.oscillators.length;

    expectSuccess(harness.port.suspend());
    expectSuccess(harness.port.resume());

    expect(harness.context.suspendCalls).toBe(1);
    expect(harness.context.resumeCalls).toBe(2);
    expect(harness.context.oscillators).toHaveLength(scheduledNotes);
  });

  it('stops every live node, closes context, and converts failures to results', () => {
    const harness = createHarness();
    expectSuccess(harness.port.resume());
    expectSuccess(harness.port.crossfadeMusic(null, 'dungeon-theme', 1_200));
    expectSuccess(harness.port.startAmbient('dungeon-drip'));
    harness.context.throwOnOscillator = true;

    expect(() => harness.port.playEffect('ui-confirm')).not.toThrow();
    expect(harness.port.playEffect('ui-confirm')).toMatchObject({
      ok: false,
      error: { code: 'operation-failed', operation: 'effect' },
    });
    harness.context.throwOnOscillator = false;
    expectSuccess(harness.port.playEffect('melee'));

    expectSuccess(harness.port.dispose());
    expectSuccess(harness.port.dispose());
    expect(harness.context.closeCalls).toBe(1);
    expect(
      [...harness.context.oscillators, ...harness.context.bufferSources].every(
        ({ stops }) => stops.length > 0,
      ),
    ).toBe(true);
    expect(() => harness.port.startAmbient('coast-wind')).not.toThrow();
    expect(harness.port.startAmbient('coast-wind')).toMatchObject({
      ok: false,
      error: { code: 'operation-failed', operation: 'start-ambient' },
    });
  });
});
