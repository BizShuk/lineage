# Talking Island Single-Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify a complete browser-based single-player recreation of the 2000–2003 Taiwan-era Lineage Talking Island experience.

**Architecture:** Phaser owns rendering, input, animation, and scene transitions; pure TypeScript modules own deterministic game rules and emit domain events. Versioned JSON content is validated before play, while an IndexedDB repository stores stable serializable state independently from Phaser objects.

**Tech Stack:** Node.js 24, npm 11, TypeScript 5.9.3, Vite 8.1.5, Phaser 3.90.0, Zod 4.4.3, idb 8.0.3, Vitest 4.1.10, fake-indexeddb 6.2.5, Playwright 1.61.1, ESLint 9.39.5.

## Global Constraints

- Desktop browser, offline-capable single-player delivery; no server, account, multiplayer, PVP, clan, siege, player trade, auction house, or monetization.
- Reference target is Taiwan Lineage from 2000–2003, scoped to Talking Island.
- All code, images, animation, sound, and music are original or legally redistributable; never copy assets from the original client.
- Four playable classes: `王族`, `騎士`, `妖精`, and `法師`.
- Six attributes: `力量`, `敏捷`, `體質`, `智力`, `精神`, and `魅力`.
- Complete level range is 1–15; expected finishing level is 12–15 and expected first playthrough is 3–5 hours.
- Seven required regions: village, scarecrow field, north field, coast, black-knight area, dungeon floor 1, and dungeon floor 2.
- Minimum content: 15 NPCs, 10 normal monster types, black-knight elites, Baphomet, 40 items, 20 abilities, a six-stage main quest, four class-guide branches, and six side quests.
- Internal viewport is `640×480`; presentation scales without smoothing to preserve the early pixel-art composition.
- Three save slots; every save contains `schemaVersion`, game version, timestamp, and checksum.
- A requirement is not complete until its unit, content-integrity, integration, E2E, visual, and production-build evidence described by the design exists.
- Follow TDD: each behavioral change starts with a focused failing test and ends with the narrow test plus the relevant broader suite passing.
- Use Traditional Chinese for player-facing copy and keep code identifiers in English.

## Planned File Structure

```text
.
├── AGENTS.md -> CLAUDE.md
├── README.md
├── README.todo
├── CLAUDE.md
├── package.json
├── eslint.config.js
├── playwright.config.ts
├── tsconfig.json
├── vite.config.ts
├── public/
│   ├── manifest.webmanifest
│   └── assets/{audio,maps,sprites,ui}/
├── src/
│   ├── app/{createGame.ts,gameConfig.ts,version.ts}
│   ├── core/{combat.ts,events.ts,inventory.ts,model.ts,progression.ts,quests.ts,rng.ts,stats.ts}
│   ├── content/{catalog.ts,loadContent.ts,schema.ts,data/*.json}
│   ├── world/{ai.ts,grid.ts,pathfinding.ts,world.ts}
│   ├── storage/{checksum.ts,migrations.ts,SaveRepository.ts,saveSchema.ts}
│   ├── game/scenes/{BootScene.ts,CharacterCreateScene.ts,MenuScene.ts,WorldScene.ts}
│   ├── game/systems/{CombatPresenter.ts,EntityRenderer.ts,InputController.ts,WorldController.ts}
│   ├── ui/{Hud.ts,WindowManager.ts,panels/*.ts,styles.css}
│   ├── main.ts
│   └── service-worker.ts
├── tests/{content,e2e,integration,unit,visual}/
└── scripts/{build-content-index.ts,verify-release.mjs}
```

`core` never imports Phaser, DOM, IndexedDB, or concrete JSON files. `content` converts validated JSON into typed catalogs. `game` adapts Phaser input and rendering to `core` and `world`. `storage` serializes only stable domain state. `ui` owns DOM overlays and never calculates combat or quest outcomes.

---

### Task 1: Project foundation and workspace contract

**Files:**
- Create: `package.json`
- Create: `eslint.config.js`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `playwright.config.ts`
- Create: `index.html`
- Create: `src/app/version.ts`
- Create: `src/app/version.test.ts`
- Create: `README.md`
- Create: `CLAUDE.md`
- Create: `README.todo`
- Create: `docs/memory/README.md`
- Create: `AGENTS.md` as a symlink to `CLAUDE.md`

**Interfaces:**
- Consumes: approved design at `docs/specs/2026-07-17-talking-island-single-player-design.md`.
- Produces: `GAME_VERSION: string`; npm scripts `dev`, `build`, `typecheck`, `lint`, `test`, `test:e2e`, and `verify`.

- [ ] **Step 1: Write the failing version test**

```ts
// src/app/version.test.ts
import { describe, expect, it } from 'vitest';
import { GAME_VERSION } from './version';

describe('GAME_VERSION', () => {
  it('uses semantic versioning', () => {
    expect(GAME_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
```

- [ ] **Step 2: Run the test and confirm the missing module failure**

Run: `npm test -- src/app/version.test.ts`

Expected: FAIL because `package.json`, Vitest, or `src/app/version.ts` does not exist.

- [ ] **Step 3: Create the exact toolchain configuration**

```json
{
  "name": "talking-island-single-player",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "engines": { "node": ">=24 <25", "npm": ">=11 <12" },
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit --pretty false && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit --pretty false",
    "lint": "eslint . --max-warnings 0",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "verify": "npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e"
  },
  "dependencies": {
    "idb": "8.0.3",
    "phaser": "3.90.0",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@eslint/js": "9.39.5",
    "@playwright/test": "1.61.1",
    "@types/node": "24.13.3",
    "eslint": "9.39.5",
    "fake-indexeddb": "6.2.5",
    "tsx": "4.23.1",
    "typescript": "5.9.3",
    "typescript-eslint": "8.64.0",
    "vite": "8.1.5",
    "vite-plugin-pwa": "1.3.0",
    "vitest": "4.1.10",
    "workbox-precaching": "7.4.1"
  }
}
```

Use these exact initial configurations:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "allowImportingTsExtensions": false,
    "isolatedModules": true,
    "noEmit": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "types": ["node"]
  },
  "include": ["src", "tests", "scripts", "vite.config.ts", "playwright.config.ts"]
}
```

```ts
// vite.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/{unit,content,integration}/**/*.test.ts'],
    coverage: { reporter: ['text', 'html'] },
  },
});
```

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  testMatch: ['e2e/**/*.spec.ts', 'visual/**/*.spec.ts'],
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

```js
// eslint.config.js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'tests/visual/*.png'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    files: ['**/*.ts'],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: { '@typescript-eslint/consistent-type-imports': 'error' },
  },
);
```

```html
<!-- index.html -->
<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>說話之島單機致敬版</title>
  </head>
  <body>
    <main id="game-root" data-testid="game-root"></main>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 4: Add the version implementation and install dependencies**

```ts
// src/app/version.ts
export const GAME_VERSION = '0.1.0';
```

Run: `NPM_CONFIG_CACHE=/private/tmp/lineage-npm-cache npm install && NPM_CONFIG_CACHE=/private/tmp/lineage-npm-cache npx playwright install chromium`

Expected: `package-lock.json` is created, npm reports zero install errors, and Playwright confirms Chromium installation.

- [ ] **Step 5: Add the unified workspace documents**

`README.md` must describe the business definition, supported browser, install/run/build/test commands, controls table, save/export paths, and asset-license rule. `CLAUDE.md` must contain the architecture tree, dependency boundaries, key commands, content-count requirements, and design/plan links. `README.todo` must use the required `# TODO` and `## Archive` structure. `docs/memory/README.md` must state that retrospective decisions live there. Create the symlink with `ln -s CLAUDE.md AGENTS.md` and verify it with `test -L AGENTS.md`.

- [ ] **Step 6: Run the foundation checks**

Run: `npm test -- src/app/version.test.ts && npm run typecheck && test -L AGENTS.md`

Expected: one passing test, zero TypeScript errors, and exit code 0.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts playwright.config.ts eslint.config.js index.html src/app README.md CLAUDE.md AGENTS.md README.todo docs/memory
git commit -m "chore: establish game project foundation"
```

### Task 2: Deterministic character model and derived stats

**Files:**
- Create: `src/core/model.ts`
- Create: `src/core/stats.ts`
- Create: `src/core/rng.ts`
- Test: `tests/unit/stats.test.ts`
- Test: `tests/unit/rng.test.ts`

**Interfaces:**
- Consumes: no runtime dependency outside TypeScript.
- Produces: `CharacterClass`, `Attributes`, `CharacterState`, `DerivedStats`, `deriveStats(character)`, and `SeededRng`.

- [ ] **Step 1: Write failing tests for all six attributes and early AC direction**

```ts
import { describe, expect, it } from 'vitest';
import { createCharacter, deriveStats } from '../../src/core/stats';

describe('derived character stats', () => {
  it('creates every class with all six attributes', () => {
    for (const classId of ['prince', 'knight', 'elf', 'wizard'] as const) {
      const character = createCharacter('測試角色', classId);
      expect(Object.keys(character.attributes).sort()).toEqual(
        ['cha', 'con', 'dex', 'int', 'str', 'wis'].sort(),
      );
    }
  });

  it('treats lower AC as stronger defense', () => {
    const knight = createCharacter('騎士', 'knight');
    const base = deriveStats(knight);
    const armored = deriveStats({ ...knight, equipmentAC: knight.equipmentAC - 4 });
    expect(armored.ac).toBe(base.ac - 4);
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- tests/unit/stats.test.ts`

Expected: FAIL because `createCharacter` and `deriveStats` are missing.

- [ ] **Step 3: Implement exact domain types and pure derivation**

```ts
export type CharacterClass = 'prince' | 'knight' | 'elf' | 'wizard';
export interface Attributes { str: number; dex: number; con: number; int: number; wis: number; cha: number }
export interface CharacterState {
  id: string;
  name: string;
  classId: CharacterClass;
  level: number;
  experience: number;
  attributes: Attributes;
  hp: number;
  mp: number;
  alignment: number;
  carriedWeight: number;
  equipmentAC: number;
}
export interface DerivedStats {
  maxHP: number;
  maxMP: number;
  ac: number;
  hitBonus: number;
  damageBonus: number;
  spellPower: number;
  weightLimit: number;
}
```

Use a frozen `Record<CharacterClass, Attributes>` for class bases. `deriveStats` must be total, side-effect free, clamp level to 1–15, and calculate AC as `10 - floor(dex / 3) + equipmentAC`. Add `SeededRng.next(): number` and `SeededRng.int(min, max): number` using a documented 32-bit Mulberry algorithm so combat tests reproduce the same rolls.

- [ ] **Step 4: Verify stats and RNG**

Run: `npm test -- tests/unit/stats.test.ts tests/unit/rng.test.ts`

Expected: all character and deterministic-sequence assertions pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/model.ts src/core/stats.ts src/core/rng.ts tests/unit/stats.test.ts tests/unit/rng.test.ts
git commit -m "feat: add deterministic character stats"
```

### Task 3: Combat, abilities, status effects, and death

**Files:**
- Create: `src/core/events.ts`
- Create: `src/core/combat.ts`
- Create: `src/core/progression.ts`
- Test: `tests/unit/combat.test.ts`
- Test: `tests/unit/progression.test.ts`

**Interfaces:**
- Consumes: `CharacterState`, `DerivedStats`, and `SeededRng` from Task 2.
- Produces: `Combatant`, `AttackCommand`, `AbilityDefinition`, `StatusEffect`, `resolveAttack`, `castAbility`, `applyExperience`, `applyDeathPenalty`, and discriminated `DomainEvent` values.

- [ ] **Step 1: Write failing combat and death tests**

```ts
import { describe, expect, it } from 'vitest';
import { resolveAttack } from '../../src/core/combat';
import { SeededRng } from '../../src/core/rng';

describe('combat', () => {
  it('emits damage and death without mutating inputs', () => {
    const attacker = { id: 'hero', hp: 30, maxHP: 30, ac: 5, hitBonus: 20, damage: [4, 4] as const };
    const target = { id: 'goblin', hp: 4, maxHP: 4, ac: 10, hitBonus: 0, damage: [1, 1] as const };
    const result = resolveAttack(attacker, target, new SeededRng(7));
    expect(target.hp).toBe(4);
    expect(result.target.hp).toBe(0);
    expect(result.events.map((event) => event.type)).toEqual(['damage', 'death']);
  });
});
```

Add progression tests asserting level never exceeds 15, experience carries across level boundaries, and death removes 5% of the current level span without dropping below that level's floor.

- [ ] **Step 2: Verify failures**

Run: `npm test -- tests/unit/combat.test.ts tests/unit/progression.test.ts`

Expected: FAIL with missing combat and progression exports.

- [ ] **Step 3: Implement deterministic combat commands**

`resolveAttack` must compute hit chance from attacker hit bonus and defender AC, clamp chance to 5–95%, roll damage inside the inclusive weapon range, return copied combatants, and emit `miss`, `damage`, and `death` events. `castAbility` must check class, level, MP, range, cooldown, and required item before applying damage, heal, buff, debuff, or control effects. Status durations use simulation milliseconds and pause with the world clock.

```ts
export type DomainEvent =
  | { type: 'miss'; sourceId: string; targetId: string }
  | { type: 'damage'; sourceId: string; targetId: string; amount: number }
  | { type: 'heal'; sourceId: string; targetId: string; amount: number }
  | { type: 'status-applied'; targetId: string; statusId: string; expiresAt: number }
  | { type: 'death'; entityId: string }
  | { type: 'level-up'; entityId: string; level: number };
```

- [ ] **Step 4: Run the focused and core suites**

Run: `npm test -- tests/unit/combat.test.ts tests/unit/progression.test.ts tests/unit/stats.test.ts`

Expected: all tests pass with deterministic snapshots for the same seed.

- [ ] **Step 5: Commit**

```bash
git add src/core/events.ts src/core/combat.ts src/core/progression.ts tests/unit/combat.test.ts tests/unit/progression.test.ts
git commit -m "feat: implement combat and progression rules"
```

### Task 4: Inventory, equipment, consumables, arrows, and shops

**Files:**
- Create: `src/core/inventory.ts`
- Create: `tests/helpers/inventoryFixtures.ts`
- Test: `tests/unit/inventory.test.ts`
- Test: `tests/integration/shop-equipment.test.ts`

**Interfaces:**
- Consumes: `CharacterClass`, `CharacterState`, and `DomainEvent`.
- Produces: `ItemDefinition`, `InventoryStack`, `InventoryState`, `EquipmentState`, `addItem`, `removeItem`, `equipItem`, `useItem`, `buyItem`, and `sellItem`; test factories `inventoryWith`, `emptyEquipment`, `knight`, and `item`.

- [ ] **Step 1: Write failing inventory invariants**

```ts
it('rejects class-incompatible equipment without losing the item', () => {
  const inventory = inventoryWith({ itemId: 'wizard-staff', quantity: 1 });
  const result = equipItem(inventory, emptyEquipment(), knight(), item('wizard-staff'));
  expect(result.ok).toBe(false);
  expect(result.inventory).toEqual(inventory);
});

it('consumes one arrow only after a successful bow attack command', () => {
  const result = consumeAmmunition(inventoryWith({ itemId: 'wooden-arrow', quantity: 2 }), 'wooden-arrow');
  expect(result.stacks).toContainEqual({ itemId: 'wooden-arrow', quantity: 1 });
});
```

Add tests for stack limits, weight limits, potion healing caps, insufficient Adena, buy/sell price direction, and atomic transactions.

- [ ] **Step 2: Verify failures**

Run: `npm test -- tests/unit/inventory.test.ts tests/integration/shop-equipment.test.ts`

Expected: FAIL because inventory operations do not exist.

- [ ] **Step 3: Implement immutable inventory transactions**

```ts
export type EquipmentSlot = 'weapon' | 'shield' | 'helmet' | 'armor' | 'cloak' | 'gloves' | 'boots' | 'amulet' | 'ring';
export interface ItemDefinition {
  id: string;
  name: string;
  kind: 'weapon' | 'armor' | 'consumable' | 'spellbook' | 'ammunition' | 'quest';
  weight: number;
  stackLimit: number;
  buyPrice: number;
  sellPrice: number;
  allowedClasses: CharacterClass[];
  equipmentSlot?: EquipmentSlot;
}
export type InventoryResult =
  | { ok: true; inventory: InventoryState; events: DomainEvent[] }
  | { ok: false; inventory: InventoryState; reason: 'overweight' | 'missing-item' | 'wrong-class' | 'insufficient-adena' | 'invalid-quantity' };
```

All operations validate first and apply once; failed operations preserve byte-equivalent input state. Recalculate carried weight from catalog definitions after each successful transaction.

- [ ] **Step 4: Verify inventory and shop integration**

Run: `npm test -- tests/unit/inventory.test.ts tests/integration/shop-equipment.test.ts`

Expected: all inventory invariants and atomic shop flows pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/inventory.ts tests/helpers/inventoryFixtures.ts tests/unit/inventory.test.ts tests/integration/shop-equipment.test.ts
git commit -m "feat: add inventory equipment and shop rules"
```

### Task 5: Content schema and validated catalog

**Files:**
- Create: `src/content/schema.ts`
- Create: `src/content/catalog.ts`
- Create: `src/content/loadContent.ts`
- Create: `src/content/data/classes.json`
- Create: `src/content/data/items.json`
- Create: `src/content/data/abilities.json`
- Create: `src/content/data/monsters.json`
- Create: `src/content/data/npcs.json`
- Create: `src/content/data/quests.json`
- Create: `src/content/data/maps.json`
- Test: `tests/content/schema.test.ts`
- Test: `tests/content/counts.test.ts`
- Test: `tests/content/references.test.ts`

**Interfaces:**
- Consumes: domain IDs and types from Tasks 2–4.
- Produces: `GameContent`, `ContentLoadError`, `loadContent(raw): GameContent`, `loadBundledContent(): GameContent`, and catalog lookup methods `item(id)`, `ability(id)`, `monster(id)`, `npc(id)`, `quest(id)`, and `map(id)`.

- [ ] **Step 1: Write failing schema, count, and cross-reference tests**

```ts
it('meets every contractual content floor', () => {
  const content = loadBundledContent();
  expect(content.classes).toHaveLength(4);
  expect(content.items.length).toBeGreaterThanOrEqual(40);
  expect(content.abilities.length).toBeGreaterThanOrEqual(20);
  expect(content.npcs.length).toBeGreaterThanOrEqual(15);
  expect(content.monsters.filter((monster) => monster.rank === 'normal').length).toBeGreaterThanOrEqual(10);
  expect(content.monsters.some((monster) => monster.id === 'baphomet' && monster.rank === 'boss')).toBe(true);
  expect(content.maps).toHaveLength(7);
});
```

Reference tests must visit every NPC shop item, monster drop, ability reagent, quest prerequisite, quest objective, map exit, and spawn definition, then assert the referenced ID exists and no IDs are duplicated.

- [ ] **Step 2: Verify failures**

Run: `npm test -- tests/content`

Expected: FAIL because the content loader and JSON data are missing.

- [ ] **Step 3: Implement strict Zod schemas and indexed catalogs**

```ts
export const contentId = z.string().regex(/^[a-z][a-z0-9-]*$/);
export const dropSchema = z.object({ itemId: contentId, chance: z.number().min(0).max(1), min: z.int().positive(), max: z.int().positive() });
export const mapExitSchema = z.object({ x: z.int().nonnegative(), y: z.int().nonnegative(), targetMapId: contentId, targetX: z.int().nonnegative(), targetY: z.int().nonnegative() });
export class ContentLoadError extends Error {
  constructor(readonly issues: string[]) {
    super(`內容驗證失敗：${issues.join('；')}`);
  }
}
```

`loadContent` must parse all root arrays, reject duplicate IDs, collect all cross-reference errors in one pass, and freeze the resulting lookup maps. The seven map IDs are `talking-island-village`, `scarecrow-field`, `north-field`, `coast`, `black-knight-area`, `talking-island-dungeon-1`, and `talking-island-dungeon-2`.

- [ ] **Step 4: Add the complete minimum data set**

Populate all JSON files to the contract counts. The ten normal monster families are `goblin`, `orc`, `dwarf`, `kobold`, `werewolf`, `spider`, `zombie`, `skeleton`, `ghoul`, and `stone-golem`; add `black-knight` as elite and `baphomet` as boss. Every definition must have Traditional Chinese display text, gameplay values, legal asset keys, and valid references.

- [ ] **Step 5: Verify every content invariant**

Run: `npm test -- tests/content`

Expected: all schemas, minimum counts, unique IDs, and cross-reference tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/content tests/content
git commit -m "feat: add validated talking island content catalog"
```

### Task 6: Grid maps, pathfinding, transitions, and reachability

**Files:**
- Create: `src/world/grid.ts`
- Create: `src/world/pathfinding.ts`
- Create: `src/world/world.ts`
- Create: `public/assets/maps/*.map.json`
- Test: `tests/unit/pathfinding.test.ts`
- Test: `tests/content/reachability.test.ts`
- Test: `tests/integration/map-transition.test.ts`

**Interfaces:**
- Consumes: seven map definitions and exits from `GameContent`.
- Produces: `TileGrid`, `WorldPosition`, `findPath(grid, start, goal)`, `isReachable`, `transitionEntity`, and `WorldState`.

- [ ] **Step 1: Write failing diagonal path and reachability tests**

```ts
it('finds an eight-direction path without cutting blocked corners', () => {
  const grid = TileGrid.fromRows(['....', '.##.', '....']);
  const path = findPath(grid, { x: 0, y: 0 }, { x: 3, y: 2 });
  expect(path.at(0)).toEqual({ x: 0, y: 0 });
  expect(path.at(-1)).toEqual({ x: 3, y: 2 });
  expect(path).not.toContainEqual({ x: 1, y: 1 });
});
```

The content reachability test must assert each spawn, NPC, quest objective, exit, and Baphomet is reachable from that map's entry point, and all seven regions form one connected directed graph.

- [ ] **Step 2: Verify failures**

Run: `npm test -- tests/unit/pathfinding.test.ts tests/content/reachability.test.ts tests/integration/map-transition.test.ts`

Expected: FAIL because grid and world transition modules are missing.

- [ ] **Step 3: Implement bounded A-star and map transitions**

Use integer tile coordinates, octile distance, costs 10 orthogonal and 14 diagonal, a deterministic neighbor order, and a hard search bound of `grid.width * grid.height`. Diagonal movement is permitted only when both adjacent orthogonal tiles are walkable. A transition atomically changes map ID and position after validating the target tile.

```ts
export interface WorldPosition { mapId: string; x: number; y: number }
export interface WorldState { player: WorldPosition; defeatedBosses: string[]; flags: Record<string, boolean>; worldTimeMs: number }
export type TransitionResult =
  | { ok: true; state: WorldState; event: { type: 'map-changed'; from: string; to: string } }
  | { ok: false; state: WorldState; reason: 'unknown-map' | 'blocked-target' | 'missing-exit' };
```

- [ ] **Step 4: Create all seven collision maps**

Each map JSON must define width, height, terrain layer, collision layer, entry point, exits, NPC anchors, monster spawn zones, and encounter-safe tiles. Use sizes large enough for exploration: village `64×64`, surface fields `96×96`, and dungeon floors `72×72`. The maps must pass reachability tests before visual decoration.

- [ ] **Step 5: Verify pathfinding and world connectivity**

Run: `npm test -- tests/unit/pathfinding.test.ts tests/content/reachability.test.ts tests/integration/map-transition.test.ts`

Expected: all deterministic path and seven-region connectivity tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/world/grid.ts src/world/pathfinding.ts src/world/world.ts public/assets/maps tests/unit/pathfinding.test.ts tests/content/reachability.test.ts tests/integration/map-transition.test.ts
git commit -m "feat: add talking island maps and navigation"
```

### Task 7: Monster AI, spawning, leashing, and loot

**Files:**
- Create: `src/world/ai.ts`
- Create: `tests/helpers/worldFixtures.ts`
- Test: `tests/unit/ai.test.ts`
- Test: `tests/integration/combat-loot.test.ts`

**Interfaces:**
- Consumes: `WorldState`, `findPath`, combat commands, inventory commands, and monster/drop content.
- Produces: `MonsterState`, `MonsterIntent`, `tickMonsterAI`, `spawnMonsters`, `rollDrops`, and `respawnEligibleMonsters`; test factories `monsterAt`, `playerAt`, `openGrid`, and `worldWithDefeatedBoss`.

- [ ] **Step 1: Write failing finite-state AI tests**

```ts
it('returns a monster home after the player exceeds leash range', () => {
  const monster = monsterAt({ x: 5, y: 5 }, { state: 'chase', homeX: 0, homeY: 0 });
  const result = tickMonsterAI(monster, playerAt(20, 20), openGrid(24, 24), 100, new SeededRng(3));
  expect(result.monster.aiState).toBe('return');
  expect(result.intent.type).toBe('move');
});

it('does not respawn Baphomet after the ending flag is saved', () => {
  expect(respawnEligibleMonsters(worldWithDefeatedBoss('baphomet'), 600_000)).not.toContainEqual(
    expect.objectContaining({ monsterId: 'baphomet' }),
  );
});
```

Add cases for idle patrol, alert radius, chase, attack cooldown, path blockage, return-home healing, normal respawn, deterministic drops, and inventory-full ground loot.

- [ ] **Step 2: Verify failures**

Run: `npm test -- tests/unit/ai.test.ts tests/integration/combat-loot.test.ts`

Expected: FAIL because AI and drop orchestration are missing.

- [ ] **Step 3: Implement one deterministic AI transition per tick**

```ts
export type MonsterAIState = 'idle' | 'patrol' | 'chase' | 'attack' | 'return' | 'dead';
export type MonsterIntent =
  | { type: 'wait' }
  | { type: 'move'; x: number; y: number }
  | { type: 'attack'; targetId: string }
  | { type: 'despawn' };
```

Use squared distances for alert and leash checks. Normal monsters respawn on their content-defined timer; elites respawn only after leaving and re-entering the map; Baphomet remains defeated after the world flag is set. `rollDrops` must roll each table entry once through the supplied RNG and emit ground-loot entities when the player cannot carry the result.

- [ ] **Step 4: Verify AI and loot integration**

Run: `npm test -- tests/unit/ai.test.ts tests/integration/combat-loot.test.ts`

Expected: all state transitions, respawn rules, and seeded drop results pass.

- [ ] **Step 5: Commit**

```bash
git add src/world/ai.ts tests/helpers/worldFixtures.ts tests/unit/ai.test.ts tests/integration/combat-loot.test.ts
git commit -m "feat: add monster AI spawning and loot"
```

### Task 8: Dialogue, quests, class guides, and ending state

**Files:**
- Create: `src/core/quests.ts`
- Test: `tests/unit/quests.test.ts`
- Test: `tests/content/quest-completion.test.ts`
- Test: `tests/integration/black-knight-ending.test.ts`

**Interfaces:**
- Consumes: quest/NPC/monster/item catalogs, `WorldState.flags`, inventory, and domain events.
- Produces: `QuestState`, `QuestObjective`, `DialogueNode`, `startQuest`, `advanceQuest`, `chooseDialogue`, `claimReward`, and `isEndingUnlocked`.

- [ ] **Step 1: Write failing quest state-machine tests**

```ts
it('advances the black-knight event only after every required defeat', () => {
  const started = startQuest({ active: {}, completed: [], claimedRewards: [] }, 'black-knight-assault');
  const partial = advanceQuest(started, { type: 'monster-defeated', monsterId: 'black-knight', count: 4 });
  expect(partial.active['black-knight-assault']?.stage).toBe('defeat-patrol');
  const complete = advanceQuest(partial, { type: 'monster-defeated', monsterId: 'black-knight', count: 1 });
  expect(complete.active['black-knight-assault']?.stage).toBe('report-to-guard-captain');
});

it('unlocks the ending only after Baphomet and the village report', () => {
  expect(isEndingUnlocked({ baphometDefeated: true, finalReportComplete: false })).toBe(false);
  expect(isEndingUnlocked({ baphometDefeated: true, finalReportComplete: true })).toBe(true);
});
```

Add tests proving quest rewards are idempotent, class branches reject the wrong class, required quest items cannot be sold, and all six side quests are mechanically completable.

- [ ] **Step 2: Verify failures**

Run: `npm test -- tests/unit/quests.test.ts tests/content/quest-completion.test.ts tests/integration/black-knight-ending.test.ts`

Expected: FAIL because quest state-machine functions are missing.

- [ ] **Step 3: Implement explicit objective reducers**

```ts
export type QuestSignal =
  | { type: 'npc-talked'; npcId: string }
  | { type: 'monster-defeated'; monsterId: string; count: number }
  | { type: 'item-acquired'; itemId: string; count: number }
  | { type: 'area-entered'; mapId: string }
  | { type: 'boss-defeated'; monsterId: 'baphomet' };
export interface QuestState {
  active: Record<string, { stage: string; counters: Record<string, number> }>;
  completed: string[];
  claimedRewards: string[];
}
```

Quest transitions must be data-driven, monotonic unless an explicit reset rule exists, and return unchanged state for unrelated signals. The common main line stages are training, village registration, field supplies, black-knight assault, dungeon seal, and final village report.

- [ ] **Step 4: Verify every quest has a simulated completion path**

Run: `npm test -- tests/unit/quests.test.ts tests/content/quest-completion.test.ts tests/integration/black-knight-ending.test.ts`

Expected: all main, class-guide, side-quest, reward, and ending assertions pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/quests.ts tests/unit/quests.test.ts tests/content/quest-completion.test.ts tests/integration/black-knight-ending.test.ts
git commit -m "feat: implement talking island quests and ending"
```

### Task 9: Versioned IndexedDB saves, backup, import, and export

**Files:**
- Create: `src/storage/checksum.ts`
- Create: `src/storage/saveSchema.ts`
- Create: `src/storage/migrations.ts`
- Create: `src/storage/SaveRepository.ts`
- Create: `tests/helpers/saveFixtures.ts`
- Test: `tests/unit/migrations.test.ts`
- Test: `tests/integration/save-repository.test.ts`

**Interfaces:**
- Consumes: serializable character, inventory, quest, world, quick-slot, and settings states.
- Produces: `SaveGameV1`, `SaveSummary`, `SaveRepository.list/get/put/delete/export/import/restoreBackup`, `migrateSave`, and `SaveCorruptionError`; test factory `completeSave(overrides): SaveGameV1`.

- [ ] **Step 1: Write failing save round-trip and corruption tests**

```ts
import 'fake-indexeddb/auto';

it('round-trips a complete save without losing world flags', async () => {
  const repository = new SaveRepository('test-save-db');
  const save = completeSave({ slot: 1, baphometDefeated: true });
  await repository.put(save);
  expect(await repository.get(1)).toEqual(save);
});

it('keeps the previous save as backup before import replacement', async () => {
  const repository = new SaveRepository('test-import-db');
  await repository.put(completeSave({ slot: 2, level: 8 }));
  await repository.import(2, JSON.stringify(completeSave({ slot: 2, level: 9 })));
  expect((await repository.restoreBackup(2)).character.level).toBe(8);
});
```

Add tests for slots 1–3 only, checksum mismatch, unsupported future schema, V0-to-V1 migration, delete confirmation boundary, and invalid import preserving current data.

- [ ] **Step 2: Verify failures**

Run: `npm test -- tests/unit/migrations.test.ts tests/integration/save-repository.test.ts`

Expected: FAIL because storage modules are missing.

- [ ] **Step 3: Define and validate the stable V1 save envelope**

```ts
export interface SaveGameV1 {
  schemaVersion: 1;
  gameVersion: string;
  slot: 1 | 2 | 3;
  updatedAt: string;
  checksum: string;
  character: CharacterState;
  inventory: InventoryState;
  equipment: EquipmentState;
  quests: QuestState;
  world: WorldState;
  quickSlots: Array<string | null>;
  settings: { music: number; ambient: number; effects: number; muted: boolean; scale: 1 | 2 | 3 };
}
```

Calculate checksum from canonical JSON with the `checksum` field blank. Use one IndexedDB database with `saves` and `backups` stores keyed by slot. Validate and migrate in memory before any write transaction. Never include Phaser sprites, timers, DOM nodes, functions, or transient animation state.

- [ ] **Step 4: Implement repository methods as atomic transactions**

`put` copies the current slot to backup before replacing it. `import` parses, validates, migrates, recomputes checksum, forces the target slot, and writes only after all steps succeed. `export` returns pretty JSON. `restoreBackup` does not destroy the backup until the restored save is confirmed written.

- [ ] **Step 5: Verify all save guarantees**

Run: `npm test -- tests/unit/migrations.test.ts tests/integration/save-repository.test.ts`

Expected: all round-trip, migration, corruption, backup, import, export, and slot-bound tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/storage tests/helpers/saveFixtures.ts tests/unit/migrations.test.ts tests/integration/save-repository.test.ts
git commit -m "feat: add versioned local save system"
```

### Task 10: Phaser boot, menu, character creation, and scale

**Files:**
- Create: `src/main.ts`
- Create: `src/app/gameConfig.ts`
- Create: `src/app/createGame.ts`
- Create: `src/game/scenes/BootScene.ts`
- Create: `src/game/scenes/MenuScene.ts`
- Create: `src/game/scenes/CharacterCreateScene.ts`
- Create: `src/ui/styles.css`
- Create: `tests/e2e/menu-character.spec.ts`

**Interfaces:**
- Consumes: `GAME_VERSION`, `loadContent`, `createCharacter`, and `SaveRepository`.
- Produces: `createGame(parent: HTMLElement): Phaser.Game`, scenes `boot`, `menu`, `character-create`, and a saved character passed to `world`.

- [ ] **Step 1: Write the failing menu and four-class E2E test**

```ts
import { expect, test } from '@playwright/test';

test('creates each early class in a separate clean database', async ({ page }) => {
  for (const label of ['王族', '騎士', '妖精', '法師']) {
    await page.goto('/?e2e=1');
    await page.getByRole('button', { name: '開始新遊戲' }).click();
    await page.getByLabel('角色名稱').fill(`測試${label}`);
    await page.getByRole('radio', { name: label }).check();
    await page.getByRole('button', { name: '建立角色' }).click();
    await expect(page.getByTestId('world-scene')).toBeVisible();
  }
});
```

- [ ] **Step 2: Verify failure**

Run: `npm run test:e2e -- tests/e2e/menu-character.spec.ts`

Expected: FAIL because the Vite page and scenes are absent.

- [ ] **Step 3: Implement boot validation and the 640×480 game shell**

```ts
export const gameConfig = (parent: HTMLElement): Phaser.Types.Core.GameConfig => ({
  type: Phaser.AUTO,
  parent,
  width: 640,
  height: 480,
  pixelArt: true,
  roundPixels: true,
  backgroundColor: '#080b0a',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: 'arcade', arcade: { debug: false } },
  scene: [BootScene, MenuScene, CharacterCreateScene, WorldScene],
});
```

Boot validates content before enabling load/new-game buttons. Validation failure renders a Traditional Chinese error panel and returns to menu without creating a save. Character creation validates 2–12 visible characters, rejects duplicate names within the three slots, previews attributes, and exposes accessible radio controls for all four classes.

- [ ] **Step 4: Verify menu, scale, and character creation**

Run: `npm run test:e2e -- tests/e2e/menu-character.spec.ts`

Expected: all four classes reach a visible world scene at a 640×480 logical canvas.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts src/app src/game/scenes/BootScene.ts src/game/scenes/MenuScene.ts src/game/scenes/CharacterCreateScene.ts src/ui/styles.css tests/e2e/menu-character.spec.ts index.html
git commit -m "feat: add game boot menu and character creation"
```

### Task 11: World scene, input, entity rendering, and combat presentation

**Files:**
- Create: `src/game/scenes/WorldScene.ts`
- Create: `src/game/systems/InputController.ts`
- Create: `src/game/systems/EntityRenderer.ts`
- Create: `src/game/systems/WorldController.ts`
- Create: `src/game/systems/CombatPresenter.ts`
- Test: `tests/unit/input-controller.test.ts`
- Test: `tests/integration/world-controller.test.ts`
- Test: `tests/e2e/movement-combat.spec.ts`

**Interfaces:**
- Consumes: content, world/pathfinding, AI, combat, inventory, quest, and save APIs.
- Produces: frame-independent `WorldController.update(deltaMs)`, command-based `InputController`, sprite-keyed `EntityRenderer`, and event-driven `CombatPresenter`.

- [ ] **Step 1: Write failing input and gameplay tests**

```ts
it('maps a monster click to one attack command and movement cancels auto-attack', () => {
  const input = new InputController();
  expect(input.pointerDown({ targetKind: 'monster', targetId: 'goblin-1' })).toEqual({ type: 'attack', targetId: 'goblin-1' });
  input.pointerDown({ targetKind: 'ground', tileX: 8, tileY: 4 });
  expect(input.currentAutoAttackTarget()).toBeNull();
});
```

E2E must click ground to move, click a goblin to approach and auto-attack, observe damage feedback, press a movement key to cancel, resume attack, kill the goblin, and pick up its loot.

- [ ] **Step 2: Verify failures**

Run: `npm test -- tests/unit/input-controller.test.ts tests/integration/world-controller.test.ts && npm run test:e2e -- tests/e2e/movement-combat.spec.ts`

Expected: FAIL because world integration is missing.

- [ ] **Step 3: Implement command-based input and fixed-step simulation**

```ts
export type PlayerCommand =
  | { type: 'move'; x: number; y: number }
  | { type: 'attack'; targetId: string }
  | { type: 'interact'; targetId: string }
  | { type: 'use-quick-slot'; index: number }
  | { type: 'toggle-target' };
```

Run simulation at fixed 50 ms steps with an accumulator capped at 250 ms. Phaser update feeds elapsed time only; the controller updates movement, AI, cooldowns, effects, drops, quests, and autosave signals. Suspend simulation on scene pause and `document.visibilitychange`. Renderer sorts entities by screen Y and never mutates domain state.

- [ ] **Step 4: Implement all approved controls**

Support mouse ground/entity clicks, WASD/arrows, Space, E, Tab, F5–F12, I, C, S, Q, M, Escape, and wheel scale. Prevent browser scrolling for bound game keys only while the canvas has focus. Short-range pathfinding never crosses an unseen map exit automatically.

- [ ] **Step 5: Verify movement, combat, cancellation, and pause**

Run: `npm test -- tests/unit/input-controller.test.ts tests/integration/world-controller.test.ts && npm run test:e2e -- tests/e2e/movement-combat.spec.ts`

Expected: focused tests and browser interaction flow pass without flaky wall-clock waits.

- [ ] **Step 6: Commit**

```bash
git add src/game/scenes/WorldScene.ts src/game/systems tests/unit/input-controller.test.ts tests/integration/world-controller.test.ts tests/e2e/movement-combat.spec.ts
git commit -m "feat: integrate world movement and combat"
```

### Task 12: Early-Lineage HUD and functional panels

**Files:**
- Create: `src/ui/Hud.ts`
- Create: `src/ui/WindowManager.ts`
- Create: `src/ui/panels/CharacterPanel.ts`
- Create: `src/ui/panels/InventoryPanel.ts`
- Create: `src/ui/panels/SpellPanel.ts`
- Create: `src/ui/panels/QuestPanel.ts`
- Create: `src/ui/panels/MapPanel.ts`
- Create: `src/ui/panels/DialoguePanel.ts`
- Create: `src/ui/panels/ShopPanel.ts`
- Create: `src/ui/panels/WarehousePanel.ts`
- Create: `src/ui/panels/SettingsPanel.ts`
- Modify: `src/ui/styles.css`
- Test: `tests/unit/window-manager.test.ts`
- Test: `tests/e2e/hud-panels.spec.ts`

**Interfaces:**
- Consumes: immutable view models and dispatches `PlayerCommand` or explicit shop/warehouse/quest actions.
- Produces: `Hud.render(viewModel)`, `WindowManager.open/close/toggle/top`, and accessible panel elements with stable `data-testid` values.

- [ ] **Step 1: Write failing window-stack and panel E2E tests**

```ts
it('Escape closes only the topmost panel', () => {
  const windows = new WindowManager();
  windows.open('inventory');
  windows.open('settings');
  windows.handleEscape();
  expect(windows.isOpen('settings')).toBe(false);
  expect(windows.isOpen('inventory')).toBe(true);
});
```

E2E opens every approved shortcut panel, equips an item by drag/drop and keyboard action, assigns a potion and spell to quick slots, buys and sells an item, deposits and withdraws warehouse stock, advances dialogue, and verifies HP/MP/AC/weight/alignment/experience updates.

- [ ] **Step 2: Verify failures**

Run: `npm test -- tests/unit/window-manager.test.ts && npm run test:e2e -- tests/e2e/hud-panels.spec.ts`

Expected: FAIL because HUD and panels do not exist.

- [ ] **Step 3: Implement the fixed early-era layout**

Use a 512×432 world viewport, 128 px right status rail, and 48 px bottom message/quick bar inside 640×480. Keep all labels in Traditional Chinese. Health and mana use both color and numeric text. Panels have headings, focus trapping, keyboard-close behavior, and scroll regions that do not move the game camera.

```ts
export interface HudViewModel {
  hp: number; maxHP: number; mp: number; maxMP: number;
  level: number; experiencePercent: number; ac: number;
  weight: number; weightLimit: number; alignment: number;
  target: { name: string; hpPercent: number } | null;
  quickSlots: Array<{ icon: string; label: string; quantity?: number } | null>;
  messages: Array<{ id: string; kind: 'combat' | 'loot' | 'quest' | 'system'; text: string }>;
}
```

- [ ] **Step 4: Implement transactional panel actions**

Panels dispatch domain operations and render the returned success or exact reason. They must not optimistically remove items or Adena. Item drag/drop and keyboard activation call the same operation. Settings persist independent music, ambient, effects, mute, and scale values.

- [ ] **Step 5: Verify every panel and HUD value**

Run: `npm test -- tests/unit/window-manager.test.ts && npm run test:e2e -- tests/e2e/hud-panels.spec.ts`

Expected: window stacking, keyboard access, inventory/shop/warehouse transactions, quick slots, and live stats pass.

- [ ] **Step 6: Commit**

```bash
git add src/ui tests/unit/window-manager.test.ts tests/e2e/hud-panels.spec.ts
git commit -m "feat: add classic HUD and gameplay panels"
```

### Task 13: Original pixel-art assets, animation, effects, and map dressing

**Files:**
- Create: `public/assets/sprites/player-prince.png`
- Create: `public/assets/sprites/player-knight.png`
- Create: `public/assets/sprites/player-elf.png`
- Create: `public/assets/sprites/player-wizard.png`
- Create: `public/assets/sprites/monsters-surface.png`
- Create: `public/assets/sprites/monsters-undead.png`
- Create: `public/assets/sprites/black-knight.png`
- Create: `public/assets/sprites/baphomet.png`
- Create: `public/assets/sprites/npcs.png`
- Create: `public/assets/sprites/items.png`
- Create: `public/assets/sprites/effects.png`
- Create: `public/assets/maps/tiles-overworld.png`
- Create: `public/assets/maps/tiles-dungeon.png`
- Create: `public/assets/ui/classic-frame.png`
- Create: `src/content/data/assets.json`
- Create: `src/content/assets.ts`
- Modify: `src/game/scenes/BootScene.ts`
- Modify: `src/game/systems/EntityRenderer.ts`
- Test: `tests/content/assets.test.ts`
- Test: `tests/e2e/animation-effects.spec.ts`

**Interfaces:**
- Consumes: legal asset keys from content and entity animation state from the world controller.
- Produces: validated `AssetManifest`, `loadAssetManifest()`, `collectAssetKeys(content)`, animation keys `{entityId}:{idle|walk|attack|hit|cast|death}:{direction}`, and effect keys for melee, arrow, spell, damage, level-up, and loot.

- [ ] **Step 1: Write failing manifest and browser asset tests**

```ts
it('maps every content asset key to one original project file', () => {
  const required = collectAssetKeys(loadBundledContent());
  const manifest = loadAssetManifest();
  expect([...required].filter((key) => !manifest[key])).toEqual([]);
  expect(Object.values(manifest).every((entry) => entry.license === 'project-original')).toBe(true);
});
```

Browser tests must load every PNG, assert nonzero natural dimensions, start idle/walk/attack/hit/cast/death states for each player class, and verify the Baphomet death animation reaches its final frame.

- [ ] **Step 2: Verify failures**

Run: `npm test -- tests/content/assets.test.ts && npm run test:e2e -- tests/e2e/animation-effects.spec.ts`

Expected: FAIL because the asset manifest and original atlases are missing.

- [ ] **Step 3: Generate and curate original raster assets**

Use the `imagegen` skill for original bitmap generation, then curate the outputs into transparent PNG atlases. Do not use screenshots, extracted sprites, logos, trade dress, or copied frame pixels from Lineage. Keep the early-era mood through muted earth colors, small human proportions, stone/wood village architecture, dark dungeon masonry, and readable silhouettes.

Player atlases require eight directions and six states: idle 2 frames, walk 6, attack 4, hit 2, cast 4, death 6. Normal monsters require idle, walk, attack, hit, death in their needed directions. Baphomet requires idle, walk, melee, spell, hit, and death. Item and spell icons use `24×24`; terrain uses `32×16` isometric diamonds; character frames fit within `48×64`.

- [ ] **Step 4: Dress all seven maps without changing collision truth**

Use overworld tiles for grass, soil, coast, village stone, buildings, trees, fences, water, and props. Use dungeon tiles for floor, walls, doors, stairs, torches, rubble, and seal-room decoration. Visual layers may overlap but must not silently add collision; every blocking decoration must also update the collision map and rerun reachability.

- [ ] **Step 5: Register animations and domain-event effects**

Boot reads `assets.json`, preloads every file, creates animations once, and records noncritical failures. EntityRenderer selects animation from domain state and direction. CombatPresenter renders melee arcs, projectiles, spell bursts, numeric damage, level-up light, and loot glow without changing rules.

- [ ] **Step 6: Verify legal manifest, animations, and paths**

Run: `npm test -- tests/content/assets.test.ts tests/content/reachability.test.ts && npm run test:e2e -- tests/e2e/animation-effects.spec.ts`

Expected: every content key resolves to an original asset, every required animation completes, and all maps remain reachable.

- [ ] **Step 7: Commit**

```bash
git add public/assets src/content/data/assets.json src/content/assets.ts src/game/scenes/BootScene.ts src/game/systems/EntityRenderer.ts tests/content/assets.test.ts tests/e2e/animation-effects.spec.ts
git commit -m "feat: add original talking island art and animation"
```

### Task 14: Original music, ambience, and sound effects

**Files:**
- Create: `src/audio/AudioPort.ts`
- Create: `src/audio/AudioDirector.ts`
- Create: `src/audio/music.ts`
- Create: `src/audio/sfx.ts`
- Create: `tests/helpers/FakeAudioPort.ts`
- Modify: `src/game/scenes/WorldScene.ts`
- Modify: `src/ui/panels/SettingsPanel.ts`
- Test: `tests/unit/audio-director.test.ts`
- Test: `tests/e2e/audio-settings.spec.ts`

**Interfaces:**
- Consumes: map-change/domain/UI events and persisted audio settings.
- Produces: `AudioDirector.enterRegion/playEvent/updateSettings/suspend/resume/dispose` through an injectable `AudioPort`, plus a recording `FakeAudioPort` for tests.

- [ ] **Step 1: Write failing routing and settings tests**

```ts
it('crossfades region music and applies independent channel gains', () => {
  const port = new FakeAudioPort();
  const director = new AudioDirector(port, { music: 0.5, ambient: 0.25, effects: 0.75, muted: false });
  director.enterRegion('talking-island-dungeon-1');
  expect(port.commands).toContainEqual({ type: 'crossfade', from: null, to: 'dungeon-theme', durationMs: 1200 });
  expect(port.channelGain('ambient')).toBe(0.25);
});
```

Add tests for mute preserving sliders, page-hidden suspend, first-user-gesture resume, no duplicate loops, and disposal.

- [ ] **Step 2: Verify failure**

Run: `npm test -- tests/unit/audio-director.test.ts`

Expected: FAIL because audio modules are missing.

- [ ] **Step 3: Implement original procedural score and effects**

Use Web Audio oscillators, noise buffers, envelopes, filters, and short tracker-like note sequences authored in `music.ts` and `sfx.ts`. Provide four original themes: title, village, surface, and dungeon/boss; provide coast wind, forest insects, village hearth, dungeon drip, melee, bow, six spell families, potion, pickup, UI, level-up, and death effects. Do not reproduce recognizable melodies or recordings from Lineage.

```ts
export interface AudioSettings { music: number; ambient: number; effects: number; muted: boolean }
export type AudioEvent = 'melee' | 'bow' | 'spell-fire' | 'spell-heal' | 'spell-control' | 'potion' | 'pickup' | 'ui-confirm' | 'ui-cancel' | 'level-up' | 'death';
```

- [ ] **Step 4: Wire settings and browser lifecycle**

Audio starts only after a user gesture, crossfades on region changes, suspends when hidden or paused, resumes without restarting the current phrase, and applies saved channel gains live. If Web Audio initialization fails, gameplay continues with a visible nonblocking Traditional Chinese message.

- [ ] **Step 5: Verify director and UI behavior**

Run: `npm test -- tests/unit/audio-director.test.ts && npm run test:e2e -- tests/e2e/audio-settings.spec.ts`

Expected: all channel, lifecycle, persistence, and silent-fallback assertions pass.

- [ ] **Step 6: Commit**

```bash
git add src/audio src/game/scenes/WorldScene.ts src/ui/panels/SettingsPanel.ts tests/helpers/FakeAudioPort.ts tests/unit/audio-director.test.ts tests/e2e/audio-settings.spec.ts
git commit -m "feat: add original adaptive audio"
```

### Task 15: Save-slot UI, recovery, offline startup, and runtime error boundary

**Files:**
- Create: `src/ui/panels/SavePanel.ts`
- Create: `src/app/ErrorBoundary.ts`
- Create: `src/storage/AutosaveCoordinator.ts`
- Create: `tests/helpers/RecordingSaveRepository.ts`
- Create: `src/service-worker.ts`
- Create: `public/manifest.webmanifest`
- Modify: `src/game/scenes/MenuScene.ts`
- Modify: `src/game/scenes/WorldScene.ts`
- Modify: `vite.config.ts`
- Modify: `index.html`
- Test: `tests/e2e/save-recovery.spec.ts`
- Test: `tests/e2e/offline.spec.ts`
- Test: `tests/integration/autosave.test.ts`

**Interfaces:**
- Consumes: `SaveRepository`, world autosave signals, load errors, and asset/content errors.
- Produces: three-slot menu actions, `AutosaveCoordinator.request(reason)`, recording repository fixture, downloadable JSON export, validated file import, backup restore, offline precache, and recoverable runtime error UI.

- [ ] **Step 1: Write failing autosave and browser recovery tests**

```ts
it('saves after map change, quest stage, death respawn, and return to menu', async () => {
  const repository = new RecordingSaveRepository();
  const autosave = new AutosaveCoordinator(repository, () => completeSave({ slot: 1 }));
  for (const reason of ['map-change', 'quest-stage', 'death-respawn', 'return-menu'] as const) await autosave.request(reason);
  expect(repository.putReasons).toEqual(['map-change', 'quest-stage', 'death-respawn', 'return-menu']);
});
```

E2E must export a slot, mutate progress, import the prior file, verify restoration, reject corrupt JSON without changing the slot, restore backup, delete only after confirmation, reload offline, and recover from an injected renderer exception without losing the last good save.

- [ ] **Step 2: Verify failures**

Run: `npm test -- tests/integration/autosave.test.ts && npm run test:e2e -- tests/e2e/save-recovery.spec.ts tests/e2e/offline.spec.ts`

Expected: FAIL because coordination, UI, service worker, and error boundary are absent.

- [ ] **Step 3: Implement serialized autosave and slot controls**

Coalesce simultaneous autosave requests into one queued write, never save during an unresolved combat transaction, and show a subtle success/failure indicator. Slot cards display name, class, level, location, updated time, and ending state. Import validates before confirmation; delete requires slot-name confirmation; backup restore shows both timestamps.

- [ ] **Step 4: Implement offline precache and recovery boundary**

Precache the production HTML, JS, CSS, manifest, JSON, maps, sprites, and font assets under a cache named with `GAME_VERSION`. On activation delete only older project cache names. ErrorBoundary pauses the scene, triggers a best-effort save, logs the stack in development, and presents `返回主選單`, `載入最近存檔`, and `匯出診斷資料` actions in Traditional Chinese.

Configure Vite PWA with an injected project service worker:

```ts
// vite.config.ts additions
import { VitePWA } from 'vite-plugin-pwa';

plugins: [
  VitePWA({
    strategies: 'injectManifest',
    srcDir: 'src',
    filename: 'service-worker.ts',
    injectRegister: 'auto',
    manifest: false,
    injectManifest: {
      globPatterns: ['**/*.{html,js,css,json,png,webmanifest}'],
      maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
    },
  }),
],
```

```ts
// src/service-worker.ts
/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') void self.skipWaiting();
});
```

Add `<link rel="manifest" href="/manifest.webmanifest" />` and `<meta name="theme-color" content="#17140f" />` to `index.html`. Use this complete initial manifest:

```json
{
  "name": "說話之島單機致敬版",
  "short_name": "說話之島",
  "lang": "zh-Hant",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#080b0a",
  "theme_color": "#17140f",
  "description": "2000–2003 台灣早期天堂說話之島風格的單機致敬遊戲"
}
```

- [ ] **Step 5: Verify save and offline guarantees**

Run: `npm test -- tests/integration/autosave.test.ts tests/integration/save-repository.test.ts && npm run build && npm run test:e2e -- tests/e2e/save-recovery.spec.ts tests/e2e/offline.spec.ts`

Expected: save/recovery tests pass and the built game starts in a browser context with network disabled after one warm load.

- [ ] **Step 6: Commit**

```bash
git add src/ui/panels/SavePanel.ts src/app/ErrorBoundary.ts src/storage/AutosaveCoordinator.ts src/service-worker.ts public/manifest.webmanifest src/game/scenes/MenuScene.ts src/game/scenes/WorldScene.ts vite.config.ts index.html tests/helpers/RecordingSaveRepository.ts tests/e2e/save-recovery.spec.ts tests/e2e/offline.spec.ts tests/integration/autosave.test.ts
git commit -m "feat: add save recovery and offline play"
```

### Task 16: Full content integration, four-class balance, and complete playthrough

**Files:**
- Create: `tests/helpers/PlaythroughDriver.ts`
- Create: `tests/integration/full-playthrough.test.ts`
- Create: `tests/e2e/full-playthrough.spec.ts`
- Modify: `src/content/data/classes.json`
- Modify: `src/content/data/items.json`
- Modify: `src/content/data/abilities.json`
- Modify: `src/content/data/monsters.json`
- Modify: `src/content/data/npcs.json`
- Modify: `src/content/data/quests.json`
- Modify: `public/assets/maps/*.map.json`

**Interfaces:**
- Consumes: the complete public game APIs and content catalog.
- Produces: deterministic `PlaythroughDriver` actions and evidence that every class can finish the six-stage main line and resume free exploration.

- [ ] **Step 1: Write the failing four-class simulation**

```ts
for (const classId of ['prince', 'knight', 'elf', 'wizard'] as const) {
  it(`${classId} completes Talking Island and continues exploring`, () => {
    const game = PlaythroughDriver.newGame(classId, 20260717);
    game.completeTraining();
    game.completeVillageRegistration();
    game.completeFieldSupplies();
    game.completeBlackKnightAssault();
    game.completeDungeonSeal();
    game.defeatBaphomet();
    game.completeFinalReport();
    expect(game.state.world.flags.endingComplete).toBe(true);
    expect(game.state.character.level).toBeGreaterThanOrEqual(12);
    expect(game.canEnter('north-field')).toBe(true);
  });
}
```

- [ ] **Step 2: Verify the simulation exposes balance/content gaps**

Run: `npm test -- tests/integration/full-playthrough.test.ts`

Expected: FAIL with exact unreachable objective, resource shortage, invalid reference, or combat wall that prevents one or more classes from finishing.

- [ ] **Step 3: Implement a deterministic public-action driver**

The driver may issue only operations available to a player: move, interact, attack, cast, use item, equip, buy, sell, deposit, withdraw, accept quest, choose dialogue, and transition through exits. It must not mutate state directly, grant items, teleport past locked gates, set flags, or bypass combat.

- [ ] **Step 4: Balance all four legal routes**

Tune only content values: spawn density, experience, prices, drops, damage, AC, HP/MP, potion availability, arrow availability, spell costs, and quest rewards. Each class must complete at level 12–15 with at least one viable equipment progression, without requiring more than 25 repeated kills of the same normal monster at a single stage. Baphomet must require preparation but remain winnable by every class without an undocumented exploit.

- [ ] **Step 5: Add a real-browser golden-path run**

Browser E2E uses the knight route to create a character, train, buy supplies, complete the black-knight event, traverse both dungeon floors, defeat Baphomet, report to the village, reload the save, and move in free-exploration state. Use deterministic E2E seed and accelerated animation speed, but do not change combat outcomes or quest requirements.

- [ ] **Step 6: Verify content and all playthroughs**

Run: `npm test -- tests/content tests/integration/full-playthrough.test.ts && npm run test:e2e -- tests/e2e/full-playthrough.spec.ts`

Expected: all four simulated classes and the visible browser golden path finish, reload, and continue exploring.

- [ ] **Step 7: Commit**

```bash
git add src/content/data public/assets/maps tests/helpers/PlaythroughDriver.ts tests/integration/full-playthrough.test.ts tests/e2e/full-playthrough.spec.ts
git commit -m "feat: complete and balance talking island campaign"
```

### Task 17: Visual baselines, release verifier, documentation, and final audit

**Files:**
- Create: `tests/visual/visual-baselines.spec.ts`
- Create: `tests/visual/*.png`
- Create: `tests/helpers/openFixture.ts`
- Create: `scripts/build-content-index.ts`
- Create: `scripts/verify-release.mjs`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `README.todo`
- Create: `docs/memory/2026-07-17-talking-island-release.md`

**Interfaces:**
- Consumes: production build, all automated suites, content catalog, and approved design requirements.
- Produces: reproducible visual snapshots, `openFixture(page, screen)`, `npm run verify`, a release audit report, and complete operator/player documentation.

- [ ] **Step 1: Write failing visual and release checks**

```ts
for (const screen of ['menu', 'character-create', 'village', 'north-field', 'black-knight-area', 'dungeon-1', 'dungeon-2', 'inventory', 'spells', 'shop', 'settings']) {
  test(`${screen} matches its approved 640x480 baseline`, async ({ page }) => {
    await openFixture(page, screen);
    await expect(page.getByTestId('game-root')).toHaveScreenshot(`${screen}.png`, { animations: 'disabled' });
  });
}
```

Release verifier must fail if a required document is missing, `AGENTS.md` is not a symlink, content counts fall below contract, production `dist/index.html` is missing, or the built tree contains unlicensed asset-manifest entries.

- [ ] **Step 2: Verify failures and inspect every first-run screenshot**

Run: `npm run test:e2e -- tests/visual/visual-baselines.spec.ts --update-snapshots`

Expected: snapshots are created for manual inspection; treat clipping, unreadable text, incorrect Z-order, collision mismatch, blurred pixels, HUD obstruction, or copied visual identity as failure, not as an accepted baseline.

- [ ] **Step 3: Fix visual defects and freeze approved baselines**

Inspect all eleven baseline PNGs at original resolution. Correct code/assets, regenerate screenshots, and rerun without `--update-snapshots`. Also test browser viewports `800×600`, `1280×720`, and `1920×1080`; the logical canvas remains 640×480, stays centered, and preserves integer-like pixel presentation without UI clipping.

- [ ] **Step 4: Implement content index and release verifier**

`build-content-index.ts` writes a deterministic summary of class, item, ability, NPC, monster, quest, and map IDs for review. `verify-release.mjs` executes document/symlink checks, invokes lint/typecheck/tests/build/E2E in order, scans the built asset manifest, and exits nonzero on the first failed gate while preserving that command's output.

```json
{
  "scripts": {
    "content:index": "tsx scripts/build-content-index.ts",
    "verify:release": "node scripts/verify-release.mjs"
  }
}
```

`tsx` is already pinned by Task 1; use it without changing the dependency graph.

- [ ] **Step 5: Synchronize project documents**

README must contain install, development, production preview, controls, three-slot save/import/export, offline warm-load behavior, troubleshooting, asset-license statement, and full verification commands. CLAUDE must match the final directory tree, module boundaries, content schema, save version, fixed simulation step, and testing strategy. Move every completed README.todo item to `## Archive`. Record final architectural decisions, balance constraints, verification evidence, and known non-blocking limitations in the release memory.

- [ ] **Step 6: Run the complete release audit**

Run: `npm run verify:release`

Expected: lint, typecheck, unit, content, integration, production build, E2E, visual, documents, symlink, content counts, and licensed-asset gates all pass with exit code 0.

- [ ] **Step 7: Perform a clean manual smoke test**

Run: `npm run build && npm run preview -- --host 127.0.0.1`

Expected: from a new browser profile, create a character, move, fight, interact, use a quick slot, open every panel, save, reload, export, import, enter a dungeon, pause by hiding the tab, and return to menu with no unhandled console error.

- [ ] **Step 8: Commit the release evidence**

```bash
git add package.json package-lock.json tests/helpers/openFixture.ts tests/visual scripts README.md CLAUDE.md AGENTS.md README.todo docs/memory
git commit -m "test: verify complete talking island release"
```

## Requirement Coverage Audit

| Design requirement | Implementing tasks | Authoritative evidence |
| --- | --- | --- |
| Four classes and six attributes | 2, 5, 10, 16 | stats tests, content tests, four-class playthrough |
| Combat, spells, arrows, potions, death | 3, 4, 7, 11 | unit combat and browser combat flow |
| Seven connected regions | 5, 6, 13 | reachability tests and visual baselines |
| NPC, shop, warehouse, dialogue, quests | 4, 8, 12, 16 | integration and panel E2E |
| Minimum content counts | 5, 16 | schema/count/reference tests |
| Early 640×480 interface and all controls | 10–13 | input tests, HUD E2E, screenshots |
| Original legal art and audio | 13, 14, 17 | asset manifest test and release scan |
| Three versioned save slots and recovery | 9, 15 | repository tests and recovery E2E |
| Offline browser delivery | 15, 17 | production offline E2E |
| Baphomet ending and free exploration | 8, 16 | four-class and browser full playthrough |
| Traditional Chinese errors and pause-on-hide | 11, 14, 15 | lifecycle and recovery E2E |
| Full automated and visual verification | 17 | `npm run verify:release` |

## Implementation Order and Checkpoints

Execute Tasks 1–17 in order because later interfaces consume earlier ones. After Tasks 1, 6, 12, 16, and 17, stop for a checkpoint review of the actual build, tests, scope coverage, and worktree before continuing. A passing checkpoint never removes later tasks from the completion definition.
