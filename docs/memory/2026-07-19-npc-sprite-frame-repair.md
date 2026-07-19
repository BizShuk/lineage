# 2026-07-19 NPC sprite frame 破圖修復

## 根因

`public/assets/sprites/npcs.png` 是 `1536×1024` 的 NPC 角色表：實際排列為 `16` 欄、`5` 列，每列每 4 個水平 pose 組成一個 NPC。舊版 `BootScene` 將所有非 detailed entity 以通用 `8×8` atlas 處理，每個 cell 再切成 `2×2` 的 `96×64` frame；NPC 角色高度約 `156` 像素，因此只保留上半身，造成畫面上看見頭部或殘缺角色。

## 修正

- 新增 `src/game/systems/SpriteAtlas.ts` 的 `npcAtlasFrame`，依 `16×5` sheet 與每個 NPC 四個水平 pose 計算完整 `96×204` source frame。
- `BootScene` 對 `npc-*` manifest entry 使用 NPC 專用 layout；其他 class、monster、item 與 effect 的既有 frame layout 不變。
- 以 TDD 建立 `tests/unit/sprite-atlas.test.ts`，涵蓋第一列、跨列、最後一個 pose 與非法索引。
- 更新 village、inventory、spells、shop、settings 五張 visual baselines；實際 presented frame 已確認 NPC 顯示完整。
- 沒有重產或替換 `npcs.png`，因素材本身完整，問題只在 runtime frame slicing。

## 驗證

- `npm test -- tests/unit/sprite-atlas.test.ts`：2 tests passed；先以缺少 helper 的預期錯誤完成 RED，再以最小實作 GREEN。
- `npm run lint`：通過。
- `npm run typecheck`：通過。
- `npm test`：38 files、268 tests passed。
- `npm run build`：通過；保留既有 bundle size 與 PWA `inlineDynamicImports` warnings。
- `npx playwright test tests/visual/visual-baselines.spec.ts --workers=1`：14 tests passed。
- `npx playwright test --grep-invert "seven-stage" --workers=1`：39 tests passed。
- `npm run verify:release`：preflight、lint、typecheck、Vitest、build 通過；完整 Playwright 只有既有七階段 campaign 在 `completeEnding` movement loop 超過 `180s`，其餘 39 tests 通過。

## 目前風險

`npcs.png` 的 source frame 已正確切出，但 NPC 顯示尺寸仍共用 `28×36`；若日後要讓不同體型角色保留個別比例，應另開 sprite display-size polish，不要再改 atlas frame contract。完整 campaign timeout 仍是獨立問題。
