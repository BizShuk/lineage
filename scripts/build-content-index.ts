import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const CONTENT_CATEGORIES = [
  'classes',
  'items',
  'abilities',
  'npcs',
  'monsters',
  'quests',
  'maps',
] as const;

export type ContentCategory = (typeof CONTENT_CATEGORIES)[number];
export type ContentIndex = Readonly<Record<ContentCategory, readonly string[]>>;

interface ContentDefinition {
  readonly id: string;
}

export interface WriteContentIndexOptions {
  readonly root?: string;
  readonly outputPath?: string;
  readonly index?: ContentIndex;
}

const headings: Readonly<Record<ContentCategory, string>> = {
  classes: 'Classes',
  items: 'Items',
  abilities: 'Abilities',
  npcs: 'NPCs',
  monsters: 'Monsters',
  quests: 'Quests',
  maps: 'Maps',
};

const compareIds = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const readDefinitions = (root: string, category: ContentCategory): readonly ContentDefinition[] => {
  const path = join(root, 'src/content/data', `${category}.json`);
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (
    !Array.isArray(value) ||
    !value.every(
      (entry: unknown): entry is ContentDefinition =>
        typeof entry === 'object' &&
        entry !== null &&
        'id' in entry &&
        typeof entry.id === 'string',
    )
  ) {
    throw new Error(`內容資料格式錯誤：${path}`);
  }
  return value;
};

export const collectContentIndex = (root = process.cwd()): ContentIndex => {
  const index: Record<ContentCategory, readonly string[]> = {
    classes: [],
    items: [],
    abilities: [],
    npcs: [],
    monsters: [],
    quests: [],
    maps: [],
  };
  for (const category of CONTENT_CATEGORIES) {
    index[category] = readDefinitions(root, category)
      .map(({ id }) => id)
      .sort(compareIds);
  }
  return index;
};

export const renderContentIndex = (index: ContentIndex): string => {
  const sections = CONTENT_CATEGORIES.map((category) => {
    const ids = [...index[category]].sort(compareIds);
    const entries = ids.length === 0 ? '- （無）' : ids.map((id) => `- \`${id}\``).join('\n');
    return `## ${headings[category]} (${String(ids.length)})\n\n${entries}`;
  });
  return [
    '# 內容索引 (Generated Content Index)',
    '',
    '> 此檔案由 `npm run content:index` 產生，請勿手動編輯。',
    '',
    ...sections.flatMap((section) => [section, '']),
  ].join('\n');
};

export const writeContentIndex = (options: WriteContentIndexOptions = {}): string => {
  const root = resolve(options.root ?? process.cwd());
  const outputPath = resolve(
    options.outputPath ?? join(root, 'docs/specs/generated-content-index.md'),
  );
  const index = options.index ?? collectContentIndex(root);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, renderContentIndex(index), 'utf8');
  return outputPath;
};

const outputArgument = (args: readonly string[]): string | undefined => {
  const index = args.indexOf('--output');
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.length === 0) {
    throw new Error('`--output` 需要檔案路徑');
  }
  return value;
};

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  try {
    const argument = outputArgument(process.argv.slice(2));
    const outputPath = writeContentIndex(argument === undefined ? {} : { outputPath: argument });
    process.stdout.write(`內容索引已寫入 ${outputPath}\n`);
  } catch (error: unknown) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
