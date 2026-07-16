import { GAME_VERSION } from './version';

export interface DiagnosticDownload {
  readonly fileName: string;
  readonly mediaType: 'application/json';
  readonly contents: string;
}

export type RecoveryActionId = 'return-menu' | 'load-latest' | 'export-diagnostic';

export interface RecoveryAction {
  readonly id: RecoveryActionId;
  readonly label: string;
  readonly run: () => void | Promise<void>;
}

export interface RecoveryView {
  readonly title: string;
  readonly message: string;
  readonly saveSucceeded: boolean;
  readonly actions: readonly RecoveryAction[];
}

export interface ErrorBoundaryPorts {
  readonly pause: () => void;
  readonly save: () => void | Promise<void>;
  readonly presentRecovery: (view: RecoveryView) => void;
  readonly returnToMenu: () => void | Promise<void>;
  readonly loadLatestSave: () => void | Promise<void>;
  readonly exportDiagnostic: (download: DiagnosticDownload) => void;
}

export interface ErrorBoundaryLogger {
  error(...values: unknown[]): void;
}

export interface ErrorBoundaryOptions {
  readonly now?: () => Date;
  readonly development?: boolean;
  readonly logger?: ErrorBoundaryLogger;
}

interface ErrorDetails {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
}

const errorDetails = (error: unknown): ErrorDetails => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack === undefined ? {} : { stack: error.stack }),
    };
  }
  return { name: 'UnknownError', message: String(error) };
};

const diagnosticFileName = (capturedAt: string): string =>
  `talking-island-diagnostic-${capturedAt.replaceAll(':', '-').replaceAll('.', '-')}.json`;

export class ErrorBoundary {
  readonly #ports: ErrorBoundaryPorts;
  readonly #now: () => Date;
  readonly #development: boolean;
  readonly #logger: ErrorBoundaryLogger;

  constructor(ports: ErrorBoundaryPorts, options: ErrorBoundaryOptions = {}) {
    this.#ports = ports;
    this.#now = options.now ?? (() => new Date());
    this.#development = options.development ?? false;
    this.#logger = options.logger ?? console;
  }

  async capture(
    error: unknown,
    context: Readonly<Record<string, unknown>> = {},
  ): Promise<RecoveryView> {
    let pauseError: unknown;
    try {
      this.#ports.pause();
    } catch (caught) {
      pauseError = caught;
    }

    let saveSucceeded = true;
    let saveError: unknown;
    try {
      await this.#ports.save();
    } catch (caught) {
      saveSucceeded = false;
      saveError = caught;
    }

    if (this.#development) {
      this.#logger.error('Runtime error', error);
    }

    const capturedAt = this.#now().toISOString();
    const diagnostic = JSON.stringify(
      {
        gameVersion: GAME_VERSION,
        capturedAt,
        error: errorDetails(error),
        context,
        save: saveSucceeded
          ? { ok: true }
          : { ok: false, error: errorDetails(saveError) },
        ...(pauseError === undefined
          ? {}
          : { pause: { ok: false, error: errorDetails(pauseError) } }),
      },
      null,
      2,
    );
    const download: DiagnosticDownload = {
      fileName: diagnosticFileName(capturedAt),
      mediaType: 'application/json',
      contents: diagnostic,
    };
    const view: RecoveryView = {
      title: '遊戲發生錯誤',
      message: saveSucceeded
        ? '遊戲已暫停，並已嘗試保存目前進度。請選擇復原方式。'
        : '遊戲已暫停，但無法保存目前進度。仍可嘗試返回或載入最近存檔。',
      saveSucceeded,
      actions: [
        {
          id: 'return-menu',
          label: '返回主選單',
          run: () => this.#ports.returnToMenu(),
        },
        {
          id: 'load-latest',
          label: '載入最近存檔',
          run: () => this.#ports.loadLatestSave(),
        },
        {
          id: 'export-diagnostic',
          label: '匯出診斷資料',
          run: () => {
            this.#ports.exportDiagnostic(download);
          },
        },
      ],
    };

    this.#ports.presentRecovery(view);
    return view;
  }
}
