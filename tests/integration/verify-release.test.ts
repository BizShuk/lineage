import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

interface VerifyResult {
  readonly exitCode: number;
  readonly failedGate: string | null;
}

interface VerifyOptions {
  readonly root: string;
  readonly output: {
    readonly stdout: (chunk: string) => void;
    readonly stderr: (chunk: string) => void;
  };
  readonly runner: (
    command: string,
    args: readonly string[],
    options: { readonly cwd: string },
  ) => Promise<CommandResult>;
}

type VerifyRelease = (options: VerifyOptions) => Promise<VerifyResult>;

// @ts-expect-error The production verifier is intentionally a directly executable MJS module.
const verifierModule: unknown = await import('../../scripts/verify-release.mjs');
const verifyRelease = (verifierModule as { readonly verifyRelease: VerifyRelease }).verifyRelease;

const write = (root: string, path: string, value = ''): void => {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, value, 'utf8');
};

const definitions = (
  prefix: string,
  count: number,
  extra: Readonly<Record<string, string>> = {},
): readonly Readonly<Record<string, string>>[] =>
  Array.from({ length: count }, (_, index) => ({ id: `${prefix}-${String(index)}`, ...extra }));

const createValidRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'lineage-release-'));
  write(root, 'AGENTS.md', '# Technical context\n');
  write(root, 'README.md', '# Project\n');
  write(root, 'README.todo', '# TODO\n');
  write(root, 'docs/memory/README.md', '# Memory\n');
  write(root, 'dist/index.html', '<!doctype html>');

  const content = {
    classes: definitions('class', 4),
    items: definitions('item', 40),
    abilities: definitions('ability', 20),
    npcs: definitions('npc', 15),
    monsters: [
      ...definitions('normal', 10, { rank: 'normal' }),
      { id: 'black-knight', rank: 'elite' },
      { id: 'kurt', rank: 'event' },
      { id: 'baphomet', rank: 'boss' },
    ],
    quests: [
      ...definitions('main', 6, { kind: 'main' }),
      ...definitions('class', 4, { kind: 'class' }),
      ...definitions('side', 6, { kind: 'side' }),
    ],
    maps: definitions('map', 7),
  };
  for (const [name, entries] of Object.entries(content)) {
    write(root, `src/content/data/${name}.json`, JSON.stringify(entries));
  }
  write(
    root,
    'src/content/data/assets.json',
    JSON.stringify({
      version: 1,
      assets: [{ key: 'asset-one', license: 'project-original' }],
    }),
  );
  return root;
};

const recordingOutput = (): {
  readonly stdout: string[];
  readonly stderr: string[];
  readonly output: VerifyOptions['output'];
} => {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    output: {
      stdout: (chunk) => {
        stdout.push(chunk);
      },
      stderr: (chunk) => {
        stderr.push(chunk);
      },
    },
  };
};

describe('release verifier', () => {
  it('runs release commands in order after every preflight gate passes', async () => {
    const root = createValidRoot();
    const calls: Array<readonly [string, readonly string[], string]> = [];
    const { output } = recordingOutput();
    const result = await verifyRelease({
      root,
      output,
      runner: async (command, args, options) => {
        calls.push([command, args, options.cwd]);
        return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
      },
    });

    expect(calls).toEqual([
      ['npm', ['run', 'lint'], root],
      ['npm', ['run', 'typecheck'], root],
      ['npm', ['test'], root],
      ['npm', ['run', 'build'], root],
      ['npm', ['run', 'test:e2e'], root],
    ]);
    expect(result).toEqual({ exitCode: 0, failedGate: null });
  });

  it.each([
    {
      name: 'AGENTS.md',
      breakRoot: (root: string): void => {
        unlinkSync(join(root, 'AGENTS.md'));
      },
      failure: 'AGENTS.md',
    },
    {
      name: 'required project files',
      breakRoot: (root: string): void => {
        rmSync(join(root, 'README.todo'));
      },
      failure: 'README.todo',
    },
    {
      name: 'content floors',
      breakRoot: (root: string): void => {
        write(root, 'src/content/data/classes.json', '[]');
      },
      failure: 'content-counts',
    },
    {
      name: 'asset licenses',
      breakRoot: (root: string): void => {
        write(
          root,
          'src/content/data/assets.json',
          JSON.stringify({
            version: 1,
            assets: [{ key: 'asset-one', license: 'unknown' }],
          }),
        );
      },
      failure: 'asset-licenses',
    },
    {
      name: 'built entrypoint',
      breakRoot: (root: string): void => {
        rmSync(join(root, 'dist/index.html'));
      },
      failure: 'dist/index.html',
    },
  ])('stops before commands when $name fails', async ({ breakRoot, failure }) => {
    const root = createValidRoot();
    breakRoot(root);
    const calls: string[] = [];
    const { output, stderr } = recordingOutput();
    const result = await verifyRelease({
      root,
      output,
      runner: async (command, args) => {
        calls.push([command, ...args].join(' '));
        return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
      },
    });

    expect(calls).toEqual([]);
    expect(result.exitCode).toBe(1);
    expect(result.failedGate).toBe(failure);
    expect(stderr.join('')).toContain(failure);
  });

  it('preserves subprocess output and exit code while short-circuiting the first failure', async () => {
    const root = createValidRoot();
    const calls: string[] = [];
    const { output, stdout, stderr } = recordingOutput();
    const result = await verifyRelease({
      root,
      output,
      runner: async (_command, args) => {
        calls.push(args.join(' '));
        return Promise.resolve(
          args.includes('typecheck')
            ? { exitCode: 23, stdout: 'partial type output\n', stderr: 'type failure\n' }
            : { exitCode: 0, stdout: 'lint output\n', stderr: '' },
        );
      },
    });

    expect(calls).toEqual(['run lint', 'run typecheck']);
    expect(stdout.join('')).toContain('lint output\npartial type output\n');
    expect(stderr.join('')).toContain('type failure\n');
    expect(result).toEqual({ exitCode: 23, failedGate: 'typecheck' });
  });
});
