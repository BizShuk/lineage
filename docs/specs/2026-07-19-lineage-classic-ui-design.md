# 《說話之島》經典《天堂》UI 對齊設計

## 狀態

- 日期：2026-07-19
- 階段：`polish`
- 目標：將現有《說話之島》單機版的主選單、建角、遊戲 HUD 與所有遊戲面板，統一成早期《天堂》龍之谷狩獵場景可辨識的復古桌面介面。
- 範圍：視覺語言、資訊編排、DOM 結構、原創 UI 素材與視覺驗收。
- 不變：核心規則、遊戲流程、存檔 schema、輸入快捷鍵、`640×480` 邏輯畫布、離線架構。

## 參考與設計原則

公開的經典《天堂》龍之谷畫面可觀察到幾項共通特徵：低飽和岩灰／褐色世界、暗色金屬框、金色小字、底部生命／魔力／經驗資訊與技能列，以及聊天或系統訊息區。本設計只採用這些高層次的介面語言，不擷取、描摹或重新散布原作客戶端素材。

參考：

- [NCSOFT Lineage Classic 公開截圖](https://lineageclassic.plaync.com/ko-kr/board/pic/view?articleId=69858846f2a097067686b4e9&targetLanguage=en&translate=false)
- [Lineage Classic 龍之谷戰鬥畫面](https://www.inven.co.kr/webzine/news/?news=313943&site=lineageclassic)

設計遵循：

- `像素優先`：維持現有 Phaser `pixelArt` 與 CSS `image-rendering: pixelated`，避免現代圓角卡片、柔和漸層與過度留白。
- `金屬框分層`：外框使用銅金與深石灰雙層邊界；內容區使用深褐皮革或炭黑石材質感。
- `資訊密度`：把戰鬥中最常看的生命、魔力、經驗、目標、訊息與快捷操作集中在底部控制區，讓世界畫面保持主視覺。
- `繁體中文可讀`：保留現有繁體中文文案與 ARIA 名稱；金色只用於標題、重要數值與選取狀態，錯誤與戰鬥回饋保留語意色彩。
- `原創邊界`：現有 `project-original` 素材優先；只有素材盤點確認缺口後，才產製風格相近的原創圖片或動畫，並登錄 manifest。

## 目前問題

現有世界 HUD 已具備狀態、訊息與八格快捷列，但畫面呈現為右側狀態欄加底部列表；主選單與建角畫面則是一般深色表單。各 panel 目前共享色彩，但尚未共享完整的經典框體、槽位、頁籤、圖示與資訊層級，因此玩家會感覺像「有復古色票的網頁 UI」，而非同一套遊戲客戶端介面。

現有 `public/assets/ui/classic-frame.png` 已提供原創金屬框、格槽、按鈕、捲軸、生命／魔力條與訊息框零件。第一輪先以該素材和既有 sprites、effects、items 為主，避免無必要地重新產圖。

## 目標畫面

### 1. 遊戲 HUD

`Hud` 仍接收現有 `HudViewModel`，但將呈現區拆成以下固定邏輯區域：

```text
┌────────────────────────────── 640 ──────────────────────────────┐
│                         世界畫面／目標提示                       │
│                                                                  │
│                                                                  │
├──────────────┬──────────────────┬───────────────────────────────┤
│ 訊息／聊天    │ 角色 HP MP EXP    │ 目標、金幣、快捷技能／物品列   │
│ 系統／戰鬥    │ 等級、AC、負重    │ 1–8 槽位、冷卻與數量            │
└──────────────┴──────────────────┴───────────────────────────────┘
```

- 保留 `data-testid="hud-root"`、`hud-stats`、`hud-messages`、`hud-quick-slots` 與既有 quick-slot test id，降低 E2E 變更成本。
- 保留 `world-viewport` 的語意與 Phaser canvas `640×480`；HUD 是 DOM overlay，不改寫 world controller 或 camera 的 domain 邏輯。
- HP／MP 使用現有 `meter` 與 aria label，外觀套入原創金屬條；新增 EXP 條時由既有 `experiencePercent` 供值，不新增經驗計算。
- 角色名稱、等級、AC、負重、正義值、金幣與目標資訊改用小型資訊牌，不再依賴一整條右側長文。
- 訊息區維持 `combat`、`loot`、`quest`、`system` 分色，加入固定高度與可讀的滾動邊界。
- 快捷列保留 F5–F12 行為；有 icon 時顯示 icon、名稱與數量，沒有 icon 時顯示穩定的文字 fallback。

### 2. 共用遊戲面板

`src/ui/panels/shared.ts` 提供所有 panel 共用的框體、標題、內容捲動區、狀態列與 action button 結構；`styles.css` 定義單一 UI token，不讓各 panel 自己發明顏色或邊框。

- 外框：銅金角飾、深石灰外緣、細金內線。
- 標題：置中金色文字，附小型分隔飾線。
- 內容：深褐／炭黑材質，使用淡金與灰白文字。
- 選取：亮金邊線或低強度綠青光，不使用現代藍色 focus fill。
- 失敗：保留紅橙色文字；成功與任務進度使用低飽和綠色。
- 按鈕：窄矩形、內凹／外凸兩態、文字置中；不使用圓角膠囊。
- 可及性：保留 keyboard focus、ARIA label、`aria-live`、disabled 與語意 HTML。

### 3. 物品欄、技能與角色欄

- `InventoryPanel` 與 `SpellPanel` 以四欄圖示槽為核心，使用現有 item／effect sprites；文字名稱、數量與操作提示放在槽內或槽下。
- `CharacterPanel` 改成左側角色資訊、中央裝備槽、右側能力與戰鬥數值；裝備槽用固定 `data-slot` 語意，不將資料寫入 UI。
- 拖放與鍵盤啟用維持現有 action boundary；視覺變更不得自行套用裝備、消耗物品或快捷列。

### 4. 任務、地圖、對話、商店與倉庫

- `QuestPanel` 使用左側任務清單、右側任務內容／階段／獎勵的經典雙欄語意；小視窗尺寸不足時退回單欄。
- `MapPanel` 使用深色地圖紙面、金色目前位置與出口標記；不把 playable map 烘成單張圖片，也不改地圖資料。
- `DialoguePanel` 使用 NPC 標題牌、深色對話框與窄版選項按鈕；對話選擇仍呼叫既有 action。
- `ShopPanel` 與 `WarehousePanel` 使用物品列、持有／倉庫數量、價格或手續費資訊牌；交易防呆與 proximity 驗證完全保留。
- `SettingsPanel` 與 `SavePanel` 使用相同的框體、頁籤與確認區，但不變更設定與存檔安全規則。

### 5. 主選單與建角

- `MenuScene` 改為經典中央主框體：標題、存檔欄、主要 action 分層，保留既有匯入、還原、刪除與開始新遊戲流程。
- `CharacterCreateScene` 改為角色預覽、角色名稱、職業槽位、能力摘要與 action footer；保留 radio input、名稱驗證、空欄選擇與錯誤提示。
- 若純框體與既有 sprites 已足夠，不新增背景圖；若 QA 發現主選單或建角需要獨立氛圍圖，才產製原創暗色龍谷／古代岩窟背景，且保持可讀對比與低視覺干擾。

## 素材策略

素材採兩階段：

1. `盤點與重用`
   - 使用 `classic-frame.png` 的框、槽、按鈕、條、捲軸與訊息框零件。
   - 使用 `sprites/items.png`、`sprites/effects.png`、既有職業／NPC／怪物 sprite。
   - 以 CSS background positioning、`object-position` 或小型 asset adapter 明確引用素材，不將圖片內容硬編碼成 domain rule。

2. `缺口產製`
   - 僅在既有素材無法提供所需圖示、背景、狀態裝飾或動畫時，使用原創生成素材。
   - UI atlas 以透明背景、像素化、固定格線與獨立 action family 產製；角色／怪物動畫遵循 sprite sheet 的 cell、anchor 與邊界 QA。
   - 生成素材不得包含原作 logo、角色、字體、商標、客戶端截圖或可辨識的原始 UI 複製。
   - 每項新增素材加入 `assets.json`，`license` 固定為 `project-original`，並記錄尺寸、用途與來源說明。

## 技術邊界

允許修改：

- `src/ui/Hud.ts`
- `src/ui/WorldUi.ts`
- `src/ui/WindowManager.ts` 的 UI class／focus wiring（若需要）
- `src/ui/panels/*.ts` 的純呈現結構
- `src/ui/styles.css`
- `src/game/scenes/MenuScene.ts`
- `src/game/scenes/CharacterCreateScene.ts`
- `public/assets/ui/` 與 `src/content/data/assets.json`
- UI unit、E2E、visual 測試與必要的文件／handoff

禁止因本項 UI 工作修改：

- `src/core/` 的戰鬥、任務、物品、屬性或 progression 規則
- `src/game/systems/GameSession.ts` 的 authoritative action boundary
- `src/world/` 的地圖、尋路、AI、fixed timestep 或 camera 規則
- `src/storage/` 的 schema、checksum、migration、autosave 與 IndexedDB 流程
- Phaser `640×480` 邏輯尺寸與離線 service worker 行為

## 實作順序與品質閘門

### Phase 1：視覺基礎與 HUD

- 建立 CSS token、框體、按鈕、槽位、meter、tooltip、focus 與 responsive rules。
- 重組 `Hud` 的 DOM 區域，但保留現有 view model 與 test id。
- 先用既有 `classic-frame.png` 和文字 fallback，確認 layout 可運作。

品質閘門：HUD fixture 在三個指定 viewport 可讀，HP／MP／EXP、訊息、目標與八格快捷列皆可見；現有 HUD unit tests 維持通過。

### Phase 2：共用 panel 與主要面板

- 完成 shared frame 與 button contract。
- 依序套用角色、物品、技能、任務、地圖、對話、商店、倉庫、設定與存檔管理。
- 每完成一組 panel 即跑對應 unit／E2E fixture。

品質閘門：所有 panel 使用同一套視覺 token，沒有殘留舊版綠黑表單風格；action、focus、escape close 與 scroll 行為不退化。

### Phase 3：主選單、建角與素材缺口

- 完成主選單與建角 overlay。
- 重新檢查 asset manifest，只有確認缺口才產製並整合原創圖片／動畫。
- 產物加入 manifest 後執行 content asset tests 與 build。

品質閘門：主選單、建角、世界 HUD 與全部 panel 具有同一套框體、色票、字級與互動狀態；所有新素材均標記 `project-original`。

### Phase 4：視覺驗收與交接

- 更新 `tests/visual/` baseline，保留可回溯的變更理由。
- 執行 `npm run lint`、`npm run typecheck`、`npm test`、`npm run build` 與 `npm run test:e2e`。
- 視環境可用性執行完整 `npm run verify`，任何既有失敗需分辨是否由本次 UI 變更引入。
- 更新 `CODEX_HANDOFF.md` 與 `docs/memory/2026-07-19-lineage-classic-ui.md`，記錄實際修改、測試結果與未驗證的素材風險。

## 驗收條件

- 所有玩家可見 UI surface：主選單、建角、HUD、角色、物品、技能、任務、地圖、對話、商店、倉庫、設定與存檔，均使用一致的經典框體與 token。
- 世界畫面仍是主要視覺焦點；HUD 不遮蔽必要互動目標，面板開啟時可明確辨識目前 top panel。
- `800×600`、`1280×720`、`1920×1080` 均能置中顯示，內部畫布仍為 `640×480` 且保持像素邊緣。
- 既有鍵盤操作、滑鼠操作、ARIA label、focus scope、Escape 關閉、拖放快捷列與 save／shop／warehouse guards 不變。
- 不新增第三方相依套件，不引入原作受保護素材，不把 UI 圖片當成 playable map 或 domain state。
- 既有功能測試與完整 production campaign 不因 UI skin 失敗；視覺差異均有對應的 baseline 更新或明確保留理由。

## 非目標

- 不重建原作 client、伺服器、多人、血盟、PVP、交易或課金系統。
- 不把「龍之谷」擴張成新的 playable map、怪物內容或主線章節。
- 不因 UI 對齊而修改戰鬥數值、任務條件、存檔格式、音效規則或輸入快捷鍵。
- 不追求逐像素複製任何權利人的現成畫面；目標是可辨識的復古介面語言與原創素材一致性。
