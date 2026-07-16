# 說話之島單機篇章 release closure

日期：`2026-07-17`

## 結論

說話之島單機篇章已依[設計規格](../specs/2026-07-17-talking-island-single-player-design.md)完成 release 文件初步收斂。玩家操作集中於 [README](../../README.md)，目前技術真相集中於 [CLAUDE.md](../../CLAUDE.md)，內容 ID 由 script 產生至[內容索引](../specs/generated-content-index.md)。原始[實作計畫](../../plans/2026-07-17-talking-island-implementation.md)保留為歷史交付順序，不代替目前程式碼。

本紀錄只列出建立當下已有直接證據的結果。production quest／claim／cast 的 session 串接與 browser golden path 尚在整合，`README.todo` 因此保持 active；待這些工作與 `npm run verify:release` 全部通過後，再補記最終結果並移入 Archive。

## 交付範圍

- `4` 個職業與 `6` 項能力值，等級範圍 `1–15`。
- `7` 張區域地圖：村莊、稻草人區、北部野外、海岸、黑騎士區、地監一樓、地監二樓。
- `6` 階段主線、`4` 條職業引導與至少 `6` 個支線。
- 桌面 Chromium 的 `640×480` Phaser viewport、DOM HUD／panels 與像素化倍率。
- 純瀏覽器 runtime；不含伺服器、帳號、多人連線或課金。
- IndexedDB 三欄存檔、current／backup、匯入預覽與確認、匯出 JSON、checksum 與 migration。
- Workbox precache 的 production offline path、Web Audio adapter 與 runtime error recovery。

## 內容快照

`npm run content:index` 於本次 closure 成功執行，從 `src/content/data/*.json` 產生固定排序的索引：

| 類型 | 數量 |
| --- | ---: |
| Classes | 4 |
| Items | 49 |
| Abilities | 29 |
| NPCs | 17 |
| Monsters | 15 |
| Quests | 17 |
| Maps | 7 |

內容索引是 generated artifact；後續資料異動應重跑 command，不得手工修補數量或 ID。

## 穩定架構決策

- `core` 保持純 TypeScript domain rules；Phaser、DOM 與 IndexedDB 留在 adapter／composition layer。
- JSON 先經 Zod structure、重複 ID 與跨 catalog reference validation，再建立 deep-frozen typed catalog。
- `WorldController` 使用 `50ms` fixed timestep，單 frame delta 最多消化 `250ms`；模擬時間不依賴 render frame rate。
- presentation 由 `MapPresenter`、`EntityRenderer`、`CombatPresenter`、UI panels 消費 state／events，不複製 domain rule。
- 存檔只保存穩定 domain state；同欄覆寫前保留上一份 backup，匯入與 restore 都重新驗證。
- autosave reason 固定為 `map-change`、`quest-stage`、`death-respawn`、`return-menu`、`manual`，戰鬥交易未完成時延後寫入。
- PWA cache suffix 使用 `GAME_VERSION`，新版接管時清理舊 cache；開發伺服器不作為離線驗收證據。

## 文件校正

本次依實際 input controller 校正玩家操作：

- `WASD`／方向鍵是四方向單格移動，不是八方向。
- 法術面板快捷鍵是 `Shift+S`；單獨 `S` 是向下移動。
- `Space` 只攻擊目前鎖定的 auto-attack target，不自行選取最近敵人。
- `Esc` 關閉最上層 panel，不宣稱另有 pause menu。

也補上 production preview、離線初次載入限制、存檔匯入／匯出／備份／刪除、runtime recovery、release gate 順序與 troubleshooting。

## 已有驗證證據

| 檢查 | 結果 | 證據 |
| --- | --- | --- |
| 內容索引產生 | PASS | `npm run content:index` 回報產物已寫入 `docs/specs/generated-content-index.md` |
| 統一介面 symlink | PASS | `readlink AGENTS.md` 回傳 `CLAUDE.md` |
| generated counts | PASS | 產物列出 4／49／29／17／15／17／7，與 source JSON 相符 |

`verify:release` 的 preflight 會要求既有 `dist/index.html`，所以最終 release 驗證順序是：

```bash
npm run build
npm run verify:release
```

第二個 command 會再次執行 lint、typecheck、Vitest、build 與 Playwright E2E／visual；整合者應以該次完整輸出作為最終發行證據。

## 已知限制與授權邊界

- 支援目標是桌面 Chromium；其他 browser engine 不在目前自動化驗收矩陣。
- 存檔綁定 browser profile 的 IndexedDB，不跨裝置同步；清除站台資料前必須先匯出。
- 首次離線使用前必須在線上完整載入 production build，讓 service worker 完成快取與接管。
- repo 目前沒有 `LICENSE`、`COPYING` 或 `NOTICE`；程式碼未宣告複製、修改或再散布授權。
- 隨附 asset manifest 的 entry 皆要求 `project-original`；不得加入從原始遊戲客戶端擷取的素材。
