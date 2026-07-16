import type { GridPoint, TileGrid } from './grid';

export interface WorldPosition extends GridPoint {
  readonly mapId: string;
}

export interface WorldState {
  readonly player: WorldPosition;
  readonly defeatedBosses: readonly string[];
  readonly flags: Readonly<Record<string, boolean>>;
  readonly worldTimeMs: number;
}

export interface WorldMapExit extends GridPoint {
  readonly targetMapId: string;
  readonly targetX: number;
  readonly targetY: number;
}

export interface WorldMap {
  readonly id: string;
  readonly grid: TileGrid;
  readonly exits: readonly WorldMapExit[];
}

export type TransitionResult =
  | {
      readonly ok: true;
      readonly state: WorldState;
      readonly event: { readonly type: 'map-changed'; readonly from: string; readonly to: string };
    }
  | {
      readonly ok: false;
      readonly state: WorldState;
      readonly reason: 'unknown-map' | 'blocked-target' | 'missing-exit';
    };

export const transitionEntity = (
  state: WorldState,
  maps: ReadonlyMap<string, WorldMap>,
): TransitionResult => {
  const currentMap = maps.get(state.player.mapId);
  if (currentMap === undefined) {
    return { ok: false, state, reason: 'unknown-map' };
  }

  const exit = currentMap.exits.find(
    ({ x, y }) => x === state.player.x && y === state.player.y,
  );
  if (exit === undefined) {
    return { ok: false, state, reason: 'missing-exit' };
  }

  const targetMap = maps.get(exit.targetMapId);
  if (targetMap === undefined) {
    return { ok: false, state, reason: 'unknown-map' };
  }
  if (!targetMap.grid.isWalkable({ x: exit.targetX, y: exit.targetY })) {
    return { ok: false, state, reason: 'blocked-target' };
  }

  return {
    ok: true,
    state: {
      ...state,
      player: { mapId: targetMap.id, x: exit.targetX, y: exit.targetY },
    },
    event: { type: 'map-changed', from: currentMap.id, to: targetMap.id },
  };
};
