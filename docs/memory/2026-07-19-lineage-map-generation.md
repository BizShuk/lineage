# 2026-07-19 地圖 atlas 生成與破圖修復

## 結論

《說話之島》世界場景的巨大重複菱形來自 terrain 素材尺寸與 renderer 假設不一致，不是地圖 JSON 的碰撞或出口資料損壞。已加入兩張 project-original `1024×1024`、`8×8` terrain atlas，並讓 `MapPresenter` 將每個 `128×128` source cell 縮放為現有 `16×16` world tile。

## 實作

- 新增 `public/assets/maps/terrain-overworld-v2.png` 與 `public/assets/maps/terrain-dungeon-v2.png`。
- `src/game/systems/MapPresenter.ts` 新增受測試的 `terrainAtlasLayout`，固定以 `8×8` frame grid 計算 source cell 與 tile scale。
- `src/content/data/assets.json` 保留原有 `map-*` IDs，改接新 atlas；collision、exit、NPC、quest、boss、safe tile 與 spawn zone 仍由 `.map.json` 控制。
- presented-frame QA 後將 `map-coast` 對應至 overworld frame `4`，`map-black-knight-area` 對應至 frame `2`；避免沿岸波紋材質出現在黑騎士區。
- 更新受影響的 world、panel 與 viewport visual baselines；沒有刪除舊的 `tiles-overworld.png`／`tiles-dungeon.png`。

## 素材來源邊界

公開線上 Lineage 地圖頁只用來參考區域節奏與地形語意，例如 Talking Island、Adventure Cave 與地圖區域索引；未下載、裁切或複製原始遊戲客戶端素材。參考頁：[Return Line 公開地圖](https://returnlin.com/182/c_map0.html)、[Lineage Compendium locations](https://www.lineagecompendium.com/www.lineagecompendium.com/location.html)、[Lineage Reborn map 1](https://lineage1reborn.com/?map=1&page=lookup)、[Lineage Reborn map 2](https://lineage1reborn.com/?map=2&page=lookup)。

兩張 atlas 由內建 image generation workflow 產生，經尺寸與 cell contract 檢查後放入專案；manifest 的 license 全部維持 `project-original`。

## 驗證證據

以下 gate 均於 2026-07-19 通過：

- `git diff --check`
- `npm run lint`
- `npm run typecheck`
- `npm test`：37 files、266 tests passed
- `npm run build`：production bundle passed；保留既有 bundle size 與 PWA `inlineDynamicImports` warnings
- `npm test -- tests/unit/map-presenter.test.ts tests/content/assets.test.ts tests/content/reachability.test.ts`：30 tests passed
- `npx playwright test tests/visual/visual-baselines.spec.ts --workers=1`：14 tests passed
- `npx playwright test --grep-invert "seven-stage" --workers=1`：39 tests passed
- `npm run verify:release`：preflight、Vitest、build 與完整 Playwright 40 tests 全部 passed

## 後續風險

- dungeon 紋理與 coast 紋理已通過 presented-frame gate；若要進一步提升視覺，可另開 polish slice 檢查長時間遊玩時的紋理重複度與 edge 連續性。
- 本次 `npm run verify:release` 的完整 campaign 也已通過；沒有因地圖修正改動 campaign，先前 UI slice 的 timeout 紀錄屬於歷史證據。
- build 的大 chunk 與 PWA deprecation warning 未影響本次 release gate。
- `CLAUDE.md`、`README.md`、`package-lock.json`、`.agents/`、`.gitignore`、`.vscode/` 的既有工作樹變更保留，未在本次地圖修復中回復或覆寫。
