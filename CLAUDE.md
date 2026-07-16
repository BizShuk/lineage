# Lineage 專案技術脈絡

## 專案目標

本 repo 實作桌面版 Chromium 可離線執行的《天堂》說話之島單機致敬版。玩家文案使用繁體中文，程式識別字使用英文；不實作伺服器、帳號、多人連線、PVP、血盟、攻城、玩家交易、交易所或課金。

規則、內容與驗收以[設計規格](docs/specs/2026-07-17-talking-island-single-player-design.md)為準，玩家操作以[README](README.md)為準，內容 ID 以[自動產生的內容索引](docs/specs/generated-content-index.md)為準。原始[實作計畫](plans/2026-07-17-talking-island-implementation.md)保留作為交付順序與決策背景，不代替目前程式碼。

## 技術組合

| 範圍 | 實作 |
| --- | --- |
| Runtime | TypeScript `5.9`、Phaser `3.90`、Vite `8.1` |
| 內容驗證 | Zod `4.4`、versioned JSON、immutable typed catalog |
| 儲存 | IndexedDB、`idb`、checksum、schema migration、current／backup stores |
| 離線 | `vite-plugin-pwa` inject manifest、Workbox precache |
| 測試 | Vitest `4.1`、Playwright `1.61` desktop Chromium |
| 執行環境 | Node.js `24.x`、npm `11.x` |

依 `package-lock.json` 鎖定實際套件版本；遊戲版本由 `src/app/version.ts` 的 `GAME_VERSION` 定義。

## 實際結構

```text
.
├── public/
│   ├── assets/                     # project-original map data and raster assets
│   └── manifest.webmanifest        # zh-Hant standalone manifest
├── src/
│   ├── app/                        # Phaser composition、設定、版本、ErrorBoundary
│   ├── audio/                      # AudioDirector、Web Audio port、原創合成音樂／音效
│   ├── content/
│   │   ├── data/                   # classes/items/abilities/npcs/monsters/quests/maps/assets JSON
│   │   ├── schema.ts               # Zod schema 與 content types
│   │   ├── loadContent.ts          # 結構、唯一 ID、跨資料參照驗證
│   │   ├── catalog.ts              # deep-frozen typed catalog 與必要查詢
│   │   └── assets.ts               # asset manifest 解析
│   ├── core/                       # combat、inventory、progression、quests、stats、RNG、events
│   ├── world/                      # grid、A* pathfinding、AI、地圖轉換
│   ├── storage/                    # save schema、checksum、migration、repository、autosave
│   ├── game/
│   │   ├── scenes/                 # Boot、Menu、CharacterCreate、World
│   │   └── systems/                # GameSession action boundary、world 與 presentation adapters
│   ├── ui/
│   │   ├── panels/                 # inventory、character、spells、quests、map、shop、settings、save
│   │   ├── Hud.ts
│   │   ├── WindowManager.ts
│   │   ├── WorldUi.ts
│   │   └── styles.css
│   ├── main.ts                     # browser composition root
│   └── service-worker.ts           # Workbox versioned precache
├── tests/
│   ├── unit/                       # pure rules、UI contracts、storage、audio、release scripts
│   ├── content/                    # schema、references、floors、asset manifest
│   ├── integration/                # cross-module game flows、autosave、full playthrough
│   ├── e2e/                        # browser player flows、save recovery、offline production
│   ├── visual/                     # menu/world/panels at required desktop resolutions
│   └── helpers/                    # deterministic fixtures and playthrough driver
├── scripts/
│   ├── build-content-index.ts      # deterministic generated content index
│   └── verify-release.mjs          # preflight and executable release gates
├── docs/specs/                     # approved spec and generated content index
├── docs/memory/                    # release evidence and retrospective decisions
└── plans/                          # historical implementation plan
```

`AGENTS.md` 必須維持為指向 `CLAUDE.md` 的相對 symlink；`verify:release` 會直接檢查 target 是否恰為 `CLAUDE.md`。

## 依賴邊界

```text
main/app/scenes/ui/audio
            │
            ├──> game systems ──> world ──> core
            ├──> content catalog ─────────> core types
            └──> storage ─────────────────> stable domain state
```

- `core` 是純 TypeScript 規則，不得 import Phaser、DOM、IndexedDB 或具體 JSON。
- `world` 負責座標、碰撞、尋徑、AI 與地圖轉換；可使用 `core`，不得知道 DOM 或 IndexedDB。
- `content` 先驗證 versioned JSON、唯一 ID 及所有跨資料參照，再建立 deep-frozen `GameContent`；規則不得直接讀未驗證 JSON。
- `game/systems` 將 Phaser input、時間與 rendering 轉接到 `world`／`core`，不得另建戰鬥、任務或掉落規則。
- `GameSession` 是玩家操作的唯一 authoritative boundary；quest、NPC、商店、裝備、物品、施法、快捷列、設定與倉庫操作都先驗證 proximity／role／target，再交由 domain controller 執行。
- `ui` 只呈現 immutable view model 與發出 action，不得計算戰鬥、經驗、任務或商店結果。
- `storage` 只序列化穩定 domain state，不得保存 Phaser object、DOM node 或 runtime controller。
- repo 不得直接依賴其他應用層專案；共用能力必須下沉至框架層。

## 啟動與內容流程

```text
main.ts
  -> createGame / BootScene
  -> loadGameContent
  -> Zod parse + duplicate/reference checks
  -> immutable GameContent catalog
  -> MenuScene -> CharacterCreateScene -> WorldScene
```

內容類別固定為 `classes`、`items`、`abilities`、`npcs`、`monsters`、`quests`、`maps`。`loadContent.ts` 必須阻止重複 ID、無效 class/item/ability/monster/NPC/quest/map reference；`catalog.ts` 的必要查詢在找不到 ID 時直接失敗，不回傳隱含 fallback。

目前 generated index 記錄 `4` 職業、`49` 物品、`29` 能力、`17` NPC、`15` 怪物、`17` 任務與 `7` 地圖。新增或刪除內容後必須執行：

```bash
npm run content:index
```

`docs/specs/generated-content-index.md` 是產物，禁止手動維護。

## 世界模擬與呈現

- `WorldController` 使用 `50ms` fixed timestep；單次 frame delta 上限為 `250ms`，避免背景分頁恢復時追趕過量更新。
- 玩家攻擊 cooldown 與怪物 AI tick 目前都是 `500ms`，以 world time 驅動，不以畫面 frame count 驅動。
- 同一個怪物 AI interval 最多提交一次對玩家的攻擊；其他已就緒怪物仍可追擊，但保留 cooldown，避免單機群怪在同一節拍同時造成不可反應的傷害。
- 輸入只接受四方向單格鍵盤移動或滑鼠地面尋路；玩家一旦改變移動指令就取消 auto-attack target。
- 玩家與怪物的 buff／debuff／control 是 runtime status，以 world time 到期；地圖轉換、死亡重生與怪物重生會清除，不寫入 `SaveGameV1`。
- `area attack` 以目標為中心影響 Chebyshev radius `2` 內的存活敵人，但 MP、cooldown 與 reagent 只支付一次；teleport 返回目前地圖入口，light／detect 保留為可觀測的限時狀態，cure-poison 清除負面狀態。
- `MapPresenter`、`EntityRenderer` 與 `CombatPresenter` 只讀 controller state／domain events，負責 Phaser tile、sprite、tween 與 floating text。
- Phaser 內部 viewport 固定 `640×480`；HUD 與 DOM panels 不得改寫 domain state。
- AC 數字越低代表防禦越強；等級範圍固定為 `1–15`。

## 存檔 schema 與寫入流程

`SaveGameV1` 保存：

```text
schemaVersion = 1
gameVersion
slot = 1 | 2 | 3
updatedAt
checksum
character
inventory
equipment
quests
world
quickSlots
settings { music, ambient, effects, muted, scale }
```

儲存規則：

- `SaveRepository` 使用 IndexedDB 的 `saves` 與 `backups` object stores；新寫入前先把同欄目前值放入 backup。
- 所有 load/import/restore 都經 `migrateSave`、Zod structure validation 與 checksum validation；V0 可遷移並重新封裝為 V1。
- import 先在 UI 建立 validation preview，再以不透明 validation token 確認；寫入時重新指定目標 slot 並重算 checksum。
- delete 必須與目前角色名稱完全相同，成功後同時刪除 current 與 backup。
- `AutosaveCoordinator` 合併同一 microtask 內的 pending requests、只在成功 snapshot 後寫入，並在 combat transaction 完成前延後存檔。
- autosave reason 固定為 `map-change`、`quest-stage`、`death-respawn`、`return-menu`、`manual`；不得另造語意相同的 reason。
- `updatedAt` 必須在實際寫入時更新，checksum 必須涵蓋穩定 payload。

## 離線、音訊與錯誤復原

- Vite production build 使用 `injectManifest`，precache `html/js/css/json/png/webmanifest`；單檔上限 `8 MiB`。
- service worker cache prefix 是 `talking-island`，suffix 使用 `GAME_VERSION`，並清除舊版 cache。
- `AudioDirector` 管理 user-gesture unlock、場景音樂／環境音切換、mute 與三類音量；`WebAudioPort` 是唯一具體 Web Audio adapter。音訊失敗不得阻斷遊戲規則。
- `ErrorBoundary` 捕捉 runtime error 後先暫停並 best-effort 存檔，再提供返回主選單、載入最近存檔、匯出診斷 JSON 三種復原 action。

## 測試分層

| Gate | 覆蓋範圍 |
| --- | --- |
| `npm run lint` | 全 repo ESLint，`--max-warnings 0` |
| `npm run typecheck` | strict TypeScript，no emit |
| `npm test` | `src/**/*.test.ts`、`tests/unit`、`tests/content`、`tests/integration`，含公開 action 的完整 production campaign |
| `npm run test:e2e` | `tests/e2e/**/*.spec.ts`、`tests/visual/**/*.spec.ts`，desktop Chromium |
| `npm run build` | typecheck 後建立 Vite production bundle 與 service worker |
| `npm run verify` | lint -> typecheck -> test -> build -> test:e2e |

Visual baselines 覆蓋主選單、角色建立、村莊、野外／地監、物品／法術／商店／設定等畫面，並檢查 `800×600`、`1280×720`、`1920×1080` 的置中與像素化呈現。Playwright 固定使用單一 worker，避免多個 WebGL browser context 同時耗盡本機資源。完整 campaign E2E 只透過真實 UI 操作；測試 probe 只可回傳 deep-cloned snapshot，不得提供 mutation method。

每項行為變更遵循 TDD：先觀察 focused test 因預期原因失敗，再做最小實作並跑相關完整測試。修正 domain rule 時優先在 unit／integration 層建立 deterministic fixture；只有瀏覽器整合與 visual layout 放到 Playwright。

## Release gate

`verify:release` 會先檢查：

- `AGENTS.md -> CLAUDE.md` symlink。
- `README.md`、`CLAUDE.md`、`README.todo`、`docs/memory/`。
- 職業、物品、能力、NPC、普通怪、三個特定首領／事件怪、主線／職業／支線、地圖的內容下限。
- `src/content/data/assets.json` 是非空 V1 manifest，且所有 entry 的 license 都是 `project-original`。
- `dist/index.html` 已存在。

因 preflight 在執行內建 build gate 前就要求 `dist/index.html`，release 順序固定為：

```bash
npm run build
npm run verify:release
```

通過 preflight 後，script 依序執行 lint、typecheck、Vitest、build、Playwright E2E／visual。任何 gate 失敗都立即停止並回報 gate 名稱。

## 內容下限與固定規則

| 類型 | 要求 |
| --- | --- |
| 職業 | `王族`、`騎士`、`妖精`、`法師`共 4 個 |
| 能力值 | 力量、敏捷、體質、智力、精神、魅力共 6 項 |
| 等級 | 完整支援 1–15；預期通關等級 12–15 |
| 區域 | 村莊、稻草人區、北部野外、海岸、黑騎士區、地監一樓、地監二樓共 7 區 |
| NPC | 至少 15 名 |
| 敵人 | 至少 10 種普通怪物，加黑騎士 elite、克特 event 與巴風特 boss |
| 物品 | 至少 40 件 |
| 魔法／技能 | 至少 20 項 |
| 任務 | 6 階段主線、4 條職業引導分支、至少 6 個支線 |
| 畫面 | 內部 viewport 固定 `640×480`，放大時不得平滑像素 |
| 存檔 | 3 個存檔欄；含 schema version、game version、timestamp、checksum |

首輪通關時間目標為 `3–5` 小時。所有素材必須原創或可合法再散布，不得複製原始遊戲客戶端資源。目前 repo 未提供程式碼授權檔，不得自行推定或補上 license。

## 文件同步規則

- 玩家可見操作、安裝、離線或存檔行為變更時，同步更新 `README.md`。
- 模組邊界、schema、fixed timestep、測試或 release gate 變更時，同步更新本檔。
- 內容 JSON 變更時重跑 `npm run content:index`，不要手改 generated index。
- 發行驗證證據與當次限制寫入 `docs/memory/YYYY-MM-DD-<topic>.md`，不要覆寫歷史紀錄。
