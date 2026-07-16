export type PanelId = 'inventory' | 'character' | 'spells' | 'quests' | 'map';

export type PlayerCommand =
  | { readonly type: 'move'; readonly x: number; readonly y: number }
  | { readonly type: 'attack'; readonly targetId: string }
  | { readonly type: 'interact'; readonly targetId: string }
  | { readonly type: 'use-quick-slot'; readonly index: number }
  | { readonly type: 'toggle-target' }
  | { readonly type: 'toggle-panel'; readonly panel: PanelId }
  | { readonly type: 'escape' }
  | { readonly type: 'adjust-scale'; readonly direction: -1 | 1 };

export type PointerTarget =
  | { readonly targetKind: 'ground'; readonly tileX: number; readonly tileY: number }
  | { readonly targetKind: 'monster'; readonly targetId: string }
  | { readonly targetKind: 'npc' | 'loot'; readonly targetId: string };

interface Position {
  readonly x: number;
  readonly y: number;
}

const movementKeys: Readonly<Record<string, Position>> = {
  KeyW: { x: 0, y: -1 },
  ArrowUp: { x: 0, y: -1 },
  KeyD: { x: 1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  KeyS: { x: 0, y: 1 },
  ArrowDown: { x: 0, y: 1 },
  KeyA: { x: -1, y: 0 },
  ArrowLeft: { x: -1, y: 0 },
};

const panelKeys: Readonly<Record<string, PanelId>> = {
  KeyI: 'inventory',
  KeyC: 'character',
  KeyQ: 'quests',
  KeyM: 'map',
};

interface KeyModifiers {
  readonly shiftKey?: boolean;
}

const quickSlotIndex = (code: string): number | null => {
  const match = /^F(\d+)$/.exec(code);
  if (match === null) return null;
  const functionNumber = Number(match[1]);
  return functionNumber >= 5 && functionNumber <= 12 ? functionNumber - 5 : null;
};

export class InputController {
  #autoAttackTargetId: string | null = null;
  #nearestInteractableId: string | null = null;

  pointerDown(target: PointerTarget): PlayerCommand {
    if (target.targetKind === 'monster') {
      this.#autoAttackTargetId = target.targetId;
      return { type: 'attack', targetId: target.targetId };
    }
    if (target.targetKind === 'ground') {
      this.#autoAttackTargetId = null;
      return { type: 'move', x: target.tileX, y: target.tileY };
    }
    return { type: 'interact', targetId: target.targetId };
  }

  keyDown(
    code: string,
    position: Position,
    modifiers: KeyModifiers = {},
  ): PlayerCommand | null {
    if (code === 'KeyS' && modifiers.shiftKey === true) {
      return { type: 'toggle-panel', panel: 'spells' };
    }
    const panel = panelKeys[code];
    if (panel !== undefined) return { type: 'toggle-panel', panel };

    const direction = movementKeys[code];
    if (direction !== undefined) {
      this.#autoAttackTargetId = null;
      return { type: 'move', x: position.x + direction.x, y: position.y + direction.y };
    }
    if (code === 'Space' && this.#autoAttackTargetId !== null) {
      return { type: 'attack', targetId: this.#autoAttackTargetId };
    }
    if (code === 'KeyE' && this.#nearestInteractableId !== null) {
      return { type: 'interact', targetId: this.#nearestInteractableId };
    }
    if (code === 'Tab') return { type: 'toggle-target' };
    if (code === 'Escape') return { type: 'escape' };
    const index = quickSlotIndex(code);
    return index === null ? null : { type: 'use-quick-slot', index };
  }

  wheel(deltaY: number): PlayerCommand | null {
    if (deltaY === 0) return null;
    return { type: 'adjust-scale', direction: deltaY < 0 ? 1 : -1 };
  }

  currentAutoAttackTarget(): string | null {
    return this.#autoAttackTargetId;
  }

  setNearestInteractable(targetId: string | null): void {
    this.#nearestInteractableId = targetId;
  }

  setAutoAttackTarget(targetId: string | null): void {
    this.#autoAttackTargetId = targetId;
  }

  isBoundKey(code: string): boolean {
    return (
      movementKeys[code] !== undefined ||
      panelKeys[code] !== undefined ||
      ['Space', 'KeyE', 'Tab', 'Escape'].includes(code) ||
      quickSlotIndex(code) !== null
    );
  }
}
