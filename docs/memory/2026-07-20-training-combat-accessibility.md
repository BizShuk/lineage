# 訓練區怪物與戰鬥可用性修正

## 問題

- 正常新角色建立後出現在沒有怪物生成的村莊，與設計規格的「先稻草人訓練」流程不一致。
- 訓練區六隻哥布林集中在入口首鏡頭之外；移到附近後又因群聚與英文 ID 標籤而難以辨識。
- 怪物 sprite 顯示約 `66×36`，但互動區僅使用 `16×16` container，點擊可見身體外緣會被判定為地面移動。
- 四職 `1536×1024` 素材實際為 `8` 方向 × `6` 狀態；舊 `16×12` 切格把完整角色切成碎片。
- `Space` 在未鎖定時不會依設計規格選擇最近敵人。

## 決策

- 正常新遊戲從 `scarecrow-field` 的 authoritative entry 開始；村莊 visual gate 改用明確 fixture，不改動已核准村莊 baseline。
- 首鏡頭只配置一隻訓練哥布林，其餘五隻分散至既有東、西 spawn zones。
- 首鏡頭哥布林與訓練場教官保持超過巡邏半徑 `3` 加警戒半徑 `5` 的距離，避免玩家接任務前被截擊。
- 怪物與掉落物直接使用實際 visual frame 作為 Phaser hit target；玩家角色不建立無用途的互動區。
- 四職依 `8×6` 完整 pose 註冊 frame；所有世界 projection 共用同一套完整角色 frame。
- `Space` 優先沿用目前鎖定目標，否則鎖定目前地圖最近的存活敵人。
- 怪物與掉落物世界標籤由 validated content catalog 解析繁體中文名稱，不顯示內部 ID。

## TDD 證據

- 新角色初始地圖測試先收到 `talking-island-village (32,32)`，預期為 `scarecrow-field (48,2)`。
- 首鏡頭內容測試先收到哥布林 anchor 差值 `20` 格且 count `6`，不符合可見與單一可讀目標要求。
- 真實 canvas 點擊測試點在可見哥布林身體右側時，`data-auto-attack` 先保持空值；改用 sprite hit target 後鎖定成功。
- `Space` 回歸案例先在取消目標後保持空值；加入最近敵人 context 後重新鎖定。
- 四職動畫 gate 先取得 fragment frame `class-prince:frame:97`；改正後六狀態依序使用完整 frame `4/12/20/28/36/44`。
- 實際目標引擎畫面證據存於 `output/playwright/combat-player-fixed.png`；圖中玩家、訓練場教官與單一哥布林均完整可辨識。
- 完整 campaign 首次暴露舊驅動器仍以 `512×432` 計算點擊；修正為正式 `640×384` camera 與 shared orthogonal／isometric projection 後，訓練導師路徑不再卡住。
- 等角村莊路徑點若與 NPC hit area 重疊，campaign 會在同一合法 tile 內選擇未遮擋點；戰鬥則以正式 `Tab` 選怪、自動接近與攻擊，不繞過 production action boundary。

## 驗證

- `npm run content:index`：通過。
- `npm test`：`40 files / 288 tests` 通過。
- 非完整戰役 E2E：`28` tests 通過。
- 七階段 production campaign：`2` tests 通過，完整流程耗時約 `4.2` 分鐘。
- visual：逐張檢查更新後的玩家完整 frame 與繁中怪物標籤，`15` tests 通過。
- `npm run build && npm run verify:release`：通過；release script 最終回報 `[release] PASS all gates`，其中 Playwright `44` tests 全數通過。

## 邊界

- 本次不把訓練區改成等角地圖；它仍依既有規格使用 orthogonal projection。
- 不新增第三方或原始遊戲客戶端素材。
- 不改變碰撞、戰鬥數值、怪物掉落或任務需求。
