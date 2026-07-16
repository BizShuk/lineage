import { describe, expect, it } from 'vitest';
import {
  WindowManager,
  type WindowFocusScope,
  type WindowKeyEvent,
} from '../../src/ui/WindowManager';

const createFocusScope = () => {
  const calls = { focusFirst: 0, restoreFocus: 0, trap: [] as boolean[] };
  const scope: WindowFocusScope = {
    focusFirst: () => {
      calls.focusFirst += 1;
    },
    restoreFocus: () => {
      calls.restoreFocus += 1;
    },
    trapFocus: (backwards) => {
      calls.trap.push(backwards);
    },
  };
  return { calls, scope };
};

const keyEvent = (key: string, shiftKey = false): WindowKeyEvent & { prevented: boolean } => {
  const event = {
    key,
    shiftKey,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  };
  return event;
};

describe('WindowManager', () => {
  it('Escape closes only the topmost panel', () => {
    const windows = new WindowManager();
    windows.open('inventory');
    windows.open('settings');

    windows.handleEscape();

    expect(windows.isOpen('settings')).toBe(false);
    expect(windows.isOpen('inventory')).toBe(true);
    expect(windows.top()).toBe('inventory');
  });

  it('moves an already-open panel to the top and toggles it closed', () => {
    const windows = new WindowManager();
    windows.open('inventory');
    windows.open('settings');

    windows.open('inventory');
    expect(windows.stack).toEqual(['settings', 'inventory']);

    windows.toggle('inventory');
    expect(windows.stack).toEqual(['settings']);
  });

  it('focuses the opened panel, traps Tab only in the top panel, and restores focus', () => {
    const inventory = createFocusScope();
    const settings = createFocusScope();
    const windows = new WindowManager();
    windows.open('inventory', inventory.scope);
    windows.open('settings', settings.scope);

    const forwards = keyEvent('Tab');
    const backwards = keyEvent('Tab', true);
    windows.handleKeyDown(forwards);
    windows.handleKeyDown(backwards);

    expect(inventory.calls.focusFirst).toBe(1);
    expect(inventory.calls.trap).toEqual([]);
    expect(settings.calls.focusFirst).toBe(1);
    expect(settings.calls.trap).toEqual([false, true]);
    expect(forwards.prevented).toBe(true);
    expect(backwards.prevented).toBe(true);

    const escape = keyEvent('Escape');
    windows.handleKeyDown(escape);
    expect(settings.calls.restoreFocus).toBe(1);
    expect(inventory.calls.focusFirst).toBe(2);
    expect(escape.prevented).toBe(true);
  });

  it('returns an immutable stack snapshot', () => {
    const windows = new WindowManager();
    windows.open('inventory');
    const snapshot = windows.stack;

    windows.open('settings');

    expect(snapshot).toEqual(['inventory']);
    expect(windows.stack).toEqual(['inventory', 'settings']);
  });
});
