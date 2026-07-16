import { describe, expect, it } from 'vitest';
import { TileGrid } from '../../src/world/grid';
import {
  transitionEntity,
  type WorldMap,
  type WorldState,
} from '../../src/world/world';

const createMaps = (): ReadonlyMap<string, WorldMap> =>
  new Map([
    [
      'village',
      {
        id: 'village',
        grid: TileGrid.fromRows(['...', '...', '...']),
        exits: [{ x: 2, y: 1, targetMapId: 'field', targetX: 0, targetY: 1 }],
      },
    ],
    [
      'field',
      {
        id: 'field',
        grid: TileGrid.fromRows(['...', '...', '...']),
        exits: [{ x: 0, y: 1, targetMapId: 'village', targetX: 2, targetY: 1 }],
      },
    ],
  ]);

const createState = (): WorldState => ({
  player: { mapId: 'village', x: 2, y: 1 },
  defeatedBosses: ['black-knight-captain'],
  flags: { tutorialComplete: true },
  worldTimeMs: 12_000,
});

describe('transitionEntity', () => {
  it('atomically changes the map and position while preserving world progress', () => {
    const state = createState();

    const result = transitionEntity(state, createMaps());

    expect(result).toEqual({
      ok: true,
      state: {
        ...state,
        player: { mapId: 'field', x: 0, y: 1 },
      },
      event: { type: 'map-changed', from: 'village', to: 'field' },
    });
    expect(state.player).toEqual({ mapId: 'village', x: 2, y: 1 });
  });

  it('returns the original state when the target tile is blocked', () => {
    const state = createState();
    const maps = createMaps();
    const field = maps.get('field');
    if (field === undefined) {
      throw new Error('fixture 缺少 field');
    }
    const blockedMaps = new Map(maps);
    blockedMaps.set('field', { ...field, grid: TileGrid.fromRows(['...', '#..', '...']) });

    const result = transitionEntity(state, blockedMaps);

    expect(result).toEqual({ ok: false, state, reason: 'blocked-target' });
    if (!result.ok) {
      expect(result.state).toBe(state);
    }
  });

  it('rejects positions that do not identify an exit', () => {
    const state = { ...createState(), player: { mapId: 'village', x: 1, y: 1 } };

    expect(transitionEntity(state, createMaps())).toEqual({
      ok: false,
      state,
      reason: 'missing-exit',
    });
  });

  it('rejects an exit whose target map is unknown', () => {
    const state = createState();
    const village = createMaps().get('village');
    if (village === undefined) {
      throw new Error('fixture 缺少 village');
    }
    const maps = new Map([
      [
        'village',
        {
          ...village,
          exits: [{ x: 2, y: 1, targetMapId: 'missing', targetX: 0, targetY: 0 }],
        },
      ],
    ]);

    expect(transitionEntity(state, maps)).toEqual({
      ok: false,
      state,
      reason: 'unknown-map',
    });
  });
});
