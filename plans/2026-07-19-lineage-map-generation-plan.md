# Lineage Map Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task with verification checkpoints.

**Goal:** Replace the broken oversized map repetition with original 8×8 terrain atlases that render as 16px playable terrain while preserving the existing map JSON rules.

**Architecture:** Keep `.map.json` collision, exits, NPC anchors, quest anchors, boss anchors, safe tiles, and spawn zones authoritative. Add two project-original terrain atlases to the existing asset manifest, extract their 8×8 frames in `MapPresenter`, and apply a tile scale from source-cell pixels to the existing `TILE_SIZE`. Runtime entities remain separate Phaser objects.

**Tech Stack:** TypeScript `5.9`, Phaser `3.90`, Vite `8.1`, Vitest `4.1`, Playwright `1.61`, built-in image generation, PNG raster assets.

## Global Constraints

- Keep the game desktop Chromium-only and the Phaser logical viewport fixed at `640×480`.
- Keep the world grid at `16px` per map cell and preserve pixelated scaling.
- Keep all map collision and reachability data in `public/assets/maps/*.map.json`; never infer collision from a bitmap.
- Use only project-original or legally redistributable assets; online Lineage maps are visual references only.
- Do not add dependencies, add playable zones, change domain rules, or delete the legacy map sheets in this slice.
- Do not mix the pre-existing production campaign `completeEnding` timeout into this map change.
- Use `npm run content:index` only when content JSON changes; this implementation does not change content IDs.

---

## File Map

- Create: `public/assets/maps/terrain-overworld-v2.png` — original 8×8 overworld terrain atlas.
- Create: `public/assets/maps/terrain-dungeon-v2.png` — original 8×8 dungeon terrain atlas.
- Modify: `src/content/data/assets.json` — point existing `map-*` entries to the new atlas groups and paths.
- Modify: `src/content/assets.ts` — allow the new project asset paths.
- Modify: `src/game/systems/MapPresenter.ts` — centralize atlas layout and apply `setTileScale`.
- Modify: `tests/unit/map-presenter.test.ts` — test valid and invalid atlas layout calculations.
- Modify: `tests/content/assets.test.ts` — update the planned raster-path contract.
- Modify: `CODEX_HANDOFF.md` — record implementation, verification, and remaining risks.
- Create: `docs/memory/2026-07-19-lineage-map-generation.md` — preserve release evidence and asset boundary.

## Task 1: Generate and inspect the terrain atlases

**Files:**

- Create: `public/assets/maps/terrain-overworld-v2.png`
- Create: `public/assets/maps/terrain-dungeon-v2.png`

**Interfaces:**

- Produces two `1024×1024` PNGs, each divided into an exact `8×8` grid of `128×128` full-bleed cells.
- Cell indices used by the current manifest remain stable: overworld `0–4`, dungeon `0–1`.

- [x] **Step 1: Generate the overworld atlas with the built-in image tool**

Use one coherent prompt with this asset contract:

```text
Create a project-original 8x8 terrain texture atlas for a desktop pixel-art fantasy RPG.
Use case: game terrain atlas.
Asset type: a 1024x1024 raster atlas divided into exactly 8 columns and 8 rows; every cell is exactly 128x128 pixels.
Scene/backdrop: flat top-down terrain tiles, not an isometric map and not a world-map illustration.
Cells 0-4: dark grass, forest grass, dirt field, packed road, damp coastal ground with subtle shoreline texture.
Style/medium: restrained early-2000s MMORPG-inspired pixel art, original shapes and colors, readable when reduced to 16x16.
Composition: every cell fully fills its square, no gutters, no grid lines, no labels, no objects, no characters, no buildings, no UI.
Lighting/mood: muted green, brown, slate, and sea-blue palette with clear value separation.
Constraints: keep all 64 cells as clean square textures; make cells tile-friendly on all four edges; no logos, no text, no watermark, no copied game asset.
Avoid: isometric diamonds, raised platforms, perspective, props, shadows outside the tile, transparent gaps, borders, guide marks, and non-square cells.
```

- [x] **Step 2: Generate the dungeon atlas with the built-in image tool**

Use the same contract, changing only the terrain set:

```text
Create a project-original 8x8 terrain texture atlas for a desktop pixel-art fantasy RPG.
Use case: game dungeon terrain atlas.
Asset type: a 1024x1024 raster atlas divided into exactly 8 columns and 8 rows; every cell is exactly 128x128 pixels.
Scene/backdrop: flat top-down dungeon floor tiles, not an isometric map and not a room illustration.
Cells 0-1: dark dungeon stone and damp cracked stone with restrained blue-gray variation.
Style/medium: restrained early-2000s MMORPG-inspired pixel art, original shapes and colors, readable when reduced to 16x16.
Composition: every cell fully fills its square, no gutters, no grid lines, no labels, no objects, no characters, no UI.
Lighting/mood: charcoal stone, muted iron, damp blue-gray, and small controlled cyan accents.
Constraints: keep all 64 cells as clean square textures; make cells tile-friendly on all four edges; no logos, no text, no watermark, no copied game asset.
Avoid: isometric diamonds, raised platforms, perspective, props, torches, doors, symbols, transparent gaps, borders, guide marks, and non-square cells.
```

- [x] **Step 3: Copy only the selected generated outputs into the workspace**

Place the inspected final files at the two exact paths above. Do not overwrite `tiles-overworld.png` or `tiles-dungeon.png`.

- [x] **Step 4: Inspect dimensions and cell boundaries**

Run:

```bash
file public/assets/maps/terrain-overworld-v2.png public/assets/maps/terrain-dungeon-v2.png
```

Expected: both files report `PNG image data, 1024 x 1024`.

Inspect both files with the image viewer. Reject and regenerate a single atlas if it has visible gutters, perspective diamonds, labels, watermarks, or cell drift. Do not continue to code integration until both images satisfy the atlas contract.

- [x] **Step 5: Commit the asset-only slice**

```bash
git add public/assets/maps/terrain-overworld-v2.png public/assets/maps/terrain-dungeon-v2.png
git commit -m "feat: add original terrain atlases"
```

## Task 2: Add a tested atlas layout contract

**Files:**

- Modify: `src/game/systems/MapPresenter.ts`
- Test: `tests/unit/map-presenter.test.ts`

**Interfaces:**

- Produces `terrainAtlasLayout(sourceWidth, sourceHeight, tileSize = TILE_SIZE): TerrainAtlasLayout | null`.
- `TerrainAtlasLayout` contains `cellWidth`, `cellHeight`, `tileScaleX`, and `tileScaleY`.
- The fixed atlas layout uses `8` columns and `8` rows.

- [x] **Step 1: Write the failing layout tests**

Add these imports and tests to `tests/unit/map-presenter.test.ts`:

```ts
import {
  nearestNpcId,
  normalizeMapPresentation,
  npcInteractionForRole,
  terrainAtlasLayout,
  type MapAsset,
  type PresentedNpc,
} from '../../src/game/systems/MapPresenter';

describe('terrain atlas layout', () => {
  it('maps a 1024px 8x8 atlas to 16px world tiles', () => {
    expect(terrainAtlasLayout(1024, 1024)).toEqual({
      cellWidth: 128,
      cellHeight: 128,
      tileScaleX: 0.125,
      tileScaleY: 0.125,
    });
  });

  it('keeps non-square source dimensions independently scaled', () => {
    expect(terrainAtlasLayout(1536, 1024)).toEqual({
      cellWidth: 192,
      cellHeight: 128,
      tileScaleX: 16 / 192,
      tileScaleY: 0.125,
    });
  });

  it('rejects an empty or undersized source image', () => {
    expect(terrainAtlasLayout(0, 1024)).toBeNull();
    expect(terrainAtlasLayout(1024, 0)).toBeNull();
    expect(terrainAtlasLayout(7, 7)).toBeNull();
  });
});
```

- [x] **Step 2: Run the focused test and confirm the expected failure**

Run:

```bash
npm test -- tests/unit/map-presenter.test.ts
```

Expected: FAIL because `terrainAtlasLayout` is not exported yet.

- [x] **Step 3: Implement the smallest pure helper**

Add this contract near `TILE_SIZE` in `src/game/systems/MapPresenter.ts`:

```ts
const TERRAIN_ATLAS_COLUMNS = 8;
const TERRAIN_ATLAS_ROWS = 8;

export interface TerrainAtlasLayout {
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly tileScaleX: number;
  readonly tileScaleY: number;
}

export const terrainAtlasLayout = (
  sourceWidth: number,
  sourceHeight: number,
  tileSize = TILE_SIZE,
): TerrainAtlasLayout | null => {
  const cellWidth = Math.floor(sourceWidth / TERRAIN_ATLAS_COLUMNS);
  const cellHeight = Math.floor(sourceHeight / TERRAIN_ATLAS_ROWS);
  if (cellWidth <= 0 || cellHeight <= 0 || tileSize <= 0) return null;
  return {
    cellWidth,
    cellHeight,
    tileScaleX: tileSize / cellWidth,
    tileScaleY: tileSize / cellHeight,
  };
};
```

- [x] **Step 4: Run the focused test and confirm it passes**

```bash
npm test -- tests/unit/map-presenter.test.ts
```

Expected: all `MapPresenter contracts` and `terrain atlas layout` tests pass.

- [x] **Step 5: Commit the pure contract slice**

```bash
git add src/game/systems/MapPresenter.ts tests/unit/map-presenter.test.ts
git commit -m "test: define terrain atlas scaling contract"
```

## Task 3: Fix `MapPresenter` terrain rendering

**Files:**

- Modify: `src/game/systems/MapPresenter.ts:190-225`

**Interfaces:**

- Consumes `terrainAtlasLayout` from Task 2.
- Produces a `TileSprite` whose source cell is scaled to one `TILE_SIZE` world tile.
- Keeps rectangle fallback and all existing terrain region ordering unchanged.

- [x] **Step 1: Replace local cell-size calculation with the tested helper**

Replace the source/frame block in `#renderTerrain` with:

```ts
const layout = terrainAtlasLayout(source.width, source.height);
if (layout === null) return;
const cellX = (entry.frame % TERRAIN_ATLAS_COLUMNS) * layout.cellWidth;
const cellY = Math.floor(entry.frame / TERRAIN_ATLAS_COLUMNS) * layout.cellHeight;
const frame = `${textureKey}:map-cell`;
if (!texture.has(frame)) {
  texture.add(
    frame,
    0,
    cellX,
    cellY,
    layout.cellWidth,
    layout.cellHeight,
  );
}
if (!texture.has(frame)) return;
const tiles = this.#scene.add
  .tileSprite(x, y, width, height, entry.group, frame)
  .setOrigin(0)
  .setDepth(depth + 1)
  .setAlpha(0.88)
  .setTileScale(layout.tileScaleX, layout.tileScaleY);
this.#objects.push(tiles);
```

The constants `TERRAIN_ATLAS_COLUMNS` and `TERRAIN_ATLAS_ROWS` remain module-level so frame extraction and layout calculation cannot silently use different grids.

- [x] **Step 2: Run typecheck and the focused tests**

```bash
npm run typecheck
npm test -- tests/unit/map-presenter.test.ts
```

Expected: both commands exit `0`; no Phaser type error for `setTileScale`.

- [x] **Step 3: Commit the renderer fix**

```bash
git add src/game/systems/MapPresenter.ts
git commit -m "fix: scale terrain atlas tiles to the world grid"
```

## Task 4: Wire the new atlases into the manifest

**Files:**

- Modify: `src/content/data/assets.json:803-849`
- Modify: `src/content/assets.ts:8-23`
- Modify: `tests/content/assets.test.ts:16-32, 48-58`

**Interfaces:**

- Existing `map-*` keys remain unchanged; frame assignments may be remapped within the atlas when presented-frame QA shows that a terrain cell does not match the map region.
- Overworld entries use `path: "public/assets/maps/terrain-overworld-v2.png"` and `group: "terrain-overworld-v2"`.
- Dungeon entries use `path: "public/assets/maps/terrain-dungeon-v2.png"` and `group: "terrain-dungeon-v2"`.

- [x] **Step 1: Update the asset-path test fixture first**

Replace the two legacy map paths in `plannedPngPaths` with:

```ts
  'public/assets/maps/terrain-overworld-v2.png',
  'public/assets/maps/terrain-dungeon-v2.png',
```

Rename the test description from `uses exactly the fourteen PNG paths planned for Task 13` to `uses exactly the fourteen planned project PNG paths`.

- [x] **Step 2: Run the asset tests and confirm the expected failure**

```bash
npm test -- tests/content/assets.test.ts
```

Expected: FAIL because the manifest still points at the legacy map paths.

- [x] **Step 3: Update the manifest allow-list and map entries**

In `src/content/assets.ts`, replace the two legacy paths in `plannedPaths` with the two `v2` paths. In `src/content/data/assets.json`, change only the seven map entries:

```json
{
  "key": "map-talking-island-village",
  "path": "public/assets/maps/terrain-overworld-v2.png",
  "group": "terrain-overworld-v2",
  "frame": 0,
  "license": "project-original"
}
```

Use the same overworld path/group for `map-scarecrow-field` frame `1` and `map-north-field` frame `2`. Use the coastal cell for `map-coast` frame `4`, and the soil/burnt-compatible cell for `map-black-knight-area` frame `2`; this mapping is intentionally validated by the presented-frame gate. Use the dungeon path/group for dungeon floor 1 frame `0` and floor 2 frame `1`.

- [x] **Step 4: Run the asset tests and content validation**

```bash
npm test -- tests/content/assets.test.ts tests/content/schema.test.ts tests/content/references.test.ts
```

Expected: all asset, schema, and reference tests pass; every manifest entry remains `project-original`.

- [x] **Step 5: Commit the manifest slice**

```bash
git add src/content/data/assets.json src/content/assets.ts tests/content/assets.test.ts
git commit -m "feat: wire original terrain atlases into map assets"
```

## Task 5: Run map reachability and presented-frame QA

**Files:**

- Modify: `tests/visual/visual-baselines.spec.ts-snapshots/*.png` only if the reviewed rendered frame changes as expected.

**Interfaces:**

- Consumes the complete atlas, renderer, and manifest slices from Tasks 1–4.
- Produces reviewed visual baselines and evidence that world entities still align with the existing grid.

- [x] **Step 1: Run deterministic map and unit checks**

```bash
npm test -- tests/unit/map-presenter.test.ts tests/content/assets.test.ts tests/content/reachability.test.ts
```

Expected: all focused tests pass.

- [x] **Step 2: Build the production bundle**

```bash
npm run build
```

Expected: Vite production build exits `0`; existing bundle-size and PWA deprecation warnings may remain documented.

- [x] **Step 3: Refresh only the affected visual baselines**

```bash
npx playwright test tests/visual/visual-baselines.spec.ts --workers=1 --update-snapshots
```

Inspect the resulting `village`, `north-field`, `coast`, `black-knight-area`, `dungeon-1`, and `dungeon-2` screenshots. Accept only frames with no giant repeated diamonds, no atlas gutters, correct player/NPC/monster placement, and unchanged HUD/panel layout.

- [x] **Step 4: Re-run visual tests without snapshot updates**

```bash
npx playwright test tests/visual/visual-baselines.spec.ts --workers=1
```

Expected: all visual baseline tests pass.

- [x] **Step 5: Run the non-campaign browser gate**

```bash
npx playwright test --grep-invert "seven-stage" --workers=1
```

Expected: all non-campaign browser tests pass. The known `completeEnding` timeout remains out of scope.

- [x] **Step 6: Commit reviewed visual baselines**

```bash
git add tests/visual/visual-baselines.spec.ts-snapshots
git commit -m "test: refresh map visual baselines"
```

## Task 6: Record delivery evidence and finish the release checks

**Files:**

- Modify: `CODEX_HANDOFF.md`
- Create: `docs/memory/2026-07-19-lineage-map-generation.md`

**Interfaces:**

- Consumes all verified implementation and visual evidence from Tasks 1–5.
- Produces durable project-local handoff and release evidence without changing gameplay behavior.

- [x] **Step 1: Record the actual changed files and commands**

The memory entry must record the generated atlas dimensions, the `MapPresenter` root cause and fix, the exact test commands, the non-campaign result, and the known campaign timeout boundary. It must state that online maps were references only and all committed atlas entries are `project-original`.

- [x] **Step 2: Update `CODEX_HANDOFF.md`**

Move the phase from `design` to `asset`/`development`, list the atlas and renderer files, record actual pass/fail evidence, and set the next safest task to a separate map polish or campaign-timeout investigation. Do not claim the full `npm run verify` passed if the known campaign timeout remains.

- [x] **Step 3: Run the final release checks**

```bash
git diff --check
npm run lint
npm run typecheck
npm run verify:release
```

Expected: all commands exit `0`; `verify:release` confirms the manifest, required documents, content floors, and `project-original` license boundary.

- [x] **Step 4: Commit the evidence slice**

```bash
git add CODEX_HANDOFF.md docs/memory/2026-07-19-lineage-map-generation.md
git commit -m "docs: record lineage map repair evidence"
```

## Self-review checklist

- [x] The plan covers the spec's two atlas files, 8×8／128px cell contract, 16px runtime scale, manifest boundary, collision boundary, fallback behavior, visual checks, and handoff evidence.
- [x] Every referenced helper name and property is defined before later tasks consume it.
- [x] The plan does not require deleting legacy assets or changing domain rules.
- [x] The plan keeps the known production campaign timeout outside this map slice.
- [x] The plan contains no placeholder step or unbounded refactor.
