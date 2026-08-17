# 說話之島單機致敬版 — 術語表 (Terminology)

本檔是本專案`術語的單一定義來源 (single source of truth)`。README.md、CLAUDE.md、
`docs/specs/`、程式碼與 commit message 一律引用此處用詞；同一概念不得有第二種說法。
玩家文案使用繁體中文，程式識別字使用英文；本表兩者並列。

## 內容目錄 (Content Catalog)

| 術語 (Term) | 英文 (English) | 定義 (Definition) | 出處 (Source) |
| ----------- | -------------- | ----------------- | ------------- |
| 內容目錄 | GameContent | 經 Zod 驗證後 deep-frozen 的不可變內容集合；規則層唯一的資料來源 | `src/content/catalog.ts` |
| 內容載入 | loadGameContent | 驗證結構、唯一 ID 與所有跨資料參照，通過後才建立目錄 | `src/content/loadContent.ts` |
| 資產清單 | Asset Manifest | V1 格式的素材授權登記；所有 entry 的 license 必須為 `project-original` | `src/content/data/assets.json`, `src/content/assets.ts` |
| 產生的內容索引 | Generated Content Index | 由腳本重建的內容 ID 索引，禁止手動編輯 | `docs/specs/generated-content-index.md`, `scripts/build-content-index.ts` |
| 內容類別 | Content Categories | 固定七類：`classes`、`items`、`abilities`、`npcs`、`monsters`、`quests`、`maps` | `src/content/schema.ts` |

## 世界模擬 (World Simulation)

| 術語 (Term) | 英文 (English) | 定義 (Definition) | 出處 (Source) |
| ----------- | -------------- | ----------------- | ------------- |
| 世界控制器 | WorldController | 以 `50ms` fixed timestep 推進世界；單次 frame delta 上限 `250ms` | `src/game/systems/WorldController.ts` |
| 世界投影 | WorldProjection | 邏輯 grid 到畫面座標的轉換；村莊使用 `2:1` 等角模式，其餘六張地圖為 orthogonal | `src/game/systems/WorldProjection.ts` |
| 遊戲工作階段 | GameSession | 玩家操作的唯一 authoritative boundary；先驗證 proximity／role／target 再交給 domain controller | `src/game/systems/GameSession.ts` |
| 世界時間 | World Time | 驅動 cooldown、AI tick 與狀態到期的時間軸；不以畫面 frame count 驅動 | `src/game/systems/WorldController.ts` |
| 尋路 | Pathfinding | A* 格點尋路；只接受四方向單格移動或滑鼠地面尋路 | `src/world/pathfinding.ts` |
| 自動攻擊目標 | Auto-Attack Target | 點擊敵人後鎖定的目標；玩家改變移動指令即取消 | `src/game/systems/InputController.ts` |
| 範圍攻擊 | Area Attack | 以目標為中心影響 Chebyshev radius `2` 內的存活敵人；MP、cooldown 與 reagent 只支付一次 | `src/core/combat.ts` |
| 執行期狀態 | Runtime Status | buff／debuff／control；以 world time 到期，地圖轉換、死亡重生與怪物重生會清除，不寫入存檔 | `src/core/model.ts` |
| 原子回退 | Atomic Fallback | 村莊 atlas／presentation data 無效時，terrain、entity、camera 與 pointer 以同一決策一起退回 orthogonal presenter | `src/game/systems/MapPresenter.ts` |

## 存檔與復原 (Save and Recovery)

| 術語 (Term) | 英文 (English) | 定義 (Definition) | 出處 (Source) |
| ----------- | -------------- | ----------------- | ------------- |
| 存檔格式 | SaveGameV1 | 目前存檔 schema，含 `schemaVersion`、`gameVersion`、`slot`、`updatedAt`、`checksum` | `src/storage/saveSchema.ts` |
| 存檔倉庫 | SaveRepository | IndexedDB 的 `saves` 與 `backups` 兩個 object store；新寫入前先把同欄目前值放入 backup | `src/storage/SaveRepository.ts` |
| 自動存檔協調器 | AutosaveCoordinator | 合併同一 microtask 的 pending requests，只在成功 snapshot 後寫入，戰鬥交易未完成前延後 | `src/storage/AutosaveCoordinator.ts` |
| 遷移 | migrateSave | V0 → V1 的存檔升級；所有 load／import／restore 都須先經過 | `src/storage/migrations.ts` |
| 驗證權杖 | Validation Token | import 預覽產生的不透明憑證；確認後才重新指定 slot 並重算 checksum | `src/storage/SaveRepository.ts` |
| 錯誤邊界 | ErrorBoundary | 捕捉 runtime error 後暫停並 best-effort 存檔，提供三種復原 action | `src/app/ErrorBoundary.ts` |

## 狀態值 (Status Values)

| 狀態 | 字面值 (Literal) | 語意 | 出處 |
| ---- | ---------------- | ---- | ---- |
| 自動存檔原因 | `map-change` / `quest-stage` / `death-respawn` / `return-menu` / `manual` | 觸發 autosave 的五個固定原因；不得另造語意相同的 reason | `src/storage/AutosaveCoordinator.ts` |
| 職業 ID | `prince` / `knight` / `elf` / `wizard` | 王族／騎士／妖精／法師 | `src/content/data/classes.json` |
| 地圖 ID | `talking-island-village` / `scarecrow-field` / `north-field` / `coast` / `black-knight-area` / `talking-island-dungeon-1` / `talking-island-dungeon-2` | 七個區域；新角色從 `scarecrow-field` 入口開始 | `src/content/data/maps.json` |
| 任務目標種類 | `kill` / `collect` / `defeat` / `defeat-patrol` | 任務 objective 的 `kind` 字面值 | `src/core/quests.ts` |
| 任務事件 | `npc-talked` / `monster-defeated` / `item-acquired` / `area-entered` / `boss-defeated` | 推進任務階段的事件型別 | `src/core/quests.ts` |
| 預設階段 | `in-progress` | 任務未宣告 `stages` 時的隱含單一階段 ID | `src/core/quests.ts` |
| 存檔欄位 | `1` / `2` / `3` | 三個存檔欄；刪除須完整輸入該欄角色名稱 | `src/storage/saveSchema.ts` |
| 素材授權 | `project-original` | 資產清單唯一合法的 license 值 | `src/content/data/assets.json` |

## 數值規則 (Numeric Rules)

| 規則 | 值 | 說明 | 出處 |
| ---- | -- | ---- | ---- |
| 等級範圍 | `1`–`15` | 完整支援；預期通關等級 12–15 | `src/core/stats.ts` (`MIN_LEVEL` / `MAX_LEVEL`) |
| 能力值 | `str` / `dex` / `con` / `int` / `wis` / `cha` | 力量、敏捷、體質、智力、精神、魅力共 6 項 | `src/core/stats.ts` (`CLASS_ATTRIBUTES`) |
| 防禦係數 | AC | 數字越低代表防禦越強 | `src/core/stats.ts` |
| 固定步進 | `50ms` | world tick；frame delta 上限 `250ms` | `src/game/systems/WorldController.ts` |
| 攻擊冷卻 | `500ms` | 玩家攻擊 cooldown 與怪物 AI tick 同值 | `src/game/systems/WorldController.ts`, `src/world/ai.ts` |
| 邏輯畫面 | `640×480` | Phaser camera viewport `640×384` + DOM HUD `640×96` | `src/app/` |
| 玩家 atlas | `8` 方向 × `6` 狀態 | 四職玩家的完整 pose 切分 | `src/game/systems/SpriteAtlas.ts` |

## 縮寫 (Abbreviations)

| 縮寫 | 全稱 | 說明 |
| ---- | ---- | ---- |
| AC | Armor Class | 防禦係數，越低越強 |
| PWA | Progressive Web App | 離線能力來源；`vite-plugin-pwa` + Workbox precache |
| HUD | Heads-Up Display | 底部 `640×96` DOM 面板，不得改寫 domain state |
| RNG | Random Number Generator | 可決定性亂數來源，測試以 fixture 固定 |

> 待補 (To be extended)：音訊領域（`src/audio/`）的 bus 與 cue 命名、
> 以及 `src/core/progression.ts` 的經驗與掉落曲線術語尚未收錄。
