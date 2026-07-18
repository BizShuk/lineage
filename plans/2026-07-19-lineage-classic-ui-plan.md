# 《說話之島》經典《天堂》UI 對齊 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將《說話之島》的主選單、建角、遊戲 HUD 與全部遊戲面板，統一成早期《天堂》龍之谷狩獵場景的原創復古桌面 UI，同時維持現有操作、domain action boundary、存檔與 `640×480` 邏輯畫布。

**Architecture:** 這是 presentation-only 的分階段改造。`HudViewModel`、panel view model 與既有 action callback 保持為資料／行為契約；`Hud.ts`、`panels/shared.ts` 與各 panel 只增加語意化的 DOM 區域，`styles.css` 統一負責復古框體、資訊密度、像素化與 responsive layout。素材先重用 `public/assets/ui/classic-frame.png`、既有 sprite sheet 與 `project-original` manifest；只有資產盤點確認缺口時才新增原創圖片或動畫。

**Tech Stack:** TypeScript `5.9`、Phaser `3.90`、Vite `8.1`、原生 DOM／CSS、Vitest `4.1`、Playwright `1.61` desktop Chromium。

## Global Constraints

- 內部 viewport 固定為 `640×480`，放大時必須使用像素邊緣，不使用平滑縮放。
- UI 不得修改 `src/core/`、`src/world/`、`src/storage/` 的規則、schema、fixed timestep、autosave 或 IndexedDB 行為。
- `GameSession` 仍是 authoritative action boundary；UI 只呈現 immutable view model 並發出既有 action。
- 既有繁體中文文案、ARIA label、keyboard focus、Escape 關閉、drag/drop 與 F5–F12 快捷列行為必須保留。
- 不新增第三方相依套件；所有新增圖片或動畫使用 `project-original`，不得擷取或描摹原作客戶端資源。
- 所有行為／結構變更遵循 TDD：先新增 focused failing test，再做最小實作，然後執行 focused test 與對應完整測試。
- 主要驗證命令為 `npm run lint`、`npm run typecheck`、`npm test`、`npm run build`、`npm run test:e2e`；最後依環境執行 `npm run verify`。

## File Map

### Existing files to modify

- `src/ui/Hud.ts`：保持 `HudViewModel`，重組 HUD 語意區域與 test ids。
- `src/ui/panels/shared.ts`：提供共用 panel header、frame、body、status 與 action button class contract。
- `src/ui/panels/CharacterPanel.ts`：角色資訊／裝備槽 DOM。
- `src/ui/panels/InventoryPanel.ts`：物品圖示槽、數量、裝備與快捷列操作 DOM。
- `src/ui/panels/SpellPanel.ts`：技能圖示槽、可用／鎖定狀態與快捷列操作 DOM。
- `src/ui/panels/QuestPanel.ts`、`MapPanel.ts`、`DialoguePanel.ts`：任務／地圖／對話內容區。
- `src/ui/panels/ShopPanel.ts`、`WarehousePanel.ts`、`SettingsPanel.ts`、`SavePanel.ts`：交易、倉庫、設定與存檔的共同復古 layout。
- `src/ui/styles.css`：UI token、框體、槽位、meter、HUD layout、panel layout 與 viewport rules。
- `src/game/scenes/MenuScene.ts`、`src/game/scenes/CharacterCreateScene.ts`：場景 overlay 的語意區域與 class contract。
- `tests/unit/ui-panels.test.ts`：DOM contract、immutable view model 與操作不變性。
- `tests/e2e/hud-panels.spec.ts`、`tests/e2e/menu-character.spec.ts`：live HUD、panel action、scene accessibility contract。
- `tests/visual/visual-baselines.spec.ts-snapshots/*.png`：核准後更新的畫面 baseline。

### New files to create

- `docs/memory/2026-07-19-lineage-classic-ui.md`：完成後記錄視覺驗收證據、素材處理與未驗證風險。

### Conditional asset files

- `public/assets/ui/`：只有 `classic-frame.png` 與既有 sprites 無法提供某個被驗收畫面明確需要的 UI icon、背景或動畫時，才新增原創資產。
- `src/content/data/assets.json`：只有新增資產時才加入對應 `key`、`path`、`group`、`frame` 與 `license: "project-original"`。

---

### Task 1: Lock the HUD DOM contract before styling

**Files:**

- Modify: `src/ui/Hud.ts:31-137`
- Test: `tests/unit/ui-panels.test.ts:103-134`
- Test: `tests/e2e/hud-panels.spec.ts:12-35`

**Interfaces:**

- Consumes: existing `HudViewModel` fields `hp`, `maxHP`, `mp`, `maxMP`, `level`, `experiencePercent`, `ac`, `weight`, `weightLimit`, `alignment`, `target`, `quickSlots`, `messages`.
- Produces: stable DOM regions `world-viewport`, `hud-stats`, `hud-hp`, `hud-mp`, new `hud-exp`, `hud-target`, `hud-messages`, and `hud-quick-slots`; no new domain field.

- [ ] **Step 1: Write the failing unit assertions for the classic regions.**

Add these assertions after the existing HUD assertions in `tests/unit/ui-panels.test.ts`:

```ts
expect(findByTestId(hud.element, 'hud-exp').textContent).toContain('經驗 42%');
expect(findByTestId(hud.element, 'hud-target').textContent).toContain('哥布林');
expect(findByTestId(hud.element, 'hud-stats').getAttribute('aria-label')).toBe('角色狀態');
expect(findByTestId(hud.element, 'hud-messages').getAttribute('aria-label')).toBe('訊息紀錄');
expect(findByTestId(hud.element, 'hud-quick-slots').getAttribute('aria-label')).toBe('快捷列');
```

Add this contract assertion to the first test in `tests/e2e/hud-panels.spec.ts`:

```ts
await expect(page.getByTestId('hud-exp')).toContainText('經驗 0%');
await expect(page.getByTestId('hud-target')).toHaveText('目標：無');
```

- [ ] **Step 2: Run the focused tests and confirm the new selectors fail.**

Run:

```bash
npx vitest run tests/unit/ui-panels.test.ts -t "fixed 640x480 HUD"
npx playwright test tests/e2e/hud-panels.spec.ts -g "shows live HUD values" --workers=1
```

Expected: FAIL because `hud-exp` and `hud-target` do not exist yet.

- [ ] **Step 3: Implement the smallest HUD DOM change.**

Keep `createGauge` as the shared meter creator. Add `readonly #target: HTMLElement;` beside the existing private HUD element fields. In `Hud` construction, keep `world-viewport`, `hud-stats`, `hud-messages`, and `hud-quick-slots`, but put them into explicit regions:

```ts
const bottom = this.#document.createElement('footer');
bottom.className = 'hud-bottom-bar';

const consoleRegion = this.#document.createElement('section');
consoleRegion.className = 'hud-console';
consoleRegion.setAttribute('aria-label', '訊息紀錄');

const vitals = this.#document.createElement('section');
vitals.className = 'hud-vitals';
vitals.setAttribute('data-testid', 'hud-vitals');
vitals.setAttribute('aria-label', '角色狀態');

const actions = this.#document.createElement('section');
actions.className = 'hud-actions';
actions.setAttribute('aria-label', '目標與快捷列');

this.#target = this.#document.createElement('p');
this.#target.className = 'hud-target';
this.#target.setAttribute('data-testid', 'hud-target');

consoleRegion.append(this.#messages);
vitals.append(this.#statusRail);
actions.append(this.#target, this.#quickSlots);
bottom.append(consoleRegion, vitals, actions);
this.element.append(viewport, bottom);
```

In `render`, create the experience meter with `createGauge(this.#document, 'hud-exp', '經驗', boundedPercent(viewModel.experiencePercent), 100)` and put it beside the existing HP／MP meters. Replace the current status-rail contents with HP, MP, EXP, and the stats paragraph; assign the target text to `this.#target` so the target remains in the actions region. In the quick-slot map, set each item class to `quick-slot`. Do not change the `HudViewModel` type or action behavior.

- [ ] **Step 4: Run the focused tests and confirm they pass.**

Run the same Vitest and Playwright commands from Step 2. Expected: PASS, with the existing movement, panel, quick-slot and HUD value assertions still passing.

- [ ] **Step 5: Commit the HUD contract.**

```bash
git add src/ui/Hud.ts tests/unit/ui-panels.test.ts tests/e2e/hud-panels.spec.ts
git commit -m "feat: structure classic lineage hud regions"
```

### Task 2: Create the shared classic panel contract

**Files:**

- Modify: `src/ui/panels/shared.ts:5-64`
- Test: `tests/unit/ui-panels.test.ts:136-163`

**Interfaces:**

- Consumes: existing `PanelShell`, `createPanelShell`, `createTextRow`, `createActionButton`, and `PanelActionResult` contracts.
- Produces: every panel has `.panel-header`, `.panel-scroll`, `.panel-status`, `.panel-frame`, and shared `.panel-action` class hooks while retaining existing `data-testid` values and roles.

- [ ] **Step 1: Add failing shared-shell assertions.**

Extend the panel creation test with these checks for the inventory panel:

```ts
const inventory = panels[1];
expect(fakeElement(inventory.element).className).toContain('panel-frame');
expect(fakeElement(inventory.element).children[0]?.className).toContain('panel-header');
expect(fakeElement(inventory.element).children[1]?.className).toContain('panel-scroll');
expect(fakeElement(inventory.element).children[2]?.className).toContain('panel-status');
```

- [ ] **Step 2: Run the focused unit test and confirm it fails.**

```bash
npx vitest run tests/unit/ui-panels.test.ts -t "labelled, operable dialog"
```

Expected: FAIL because the shell currently has no `panel-frame` or `panel-header` class.

- [ ] **Step 3: Implement shared shell classes without changing behavior.**

Use this shape in `createPanelShell`:

```ts
const element = document.createElement('section');
element.className = 'game-panel panel-frame';
// Keep the existing tabIndex, role, aria-modal, aria-label, and data-testid assignments.

const header = document.createElement('header');
header.className = 'panel-header';
const heading = document.createElement('h2');
heading.className = 'panel-title';
heading.textContent = title;
header.append(heading);

const body = document.createElement('div');
body.className = 'panel-scroll';
body.setAttribute('data-testid', `${testId}-body`);

const status = document.createElement('p');
status.className = 'panel-status';
status.setAttribute('aria-live', 'polite');
status.setAttribute('data-testid', `${testId}-status`);

element.append(header, body, status);
```

Add `button.className = 'panel-action'` in `createActionButton`; do not change the callback or `data-testid`.

- [ ] **Step 4: Run the focused panel tests.**

```bash
npx vitest run tests/unit/ui-panels.test.ts
```

Expected: PASS; all nine panel roles, labels, result handling, drag/drop and settings behavior remain unchanged.

- [ ] **Step 5: Commit the shared panel contract.**

```bash
git add src/ui/panels/shared.ts tests/unit/ui-panels.test.ts
git commit -m "feat: add classic panel structure hooks"
```

### Task 3: Replace the generic skin with the classic UI token system and HUD layout

**Files:**

- Modify: `src/ui/styles.css:1-393`
- Test: `tests/e2e/hud-panels.spec.ts:12-35`
- Test: `tests/visual/visual-baselines.spec.ts:5-15`

**Interfaces:**

- Consumes: the DOM class contract from Tasks 1–2, Phaser canvas `640×480`, existing `--hud-display-scale`, and `public/assets/ui/classic-frame.png`.
- Produces: a responsive, pixelated classic HUD and shared panel skin with no domain or behavior changes.

- [ ] **Step 1: Add a failing layout contract to the HUD E2E test.**

After the live HUD assertions, add:

```ts
await expect(page.getByTestId('hud-vitals')).toBeVisible();
await expect(page.getByTestId('hud-messages')).toBeVisible();
await expect(page.getByTestId('hud-quick-slots')).toBeVisible();
await expect(page.getByTestId('hud-vitals')).toHaveCSS('display', 'grid');
await expect(page.getByTestId('hud-root')).toHaveCSS('image-rendering', 'pixelated');
```

Use `page.getByTestId('hud-root').evaluate((element) => getComputedStyle(element).gridTemplateRows)` only if a browser-specific CSS assertion is needed; do not assert exact physical pixels because `--hud-display-scale` changes with viewport.

- [ ] **Step 2: Run the HUD E2E test before styling.**

```bash
npx playwright test tests/e2e/hud-panels.spec.ts -g "shows live HUD values" --workers=1
```

Expected: the `hud-vitals` display assertion fails because the new region has no classic layout styling yet.

- [ ] **Step 3: Replace the CSS token and layout layer.**

Keep the existing global reset, `#game-root`, pixel rendering, focus styles and media query behavior. Replace the generic color declarations with this token set and use it throughout `.classic-hud`, `.game-panel`, buttons and form controls:

```css
:root {
  --classic-ink: #e9dfc5;
  --classic-muted: #a99d81;
  --classic-gold: #d5b56f;
  --classic-gold-bright: #f1d48c;
  --classic-bronze: #80613c;
  --classic-stone: #22231f;
  --classic-stone-deep: #0b0d0c;
  --classic-leather: #2b2118;
  --classic-red: #b9382e;
  --classic-blue: #365ea8;
  --classic-green: #668d4f;
}
```

Set `.classic-hud` to a fixed `640px × 480px` overlay with `grid-template-rows: minmax(0, 1fr) 96px`, a dark metal outer border, and `image-rendering: pixelated`. Use `.hud-bottom-bar` with three columns for `.hud-console`, `.hud-vitals`, and `.hud-actions`; keep `pointer-events: none` on the outer HUD and `pointer-events: auto` on interactive regions. Style meters with red／blue fills and add an EXP meter with the existing HTML `meter` element. Style `.game-panel`, `.panel-frame`, `.panel-header`, `.panel-title`, `.panel-scroll`, `.panel-status`, `.panel-action`, `.item-grid`, `.quick-slot`, `.dialogue-choices`, and form overlays using the token set. Use the existing UI asset through a CSS variable on frame-capable regions:

```css
.classic-hud,
.game-panel,
.scene-overlay {
  --classic-frame-image: url('/assets/ui/classic-frame.png');
}
```

Use `background-image` only for a safely cropped or non-disruptive frame texture; a full atlas must not be stretched over a panel. CSS gradients are allowed as the fallback when the atlas cannot be sliced without showing unrelated atlas elements.

- [ ] **Step 4: Run the focused E2E test and the HUD visual fixture.**

```bash
npx playwright test tests/e2e/hud-panels.spec.ts -g "shows live HUD values" --workers=1
npx playwright test tests/visual/visual-baselines.spec.ts -g "village remains visually stable" --workers=1
```

Expected: PASS for behavior; visual test may report an intentional screenshot mismatch and must be updated only after manual inspection at `1280×720`.

- [ ] **Step 5: Commit the token and HUD skin.**

```bash
git add src/ui/styles.css tests/e2e/hud-panels.spec.ts
git commit -m "feat: apply classic lineage hud skin"
```

### Task 4: Convert inventory, spells, character, and shared list rows to icon-slot presentation

**Files:**

- Modify: `src/ui/panels/CharacterPanel.ts:36-61`
- Modify: `src/ui/panels/InventoryPanel.ts:54-96`
- Modify: `src/ui/panels/SpellPanel.ts:50-90`
- Modify: `src/ui/panels/shared.ts:37-64` if row or slot helpers are needed
- Test: `tests/unit/ui-panels.test.ts:193-214`
- Test: `tests/e2e/hud-panels.spec.ts:31-53`

**Interfaces:**

- Consumes: existing item／spell／character view models and existing `activateItem`, `assignQuickSlot`, `activateSpell`, and `assignQuickSlot` actions.
- Produces: `.item-grid`, `.item-slot`, `.spell-grid`, `.spell-slot`, `.equipment-grid`, and `.panel-row` elements with existing test ids, button semantics, quantity text and drag/drop behavior.

- [ ] **Step 1: Add failing DOM class and icon fallback assertions.**

In `tests/unit/ui-panels.test.ts`, render a one-item inventory and assert:

```ts
expect(findByTestId(panel.element, 'inventory-item-sword').getAttribute('data-ui-kind')).toBe('item-slot');
expect(findByTestId(panel.element, 'inventory-item-sword').textContent).toContain('短劍');
```

In `tests/e2e/hud-panels.spec.ts`, after opening inventory and spells, assert the existing buttons remain operable:

```ts
await expect(page.getByTestId('inventory-item-leather-jacket')).toHaveAttribute('data-ui-kind', 'item-slot');
await expect(page.getByTestId('spell-guarded-stance')).toHaveAttribute('data-ui-kind', 'spell-slot');
```

- [ ] **Step 2: Run the focused unit test and confirm it fails.**

```bash
npx vitest run tests/unit/ui-panels.test.ts -t "keyboard activation and drag/drop"
```

Expected: FAIL because the buttons have no `data-ui-kind` attribute.

- [ ] **Step 3: Add visual-only slot metadata and preserve action paths.**

In `InventoryPanel.render`, after creating each item button, add:

```ts
button.className = 'item-slot';
button.setAttribute('data-ui-kind', 'item-slot');
button.setAttribute('aria-label', `${item.name}，數量 ${String(item.quantity)}`);
```

In `SpellPanel.render`, add:

```ts
button.className = 'spell-slot';
button.setAttribute('data-ui-kind', 'spell-slot');
button.setAttribute('aria-label', `${spell.name}，魔力 ${String(spell.manaCost)}`);
```

Wrap the existing character text rows and equipment list with `.character-summary` and `.equipment-grid`; set equipment list items to `.equipment-slot`. Do not add item lookup or icon lookup to `core`, and use the current text label as the fallback when an icon is unavailable.

- [ ] **Step 4: Run the focused UI and E2E tests.**

```bash
npx vitest run tests/unit/ui-panels.test.ts
npx playwright test tests/e2e/hud-panels.spec.ts -g "shows live HUD values" --workers=1
```

Expected: PASS, including inventory keyboard activation, drag/drop, spell disabled state, HUD quick-slot updates and character panel text.

- [ ] **Step 5: Commit the item／spell／character presentation.**

```bash
git add src/ui/panels/CharacterPanel.ts src/ui/panels/InventoryPanel.ts src/ui/panels/SpellPanel.ts src/ui/panels/shared.ts tests/unit/ui-panels.test.ts tests/e2e/hud-panels.spec.ts
git commit -m "feat: present classic item and character slots"
```

### Task 5: Apply the classic layout to quest, map, dialogue, commerce, settings, and save panels

**Files:**

- Modify: `src/ui/panels/QuestPanel.ts`
- Modify: `src/ui/panels/MapPanel.ts`
- Modify: `src/ui/panels/DialoguePanel.ts`
- Modify: `src/ui/panels/ShopPanel.ts`
- Modify: `src/ui/panels/WarehousePanel.ts`
- Modify: `src/ui/panels/SettingsPanel.ts`
- Modify: `src/ui/panels/SavePanel.ts`
- Modify: `src/ui/styles.css`
- Test: `tests/unit/ui-panels.test.ts:136-241`
- Test: `tests/e2e/hud-panels.spec.ts:67-128`
- Test: `tests/visual/visual-baselines.spec.ts:8-14`

**Interfaces:**

- Consumes: the existing panel view models, action result flow, `WindowManager` focus scope and current test ids.
- Produces: consistent list／detail／form classes: `.quest-list`, `.map-sheet`, `.dialogue-box`, `.trade-list`, `.warehouse-list`, `.settings-form`, `.save-slots`, with no changed action signatures.

- [ ] **Step 1: Add failing class contract assertions to the existing panel E2E.**

Add these checks in `tests/e2e/hud-panels.spec.ts` after each panel is opened:

```ts
await expect(page.getByTestId('shop-panel').locator('.trade-list')).toBeVisible();
await expect(page.getByTestId('warehouse-panel').locator('.warehouse-list')).toBeVisible();
await expect(page.getByTestId('dialogue-panel').locator('.dialogue-box')).toBeVisible();
await expect(page.getByTestId('settings-panel').locator('.settings-form')).toBeVisible();
```

Add one unit assertion that a quest list button retains its existing `data-testid` and gains `data-ui-kind="quest-entry"`; add a `data-testid="quest-list"` to the list so the class can be checked without depending on text.

- [ ] **Step 2: Run the commerce／dialogue／settings E2E test and confirm the new contract fails.**

```bash
npx vitest run tests/unit/ui-panels.test.ts -t "labelled, operable dialog"
npx playwright test tests/e2e/hud-panels.spec.ts -g "production transactional panels" --workers=1
```

Expected: FAIL only because the new `.trade-list`, `.warehouse-list`, `.dialogue-box`, `.settings-form`, or `data-ui-kind` hooks do not exist; existing purchase, sale, deposit, withdraw, dialogue and settings assertions must continue to execute.

- [ ] **Step 3: Add semantic classes without changing panel actions.**

Apply these exact metadata rules while keeping every existing callback:

```ts
// QuestPanel list button
button.className = 'quest-entry';
button.setAttribute('data-ui-kind', 'quest-entry');

// MapPanel location button
button.className = 'map-location';
button.setAttribute('data-ui-kind', 'map-location');

// DialoguePanel choice button
button.className = 'dialogue-choice';
button.setAttribute('data-ui-kind', 'dialogue-choice');

// ShopPanel / WarehousePanel row
row.className = 'trade-row';

// SettingsPanel form controls
shell.body.className = 'panel-scroll settings-form';
```

Use `.map-sheet`, `.dialogue-box`, `.trade-list`, `.warehouse-list`, and `.save-slots` on the relevant existing containers. Keep all `aria-description`, disabled state, status live region, file input, delete name validation, import preview token and confirmation flow intact.

Use these concrete assignments: `QuestPanel` list `className = 'quest-list'` plus `data-testid="quest-list"`; `MapPanel` list `className = 'map-sheet'`; `DialoguePanel` body `className = 'panel-scroll dialogue-box'`; `ShopPanel` list `className = 'trade-list'`; `WarehousePanel` list `className = 'warehouse-list'`; and retain the existing `save-slots` class in `SavePanel` while applying the shared frame styles.

- [ ] **Step 4: Extend CSS for the classic list／form states and run focused tests.**

Add rules for the exact classes from Step 3, using the existing token set. The list rows must keep text readable at `640×480`; the map sheet must not be a playable-map bitmap; settings and save forms must preserve visible focus outlines. Then run:

```bash
npx vitest run tests/unit/ui-panels.test.ts
npx playwright test tests/e2e/hud-panels.spec.ts -g "production transactional panels" --workers=1
npx playwright test tests/e2e/save-recovery.spec.ts --workers=1
```

Expected: PASS for domain action behavior, focus stack, save recovery and new visual class contracts.

- [ ] **Step 5: Commit all secondary panel presentation changes.**

```bash
git add src/ui/panels/QuestPanel.ts src/ui/panels/MapPanel.ts src/ui/panels/DialoguePanel.ts src/ui/panels/ShopPanel.ts src/ui/panels/WarehousePanel.ts src/ui/panels/SettingsPanel.ts src/ui/panels/SavePanel.ts src/ui/styles.css tests/unit/ui-panels.test.ts tests/e2e/hud-panels.spec.ts
git commit -m "feat: style classic quest commerce and settings panels"
```

### Task 6: Restyle menu and character creation overlays

**Files:**

- Modify: `src/game/scenes/MenuScene.ts:45-150`
- Modify: `src/game/scenes/CharacterCreateScene.ts:100-210`
- Modify: `src/ui/styles.css`
- Test: `tests/e2e/menu-character.spec.ts:10-98`
- Test: `tests/visual/visual-baselines.spec.ts:8-14`

**Interfaces:**

- Consumes: existing `SavePanel`, menu save actions, class radio inputs, name validation, content registry and `active-save` flow.
- Produces: `.classic-menu`, `.classic-save-management`, `.classic-character-form`, `.class-select`, `.attribute-panel`, `.scene-actions` classes while retaining accessible labels and existing button names.

- [ ] **Step 1: Add failing scene class assertions.**

In `tests/e2e/menu-character.spec.ts`, add after entering each scene:

```ts
await expect(page.locator('.menu-panel')).toHaveClass(/classic-menu/);
await expect(page.locator('.character-form')).toHaveClass(/classic-character-form/);
```

The scene title `建立角色` is rendered by Phaser rather than a DOM heading, so do not add a brittle heading selector; validate the DOM form and its existing accessible controls instead.

- [ ] **Step 2: Run the focused menu／character tests and confirm the new class assertions fail.**

```bash
npx playwright test tests/e2e/menu-character.spec.ts -g "creates 王族" --workers=1
```

Expected: FAIL only on the new class assertions; name validation and save creation behavior must remain reachable.

- [ ] **Step 3: Add scene classes and semantic grouping.**

In `MenuScene`, append `classic-menu` to the existing `menu-panel` class and call `panel.element.classList.add('classic-save-management')` after constructing the `SavePanel`; keep the existing save panel `aria-modal="false"` contract. In `CharacterCreateScene`, append `classic-character-form` to the existing `character-form`, add `class-select` to the fieldset, `attribute-panel` to the preview, and `scene-actions` to the action wrapper. Do not rename `角色名稱`, radio labels, `建立角色`, `返回`, `attribute-preview`, or error messages.

- [ ] **Step 4: Style and verify scene overlays.**

Add the classic central frame, title spacing, input inset, class selection slots, attribute parchment／stone panel, and narrow action footer. Ensure the form remains usable with keyboard focus and at `800×600`.

```bash
npx playwright test tests/e2e/menu-character.spec.ts --workers=1
npx playwright test tests/visual/visual-baselines.spec.ts -g "menu|character-create" --workers=1
```

Expected: all character creation and validation tests pass; visual diffs are inspected before baseline update.

- [ ] **Step 5: Commit scene overlay presentation.**

```bash
git add src/game/scenes/MenuScene.ts src/game/scenes/CharacterCreateScene.ts src/ui/styles.css tests/e2e/menu-character.spec.ts
git commit -m "feat: restyle classic menu and character creation"
```

### Task 7: Audit, integrate, or explicitly defer missing visual assets

**Files:**

- Inspect: `public/assets/ui/classic-frame.png`
- Inspect: `public/assets/sprites/items.png`
- Inspect: `public/assets/sprites/effects.png`
- Inspect: `public/assets/sprites/player-*.png`
- Inspect: `src/content/data/assets.json`
- Conditional Create: `public/assets/ui/*`
- Conditional Modify: `src/content/data/assets.json`
- Test: `tests/content/assets.test.ts`

**Interfaces:**

- Consumes: visual screenshots produced by Tasks 3–6 and the existing asset manifest.
- Produces: either no new asset (when existing original art covers the UI), or a small original UI asset pack with manifest entries and deterministic import dimensions.

- [ ] **Step 1: Run the asset and build checks before generating anything.**

```bash
npx vitest run tests/content/assets.test.ts tests/unit/build-content-index.test.ts
npm run build
```

Expected: existing assets pass and the build can load `/assets/ui/classic-frame.png`.

- [ ] **Step 2: Compare each missing visual element against the asset inventory.**

Record the result in the implementation notes using this decision table:

| Visual need | Existing source | Action |
| --- | --- | --- |
| panel／slot／button／meter frame | `classic-frame.png` | reuse via safe slice or CSS fallback |
| item icon | `sprites/items.png` | reuse with text fallback |
| spell icon／effect | `sprites/effects.png` | reuse with text fallback |
| class／character visual | `sprites/player-*.png` | reuse |
| missing decorative background or animation | none | generate an original asset only if the visual baseline has a concrete gap |

- [ ] **Step 3: If and only if a concrete gap remains, generate and QA one compact asset pack.**

Use the image generation workflow with a prompt that specifies an original pixel-art UI atlas, fixed grid, transparent background or solid `#00FF00` chroma background as appropriate, no labels, no logo, no copied character, and no scenery mixed into UI parts. Keep the result to one coherent UI family. Inspect dimensions, transparency, edge touching and frame consistency before integration.

- [ ] **Step 4: Integrate only approved original assets.**

Place each asset under `public/assets/ui/`, add an `assets.json` entry such as:

```json
{
  "key": "ui-classic-panel-frame",
  "path": "public/assets/ui/classic-panel-frame.png",
  "group": "ui",
  "frame": 0,
  "license": "project-original"
}
```

Use the asset in CSS or an explicit UI adapter. Do not place asset lookup in `core`, `world`, or save data. If no gap remains, do not add a generated asset merely to increase file count.

- [ ] **Step 5: Run content and production checks.**

```bash
npm run content:index
npx vitest run tests/content/assets.test.ts tests/content/references.test.ts tests/unit/build-content-index.test.ts
npm run build
```

Expected: all asset entries use valid paths and `project-original`; generated content index changes only when the manifest actually changed.

- [ ] **Step 6: Commit only if assets or manifest changed.**

```bash
git add public/assets/ui src/content/data/assets.json docs/specs/generated-content-index.md
git commit -m "feat: add original classic ui art"
```

If the audit found no gap, skip this commit and record `no new art required` in the handoff.

### Task 8: Update visual baselines and run the complete UI regression gate

**Files:**

- Modify: `tests/visual/visual-baselines.spec.ts-snapshots/*.png`
- Modify: `tests/visual/visual-baselines.spec.ts` only if a new stable fixture or assertion is needed
- Create: `docs/memory/2026-07-19-lineage-classic-ui.md`
- Modify: `CODEX_HANDOFF.md`

**Interfaces:**

- Consumes: completed UI implementation and any approved assets from Tasks 1–7.
- Produces: reviewed screenshots, test evidence, documented risks and a clean implementation handoff.

- [ ] **Step 1: Run all visual fixtures at the existing viewport and inspect each diff.**

```bash
npx playwright test tests/visual/visual-baselines.spec.ts --workers=1
```

Expected: screenshot diffs correspond only to the approved classic UI redesign. Reject any diff that hides the player, target, panel content, focus state or action control.

- [ ] **Step 2: Run the required viewport centering contract.**

```bash
npx playwright test tests/visual/visual-baselines.spec.ts -g "keeps the 640x480 logical canvas centered" --workers=1
```

Expected: all `800×600`, `1280×720`, and `1920×1080` checks pass with canvas width `640`, height `480`, pixelated rendering, and centered bounds.

- [ ] **Step 3: Update baselines only after manual inspection.**

```bash
npx playwright test tests/visual/visual-baselines.spec.ts --workers=1 --update-snapshots
```

Review the changed PNG list with `git status --short`; keep only the expected menu, character-create, world, and panel baseline updates.

- [ ] **Step 4: Run the full verification sequence.**

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Expected: every command exits `0`; if an unrelated pre-existing failure appears, record the exact command and failure in the handoff instead of changing core code.

- [ ] **Step 5: Write the release evidence and update handoff.**

Create `docs/memory/2026-07-19-lineage-classic-ui.md` with the actual changed file list, visual fixture names, commands and results, asset decision, and any unverified browser／image risk. Update `CODEX_HANDOFF.md` with phase status `UI alignment complete`, the final commits, test results, known risks, and the next safest task.

- [ ] **Step 6: Commit the verified UI alignment.**

```bash
git add src tests docs/memory/2026-07-19-lineage-classic-ui.md CODEX_HANDOFF.md
git commit -m "feat: complete classic lineage ui alignment"
```

## Self-review checklist

- Spec coverage: Tasks 1–3 cover the HUD, common frame, token system and `640×480` constraints; Tasks 4–6 cover every panel and both scene overlays; Task 7 covers asset reuse／generation and manifest rules; Task 8 covers visual baselines, regression, memory and handoff.
- Placeholder scan: the plan contains no unresolved marker, unresolved choice, or unspecified test command.
- Type consistency: all tasks preserve the existing `HudViewModel`, `PanelShell`, `PanelActionResult<T>`, panel action callbacks, test ids and `WindowManager` contracts.
- Scope: no task changes gameplay, world simulation, storage, service worker, or dependencies.
