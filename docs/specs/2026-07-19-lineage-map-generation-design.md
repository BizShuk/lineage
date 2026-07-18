# 《說話之島》地圖生成與破圖修復設計

## 目的

修復目前世界場景的地圖重複破圖，並以公開線上《天堂／Lineage》地圖的區域節奏作為風格參考，生成可合法使用的原創地形素材。既有 7 張地圖的尺寸、碰撞、出口、NPC、任務錨點與怪物生成資料保持為遊戲規則真相來源。

## 現況與根因

目前 `public/assets/maps/tiles-overworld.png` 與 `tiles-dungeon.png` 是 `1536×1024` 的等角地形／物件素材盤，不是可直接以 16px 重複的 tile texture。`MapPresenter` 將來源圖切成 `8×8`，得到約 `192×128` 的 frame，卻未設定 tile scale 就交給 Phaser `TileSprite`，因此遊戲畫面以巨大等角地塊重複填滿地圖，造成目前 visual baseline 中的菱形破圖。

## 參考合約

線上資料只用於觀察構圖、區域分層、路線節奏與色彩方向，不下載、裁切、重繪或散布原始截圖、Logo、文字、地圖標記或客戶端素材。

### Must match

- 說話之島村具備中央安全據點、道路、港口與通往外圍區域的出口感。
- 野外區域以森林／草地／泥地／海岸等大區塊形成辨識度，不讓所有區域看起來相同。
- 地監一樓與二樓具備石材通道、房間節點、深層區域與首領房的探索節奏。
- 遊戲內部仍以 `16px` grid、`640×480` logical viewport、像素化縮放與目前 camera bounds 呈現。

### Flexible

- 各地圖的精確道路彎曲、房間位置、裝飾密度、色票與地形細節。
- 現有原創 NPC、怪物、掉落物與 UI 的位置及呈現；它們不烘焙進地形 atlas。
- 與原作不同的地圖尺寸與出口座標；目前 `.map.json` 資料優先於線上參考圖。

### Out of scope

- 新增亞丁大陸、龍之谷或其他不在目前設計規格內的 playable map。
- 複製原始《天堂》客戶端素材、地圖截圖、商標、Logo、字體或標記。
- 把整張生成圖當成唯一 playable map，或把 collision／出口資料藏進 bitmap。
- 修改戰鬥、任務、存檔、怪物生成與 map transition domain rules。

參考頁面：

- [回到天堂 1.82c 地圖頁](https://returnlin.com/182/c_map0.html)：說話之島、冒險洞穴 1F／2F、海底隧道的區域分頁。
- [Lineage Compendium 地點索引](https://www.lineagecompendium.com/www.lineagecompendium.com/location.html)：經典世界、說話之島與 dungeon map 的分類方向。
- [Lineage 1 Reborn Talking Island Dungeon 1F](https://lineage1reborn.com/?map=1&page=lookup) 與 [2F](https://lineage1reborn.com/?map=2&page=lookup)：地監樓層與怪物密度的公開參考。

## 素材設計

生成兩張 project-original 地形 atlas，不包含物件、角色、怪物、文字、邊框或水印：

| 檔案 | 尺寸 | grid | 使用範圍 |
| --- | --- | --- | --- |
| `public/assets/maps/terrain-overworld-v2.png` | `1024×1024` | `8×8`、每格 `128×128` | 村莊、稻草人區、北部野外、海岸、黑騎士區 |
| `public/assets/maps/terrain-dungeon-v2.png` | `1024×1024` | `8×8`、每格 `128×128` | 地監一樓、地監二樓 |

Atlas cell 合約：

- 每格完整填滿正方形 cell，無透明縫、外部邊框、文字、標籤或指南線。
- 每格是可重複的俯視地形紋理，不使用等角菱形地台。
- `overworld` 使用暗綠草地、森林、泥地、道路、潮濕海岸與焦土方向。
- `dungeon` 使用深灰石材、濕石、裂紋地面、儀式地面與暗色邊界方向。
- cell 0–4 對應現有 overworld map asset frame；cell 0–1 對應現有 dungeon map asset frame；其餘 cell 保留作未來原創 variation，不參與本次規則。

## Runtime 整合

### Asset manifest

- 將現有 map manifest entries 改指向兩張 `v2` atlas，保留既有 `map-*` keys 與 frame 編號。
- `license` 維持 `project-original`。
- 更新 `src/content/assets.ts` 的允許路徑與 `tests/content/assets.test.ts` 的 planned path contract。
- 舊版 `tiles-overworld.png` 與 `tiles-dungeon.png` 保留在 repo 作為歷史素材，不再被 map manifest 使用；不在本次刪除。

### `MapPresenter`

- 以 manifest entry 的 `group` 與 `frame` 找到 atlas cell。
- 依 atlas 固定 `8×8` 切割建立 Phaser texture frame。
- 使用 `setTileScale(16 / cellWidth, 16 / cellHeight)` 將 `128×128` source cell 顯示為一個 `16×16` world tile。
- 保留目前 base terrain rectangle、region overlay、depth 與 alpha 語意；atlas 只負責底層視覺。
- 當 texture 或 frame 載入失敗時，保留既有 deterministic terrain color fallback，不能讓遊戲規則或場景啟動失敗。

### 地圖資料邊界

- `public/assets/maps/*.map.json` 繼續保存 width／height、collision rectangles、exits、NPC anchors、spawn zones、quest objectives、boss anchors 與 safe tiles。
- 不從生成圖片推導碰撞，不改 `TileGrid`、pathfinding、camera、輸入或 transition 行為。
- Runtime-controlled entities 仍由 `EntityRenderer` 與 `WorldScene` 分開繪製，不能烘焙到 atlas。

## 驗收

### Deterministic checks

- `npm run lint`
- `npm run typecheck`
- `npm test -- tests/unit/map-presenter.test.ts tests/content/assets.test.ts tests/content/reachability.test.ts`
- `npm run build`
- `git diff --check`

### Presented-frame checks

- 以實際 Chromium frame 檢查 `village`、`north-field`、`coast`、`black-knight-area`、`dungeon-1`、`dungeon-2`。
- 在 `1280×720` 確認地圖地形不再出現巨大菱形重複、玩家／NPC／怪物仍落在正確 grid 座標。
- 確認 `800×600`、`1280×720`、`1920×1080` 的 `640×480` canvas 置中與 pixelated scaling 不變。
- 更新並檢視受影響的 visual baselines，再執行非 campaign browser gate。

### Release boundary

- `npm run verify:release` 必須仍確認所有 manifest entry 都是 `project-original`。
- 本次不處理既有 production campaign `completeEnding` timeout；若仍失敗，沿用既有 handoff 風險紀錄，不能把它歸因於地圖素材。

## 交付順序

1. 以本規格的 atlas contract 生成 overworld 與 dungeon 原創素材。
2. 先檢查 bitmap 尺寸、cell grid、邊界與可重複性，再加入 workspace。
3. 更新 manifest、MapPresenter 與 focused tests。
4. 先跑 deterministic checks，再以 Chromium presented frame 驗收。
5. 更新 `CODEX_HANDOFF.md`、release evidence 與 visual baseline 狀態。
