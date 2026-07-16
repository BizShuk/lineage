import { existsSync, lstatSync, readFileSync, readlinkSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const releaseCommands = [
  { gate: 'lint', command: 'npm', args: ['run', 'lint'] },
  { gate: 'typecheck', command: 'npm', args: ['run', 'typecheck'] },
  { gate: 'test', command: 'npm', args: ['test'] },
  { gate: 'build', command: 'npm', args: ['run', 'build'] },
  { gate: 'test:e2e', command: 'npm', args: ['run', 'test:e2e'] },
];

const requiredPaths = [
  { path: 'README.md', kind: 'file' },
  { path: 'CLAUDE.md', kind: 'file' },
  { path: 'README.todo', kind: 'file' },
  { path: 'docs/memory', kind: 'directory' },
];

class GateFailure extends Error {
  constructor(gate, message) {
    super(message);
    this.gate = gate;
  }
}

const readJsonArray = (root, path) => {
  const absolutePath = join(root, path);
  const value = JSON.parse(readFileSync(absolutePath, 'utf8'));
  if (!Array.isArray(value)) throw new Error(`${path} 必須是 JSON array`);
  return value;
};

const checkAgentsSymlink = (root) => {
  const path = join(root, 'AGENTS.md');
  if (!existsSync(path) || !lstatSync(path).isSymbolicLink()) {
    throw new Error('AGENTS.md 必須是指向 CLAUDE.md 的 symlink');
  }
  const target = readlinkSync(path);
  if (target !== 'CLAUDE.md') {
    throw new Error(`AGENTS.md symlink target 應為 CLAUDE.md，目前為 ${target}`);
  }
};

const checkRequiredPaths = (root) => {
  for (const requirement of requiredPaths) {
    const path = join(root, requirement.path);
    if (!existsSync(path)) {
      throw new GateFailure(requirement.path, `缺少必要路徑 ${requirement.path}`);
    }
    const stats = statSync(path);
    if (requirement.kind === 'file' ? !stats.isFile() : !stats.isDirectory()) {
      throw new Error(`${requirement.path} 必須是 ${requirement.kind}`);
    }
  }
};

const countKind = (entries, kind) => entries.filter((entry) => entry.kind === kind).length;

const checkContentCounts = (root) => {
  const classes = readJsonArray(root, 'src/content/data/classes.json');
  const items = readJsonArray(root, 'src/content/data/items.json');
  const abilities = readJsonArray(root, 'src/content/data/abilities.json');
  const npcs = readJsonArray(root, 'src/content/data/npcs.json');
  const monsters = readJsonArray(root, 'src/content/data/monsters.json');
  const quests = readJsonArray(root, 'src/content/data/quests.json');
  const maps = readJsonArray(root, 'src/content/data/maps.json');
  const floors = [
    ['classes', classes.length === 4, '必須恰好 4 個'],
    ['items', items.length >= 40, '至少 40 個'],
    ['abilities', abilities.length >= 20, '至少 20 個'],
    ['npcs', npcs.length >= 15, '至少 15 個'],
    [
      'normal monsters',
      monsters.filter((entry) => entry.rank === 'normal').length >= 10,
      '至少 10 個',
    ],
    [
      'black-knight',
      monsters.some((entry) => entry.id === 'black-knight' && entry.rank === 'elite'),
      '必須存在 elite',
    ],
    [
      'kurt',
      monsters.some((entry) => entry.id === 'kurt' && entry.rank === 'event'),
      '必須存在 event',
    ],
    [
      'baphomet',
      monsters.some((entry) => entry.id === 'baphomet' && entry.rank === 'boss'),
      '必須存在 boss',
    ],
    ['main quests', countKind(quests, 'main') === 6, '必須恰好 6 個'],
    ['class quests', countKind(quests, 'class') === 4, '必須恰好 4 個'],
    ['side quests', countKind(quests, 'side') >= 6, '至少 6 個'],
    ['maps', maps.length === 7, '必須恰好 7 個'],
  ];
  const failure = floors.find(([, passes]) => !passes);
  if (failure !== undefined) {
    throw new Error(`${failure[0]} ${failure[2]}`);
  }
};

const checkAssetLicenses = (root) => {
  const path = 'src/content/data/assets.json';
  const manifest = JSON.parse(readFileSync(join(root, path), 'utf8'));
  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    manifest.version !== 1 ||
    !Array.isArray(manifest.assets) ||
    manifest.assets.length === 0
  ) {
    throw new Error(`${path} 必須是 version 1 且含非空 assets array 的 manifest`);
  }
  const assets = manifest.assets;
  const invalid = assets.find((entry) => entry.license !== 'project-original');
  if (invalid !== undefined) {
    throw new Error(`asset ${String(invalid.key ?? '(unknown)')} 缺少 project-original license`);
  }
};

const checkBuiltEntrypoint = (root) => {
  const path = join(root, 'dist/index.html');
  if (!existsSync(path) || !statSync(path).isFile()) {
    throw new Error('缺少 dist/index.html');
  }
};

const preflightGates = [
  { gate: 'AGENTS.md', check: checkAgentsSymlink },
  { gate: 'required-paths', check: checkRequiredPaths },
  { gate: 'content-counts', check: checkContentCounts },
  { gate: 'asset-licenses', check: checkAssetLicenses },
  { gate: 'dist/index.html', check: checkBuiltEntrypoint },
];

const defaultRunner = (command, args, options) => {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: process.env,
  });
  const errorOutput = result.error === undefined ? '' : `${result.error.message}\n`;
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: `${result.stderr ?? ''}${errorOutput}`,
  };
};

const defaultOutput = {
  stdout: (chunk) => process.stdout.write(chunk),
  stderr: (chunk) => process.stderr.write(chunk),
};

export const verifyRelease = async (options = {}) => {
  const root = resolve(options.root ?? process.cwd());
  const runner = options.runner ?? defaultRunner;
  const output = options.output ?? defaultOutput;

  for (const gate of preflightGates) {
    try {
      gate.check(root);
      output.stdout(`[release] PASS ${gate.gate}\n`);
    } catch (error) {
      const failedGate = error instanceof GateFailure ? error.gate : gate.gate;
      output.stderr(
        `[release] FAIL ${failedGate}: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      return { exitCode: 1, failedGate };
    }
  }

  for (const step of releaseCommands) {
    const result = await runner(step.command, step.args, { cwd: root });
    if (result.stdout.length > 0) output.stdout(result.stdout);
    if (result.stderr.length > 0) output.stderr(result.stderr);
    if (result.exitCode !== 0) {
      output.stderr(`[release] FAIL ${step.gate} (exit ${String(result.exitCode)})\n`);
      return { exitCode: result.exitCode, failedGate: step.gate };
    }
  }

  output.stdout('[release] PASS all gates\n');
  return { exitCode: 0, failedGate: null };
};

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const result = await verifyRelease();
  process.exitCode = result.exitCode;
}
