export type PanelActionResult<T> =
  | { readonly ok: true; readonly viewModel: T }
  | { readonly ok: false; readonly reason: string };

export interface PanelShell {
  readonly element: HTMLElement;
  readonly body: HTMLElement;
  readonly status: HTMLElement;
}

export const createPanelShell = (
  document: Document,
  testId: string,
  title: string,
): PanelShell => {
  const element = document.createElement('section');
  element.className = 'game-panel';
  element.tabIndex = -1;
  element.setAttribute('role', 'dialog');
  element.setAttribute('aria-modal', 'true');
  element.setAttribute('aria-label', title);
  element.setAttribute('data-testid', `${testId}-panel`);

  const heading = document.createElement('h2');
  heading.textContent = title;
  const body = document.createElement('div');
  body.className = 'panel-scroll';
  body.setAttribute('data-testid', `${testId}-body`);
  const status = document.createElement('p');
  status.className = 'panel-status';
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('data-testid', `${testId}-status`);
  element.append(heading, body, status);
  return { element, body, status };
};

export const createTextRow = (
  document: Document,
  label: string,
  value: string,
  testId?: string,
): HTMLElement => {
  const row = document.createElement('p');
  row.className = 'panel-row';
  row.textContent = `${label}：${value}`;
  if (testId !== undefined) {
    row.setAttribute('data-testid', testId);
  }
  return row;
};

export const createActionButton = (
  document: Document,
  label: string,
  testId: string,
  action: () => void,
): HTMLButtonElement => {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.setAttribute('data-testid', testId);
  button.addEventListener('click', action);
  return button;
};

export const applyPanelResult = <T>(
  result: PanelActionResult<T>,
  render: (viewModel: T) => void,
  status: HTMLElement,
): boolean => {
  if (!result.ok) {
    status.textContent = result.reason;
    return false;
  }
  status.textContent = '';
  render(result.viewModel);
  return true;
};

export const bindDragPayload = (element: HTMLElement, itemId: string): void => {
  element.draggable = true;
  element.addEventListener('dragstart', (event) => {
    event.dataTransfer?.setData('text/plain', itemId);
  });
};

export const bindDropAction = (
  element: HTMLElement,
  action: (itemId: string) => void,
): void => {
  element.addEventListener('dragover', (event) => {
    event.preventDefault();
  });
  element.addEventListener('drop', (event) => {
    event.preventDefault();
    const itemId = event.dataTransfer?.getData('text/plain') ?? '';
    if (itemId.length > 0) {
      action(itemId);
    }
  });
};
