import { describe, expect, it } from 'vitest';

import { InputController } from '../../src/game/systems/InputController';

describe('InputController', () => {
  it('maps a monster click to attack and ground movement cancels auto-attack', () => {
    const input = new InputController();

    expect(input.pointerDown({ targetKind: 'monster', targetId: 'goblin-1' })).toEqual({
      type: 'attack',
      targetId: 'goblin-1',
    });
    expect(input.currentAutoAttackTarget()).toBe('goblin-1');
    expect(input.pointerDown({ targetKind: 'ground', tileX: 8, tileY: 4 })).toEqual({
      type: 'move',
      x: 8,
      y: 4,
    });
    expect(input.currentAutoAttackTarget()).toBeNull();
  });

  it('maps keyboard movement, combat, interaction, targeting, and quick slots', () => {
    const input = new InputController();
    input.pointerDown({ targetKind: 'monster', targetId: 'goblin-1' });
    input.setNearestInteractable('pandora');

    expect(input.keyDown('KeyW', { x: 4, y: 5 })).toEqual({ type: 'move', x: 4, y: 4 });
    expect(input.keyDown('ArrowDown', { x: 4, y: 5 })).toEqual({
      type: 'move',
      x: 4,
      y: 6,
    });
    input.pointerDown({ targetKind: 'monster', targetId: 'goblin-1' });
    expect(input.keyDown('Space', { x: 4, y: 5 })).toEqual({
      type: 'attack',
      targetId: 'goblin-1',
    });
    expect(input.keyDown('KeyE', { x: 4, y: 5 })).toEqual({
      type: 'interact',
      targetId: 'pandora',
    });
    expect(input.keyDown('Tab', { x: 4, y: 5 })).toEqual({ type: 'toggle-target' });
    expect(input.keyDown('F5', { x: 4, y: 5 })).toEqual({
      type: 'use-quick-slot',
      index: 0,
    });
    expect(input.keyDown('F12', { x: 4, y: 5 })).toEqual({
      type: 'use-quick-slot',
      index: 7,
    });
  });

  it('locks the nearest living enemy when Space is pressed without a current target', () => {
    const input = new InputController();
    input.setNearestEnemy('nearest-goblin');

    expect(input.keyDown('Space', { x: 4, y: 5 })).toEqual({
      type: 'attack',
      targetId: 'nearest-goblin',
    });
    expect(input.currentAutoAttackTarget()).toBe('nearest-goblin');
  });

  it.each([
    ['KeyI', 'inventory'],
    ['KeyC', 'character'],
    ['KeyQ', 'quests'],
    ['KeyM', 'map'],
  ] as const)('maps %s to the %s panel', (code, panel) => {
    expect(new InputController().keyDown(code, { x: 0, y: 0 })).toEqual({
      type: 'toggle-panel',
      panel,
    });
  });

  it('keeps S available for WASD movement and uses Shift+S for spells', () => {
    const input = new InputController();

    expect(input.keyDown('KeyS', { x: 4, y: 5 })).toEqual({ type: 'move', x: 4, y: 6 });
    expect(input.keyDown('KeyS', { x: 4, y: 5 }, { shiftKey: true })).toEqual({
      type: 'toggle-panel',
      panel: 'spells',
    });
  });

  it('maps escape and wheel scale while ignoring unrelated keys', () => {
    const input = new InputController();

    expect(input.keyDown('Escape', { x: 0, y: 0 })).toEqual({ type: 'escape' });
    expect(input.wheel(-1)).toEqual({ type: 'adjust-scale', direction: 1 });
    expect(input.wheel(1)).toEqual({ type: 'adjust-scale', direction: -1 });
    expect(input.keyDown('KeyZ', { x: 0, y: 0 })).toBeNull();
    expect(input.isBoundKey('KeyZ')).toBe(false);
    expect(input.isBoundKey('ArrowLeft')).toBe(true);
  });
});
