# 《說話之島》等角村莊 First-frame 對齊設計

## 狀態

- 日期：`2026-07-19`
- 階段：`polish`／單畫面 vertical slice
- 核准方向：方案 `A`，以 project-original 預產素材的等角視覺語言重做村莊 presented frame
- 目標平台：桌面版 Chromium
- 視覺真值：實際 Phaser runtime 的 `1280×720` capture，不以素材圖、AI mockup 或 visual baseline 通過代替

## 目的

先修正玩家進入說話之島村莊時看到的第一個世界畫面，使地圖、角色、NPC 與 HUD 使用同一套早期桌面 MMORPG 的等角視覺語言。第一張實機 frame 經使用者核准後，才把相同 presenter 擴展到其他六張地圖。

本輪只改 presentation。現有正交 grid、碰撞、尋路、NPC 座標、任務、戰鬥、存檔與內容 ID 繼續是 authoritative state。

## 現況證據與根因

目前 `tmp/image.png` 與預產素材無法對齊，原因不是 browser cache：

1. `src/ui/styles.css` 把近乎不透明的 gradient 畫在 `classic-frame.png` 上方，因此玩家只看見普通 CSS 框線，看不見預產金屬框細節。
2. 村莊 manifest 目前使用俯視矩形材質 `terrain-overworld-v2.png`；預產的 `tiles-overworld.png` 則是 `2:1` 等角地塊與場景物件，兩者投影不同。
3. `village.map.json` 只有 terrain rectangles、collision rectangles 與 gameplay anchors，沒有建築、樹木、圍欄或井等 presentation layer。
4. `MapPresenter`、`EntityRenderer`、pointer 座標與 camera center 都使用 `x * 16`、`y * 16` 的正交螢幕位置，不能只替換 bitmap 就得到等角世界。
5. 玩家與 NPC 都被強制設為 `28×36`，未保持來源 frame 比例與 feet anchor，會讓預產角色產生壓縮感。
6. Phaser camera viewport 是 `512×432`，但 HUD 宣告的世界區是 `640×384`；兩個 presented-frame contract 互相矛盾。

`tmp/imagegen/image.png` 是先前巨大菱形重複破圖的 runtime capture，只保留為診斷證據，不作為最終 reference。

## Reference Contract

主要 reference 是 [`public/assets/maps/tiles-overworld.png`](../../public/assets/maps/tiles-overworld.png)。它只定義 project-original 的等角投影、材質密度與村莊物件語言，不直接作為 runtime atlas，因為其深灰背景與不規則 packing 不符合透明固定格線 contract。

輔助素材：

- [`public/assets/sprites/player-prince.png`](../../public/assets/sprites/player-prince.png)：玩家比例、輪廓與動作方向。
- [`public/assets/sprites/npcs.png`](../../public/assets/sprites/npcs.png)：NPC 比例、服裝與 feet anchor。
- [`public/assets/ui/classic-frame.png`](../../public/assets/ui/classic-frame.png)：HUD 金屬框、槽位、按鈕與 meter 視覺。

| 欄位 | 分類 | First-frame contract |
| --- | --- | --- |
| Camera | Must match | `640×384` world viewport、玩家腳底位於畫面水平中央且略低於垂直中央、`2:1` 等角投影、無透視縮放 |
| Silhouette | Must match | 玩家與 NPC 保持來源比例、以腳底落在 tile anchor、人物縮到 gameplay 尺寸仍可辨識，名稱不遮住頭部 |
| Lighting | Flexible | 低對比日間環境光；角色與道路比草地亮一階，不新增動態陰影或 post-processing |
| Palette | Must match | 低飽和橄欖綠、土褐、灰石與舊銅金；不再使用目前大片高亮矩形材質 |
| Material | Must match | 地面是清楚的像素化菱形 tile；建築、樹與井使用相同像素密度，不混入寫實俯視 texture |
| Background | Must match | 村莊必須有道路、石造安全區、至少兩棟建築、樹木／圍欄／井等層次；不得只剩 terrain rectangles |

## 核准方案

### 1. 保留 domain grid，新增等角 presentation transform

邏輯座標仍是整數 `(x, y)`，單格移動、A*、距離、碰撞與 NPC proximity 完全不變。呈現層使用固定投影：

```text
screenX = originX + (x - y) * 16
screenY = originY + (x + y) * 8
```

這代表一個邏輯格在畫面上是 `32×16` 的菱形。`originX`、`originY` 由 map dimensions 與可見 prop padding 計算，讓投影後的四角與高物件都落在非負 world bounds；camera bounds 也由同一 helper 產生，不使用正交的 `width * 16`／`height * 16`。反向轉換先扣除 origin，只供地面 pointer input 使用，結果在送入 `InputController` 前取整並由既有 grid 規則再次驗證。

projection helper 同時提供：

- `gridToScreen(x, y)`：地面、玩家、NPC、怪物、掉落物與 camera 共用。
- `screenToGrid(screenX, screenY)`：滑鼠地面尋路共用。
- `depthFor(x, y, offset)`：依腳底 `(x + y)` 排序，讓角色可正確走到建築或樹木前後。
- `projectedBounds(width, height, padding)`：MapPresenter 與 camera 共用的非負 world bounds。

不得在 `MapPresenter`、`EntityRenderer` 與 `WorldScene` 各自重寫公式。

### 2. 村莊專用 presentation layer

`village.map.json` 新增可選的 `presentationLayer`；它只描述視覺，不參與 `TileGrid`：

```text
presentationLayer
├── projection: "isometric-2-1"
├── ground: terrain key 與 tile／region placement
└── props[]
    ├── asset frame
    ├── grid x／y
    ├── uniform scale
    ├── feet anchor
    └── depth offset
```

建築與既有 blocked rectangles 的位置需人工對齊，但 renderer 不得從 collision 自動推導 visual。若 presentation layer 缺失、驗證失敗或 atlas／必要 frame 未完整載入，整張村莊以單一決策回退到目前的 top-down presenter；地圖、NPC、玩家、camera 與 pointer 必須使用同一 projection mode，不允許混合 fallback。

其餘六張地圖本輪不新增 presentation layer，繼續使用目前 presenter。

### 3. 單一 project-original 村莊 atlas

現有 `tiles-overworld.png` 不直接接入 runtime。先依它的視覺方向製作一張 `isometric-village-v1.png`，並遵守固定格線：

- `1024×1024` PNG、`4×4` cells、每格 `256×256`。
- 透明背景；若生成工具無法穩定輸出透明邊緣，vegetation workflow 使用純洋紅 `#FF00FF`，驗證完成後才建立透明 runtime 版本。
- cell `0–7`：草地、石地、道路與必要 transition diamonds。
- cell `8–15`：房屋、樹、圍欄、井、箱子、路牌等村莊 props。
- 每格只有一個完整物件，不得跨 cell、不得包含文字、Logo、水印、角色或 UI。
- 素材只採高層次早期 MMORPG 視覺語言，不複製《天堂》客戶端像素、商標或地圖。
- 接入前檢查 image dimensions、16 個 cell 邊界、透明背景與 gameplay 尺寸；任一 cell 跨格或殘留背景色即拒絕該 atlas，不以 CSS 遮掩。

atlas 先以一張實際村莊 frame 驗證。核准前不生成其餘地圖 atlas，也不建立完整 decoration catalog。

### 4. 角色與 NPC 呈現

- 玩家、NPC 與怪物共用 uniform scale helper，只限制最大 gameplay 高度，不同時強制 width 與 height。
- Phaser sprite origin 對齊腳底；container interaction size 仍對應原邏輯 tile，不把透明 frame 邊界當碰撞。
- depth 使用 `depthFor`；文字 label 位於 trimmed silhouette 上方，字級維持 `8–9px` 並加一像素深色描邊。
- NPC frame 使用目前已修正的 `16×5`、每 NPC 四個水平 pose contract；不得回退通用 `8×8` 切格。
- 本張 first-frame 只要求 idle／walk 輪廓正確；攻擊、施法與死亡動畫不因畫面對齊而重新製作。

### 5. HUD 真正使用 classic frame atlas

底部 HUD 固定為 `640×96`，上方世界區固定為 `640×384`。`classic-frame.png` 透過明確 atlas crop token 使用，不再把整張圖放在不透明 gradient 下方。

First-frame 必須可見：

- 外框四角與銅金邊線。
- 訊息區、角色狀態區、目標／快捷列三個明確凹槽。
- HP／MP／EXP 有不同顏色且共用金屬 meter frame。
- 八個快捷槽使用同一套 atlas slot frame。
- `手動儲存` 與 `返回主選單` 不浮出 HUD 外框，也不遮擋快捷槽。

HUD 仍只讀既有 `HudViewModel`；本輪不新增 domain 欄位或快捷鍵。

## Runtime 資料流

```text
WorldController snapshot／MapAsset
  -> shared isometric projection
  -> MapPresenter：ground + presentation props + NPC
  -> EntityRenderer：player + monsters + loot
  -> WorldScene：projected camera center + inverse pointer transform
  -> Phaser world viewport 640×384

HudViewModel
  -> Hud DOM
  -> classic-frame crop tokens
  -> bottom HUD 640×96
```

所有 gameplay action 仍經 `GameSession`。presentation layer、projection 與 CSS 不得修改 snapshot、碰撞、任務或存檔。

## First-frame 實作邊界

為遵守 presented-frame gate，使用者核准實機 frame 前只完成一個村莊 vertical slice：

1. 一張村莊 atlas。
2. 一個共用 projection helper。
3. 村莊 ground、少量 props、玩家與現有 NPC 的等角定位。
4. `640×384` camera 與 `640×96` HUD。
5. 一張 deterministic `1280×720` Chromium capture。

核准前不做：

- 其他六張地圖轉換。
- 完整 atlas family、天氣、光影、parallax 或粒子裝飾。
- 新增玩法、地圖尺寸、碰撞、NPC、怪物或任務。
- 全套動畫重製。
- 完整 release suite 或 production campaign。

## 錯誤與 fallback

- atlas 或任何必要 frame 缺失：記錄 asset failure，整張村莊 atomic fallback 至現有 top-down projection，不阻止遊戲啟動。
- `presentationLayer` 資料無效：忽略該 visual entry；不得改寫或放寬 collision。
- inverse pointer 超出 map bounds：不提交 movement command。
- runtime projection error：交由既有 `ErrorBoundary`，不建立第二套 recovery flow。
- CSS atlas crop 不可用：保留可讀的純色 border fallback，但該 frame 不得標為視覺核准。

## 測試與驗收

### Focused deterministic checks

- projection round-trip：代表性 grid points 經 `gridToScreen`／`screenToGrid` 返回原 tile。
- depth ordering：同一斜線與前後相鄰 tile 的排序穩定。
- presentation layer：缺失時 top-down fallback；存在時不改 collision 與 NPC authoritative coordinates。
- sprite fitting：保持來源 aspect ratio 並使用 feet anchor。
- HUD contract：camera world viewport 是 `640×384`，bottom HUD 是 `640×96`，classic-frame atlas crop 實際可見。

### Presented-frame acceptance

固定條件：

- Browser viewport：`1280×720`。
- Phaser logical viewport：`640×480`。
- Scene：測試 fixture 強制新角色進入 `talking-island-village`；不改變正常新遊戲從訓練區開始的流程。
- Camera：玩家腳底置中於 world viewport。
- UI scale：`1`，browser zoom `100%`。

frame 必須同時符合：

- 畫面不再出現大片俯視矩形 terrain band 或重複巨大菱形。
- 至少可見道路、石造安全區、兩棟建築、樹／圍欄／井三類 props。
- 玩家與至少三名 NPC 的腳底正確落在 tile 上，比例未被壓扁，前後遮擋合理。
- 名稱可讀且不遮住人物頭部。
- HUD 金屬框細節肉眼可見，三區與八格快捷列均在框內。
- 畫面沒有新 console error、asset load failure、透明背景色塊或裁切破圖。

使用者核准該實際 frame 後，才能規劃其他六張地圖、完整輸入回歸與一次 full suite。

## 文件與版權邊界

- 新增 raster 必須加入 `assets.json`，`license` 固定為 `project-original`。
- 玩家操作若因 pointer 投影而有可見變更，同步更新 [`README.md`](../../README.md)。
- presenter、projection、camera 或 asset schema 邊界改變時同步更新 [`CLAUDE.md`](../../CLAUDE.md)。
- first-frame 結果與限制寫入新的 `docs/memory/2026-07-19-isometric-village-first-frame.md`，不覆寫既有地圖修復紀錄。
- `tmp/imagegen/*` 只作工作證據，不是 release asset，也不能成為 runtime dependency。
