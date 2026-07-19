# Isometric Village First-frame Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce and approve one real Phaser-rendered isometric Talking Island village frame, then activate the same projection, atlas, actor anchoring, pointer mapping, camera, and classic HUD in the normal game without changing domain rules.

**Architecture:** Phase A is a query-gated vertical slice limited to five production files: one project-original atlas, a focused preview presenter, BootScene loading, WorldScene routing, and preview-only HUD CSS. After the user approves that real Chromium frame, Phase B moves the approved visual contract into the normal asset manifest, a shared world projection, MapPresenter, EntityRenderer, WorldScene input/camera wiring, and Hud DOM/CSS; the preview path is then removed.

**Tech Stack:** TypeScript `5.9`, Phaser `3.90`, Vite `8.1`, Vitest `4.1`, Playwright `1.61`, PNG raster assets, CSS.

## Global Constraints

- Keep the Phaser logical viewport exactly `640×480`.
- The approved world camera viewport is `640×384` and the bottom HUD is `640×96`.
- The isometric projection uses a `32×16` diamond: `screenX = originX + (x - y) * 16` and `screenY = originY + (x + y) * 8`.
- Keep the existing orthogonal integer grid, A*, collision, NPC anchors, proximity, combat, quests, save schema, and `GameSession` authoritative.
- Do not add dependencies or modify `src/core/`, `src/world/` domain rules, or `src/storage/`.
- Use only project-original or legally redistributable assets. Do not copy Lineage client pixels, maps, logos, fonts, or trade dress.
- Do not generate atlases for the other six maps in this plan.
- Before the Phase A user visual-approval gate, modify no more than five production files and run no full test suite.
- A missing atlas, missing frame, or invalid `presentationLayer` must atomically select the existing orthogonal presenter for terrain, actors, camera, and pointer input.
- Preserve the existing uncommitted `CLAUDE.md`, `CODEX_HANDOFF.md`, `README.md`, `package-lock.json`, `.agents/`, `.gitignore`, and `.vscode/` changes. Stage only exact task paths.
- Use `apply_patch` for source and documentation edits. Generated PNGs and Playwright screenshots are tool outputs.

---

## File Map

### Phase A: first-frame candidate before visual approval

- Create: `public/assets/maps/isometric-village-v1.png` — one project-original `4×4` isometric village atlas.
- Create: `src/game/systems/IsometricVillagePreview.ts` — isolated Phaser preview renderer and its pure coordinate helpers.
- Modify: `src/game/scenes/BootScene.ts` — query-gated preview atlas load and `4×4` frame registration.
- Modify: `src/game/scenes/WorldScene.ts` — query-gated preview routing, `640×384` preview camera, and cleanup.
- Modify: `src/ui/styles.css` — query-gated classic-frame HUD skin used only by the preview.
- Create: `tests/unit/isometric-village-preview.test.ts` — preview projection, terrain, and depth contracts.
- Create: `tests/visual/isometric-village-first-frame.spec.ts` — deterministic real Chromium capture with console and layout assertions.

### Phase B: normal-game activation after visual approval

- Create: `src/game/systems/WorldProjection.ts` — shared orthogonal and `2:1` isometric transforms, bounds, inverse pointer mapping, and depth.
- Create: `tests/unit/world-projection.test.ts` — projection round-trip, bounds, rejection, and ordering.
- Modify: `src/content/data/assets.json` — add optional presentation key `map-village-isometric` while preserving the orthogonal `map-talking-island-village` fallback entry.
- Modify: `src/content/assets.ts` — allow the new project-original path.
- Modify: `tests/content/assets.test.ts` — enforce the new manifest path and file.
- Modify: `tests/e2e/animation-effects.spec.ts` — verify the new PNG loads with nonzero dimensions.
- Modify: `src/game/systems/SpriteAtlas.ts` — `4×4` village atlas cells and uniform sprite fitting.
- Modify: `tests/unit/sprite-atlas.test.ts` — exact cell and aspect-ratio contracts.
- Modify: `src/game/scenes/BootScene.ts` — replace preview-only registration with manifest-driven frame registration.
- Modify: `public/assets/maps/village.map.json` — add presentation-only atlas mapping and prop placements.
- Modify: `src/game/systems/MapPresenter.ts` — validate and render the isometric layer or select an atomic orthogonal fallback.
- Modify: `tests/unit/map-presenter.test.ts` — presentation normalization, frame requirements, terrain precedence, and fallback inputs.
- Modify: `src/game/systems/EntityRenderer.ts` — project player, monsters, and loot through the active projection.
- Modify: `src/game/scenes/WorldScene.ts` — normal camera, pointer inverse mapping, projection diagnostics, and preview removal.
- Create: `tests/e2e/isometric-village.spec.ts` — normal-game camera and real canvas pointer regression.
- Modify: `src/ui/Hud.ts` — `640×384` semantics and an in-frame system-controls host.
- Modify: `src/ui/styles.css` — activate the approved classic-frame skin globally.
- Modify: `tests/unit/ui-panels.test.ts` — HUD DOM semantics.
- Modify: `tests/e2e/hud-panels.spec.ts` — visible atlas layer and in-frame control bounds.
- Modify: `tests/visual/visual-baselines.spec.ts-snapshots/*.png` — only snapshots affected by the approved village/HUD presentation.
- Create: `tests/visual/isometric-village-first-frame.spec.ts-snapshots/isometric-village-first-frame-chromium-darwin.png` — approved first-frame baseline.
- Create: `docs/memory/2026-07-19-isometric-village-first-frame.md` — actual frame and verification evidence.
- Modify without staging unrelated hunks: `CLAUDE.md` and `CODEX_HANDOFF.md` — current projection and handoff truth.

---

## Phase A — Actual Target-engine First-frame

### Task 1: Generate the single village atlas

**Files:**

- Create: `public/assets/maps/isometric-village-v1.png`
- Reference: `public/assets/maps/tiles-overworld.png`
- Reference: `docs/specs/2026-07-19-isometric-village-first-frame-design.md`

**Interfaces:**

- Consumes: the approved `4×4`, `1024×1024` atlas contract.
- Produces: sixteen `256×256` cells at `public/assets/maps/isometric-village-v1.png`; cells `0–7` are ground diamonds and cells `8–15` are props.

- [ ] **Step 1: Generate one project-original atlas through the imagegen skill**

Use `public/assets/maps/tiles-overworld.png` as the local visual reference and submit this exact prompt:

```text
Create a project-original pixel-art isometric village atlas for a desktop fantasy RPG.
Output: one 1024x1024 transparent PNG divided into exactly 4 columns and 4 rows; every cell is exactly 256x256 pixels.
Projection: fixed 2:1 isometric. Every ground diamond has a 128x64 footprint centered in its cell and must remain readable when the whole cell is rendered at 0.25 scale.
Style reference: use the attached project-original tiles-overworld image only for restrained early-2000s MMORPG pixel density, muted olive green, earth brown, gray stone, wood, and blue-gray roof language. Do not copy any object pixel-for-pixel.
Cell 0: seamless olive grass diamond.
Cell 1: seamless gray stone plaza diamond.
Cell 2: packed earth road diamond.
Cell 3: road crossing diamond.
Cell 4: grass-to-road transition diamond.
Cell 5: stone-to-road transition diamond.
Cell 6: grass-to-stone transition diamond.
Cell 7: sparse dirt accent diamond.
Cell 8: small timber-and-stone cottage, front-right view, complete silhouette.
Cell 9: second cottage with blue-gray roof, distinct silhouette.
Cell 10: broadleaf village tree.
Cell 11: short wooden fence segment.
Cell 12: round stone well.
Cell 13: stacked wooden crates.
Cell 14: wooden signpost.
Cell 15: small iron-and-wood village lamp.
Each cell contains exactly one complete item, centered with clear transparent margins. Props use a feet/base anchor near x=128, y=224 within their cell.
No gutters, grid lines, labels, text, logo, watermark, characters, monsters, UI, cast shadow outside a cell, dark backdrop, green screen, magenta screen, or copied game asset.
```

Expected: a transparent PNG candidate with all sixteen cells complete and aligned.

- [ ] **Step 2: Copy only the selected generated output to the exact runtime path**

Use the image-generation result as `public/assets/maps/isometric-village-v1.png`. Do not overwrite `tiles-overworld.png` or either `terrain-*-v2.png` file.

- [ ] **Step 3: Verify dimensions, alpha channel, and cell boundaries**

Run:

```bash
file public/assets/maps/isometric-village-v1.png
sips -g pixelWidth -g pixelHeight public/assets/maps/isometric-village-v1.png
```

Expected: `PNG image data, 1024 x 1024, 8-bit/color RGBA` and both dimensions equal `1024`.

Open the image in the image viewer at original detail. Reject it if any item crosses a `256px` boundary, any ground diamond is not centered, any prop is clipped, or any opaque backdrop remains. Regenerate only this atlas, at most five attempts.

- [ ] **Step 4: Commit the asset-only slice**

```bash
git add public/assets/maps/isometric-village-v1.png
git commit -m "feat: add isometric village first-frame atlas"
```

### Task 2: Build the isolated Phaser preview

**Files:**

- Create: `src/game/systems/IsometricVillagePreview.ts`
- Create: `tests/unit/isometric-village-preview.test.ts`
- Modify: `src/game/scenes/BootScene.ts`
- Modify: `src/game/scenes/WorldScene.ts`

**Interfaces:**

- Consumes: texture `isometric-village-preview` with frame names `isometric-village-preview:frame:0` through `:15` plus existing `class-knight` and NPC frames.
- Produces: `previewGridToScreen(x, y)`, `previewTerrainFrame(x, y)`, `previewDepth(x, y, offset)`, and `IsometricVillagePreview.render(): PreviewFrame`.

- [ ] **Step 1: Write the failing pure preview test**

Create `tests/unit/isometric-village-preview.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  previewDepth,
  previewGridToScreen,
  previewTerrainFrame,
} from '../../src/game/systems/IsometricVillagePreview';

describe('isometric village first-frame preview', () => {
  it('projects the village center through a fixed 32x16 diamond', () => {
    expect(previewGridToScreen(32, 32)).toEqual({ x: 1024, y: 576 });
    expect(previewGridToScreen(33, 32)).toEqual({ x: 1040, y: 584 });
    expect(previewGridToScreen(32, 33)).toEqual({ x: 1008, y: 584 });
  });

  it('selects road over plaza and plaza over grass', () => {
    expect(previewTerrainFrame(32, 32)).toBe(2);
    expect(previewTerrainFrame(24, 24)).toBe(1);
    expect(previewTerrainFrame(18, 18)).toBe(0);
  });

  it('orders feet by projected row and explicit offset', () => {
    expect(previewDepth(33, 32)).toBeGreaterThan(previewDepth(32, 32));
    expect(previewDepth(32, 32, 10)).toBe(previewDepth(32, 32) + 10);
  });
});
```

- [ ] **Step 2: Run the focused test and confirm the import fails**

Run:

```bash
npx vitest run tests/unit/isometric-village-preview.test.ts
```

Expected: FAIL because `IsometricVillagePreview.ts` does not exist.

- [ ] **Step 3: Add the complete isolated preview presenter**

Create `src/game/systems/IsometricVillagePreview.ts`:

```ts
import type Phaser from 'phaser';

const PREVIEW_ATLAS = 'isometric-village-preview';
const PREVIEW_ORIGIN_X = 1_024;
const PREVIEW_ORIGIN_Y = 64;
const PREVIEW_TILE_SCALE = 0.25;

export interface PreviewPoint {
  readonly x: number;
  readonly y: number;
}

export interface PreviewFrame {
  readonly player: PreviewPoint;
  readonly objectCount: number;
}

export const previewGridToScreen = (x: number, y: number): PreviewPoint => ({
  x: PREVIEW_ORIGIN_X + (x - y) * 16,
  y: PREVIEW_ORIGIN_Y + (x + y) * 8,
});

export const previewTerrainFrame = (x: number, y: number): number => {
  if (x >= 28 && x < 36) return 2;
  if (x >= 20 && x < 44 && y >= 20 && y < 44) return 1;
  return 0;
};

export const previewDepth = (x: number, y: number, offset = 0): number =>
  (x + y) * 100 + offset;

const props = [
  { frame: 8, x: 27, y: 28, scale: 0.5, anchorY: 0.88 },
  { frame: 9, x: 37, y: 28, scale: 0.5, anchorY: 0.88 },
  { frame: 10, x: 25, y: 26, scale: 0.4, anchorY: 0.9 },
  { frame: 11, x: 29, y: 25, scale: 0.3, anchorY: 0.82 },
  { frame: 12, x: 32, y: 28, scale: 0.35, anchorY: 0.82 },
  { frame: 13, x: 36, y: 26, scale: 0.3, anchorY: 0.84 },
  { frame: 14, x: 30, y: 30, scale: 0.28, anchorY: 0.86 },
  { frame: 15, x: 34, y: 30, scale: 0.28, anchorY: 0.9 },
] as const;

const actors = [
  { texture: 'player-knight', frame: 'class-knight:frame:0', name: '視覺測試', x: 32, y: 32 },
  { texture: 'npcs', frame: 'npc-balsim:frame:0', name: '巴辛', x: 22, y: 32 },
  { texture: 'npcs', frame: 'npc-pandora:frame:0', name: '潘朵拉', x: 42, y: 32 },
  { texture: 'npcs', frame: 'npc-dorin:frame:0', name: '多林', x: 32, y: 38 },
] as const;

export class IsometricVillagePreview {
  readonly #scene: Phaser.Scene;
  readonly #objects: Phaser.GameObjects.GameObject[] = [];
  #frame: PreviewFrame | null = null;

  constructor(scene: Phaser.Scene) {
    this.#scene = scene;
  }

  render(): PreviewFrame {
    if (this.#frame !== null) return this.#frame;

    for (let y = 18; y <= 46; y += 1) {
      for (let x = 18; x <= 46; x += 1) {
        const point = previewGridToScreen(x, y);
        const frame = PREVIEW_ATLAS + ':frame:' + String(previewTerrainFrame(x, y));
        const tile = this.#scene.add
          .image(point.x, point.y, PREVIEW_ATLAS, frame)
          .setOrigin(0.5)
          .setScale(PREVIEW_TILE_SCALE)
          .setDepth(-100_000 + previewDepth(x, y));
        this.#objects.push(tile);
      }
    }

    for (const prop of props) {
      const point = previewGridToScreen(prop.x, prop.y);
      const image = this.#scene.add
        .image(point.x, point.y, PREVIEW_ATLAS, PREVIEW_ATLAS + ':frame:' + String(prop.frame))
        .setOrigin(0.5, prop.anchorY)
        .setScale(prop.scale)
        .setDepth(previewDepth(prop.x, prop.y));
      this.#objects.push(image);
    }

    for (const actor of actors) {
      const point = previewGridToScreen(actor.x, actor.y);
      const sprite = this.#scene.add.sprite(0, 0, actor.texture, actor.frame).setOrigin(0.5, 1);
      const width = Math.max(1, sprite.frame.realWidth);
      const height = Math.max(1, sprite.frame.realHeight);
      sprite.setScale(Math.min(44 / width, 52 / height));
      const label = this.#scene.add
        .text(0, -sprite.displayHeight - 2, actor.name, {
          color: '#ffe8b0',
          fontSize: '9px',
          stroke: '#17120d',
          strokeThickness: 2,
        })
        .setOrigin(0.5, 1);
      const container = this.#scene.add
        .container(point.x, point.y, [sprite, label])
        .setDepth(previewDepth(actor.x, actor.y, 20));
      this.#objects.push(container);
    }

    this.#frame = {
      player: previewGridToScreen(32, 32),
      objectCount: this.#objects.length,
    };
    return this.#frame;
  }

  destroy(): void {
    this.#objects.forEach((object) => {
      object.destroy();
    });
    this.#objects.length = 0;
    this.#frame = null;
  }
}
```

- [ ] **Step 4: Load and register the preview atlas only for the preview query**

In `BootScene.preload()`, after normal manifest image registration, reuse the method's existing `search` variable and add:

```ts
if (search.get('firstFrame') === '1') {
  this.load.image(
    'isometric-village-preview',
    '/assets/maps/isometric-village-v1.png',
  );
}
```

In `BootScene.create()`, immediately after `this.#registerFramesAndAnimations(this.#manifest);`, add:

```ts
if (new URLSearchParams(window.location.search).get('firstFrame') === '1') {
  const texture = this.textures.get('isometric-village-preview');
  const source = texture.getSourceImage() as { width: number; height: number };
  const cellWidth = Math.floor(source.width / 4);
  const cellHeight = Math.floor(source.height / 4);
  for (let index = 0; index < 16; index += 1) {
    this.#addFrame(
      texture,
      'isometric-village-preview:frame:' + String(index),
      (index % 4) * cellWidth,
      Math.floor(index / 4) * cellHeight,
      cellWidth,
      cellHeight,
    );
  }
}
```

- [ ] **Step 5: Route only `firstFrame=1` through the preview**

In `WorldScene.ts` import `ASSET_LOAD_FAILURES_REGISTRY_KEY` beside the existing BootScene registry constants, import the presenter, and add fields:

```ts
import { IsometricVillagePreview } from '../systems/IsometricVillagePreview';

#firstFramePreviewEnabled = false;
#firstFramePreview: IsometricVillagePreview | null = null;
```

In `create()`, after creating `search`, set:

```ts
this.#firstFramePreviewEnabled = search.get('firstFrame') === '1';
if (this.#firstFramePreviewEnabled) {
  const failures = this.registry.get(
    ASSET_LOAD_FAILURES_REGISTRY_KEY,
  ) as readonly string[] | undefined;
  parent.dataset.firstFramePreview = 'true';
  parent.dataset.firstFrameCamera = '640x384';
  parent.dataset.firstFrameAssetFailures = String(failures?.length ?? 0);
}
```

Replace the camera viewport assignment in `#initialize()` with:

```ts
this.cameras.main.setViewport(
  0,
  0,
  this.#firstFramePreviewEnabled ? 640 : 512,
  this.#firstFramePreviewEnabled ? 384 : 432,
);
```

At the start of the presentation section in `#renderUnsafe()`, after obtaining `snapshot`, add:

```ts
if (this.#firstFramePreviewEnabled) {
  this.#firstFramePreview ??= new IsometricVillagePreview(this);
  const preview = this.#firstFramePreview.render();
  this.cameras.main.centerOn(preview.player.x, preview.player.y);
  this.#syncInputContext(snapshot);
  this.#renderE2EState(snapshot);
  this.#worldUi?.renderHud(this.#hudViewModel(snapshot));
  return;
}
```

In `#destroy()` add:

```ts
this.#firstFramePreview?.destroy();
this.#firstFramePreview = null;
if (this.#root !== null) {
  delete this.#root.dataset.firstFramePreview;
  delete this.#root.dataset.firstFrameCamera;
  delete this.#root.dataset.firstFrameAssetFailures;
}
```

- [ ] **Step 6: Run the focused checks**

```bash
npx vitest run tests/unit/isometric-village-preview.test.ts
npm run typecheck
```

Expected: `3` preview tests pass and TypeScript exits `0`.

- [ ] **Step 7: Commit the isolated preview**

```bash
git add src/game/systems/IsometricVillagePreview.ts tests/unit/isometric-village-preview.test.ts src/game/scenes/BootScene.ts src/game/scenes/WorldScene.ts
git commit -m "feat: add isolated isometric village preview"
```

### Task 3: Skin, capture, and review the real first frame

**Files:**

- Modify: `src/ui/styles.css`
- Create: `tests/visual/isometric-village-first-frame.spec.ts`

**Interfaces:**

- Consumes: `data-first-frame-preview="true"` and `data-first-frame-camera="640x384"` on `#game-root`.
- Produces: query-gated classic-frame HUD styling and a Playwright attachment named `isometric-village-first-frame.png`.

- [ ] **Step 1: Write the failing Chromium layout/capture test**

Create `tests/visual/isometric-village-first-frame.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 720 } });

test('captures the isometric village first-frame candidate', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });

  await page.goto('/?e2e=1&firstFrame=1');
  await page.getByRole('button', { name: '開始新遊戲' }).click();
  await page.getByLabel('角色名稱').fill('視覺測試');
  await page.getByRole('radio', { name: '騎士' }).check();
  await page.getByRole('button', { name: '建立角色' }).click();

  const root = page.getByTestId('game-root');
  await expect(page.getByTestId('world-state')).toHaveAttribute('data-ready', 'true');
  await expect(root).toHaveAttribute('data-first-frame-preview', 'true');
  await expect(root).toHaveAttribute('data-first-frame-camera', '640x384');
  await expect(root).toHaveAttribute('data-first-frame-asset-failures', '0');

  const background = await root.locator('.hud-bottom-bar').evaluate(
    (element) => getComputedStyle(element).backgroundImage,
  );
  expect(background.startsWith('url(')).toBe(true);

  const hudBox = await page.getByTestId('hud-root').boundingBox();
  const controlsBox = await page.locator('.save-controls').boundingBox();
  expect(hudBox).not.toBeNull();
  expect(controlsBox).not.toBeNull();
  if (hudBox !== null && controlsBox !== null) {
    expect(controlsBox.x).toBeGreaterThanOrEqual(hudBox.x);
    expect(controlsBox.y).toBeGreaterThanOrEqual(hudBox.y);
    expect(controlsBox.x + controlsBox.width).toBeLessThanOrEqual(hudBox.x + hudBox.width);
    expect(controlsBox.y + controlsBox.height).toBeLessThanOrEqual(hudBox.y + hudBox.height);
  }

  await page.getByTestId('world-state').evaluate((element) => {
    element.style.display = 'none';
  });
  await page.addStyleTag({
    content: '*, *::before, *::after { animation: none !important; caret-color: transparent !important; }',
  });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );

  const screenshotPath = testInfo.outputPath('isometric-village-first-frame.png');
  await root.screenshot({ path: screenshotPath, animations: 'disabled' });
  await testInfo.attach('isometric-village-first-frame', {
    path: screenshotPath,
    contentType: 'image/png',
  });
  expect(errors).toEqual([]);
});
```

- [ ] **Step 2: Run the candidate test before preview styling**

```bash
npx playwright test tests/visual/isometric-village-first-frame.spec.ts --workers=1
```

Expected: FAIL because the HUD computed background starts with `linear-gradient(` rather than `url(`.

- [ ] **Step 3: Add the exact query-gated atlas skin**

Append to `src/ui/styles.css`:

```css
#game-root[data-first-frame-preview='true'] .hud-bottom-bar {
  position: relative;
  grid-template-columns: 160px 220px 260px;
  background-image:
    var(--classic-frame-image),
    linear-gradient(180deg, rgb(34 35 31 / 98%), rgb(11 13 12 / 99%));
  background-repeat: no-repeat, no-repeat;
  background-position: -21px -355px, 0 0;
  background-size: 965px 465px, 100% 100%;
}

#game-root[data-first-frame-preview='true'] .hud-console,
#game-root[data-first-frame-preview='true'] .hud-vitals,
#game-root[data-first-frame-preview='true'] .hud-actions {
  position: relative;
  z-index: 1;
  background: rgb(8 10 9 / 72%);
}

#game-root[data-first-frame-preview='true'] .hud-quick-slots > li {
  border-color: transparent;
  background-image:
    var(--classic-frame-image),
    linear-gradient(180deg, #292821, #141612);
  background-repeat: no-repeat, no-repeat;
  background-position: -517px -14px, 0 0;
  background-size: 1034px 401px, 100% 100%;
}

#game-root[data-first-frame-preview='true'] .hud-gauge {
  padding: 1px 3px;
  border: 1px solid #80613c;
  background: rgb(8 10 9 / 82%);
}

#game-root[data-first-frame-preview='true'] .save-controls {
  right: 4px !important;
  bottom: 4px !important;
  grid-template-columns: 1fr 1fr;
  width: 252px;
}

#game-root[data-first-frame-preview='true'] .save-controls button {
  min-height: 18px;
  padding: 1px 3px;
  font-size: 8px;
}

#game-root[data-first-frame-preview='true'] .save-controls output {
  grid-column: 1 / -1;
  min-height: 10px;
}
```

- [ ] **Step 4: Run the deterministic capture**

```bash
npx playwright test tests/visual/isometric-village-first-frame.spec.ts --workers=1
rg --files test-results | rg 'isometric-village-first-frame\\.png$'
```

Expected: `1 passed`, no console/page errors, and exactly one attached PNG path.

- [ ] **Step 5: Inspect the actual target-engine frame**

Open the PNG returned by the previous command in the image viewer at original detail. Record pass/fail for all six reference fields:

```text
Camera: 640x384 world above a 640x96 HUD; player feet centered.
Silhouette: player and three NPCs preserve aspect ratio and feet anchors.
Lighting: restrained day contrast; roads and actors separate from grass.
Palette: olive, earth, gray stone, blue-gray roof, old copper HUD.
Material: visible 32x16 diamonds and consistent pixel density.
Background: two cottages plus tree, fence, well; no rectangular terrain bands.
```

Also reject the frame if any transparent backdrop, clipped cell, missing frame, floating actor, name-over-head overlap, or control outside the HUD is visible.

- [ ] **Step 6: Commit the preview skin and capture test**

```bash
git add src/ui/styles.css tests/visual/isometric-village-first-frame.spec.ts
git commit -m "test: add isometric village first-frame gate"
```

- [ ] **Step 7: Stop for the user visual-approval gate**

Show the actual PNG to the user. Do not start Task 4 until the user explicitly approves this real Phaser frame. If rejected, change only `isometric-village-v1.png`, `IsometricVillagePreview.ts`, or the query-gated CSS, then rerun Steps 4–5.

---

## Phase B — Normal-game Activation After User Approval

### Task 4: Activate the approved atlas through the manifest

**Files:**

- Modify: `src/content/data/assets.json`
- Modify: `src/content/assets.ts`
- Modify: `tests/content/assets.test.ts`
- Modify: `tests/e2e/animation-effects.spec.ts`
- Modify: `src/game/systems/SpriteAtlas.ts`
- Modify: `tests/unit/sprite-atlas.test.ts`
- Modify: `src/game/scenes/BootScene.ts`

**Interfaces:**

- Consumes: approved `isometric-village-v1.png`.
- Produces: optional manifest key `map-village-isometric`, group `isometric-village-v1`, and frames `map-village-isometric:frame:0` through `:15`.

- [ ] **Step 1: Write failing manifest and atlas-frame tests**

Add to the planned path list and manifest test in `tests/content/assets.test.ts`:

```ts
'public/assets/maps/isometric-village-v1.png',

expect(loadAssetManifest()['map-talking-island-village']).toMatchObject({
  path: 'public/assets/maps/terrain-overworld-v2.png',
  group: 'terrain-overworld-v2',
});
expect(loadAssetManifest()['map-village-isometric']).toMatchObject({
  path: 'public/assets/maps/isometric-village-v1.png',
  group: 'isometric-village-v1',
  frame: 0,
  license: 'project-original',
});
```

Append to `tests/unit/sprite-atlas.test.ts`:

```ts
import {
  fitSpriteFrame,
  isometricVillageAtlasFrame,
  npcAtlasFrame,
} from '../../src/game/systems/SpriteAtlas';

describe('isometric village atlas layout', () => {
  it('cuts exact 4x4 cells from the approved 1024px atlas', () => {
    expect(isometricVillageAtlasFrame(1024, 1024, 0)).toEqual({
      x: 0,
      y: 0,
      width: 256,
      height: 256,
    });
    expect(isometricVillageAtlasFrame(1024, 1024, 15)).toEqual({
      x: 768,
      y: 768,
      width: 256,
      height: 256,
    });
  });

  it('rejects invalid village atlas indexes and dimensions', () => {
    expect(isometricVillageAtlasFrame(0, 1024, 0)).toBeNull();
    expect(isometricVillageAtlasFrame(1024, 0, 0)).toBeNull();
    expect(isometricVillageAtlasFrame(1024, 1024, -1)).toBeNull();
    expect(isometricVillageAtlasFrame(1024, 1024, 16)).toBeNull();
  });

  it('fits actor frames without changing aspect ratio', () => {
    expect(fitSpriteFrame(96, 204, 44, 52)).toEqual({
      width: 96 * (52 / 204),
      height: 52,
      scale: 52 / 204,
    });
    expect(fitSpriteFrame(0, 204, 44, 52)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests and confirm expected failures**

```bash
npx vitest run tests/content/assets.test.ts tests/unit/sprite-atlas.test.ts
```

Expected: FAIL because `map-village-isometric` and the new planned path are absent and both helpers are missing. The existing `map-talking-island-village` terrain fallback must continue to pass.

- [ ] **Step 3: Add the pure atlas and fitting helpers**

Append to `src/game/systems/SpriteAtlas.ts`:

```ts
const ISOMETRIC_VILLAGE_COLUMNS = 4;
const ISOMETRIC_VILLAGE_ROWS = 4;

export interface SpriteDisplaySize {
  readonly width: number;
  readonly height: number;
  readonly scale: number;
}

export const isometricVillageAtlasFrame = (
  sourceWidth: number,
  sourceHeight: number,
  index: number,
): SpriteAtlasFrame | null => {
  const width = Math.floor(sourceWidth / ISOMETRIC_VILLAGE_COLUMNS);
  const height = Math.floor(sourceHeight / ISOMETRIC_VILLAGE_ROWS);
  if (width <= 0 || height <= 0 || index < 0 || index >= 16) return null;
  return {
    x: (index % ISOMETRIC_VILLAGE_COLUMNS) * width,
    y: Math.floor(index / ISOMETRIC_VILLAGE_COLUMNS) * height,
    width,
    height,
  };
};

export const fitSpriteFrame = (
  sourceWidth: number,
  sourceHeight: number,
  maximumWidth: number,
  maximumHeight: number,
): SpriteDisplaySize | null => {
  if (
    sourceWidth <= 0 ||
    sourceHeight <= 0 ||
    maximumWidth <= 0 ||
    maximumHeight <= 0
  ) {
    return null;
  }
  const scale = Math.min(maximumWidth / sourceWidth, maximumHeight / sourceHeight);
  return { width: sourceWidth * scale, height: sourceHeight * scale, scale };
};
```

- [ ] **Step 4: Activate the approved atlas in the manifest**

Add `public/assets/maps/isometric-village-v1.png` to `plannedPaths` in `src/content/assets.ts`, rename the asset test description from “fourteen” to “fifteen”, and replace the optional-key set with:

```ts
const allowedKeys = new Set([
  ...required,
  'ui-classic-frame',
  'map-village-isometric',
]);
```

Keep the existing `map-talking-island-village` entry unchanged so it remains the orthogonal fallback. Append this optional entry before `ui-classic-frame` in `src/content/data/assets.json`:

```json
{
  "key": "map-village-isometric",
  "path": "public/assets/maps/isometric-village-v1.png",
  "group": "isometric-village-v1",
  "frame": 0,
  "license": "project-original"
}
```

Add `'/assets/maps/isometric-village-v1.png'` to `pngPaths` in `tests/e2e/animation-effects.spec.ts` and update the dimensions assertion from `14` to `15`.

- [ ] **Step 5: Replace preview-only BootScene registration with manifest-driven frames**

Import `isometricVillageAtlasFrame` beside `npcAtlasFrame`. In `#registerPhysicalFrames`, before the NPC branch, add:

```ts
if (entry.key === 'map-village-isometric') {
  return Array.from({ length: 16 }, (_, index) => {
    const frame = isometricVillageAtlasFrame(source.width, source.height, index);
    if (frame === null) return null;
    const name = entry.key + ':frame:' + String(index);
    this.#addFrame(texture, name, frame.x, frame.y, frame.width, frame.height);
    return name;
  }).filter((name): name is string => name !== null);
}
```

Delete the `firstFrame` direct `this.load.image` block and direct `4×4` registration block added in Task 2. Update `IsometricVillagePreview.ts` to use:

```ts
const PREVIEW_ATLAS = 'isometric-village-v1';
const previewFrame = (index: number): string =>
  'map-village-isometric:frame:' + String(index);
```

Replace both preview frame-name constructions with `previewFrame(index)`.

- [ ] **Step 6: Run focused asset checks**

```bash
npx vitest run tests/content/assets.test.ts tests/unit/sprite-atlas.test.ts
npm run typecheck
npx playwright test tests/e2e/animation-effects.spec.ts -g "loads every planned PNG" --workers=1
```

Expected: manifest and atlas unit tests pass, typecheck exits `0`, PNG test reports `1 passed` and asset-load-failures `0`.

- [ ] **Step 7: Commit manifest activation**

```bash
git add src/content/data/assets.json src/content/assets.ts tests/content/assets.test.ts tests/e2e/animation-effects.spec.ts src/game/systems/SpriteAtlas.ts tests/unit/sprite-atlas.test.ts src/game/scenes/BootScene.ts src/game/systems/IsometricVillagePreview.ts
git commit -m "feat: register approved isometric village atlas"
```

### Task 5: Add the shared world projection

**Files:**

- Create: `src/game/systems/WorldProjection.ts`
- Create: `tests/unit/world-projection.test.ts`

**Interfaces:**

- Produces: `createOrthogonalProjection(width, height)`, `createIsometricProjection(width, height, padding)`, `projectedBounds(width, height, padding)`, and `WorldProjection`.
- Consumers: `MapPresenter`, `EntityRenderer`, and `WorldScene` in Tasks 6–7.

- [ ] **Step 1: Write the failing projection tests**

Create `tests/unit/world-projection.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  createIsometricProjection,
  createOrthogonalProjection,
  projectedBounds,
} from '../../src/game/systems/WorldProjection';

describe('world presentation projection', () => {
  it('round-trips representative isometric village points', () => {
    const projection = createIsometricProjection(64, 64, 128);
    expect(projection).not.toBeNull();
    if (projection === null) return;
    for (const point of [{ x: 0, y: 0 }, { x: 32, y: 32 }, { x: 63, y: 63 }]) {
      expect(projection.screenToGrid(projection.gridToScreen(point))).toEqual(point);
    }
  });

  it('computes nonnegative projected bounds and stable depth', () => {
    expect(projectedBounds(64, 64, 128)).toEqual({
      x: 0,
      y: 0,
      width: 2_304,
      height: 1_280,
    });
    const projection = createIsometricProjection(64, 64, 128);
    expect(projection?.gridToScreen({ x: 32, y: 32 })).toEqual({ x: 1_152, y: 640 });
    expect(projection?.depthFor({ x: 33, y: 32 })).toBeGreaterThan(
      projection?.depthFor({ x: 32, y: 32 }) ?? Number.MAX_SAFE_INTEGER,
    );
  });

  it('keeps the existing orthogonal center and rejects invalid inputs', () => {
    const orthogonal = createOrthogonalProjection(64, 64);
    expect(orthogonal?.gridToScreen({ x: 1, y: 2 })).toEqual({ x: 24, y: 40 });
    expect(createIsometricProjection(0, 64, 128)).toBeNull();
    expect(createIsometricProjection(64, 0, 128)).toBeNull();
    expect(createIsometricProjection(64, 64, -1)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the focused test and confirm the file is missing**

```bash
npx vitest run tests/unit/world-projection.test.ts
```

Expected: FAIL because `WorldProjection.ts` does not exist.

- [ ] **Step 3: Add the complete projection module**

Create `src/game/systems/WorldProjection.ts`:

```ts
import type { GridPoint } from '../../world/grid';

const ORTHOGONAL_TILE_SIZE = 16;
const ISOMETRIC_HALF_WIDTH = 16;
const ISOMETRIC_HALF_HEIGHT = 8;

export type ProjectionMode = 'orthogonal' | 'isometric-2-1';

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export interface ProjectionBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface WorldProjection {
  readonly mode: ProjectionMode;
  readonly bounds: ProjectionBounds;
  readonly gridToScreen: (point: GridPoint) => ScreenPoint;
  readonly screenToGrid: (point: ScreenPoint) => GridPoint | null;
  readonly depthFor: (point: GridPoint, offset?: number) => number;
}

const inside = (point: GridPoint, width: number, height: number): boolean =>
  point.x >= 0 && point.y >= 0 && point.x < width && point.y < height;

export const projectedBounds = (
  width: number,
  height: number,
  padding: number,
): ProjectionBounds | null => {
  if (width <= 0 || height <= 0 || padding < 0) return null;
  return {
    x: 0,
    y: 0,
    width: (width + height) * ISOMETRIC_HALF_WIDTH + padding * 2,
    height: (width + height) * ISOMETRIC_HALF_HEIGHT + padding * 2,
  };
};

export const createIsometricProjection = (
  width: number,
  height: number,
  padding = 128,
): WorldProjection | null => {
  const bounds = projectedBounds(width, height, padding);
  if (bounds === null) return null;
  const originX = height * ISOMETRIC_HALF_WIDTH + padding;
  const originY = padding;
  const gridToScreen = (point: GridPoint): ScreenPoint => ({
    x: originX + (point.x - point.y) * ISOMETRIC_HALF_WIDTH,
    y: originY + (point.x + point.y) * ISOMETRIC_HALF_HEIGHT,
  });
  return {
    mode: 'isometric-2-1',
    bounds,
    gridToScreen,
    screenToGrid: (point) => {
      const horizontal = (point.x - originX) / ISOMETRIC_HALF_WIDTH;
      const vertical = (point.y - originY) / ISOMETRIC_HALF_HEIGHT;
      const candidate = {
        x: Math.round((horizontal + vertical) / 2),
        y: Math.round((vertical - horizontal) / 2),
      };
      return inside(candidate, width, height) ? candidate : null;
    },
    depthFor: (point, offset = 0) => (point.x + point.y) * 100 + offset,
  };
};

export const createOrthogonalProjection = (
  width: number,
  height: number,
): WorldProjection | null => {
  if (width <= 0 || height <= 0) return null;
  return {
    mode: 'orthogonal',
    bounds: {
      x: 0,
      y: 0,
      width: width * ORTHOGONAL_TILE_SIZE,
      height: height * ORTHOGONAL_TILE_SIZE,
    },
    gridToScreen: (point) => ({
      x: point.x * ORTHOGONAL_TILE_SIZE + ORTHOGONAL_TILE_SIZE / 2,
      y: point.y * ORTHOGONAL_TILE_SIZE + ORTHOGONAL_TILE_SIZE / 2,
    }),
    screenToGrid: (point) => {
      const candidate = {
        x: Math.floor(point.x / ORTHOGONAL_TILE_SIZE),
        y: Math.floor(point.y / ORTHOGONAL_TILE_SIZE),
      };
      return inside(candidate, width, height) ? candidate : null;
    },
    depthFor: (point, offset = 0) => point.y * ORTHOGONAL_TILE_SIZE + offset,
  };
};
```

- [ ] **Step 4: Run and commit**

```bash
npx vitest run tests/unit/world-projection.test.ts
npm run typecheck
git add src/game/systems/WorldProjection.ts tests/unit/world-projection.test.ts
git commit -m "feat: add shared world presentation projection"
```

Expected: `3` projection tests pass and typecheck exits `0`.

### Task 6: Model and render the village presentation layer

**Files:**

- Modify: `public/assets/maps/village.map.json`
- Modify: `src/game/systems/MapPresenter.ts`
- Modify: `tests/unit/map-presenter.test.ts`

**Interfaces:**

- Consumes: `WorldProjection` and manifest frames from Tasks 4–5.
- Produces: validated `PresentedIsometricLayer`, `requiredIsometricFrames(layer)`, `terrainAt(asset, x, y)`, and `MapPresenter.projection`.

- [ ] **Step 1: Add failing pure presentation tests**

Extend `tests/unit/map-presenter.test.ts`:

```ts
import {
  nearestNpcId,
  normalizeIsometricPresentation,
  normalizeMapPresentation,
  npcInteractionForRole,
  requiredIsometricFrames,
  terrainAt,
  terrainAtlasLayout,
  type MapAsset,
  type PresentedNpc,
} from '../../src/game/systems/MapPresenter';

describe('isometric village presentation', () => {
  const validLayer = {
    projection: 'isometric-2-1',
    atlasKey: 'map-test-map',
    groundFrames: { grass: 0, forest: 1, road: 2 },
    props: [
      {
        id: 'cottage',
        frame: 8,
        x: 6,
        y: 5,
        scale: 0.5,
        anchorX: 0.5,
        anchorY: 0.88,
        depthOffset: 0,
      },
    ],
  } as const;

  const isometricAsset: MapAsset = {
    ...asset,
    presentationLayer: validLayer,
  };

  it('normalizes required ground frames and in-bounds props', () => {
    const layer = normalizeIsometricPresentation(isometricAsset);
    expect(layer).not.toBeNull();
    expect(layer?.atlasKey).toBe('map-test-map');
    expect(layer?.props.map(({ id }) => id)).toEqual(['cottage']);
    expect(requiredIsometricFrames(layer)).toEqual([0, 1, 2, 8]);
  });

  it('rejects a missing terrain frame and filters invalid props', () => {
    expect(
      normalizeIsometricPresentation({
        ...isometricAsset,
        presentationLayer: {
          ...validLayer,
          groundFrames: { grass: 0, road: 2 },
        },
      }),
    ).toBeNull();
    expect(
      normalizeIsometricPresentation({
        ...isometricAsset,
        presentationLayer: {
          ...validLayer,
          props: [
            {
              id: 'outside',
              frame: 8,
              x: 99,
              y: 99,
              scale: 0.5,
              anchorX: 0.5,
              anchorY: 0.88,
              depthOffset: 0,
            },
          ],
        },
      })?.props,
    ).toEqual([]);
  });

  it('uses the last terrain region over the default terrain', () => {
    expect(terrainAt(asset, 2, 3)).toBe('forest');
    expect(terrainAt(asset, 9, 3)).toBe('road');
    expect(terrainAt(asset, 19, 15)).toBe('grass');
  });
});
```

- [ ] **Step 2: Run tests and confirm the new exports are missing**

```bash
npx vitest run tests/unit/map-presenter.test.ts
```

Expected: FAIL because the isometric normalization, required-frame, and terrain lookup exports do not exist.

- [ ] **Step 3: Add exact presentation types and pure normalization**

In `MapPresenter.ts` add:

```ts
import {
  createIsometricProjection,
  createOrthogonalProjection,
  type WorldProjection,
} from './WorldProjection';
import { fitSpriteFrame } from './SpriteAtlas';

export interface PresentedProp {
  readonly id: string;
  readonly frame: number;
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly depthOffset: number;
}

export interface PresentedIsometricLayer {
  readonly atlasKey: string;
  readonly groundFrames: Readonly<Record<string, number>>;
  readonly props: readonly PresentedProp[];
}
```

Add `readonly presentationLayer?: unknown;` to `MapAsset` and `readonly isometric?: PresentedIsometricLayer;` to `MapPresentation`.

Add these pure helpers before `normalizeMapPresentation`:

```ts
const recordValue = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const safeFrame = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) < 16;

export const terrainAt = (asset: MapAsset, x: number, y: number): string => {
  const region = [...asset.terrainLayer.regions].reverse().find(
    (candidate) =>
      x >= candidate.x &&
      y >= candidate.y &&
      x < candidate.x + candidate.width &&
      y < candidate.y + candidate.height,
  );
  return region?.terrain ?? asset.terrainLayer.defaultTerrain;
};

export const normalizeIsometricPresentation = (
  asset: MapAsset,
): PresentedIsometricLayer | null => {
  const raw = recordValue(asset.presentationLayer);
  if (raw?.projection !== 'isometric-2-1' || typeof raw.atlasKey !== 'string') return null;
  const frames = recordValue(raw.groundFrames);
  if (frames === null) return null;
  const terrainKeys = new Set([
    asset.terrainLayer.defaultTerrain,
    ...asset.terrainLayer.regions.map(({ terrain }) => terrain),
  ]);
  const groundFrames: Record<string, number> = {};
  for (const key of terrainKeys) {
    const frame = frames[key];
    if (!safeFrame(frame)) return null;
    groundFrames[key] = frame;
  }
  const rawProps = Array.isArray(raw.props) ? raw.props : [];
  const props = rawProps.flatMap((value): PresentedProp[] => {
    const prop = recordValue(value);
    if (
      prop === null ||
      typeof prop.id !== 'string' ||
      !safeFrame(prop.frame) ||
      typeof prop.x !== 'number' ||
      !Number.isSafeInteger(prop.x) ||
      typeof prop.y !== 'number' ||
      !Number.isSafeInteger(prop.y) ||
      typeof prop.scale !== 'number' ||
      !Number.isFinite(prop.scale) ||
      typeof prop.anchorX !== 'number' ||
      !Number.isFinite(prop.anchorX) ||
      typeof prop.anchorY !== 'number' ||
      !Number.isFinite(prop.anchorY) ||
      typeof prop.depthOffset !== 'number' ||
      !Number.isFinite(prop.depthOffset) ||
      prop.x < 0 ||
      prop.y < 0 ||
      prop.x >= asset.width ||
      prop.y >= asset.height ||
      prop.scale <= 0 ||
      prop.anchorX < 0 ||
      prop.anchorX > 1 ||
      prop.anchorY < 0 ||
      prop.anchorY > 1
    ) {
      return [];
    }
    return [{
      id: prop.id,
      frame: prop.frame,
      x: prop.x,
      y: prop.y,
      scale: prop.scale,
      anchorX: prop.anchorX,
      anchorY: prop.anchorY,
      depthOffset: prop.depthOffset,
    }];
  });
  return { atlasKey: raw.atlasKey, groundFrames: Object.freeze(groundFrames), props };
};

export const requiredIsometricFrames = (
  layer: PresentedIsometricLayer | null,
): readonly number[] =>
  layer === null
    ? []
    : [...new Set([
        ...Object.values(layer.groundFrames),
        ...layer.props.map(({ frame }) => frame),
      ])].sort((left, right) => left - right);
```

Replace the current expression-bodied `normalizeMapPresentation` with this complete block-bodied implementation:

```ts
export const normalizeMapPresentation = (
  asset: MapAsset,
  npcLookup: NpcLookup,
): MapPresentation => {
  const isometric = normalizeIsometricPresentation(asset);
  return {
    id: asset.id,
    width: asset.width,
    height: asset.height,
    textureKey: 'map-' + asset.id,
    terrain: [
      {
        terrain: asset.terrainLayer.defaultTerrain,
        frame: terrainFrame(asset.terrainLayer.defaultTerrain),
        x: 0,
        y: 0,
        width: asset.width,
        height: asset.height,
      },
      ...asset.terrainLayer.regions.map((region) => ({
        ...region,
        frame: terrainFrame(region.terrain),
      })),
    ],
    npcs: asset.npcAnchors.map((anchor) => {
      const npc = npcLookup(anchor.id);
      return {
        id: npc.id,
        name: npc.name,
        spriteKey: npc.spriteKey,
        interaction: npcInteractionForRole(npc.role),
        x: anchor.x,
        y: anchor.y,
      };
    }),
    ...(isometric === null ? {} : { isometric }),
  };
};
```

- [ ] **Step 4: Add the exact village visual layer**

Add this top-level property after `terrainLayer` in `public/assets/maps/village.map.json`:

```json
"presentationLayer": {
  "projection": "isometric-2-1",
  "atlasKey": "map-village-isometric",
  "groundFrames": {
    "grass": 0,
    "stone": 1,
    "road": 2
  },
  "props": [
    { "id": "cottage-west", "frame": 8, "x": 27, "y": 28, "scale": 0.5, "anchorX": 0.5, "anchorY": 0.88, "depthOffset": 0 },
    { "id": "cottage-east", "frame": 9, "x": 37, "y": 28, "scale": 0.5, "anchorX": 0.5, "anchorY": 0.88, "depthOffset": 0 },
    { "id": "tree-west", "frame": 10, "x": 25, "y": 26, "scale": 0.4, "anchorX": 0.5, "anchorY": 0.9, "depthOffset": 0 },
    { "id": "fence-west", "frame": 11, "x": 29, "y": 25, "scale": 0.3, "anchorX": 0.5, "anchorY": 0.82, "depthOffset": 0 },
    { "id": "village-well", "frame": 12, "x": 32, "y": 28, "scale": 0.35, "anchorX": 0.5, "anchorY": 0.82, "depthOffset": 0 },
    { "id": "supply-crates", "frame": 13, "x": 36, "y": 26, "scale": 0.3, "anchorX": 0.5, "anchorY": 0.84, "depthOffset": 0 },
    { "id": "village-sign", "frame": 14, "x": 30, "y": 30, "scale": 0.28, "anchorX": 0.5, "anchorY": 0.86, "depthOffset": 0 },
    { "id": "village-lamp", "frame": 15, "x": 34, "y": 30, "scale": 0.28, "anchorX": 0.5, "anchorY": 0.9, "depthOffset": 0 }
  ]
},
```

- [ ] **Step 5: Add atomic resource selection and isometric rendering**

Add `readonly #projection` state and getter to `MapPresenter`:

```ts
#projection: WorldProjection | null = null;

get projection(): WorldProjection | null {
  return this.#projection;
}
```

Replace `render(mapId)` with:

```ts
render(mapId: string): void {
  if (this.#presentation?.id === mapId) return;
  this.#clear();
  const asset = this.#assets.get(mapId);
  if (asset === undefined) return;
  const presentation = normalizeMapPresentation(asset, this.#npcLookup);
  const isometric = presentation.isometric;
  const projection =
    isometric === undefined ? null : createIsometricProjection(asset.width, asset.height, 128);
  const entry = isometric === undefined ? undefined : this.#manifest[isometric.atlasKey];
  const texture =
    entry === undefined || !this.#scene.textures.exists(entry.group)
      ? null
      : this.#scene.textures.get(entry.group);
  const ready =
    isometric !== undefined &&
    projection !== null &&
    entry !== undefined &&
    texture !== null &&
    requiredIsometricFrames(isometric).every((frame) =>
      texture.has(isometric.atlasKey + ':frame:' + String(frame)),
    );

  if (ready && isometric !== undefined && projection !== null && entry !== undefined) {
    this.#renderIsometric(asset, isometric, projection, entry.group);
    this.#projection = projection;
  } else {
    presentation.terrain.forEach((terrain, index) => {
      this.#renderTerrain(presentation.textureKey, terrain, index);
    });
    this.#projection = createOrthogonalProjection(asset.width, asset.height);
  }
  if (this.#projection !== null) {
    presentation.npcs.forEach((npc) => {
      this.#renderNpc(npc, this.#projection);
    });
  }
  this.#presentation = presentation;
}
```

Add:

```ts
#renderIsometric(
  asset: MapAsset,
  layer: PresentedIsometricLayer,
  projection: WorldProjection,
  textureKey: string,
): void {
  for (let y = 0; y < asset.height; y += 1) {
    for (let x = 0; x < asset.width; x += 1) {
      const terrain = terrainAt(asset, x, y);
      const frame = layer.groundFrames[terrain];
      if (frame === undefined) continue;
      const point = projection.gridToScreen({ x, y });
      const tile = this.#scene.add
        .image(point.x, point.y, textureKey, layer.atlasKey + ':frame:' + String(frame))
        .setOrigin(0.5)
        .setScale(0.25)
        .setDepth(-100_000 + projection.depthFor({ x, y }));
      this.#objects.push(tile);
    }
  }
  for (const prop of layer.props) {
    const point = projection.gridToScreen(prop);
    const image = this.#scene.add
      .image(
        point.x,
        point.y,
        textureKey,
        layer.atlasKey + ':frame:' + String(prop.frame),
      )
      .setOrigin(prop.anchorX, prop.anchorY)
      .setScale(prop.scale)
      .setDepth(projection.depthFor(prop, prop.depthOffset));
    image.setData('presentation-id', prop.id);
    this.#objects.push(image);
  }
}
```

Change `#renderNpc` to accept a `WorldProjection`. Keep the existing orthogonal size for fallback; use feet anchoring only for isometric:

```ts
#renderNpc(npc: PresentedNpc, projection: WorldProjection): void {
  const entry = this.#manifest[npc.spriteKey];
  const frame = npc.spriteKey + ':frame:0';
  let visual: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle;
  let labelY = -19;
  if (
    entry !== undefined &&
    this.#scene.textures.exists(entry.group) &&
    this.#scene.textures.get(entry.group).has(frame)
  ) {
    const sprite = this.#scene.add.sprite(0, 0, entry.group, frame);
    if (projection.mode === 'isometric-2-1') {
      const fit = fitSpriteFrame(sprite.frame.realWidth, sprite.frame.realHeight, 44, 52);
      if (fit !== null) sprite.setDisplaySize(fit.width, fit.height);
      sprite.setOrigin(0.5, 1);
      labelY = -sprite.displayHeight - 2;
    } else {
      sprite.setDisplaySize(28, 36);
    }
    visual = sprite;
  } else {
    visual = this.#scene.add.rectangle(0, 0, 14, 18, 0xc29b62).setStrokeStyle(1, 0x17120d);
  }
  const label = this.#scene.add
    .text(0, labelY, npc.name, {
      color: '#ffe8b0',
      fontSize: '9px',
      stroke: '#17120d',
      strokeThickness: projection.mode === 'isometric-2-1' ? 2 : 0,
    })
    .setOrigin(0.5, 1);
  const point = projection.gridToScreen(npc);
  const container = this.#scene.add
    .container(point.x, point.y, [visual, label])
    .setDepth(projection.depthFor(npc, 20))
    .setSize(projection.mode === 'isometric-2-1' ? 32 : TILE_SIZE, 36)
    .setInteractive();
  container.setData('target-kind', 'npc');
  container.setData('target-id', npc.id);
  this.#objects.push(container);
}
```

In `#clear()` add `this.#projection = null;`.

- [ ] **Step 6: Run focused map checks**

```bash
npx vitest run tests/unit/map-presenter.test.ts tests/unit/world-projection.test.ts tests/content/reachability.test.ts
npm run typecheck
```

Expected: all focused tests pass and typecheck exits `0`.

- [ ] **Step 7: Commit the map presenter**

```bash
git add public/assets/maps/village.map.json src/game/systems/MapPresenter.ts tests/unit/map-presenter.test.ts
git commit -m "feat: render approved isometric village layer"
```

### Task 7: Project entities, camera, and real canvas pointer input

**Files:**

- Modify: `src/game/systems/EntityRenderer.ts`
- Modify: `src/game/scenes/WorldScene.ts`
- Delete: `src/game/systems/IsometricVillagePreview.ts`
- Delete: `tests/unit/isometric-village-preview.test.ts`
- Create: `tests/e2e/isometric-village.spec.ts`

**Interfaces:**

- Consumes: `MapPresenter.projection` and `WorldProjection`.
- Produces: normal-game `data-projection` and `data-camera-viewport` diagnostics plus inverse-mapped canvas clicks.

- [ ] **Step 1: Write the failing normal-game E2E test**

Create `tests/e2e/isometric-village.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('uses the isometric projection for camera and real ground clicks', async ({ page }) => {
  await page.goto('/?e2e=1');
  await page.getByRole('button', { name: '開始新遊戲' }).click();
  await page.getByLabel('角色名稱').fill('投影測試');
  await page.getByRole('radio', { name: '騎士' }).check();
  await page.getByRole('button', { name: '建立角色' }).click();

  const state = page.getByTestId('world-state');
  await expect(state).toHaveAttribute('data-ready', 'true');
  await expect(state).toHaveAttribute('data-projection', 'isometric-2-1');
  await expect(state).toHaveAttribute('data-camera-viewport', '640x384');
  await expect(page.getByTestId('player-state')).toHaveAttribute('data-x', '32');
  await expect(page.getByTestId('player-state')).toHaveAttribute('data-y', '32');

  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  const scale = box.width / 640;
  await canvas.click({
    position: {
      x: (320 + 16) * scale,
      y: (192 + 8) * scale,
    },
  });
  await page.getByTestId('simulation-step').click();
  await expect(page.getByTestId('player-state')).toHaveAttribute('data-x', '33');
  await expect(page.getByTestId('player-state')).toHaveAttribute('data-y', '32');
});
```

- [ ] **Step 2: Run the test and confirm diagnostics are absent**

```bash
npx playwright test tests/e2e/isometric-village.spec.ts --workers=1
```

Expected: FAIL because `data-projection` is absent.

- [ ] **Step 3: Pass the active projection into EntityRenderer**

In `EntityRenderer.ts` import `fitSpriteFrame` and `WorldProjection`. Add:

```ts
import { fitSpriteFrame } from './SpriteAtlas';
import type { ProjectionMode, WorldProjection } from './WorldProjection';

readonly #labels = new Map<string, Phaser.GameObjects.Text>();
#projectionMode: ProjectionMode | null = null;
```

Change `render(snapshot)` to `render(snapshot, projection: WorldProjection)`. At its start add:

```ts
if (this.#projectionMode !== projection.mode) {
  this.#clearEntities();
  this.#projectionMode = projection.mode;
}
```

Pass `projection` into `#renderEntity`. Replace the existing visual/label creation block with:

```ts
let visual: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle;
let labelY = -11;
if (
  entry !== undefined &&
  this.#scene.textures.exists(entry.group) &&
  this.#scene.textures.get(entry.group).has(firstFrame)
) {
  const sprite = this.#scene.add.sprite(0, 0, entry.group, firstFrame);
  if (projection.mode === 'isometric-2-1') {
    const fit = fitSpriteFrame(sprite.frame.realWidth, sprite.frame.realHeight, 44, 52);
    if (fit !== null) sprite.setDisplaySize(fit.width, fit.height);
    sprite.setOrigin(0.5, 1);
    labelY = -sprite.displayHeight - 2;
  } else {
    sprite.setDisplaySize(28, 36);
  }
  this.#sprites.set(view.id, sprite);
  visual = sprite;
} else {
  visual = this.#scene.add
    .rectangle(0, 0, 12, 12, view.color)
    .setStrokeStyle(1, 0x080b0a);
}

const label = this.#scene.add
  .text(0, labelY, view.label, {
    color: '#f1e7ca',
    fontSize: '8px',
    stroke: '#17120d',
    strokeThickness: projection.mode === 'isometric-2-1' ? 2 : 0,
  })
  .setOrigin(0.5, 1);
this.#labels.set(view.id, label);
```

In the existing dead-entity removal loop add `this.#labels.delete(id);` beside the sprite, position, and direction cleanup.

Replace the final container positioning with:

```ts
const point = projection.gridToScreen(view);
container
  .setPosition(point.x, point.y)
  .setDepth(projection.depthFor(view, view.kind === 'loot' ? -1 : 20));
```

Add a private cleanup and use it from `destroy()`:

```ts
#clearEntities(): void {
  for (const entity of this.#entities.values()) entity.destroy(true);
  this.#entities.clear();
  this.#sprites.clear();
  this.#labels.clear();
  this.#positions.clear();
  this.#directions.clear();
}
```

- [ ] **Step 4: Wire projection, camera bounds, inverse pointer mapping, and diagnostics**

In `WorldScene.ts` remove `TILE_SIZE` from the `EntityRenderer` import, import `createOrthogonalProjection` and `WorldProjection`, add `#activeProjection: WorldProjection | null = null;`, and set the normal camera viewport:

```ts
this.cameras.main.setViewport(0, 0, 640, 384);
```

Replace the ground pointer branch with:

```ts
const point = this.#activeProjection?.screenToGrid({
  x: pointer.worldX,
  y: pointer.worldY,
});
if (point === null || point === undefined) return;
this.#issue({ targetKind: 'ground', tileX: point.x, tileY: point.y });
```

In `#renderUnsafe()`, immediately after `this.#mapPresenter?.render(snapshot.player.mapId);`, add:

```ts
const mapDefinition = this.#content?.map(snapshot.player.mapId);
const fallback =
  mapDefinition === undefined
    ? null
    : createOrthogonalProjection(mapDefinition.width, mapDefinition.height);
const projection = this.#mapPresenter?.projection ?? fallback;
if (projection === null) throw new Error('找不到可用的世界投影');
this.#activeProjection = projection;
this.#renderer.render(snapshot, projection);
const bounds = projection.bounds;
this.cameras.main.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
const playerPoint = projection.gridToScreen(snapshot.player);
this.cameras.main.centerOn(playerPoint.x, playerPoint.y);
```

Delete the old `this.#renderer.render(snapshot);` and old `x * TILE_SIZE` camera center block.

At the start of `#renderE2EState` add:

```ts
panel.dataset.projection = this.#activeProjection?.mode ?? '';
panel.dataset.cameraViewport =
  String(this.cameras.main.width) + 'x' + String(this.cameras.main.height);
```

Remove the `IsometricVillagePreview` field, render branch, preview camera branch, `ASSET_LOAD_FAILURES_REGISTRY_KEY` import, and the `data-first-frame-camera`／`data-first-frame-asset-failures` diagnostics added in Task 2. Delete `IsometricVillagePreview.ts` and its unit test.

Keep only this temporary style gate in `create()` until Task 8:

```ts
if (search.get('firstFrame') === '1') {
  parent.dataset.firstFramePreview = 'true';
}
```

Keep `delete this.#root.dataset.firstFramePreview;` in `#destroy()`. The visual test continues to use `firstFrame=1` solely to select the already approved HUD CSS while the normal MapPresenter and EntityRenderer render the world.

Also set `this.#activeProjection = null;` in `#destroy()` after destroying the renderers.

- [ ] **Step 5: Run focused projection consumers**

```bash
npx playwright test tests/e2e/isometric-village.spec.ts --workers=1
npx playwright test tests/e2e/movement-combat.spec.ts --workers=1
npm run typecheck
```

Expected: both browser files pass, the real canvas click moves from `32,32` to `33,32`, and typecheck exits `0`.

- [ ] **Step 6: Commit normal projection activation**

```bash
git add src/game/systems/EntityRenderer.ts src/game/scenes/WorldScene.ts tests/e2e/isometric-village.spec.ts
git add -u src/game/systems/IsometricVillagePreview.ts tests/unit/isometric-village-preview.test.ts
git commit -m "feat: activate isometric village projection"
```

### Task 8: Activate the approved HUD frame and contain system controls

**Files:**

- Modify: `src/ui/Hud.ts`
- Modify: `src/ui/styles.css`
- Modify: `src/game/scenes/WorldScene.ts`
- Modify: `tests/unit/ui-panels.test.ts`
- Modify: `tests/e2e/hud-panels.spec.ts`
- Modify: `tests/visual/isometric-village-first-frame.spec.ts`

**Interfaces:**

- Produces: `data-testid="hud-system-controls"` inside `hud-actions`, world aria label `遊戲世界 640 乘 384`, and globally active atlas-first backgrounds.

- [ ] **Step 1: Add failing HUD DOM and browser assertions**

Change the world viewport assertion in `tests/unit/ui-panels.test.ts` to:

```ts
expect(findByTestId(hud.element, 'world-viewport').getAttribute('aria-label')).toBe(
  '遊戲世界 640 乘 384',
);
expect(findByTestId(hud.element, 'hud-system-controls').getAttribute('aria-label')).toBe(
  '系統操作',
);
```

Add to the live HUD test in `tests/e2e/hud-panels.spec.ts`:

```ts
const bottomBackground = await page.locator('.hud-bottom-bar').evaluate(
  (element) => getComputedStyle(element).backgroundImage,
);
expect(bottomBackground.startsWith('url(')).toBe(true);
await expect(page.getByTestId('hud-system-controls').getByTestId('manual-save')).toBeVisible();
await expect(page.getByTestId('hud-system-controls').getByTestId('return-menu')).toBeVisible();
```

- [ ] **Step 2: Run tests and confirm the new host is missing**

```bash
npx vitest run tests/unit/ui-panels.test.ts -t "fixed 640x480 HUD"
npx playwright test tests/e2e/hud-panels.spec.ts -g "shows live HUD values" --workers=1
```

Expected: unit and browser tests fail because `hud-system-controls` does not exist.

- [ ] **Step 3: Add the system-controls host to Hud**

In `Hud.ts` change the aria label and append a host:

```ts
viewport.setAttribute('aria-label', '遊戲世界 640 乘 384');

const actionGrid = document.createElement('div');
actionGrid.className = 'hud-action-grid';
const systemControls = document.createElement('div');
systemControls.className = 'hud-system-controls';
systemControls.setAttribute('data-testid', 'hud-system-controls');
systemControls.setAttribute('aria-label', '系統操作');
actionGrid.append(this.#quickSlots, systemControls);
actions.append(this.#target, actionGrid);
```

Remove the old `actions.append(this.#target, this.#quickSlots);` line.

- [ ] **Step 4: Append save controls to the host without inline positioning**

In `WorldScene.#createSaveControls()` delete `controls.style.cssText = ...` and replace the append target with:

```ts
const host = this.#root.querySelector<HTMLElement>(
  '[data-testid="hud-system-controls"]',
);
(host ?? this.#root).append(controls);
```

- [ ] **Step 5: Activate the approved CSS globally**

Move the declarations added in Task 3 from selectors beginning with:

```css
#game-root[data-first-frame-preview='true']
```

to their unscoped production selectors:

```css
.hud-bottom-bar
.hud-console,
.hud-vitals,
.hud-actions
.hud-quick-slots > li
.hud-gauge
.save-controls
.save-controls button
.save-controls output
```

Use this production action layout:

```css
.hud-actions {
  display: grid;
  grid-template-rows: 18px minmax(0, 1fr);
  gap: 3px;
}

.hud-action-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 58px;
  gap: 3px;
  min-height: 0;
}

.hud-system-controls {
  min-width: 0;
}

.save-controls {
  position: static;
  display: grid;
  gap: 2px;
  width: auto;
  pointer-events: auto;
}

.save-controls button {
  min-height: 20px;
  padding: 1px 2px;
  font-size: 8px;
}

.save-controls output {
  min-height: 10px;
  color: var(--classic-muted);
  font-size: 7px;
}
```

Remove duplicate preview-only declarations after moving their values to the existing production selectors.

Delete the temporary `firstFrame` dataset assignment from `WorldScene.create()` and its cleanup from `#destroy()`; the production HUD no longer depends on a query parameter.

- [ ] **Step 6: Make the capture test use the normal game**

In `tests/visual/isometric-village-first-frame.spec.ts` change the URL to `/?e2e=1` and replace the preview root assertions with:

```ts
await expect(page.getByTestId('world-state')).toHaveAttribute(
  'data-projection',
  'isometric-2-1',
);
await expect(page.getByTestId('world-state')).toHaveAttribute(
  'data-camera-viewport',
  '640x384',
);
```

- [ ] **Step 7: Run focused HUD checks**

```bash
npx vitest run tests/unit/ui-panels.test.ts
npx playwright test tests/e2e/hud-panels.spec.ts --workers=1
npx playwright test tests/visual/isometric-village-first-frame.spec.ts --workers=1
```

Expected: all three commands pass and the attached normal-game frame preserves the user-approved composition.

- [ ] **Step 8: Commit production HUD activation**

```bash
git add src/ui/Hud.ts src/ui/styles.css src/game/scenes/WorldScene.ts tests/unit/ui-panels.test.ts tests/e2e/hud-panels.spec.ts tests/visual/isometric-village-first-frame.spec.ts
git commit -m "feat: activate approved classic village HUD"
```

### Task 9: Lock visual baselines, verify the slice, and record evidence

**Files:**

- Create: `tests/visual/isometric-village-first-frame.spec.ts-snapshots/isometric-village-first-frame-chromium-darwin.png`
- Modify: `tests/visual/isometric-village-first-frame.spec.ts`
- Modify: `tests/visual/visual-baselines.spec.ts-snapshots/*.png`
- Create: `docs/memory/2026-07-19-isometric-village-first-frame.md`
- Modify without staging unrelated hunks: `CLAUDE.md`
- Modify without staging unrelated hunks: `CODEX_HANDOFF.md`

**Interfaces:**

- Consumes: the user-approved real Phaser frame from Task 3 and the normal-game capture from Task 8.
- Produces: deterministic approved snapshot, focused verification evidence, and current technical/handoff documentation.

- [ ] **Step 1: Convert the candidate capture into a visual assertion**

Replace the manual screenshot/attachment block in `tests/visual/isometric-village-first-frame.spec.ts` with:

```ts
await expect(root).toHaveScreenshot('isometric-village-first-frame.png', {
  animations: 'disabled',
});
expect(errors).toEqual([]);
```

- [ ] **Step 2: Create only the approved first-frame baseline**

```bash
npx playwright test tests/visual/isometric-village-first-frame.spec.ts --workers=1 --update-snapshots
npx playwright test tests/visual/isometric-village-first-frame.spec.ts --workers=1
```

Expected: the update writes one `isometric-village-first-frame-chromium-darwin.png` and the second run reports `1 passed`.

- [ ] **Step 3: Refresh and inspect visual baselines affected by village projection or global HUD**

```bash
npx playwright test tests/visual/visual-baselines.spec.ts --workers=1 --update-snapshots
npx playwright test tests/visual/visual-baselines.spec.ts --workers=1
```

Expected: `14 passed`. Open the updated `village`, `inventory`, `spells`, `shop`, and `settings` snapshots; reject any frame with clipped actors, stale preview CSS, controls outside the HUD, or missing atlas details.

- [ ] **Step 4: Run the focused and non-campaign gates**

```bash
git diff --check
npm run lint
npm run typecheck
npm test
npm run build
npx playwright test tests/e2e/isometric-village.spec.ts tests/e2e/hud-panels.spec.ts tests/e2e/movement-combat.spec.ts tests/e2e/animation-effects.spec.ts --workers=1
npx playwright test tests/visual --workers=1
```

Expected:

```text
git diff --check: exit 0
lint: exit 0 with zero warnings
typecheck: exit 0
Vitest: all tests pass
build: exit 0; existing chunk/PWA warnings may remain
focused E2E: all selected tests pass
visual: first-frame plus existing visual tests pass
```

Do not run `npm run verify` or the seven-stage production campaign in this first-frame plan.

- [ ] **Step 5: Write exact release evidence**

Create `docs/memory/2026-07-19-isometric-village-first-frame.md` with:

```markdown
# 2026-07-19 等角村莊 First-frame 驗收

## 結論

說話之島村莊已使用 project-original `isometric-village-v1.png`、`2:1` projection、feet-anchored actors、`640×384` camera 與 `640×96` classic HUD 產生實際 Phaser frame，並經使用者視覺核准。

## 視覺與版權邊界

- `tiles-overworld.png` 只作 project-original art-direction reference。
- 新 atlas 為 project-original，不包含 Lineage 客戶端素材、Logo、字體或地圖。
- 其他六張地圖仍使用既有 orthogonal presenter；本次未生成其 atlas。

## 技術邊界

- grid、碰撞、A*、NPC anchors、任務、戰鬥與存檔未變。
- atlas／frame／presentation validation 失敗時，村莊 terrain、actors、camera 與 pointer atomic fallback 至 orthogonal projection。
- pointer 由 shared projection inverse mapping 後才提交既有 movement command。

## 驗證證據

記錄 Task 9 Step 4 的實際命令、通過數量、build warnings，以及 approved snapshot 路徑。

## 後續

下一個獨立設計／計畫才處理其餘六張地圖；不得直接複製村莊 props 或把 collision 從 bitmap 推導。
```

Replace the instruction sentence in `驗證證據` with the actual observed counts before saving the file.

- [ ] **Step 6: Synchronize current technical and handoff truth without staging prior changes**

In `CLAUDE.md` update only the world-presentation bullets to state:

```markdown
- 村莊 presentation 使用 shared `WorldProjection` 的 `2:1` 等角模式；邏輯 grid、碰撞、尋路與 domain 座標保持正交整數。其他六張地圖仍使用 orthogonal projection。
- Phaser 世界 camera viewport 是 `640×384`，底部 DOM HUD 是 `640×96`；兩者合計仍為 `640×480` logical viewport。
- 村莊 atlas、presentation data 或必要 frame 無效時，terrain、entity、camera 與 pointer 以同一決策 atomic fallback 至 orthogonal presenter。
```

Update `CODEX_HANDOFF.md` current goal, latest completed work, verification, risk, and next safest task with the observed Task 9 results.

Because both files already contain uncommitted work, do not stage them wholesale. Leave the synchronized working-tree edits visible and report them explicitly unless their pre-existing changes have separately become authorized for commit.

- [ ] **Step 7: Commit only first-frame tests, snapshots, and evidence**

```bash
git add tests/visual/isometric-village-first-frame.spec.ts tests/visual/isometric-village-first-frame.spec.ts-snapshots docs/memory/2026-07-19-isometric-village-first-frame.md
git add tests/visual/visual-baselines.spec.ts-snapshots
git commit -m "test: approve isometric village first frame"
```

- [ ] **Step 8: Report the final first-frame boundary**

Report:

```text
approved actual-frame path and commit
projection/camera/HUD contract
asset provenance
focused test counts
files intentionally left uncommitted
remaining six-map scope
next safest task
```

Do not claim all seven maps are aligned. The completed outcome of this plan is one approved, production-wired village first frame plus an orthogonal fallback for the other maps.
