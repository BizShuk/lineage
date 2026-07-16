export type PanelId =
  | 'character'
  | 'inventory'
  | 'spells'
  | 'quests'
  | 'map'
  | 'dialogue'
  | 'shop'
  | 'warehouse'
  | 'settings';

export interface WindowFocusScope {
  readonly focusFirst: () => void;
  readonly restoreFocus: () => void;
  readonly trapFocus: (backwards: boolean) => void;
}

export interface WindowKeyEvent {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly preventDefault: () => void;
}

interface WindowEntry {
  readonly id: PanelId;
  readonly focusScope: WindowFocusScope | null;
}

const focusableSelector = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export const createElementFocusScope = (
  root: HTMLElement,
  restoreTarget: HTMLElement | null,
): WindowFocusScope => ({
  focusFirst: () => {
    const first = root.querySelector<HTMLElement>(focusableSelector);
    (first ?? root).focus();
  },
  restoreFocus: () => {
    restoreTarget?.focus();
  },
  trapFocus: (backwards) => {
    const focusable = [...root.querySelectorAll<HTMLElement>(focusableSelector)];
    if (focusable.length === 0) {
      root.focus();
      return;
    }
    const currentIndex = focusable.indexOf(root.ownerDocument.activeElement as HTMLElement);
    const nextIndex = backwards
      ? (currentIndex <= 0 ? focusable.length : currentIndex) - 1
      : (currentIndex + 1) % focusable.length;
    focusable[nextIndex]?.focus();
  },
});

export class WindowManager {
  #entries: WindowEntry[] = [];

  get stack(): readonly PanelId[] {
    return this.#entries.map(({ id }) => id);
  }

  open(id: PanelId, focusScope: WindowFocusScope | null = null): void {
    const existing = this.#entries.find(({ id: entryId }) => entryId === id);
    this.#entries = this.#entries.filter(({ id: entryId }) => entryId !== id);
    const entry = { id, focusScope: focusScope ?? existing?.focusScope ?? null };
    this.#entries.push(entry);
    entry.focusScope?.focusFirst();
  }

  close(id: PanelId): boolean {
    const index = this.#entries.findIndex(({ id: entryId }) => entryId === id);
    if (index < 0) {
      return false;
    }
    const wasTop = index === this.#entries.length - 1;
    const [closed] = this.#entries.splice(index, 1);
    if (wasTop) {
      closed?.focusScope?.restoreFocus();
      this.#entries.at(-1)?.focusScope?.focusFirst();
    }
    return true;
  }

  toggle(id: PanelId, focusScope: WindowFocusScope | null = null): boolean {
    if (this.isOpen(id)) {
      this.close(id);
      return false;
    }
    this.open(id, focusScope);
    return true;
  }

  top(): PanelId | null {
    return this.#entries.at(-1)?.id ?? null;
  }

  isOpen(id: PanelId): boolean {
    return this.#entries.some(({ id: entryId }) => entryId === id);
  }

  handleEscape(): PanelId | null {
    const top = this.top();
    if (top !== null) {
      this.close(top);
    }
    return top;
  }

  handleKeyDown(event: WindowKeyEvent): void {
    if (event.key === 'Escape') {
      if (this.handleEscape() !== null) {
        event.preventDefault();
      }
      return;
    }
    if (event.key === 'Tab') {
      const scope = this.#entries.at(-1)?.focusScope;
      if (scope !== null && scope !== undefined) {
        scope.trapFocus(event.shiftKey);
        event.preventDefault();
      }
    }
  }
}
