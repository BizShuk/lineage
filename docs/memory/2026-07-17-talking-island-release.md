# 說話之島單機篇章 release closure

日期：`2026-07-17`

## 結論

說話之島單機篇章已依[設計規格](../specs/2026-07-17-talking-island-single-player-design.md)完成 release 收斂。玩家操作集中於 [README](../../README.md)，目前技術真相集中於 [CLAUDE.md](../../CLAUDE.md)，內容 ID 由 script 產生至[內容索引](../specs/generated-content-index.md)。原始[實作計畫](../../plans/2026-07-17-talking-island-implementation.md)保留為歷史交付順序，不代替目前程式碼。

production quest／claim／cast 已統一經 `GameSession` 公開 action；deterministic integration 與 browser golden path 都完成騎士建角、七段任務、真實戰鬥／掉落／商業、巴風特結局、手動存檔重載與結局後自由探索。最終 `npm run verify:release` 回傳所有 gate 通過，`README.todo` 已將本篇章移入 Archive。

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
- `GameSession` 是 quest、NPC、商店、裝備、物品、技能、快捷列、設定與倉庫的 authoritative action boundary；production scene 不再維護第二套玩家狀態。
- buff／debuff／control 依 world time 到期；area attack、cleanse、teleport、群怪單節拍攻擊上限都有 deterministic regression。
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
| Lint／型別 | PASS | release gate 內 `npm run lint` 與 `npm run typecheck` exit `0` |
| Domain／integration | PASS | Vitest `37` files、`261` tests passed |
| Production build／PWA | PASS | Vite build 完成；Workbox precache `26` entries |
| Browser／visual | PASS | Playwright Chromium `39` tests passed，單 worker 總計約 `4.1m` |
| Release gate | PASS | `npm run verify:release` 回傳 `[release] PASS all gates` |

`verify:release` 的 preflight 會要求既有 `dist/index.html`，所以最終 release 驗證順序是：

```bash
npm run build
npm run verify:release
```

第二個 command 已在本次 closure 再次執行 lint、typecheck、Vitest、build 與 Playwright E2E／visual；上表記錄該次完整輸出。

## 已知限制與授權邊界

- 支援目標是桌面 Chromium；其他 browser engine 不在目前自動化驗收矩陣。
- 存檔綁定 browser profile 的 IndexedDB，不跨裝置同步；清除站台資料前必須先匯出。
- 首次離線使用前必須在線上完整載入 production build，讓 service worker 完成快取與接管。
- repo 目前沒有 `LICENSE`、`COPYING` 或 `NOTICE`；程式碼未宣告複製、修改或再散布授權。
- 隨附 asset manifest 的 entry 皆要求 `project-original`；不得加入從原始遊戲客戶端擷取的素材。
