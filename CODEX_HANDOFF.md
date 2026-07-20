# Codex Handoff

## Active work — 2026-07-20

- Goal：修正正常新遊戲看不到怪物、可見怪物難以點擊、`Space` 無法起手攻擊，以及玩家 atlas 破圖；同步所有與核准設計規格不一致的流程與測試。
- Status：實作、實際畫面 QA 與正式 release gate 全部完成。
- Runtime：新角色從 `scarecrow-field (48,2)` 開始；第一隻訓練哥布林位於首個 `640×384` world frame 且不侵入導師巡邏／警戒安全包絡。
- Combat：點擊怪物實際 visual frame 會鎖定並自動接近攻擊；移動取消目標；`Space` 無目標時選擇最近存活敵人；`Tab` production 流程已完成完整 campaign。
- Presentation：四職玩家 atlas 按 `8×6` 完整 pose 註冊，怪物／掉落物使用繁中 content 名稱與 visual hit target；沒有加入第三方或原始遊戲客戶端素材。
- Visual：保留核准的村莊 first-frame 取景；更新 `village`、`north-field`、`black-knight-area`、`dungeon-1`、`dungeon-2`、`inventory`、`spells` 七張預期基準並逐張檢查。
- Verification：`npm run build && npm run verify:release` 通過；`40 files / 288 Vitest` 與 `44 Playwright` 全數通過，release campaign 完整通關、結局、存檔與還原耗時約 `3.6` 分鐘。
- Evidence：`docs/memory/2026-07-20-training-combat-accessibility.md`、`output/playwright/combat-player-fixed.png`。
- Next：release gate 通過後，下一個安全任務是為其餘 orthogonal 地圖逐張建立獨立 actual-frame 設計與核准基準，不改動本次戰鬥規則。

## Active work — 2026-07-19

- Goal：完成一張使用者核准、由正常遊戲路徑繪製的說話之島等角村莊 first frame。
- Phase：`Phase B / Tasks 4–9` 已完成；preview presenter 已移除，正常 `WorldScene` 使用 shared projection、正式 HUD 與 manifest atlas。
- Asset：`public/assets/maps/isometric-village-v1.png` 為 `1024×1024 RGBA`、`4×4`、project-original atlas。
- Runtime：村莊使用 `2:1` isometric projection、`640×384` camera 與 `640×96` HUD；其他六張地圖維持 orthogonal fallback。
- Verification：lint、typecheck、build、`39 files / 283 Vitest`、`10 focused E2E`、`15 visual` 全部通過。
- Approved baseline：`tests/visual/isometric-village-first-frame.spec.ts-snapshots/isometric-village-first-frame-chromium-darwin.png`，`1280×720`。
- Implementation commits：`86cbeb9`、`4140b1f`、`4b338a5`、`cb97080`、`76c9723`、`3c2ee47`。
- Next：其餘六張地圖必須另開設計／計畫；不要直接複製村莊 props 或改動 domain grid。

## Current goal

完成《說話之島》村莊的原創 `2:1` 等角 presented frame，並把同一 projection、atlas、角色 anchor、pointer、camera 與 classic HUD 接入正常遊戲路徑。

## Phase

`polish`／村莊 first-frame production activation、visual baseline 與非 campaign gates 已完成；其餘六張地圖仍是明確的後續範圍。

## Latest completed work

- 完成完整 UI 對齊設計：HUD、共用 panel、主選單、建角、素材策略、技術邊界、分階段品質閘門。
- 完成 HUD 三欄底部資訊區：訊息、HP／MP／EXP／角色狀態、目標與八格快捷列。
- 完成共用 panel 框體、標題、捲動區、狀態列、交易／倉庫／任務／地圖／對話／設定語意 class。
- 完成物品、法術、角色裝備槽與主選單／建角 overlay 的經典 UI skin。
- HUD render 改為重用固定 DOM 節點；顯示區保持 pointer-through，避免攔截世界 canvas 尋路。
- 素材盤點確認 `classic-frame.png`、既有 sprites／effects 已足夠；NPC 破圖由 frame layout 錯誤造成，本次沒有新增圖片或動畫。
- 新增 `.vscode/tasks.json`，提供開發伺服器、production preview、build 與完整 verify 的可執行 tasks。
- 確認 `MapPresenter` 將 `1536×1024` 等角素材盤當成未縮放的 `TileSprite`，造成約 `192×128` frame 被巨大重複；根因已完成定位。
- 新增並 self-review 地圖生成規格，定義 overworld／dungeon `8×8` atlas、16px tile scale、碰撞資料邊界與線上參考素材限制；設計 commit：`2643fff`。
- 生成並檢查兩張 `1024×1024`、`8×8`、每格 `128×128` 的 project-original terrain atlas。
- 以 TDD 新增 `terrainAtlasLayout`，並讓 `MapPresenter` 將 source cell 正確縮放至 `16×16` world tile；保留 JSON collision／exit／NPC／spawn 為 authoritative data。
- 將既有 `map-*` manifest entries 接入新 atlas；presented-frame QA 後確認 `map-coast` 使用 frame `4`、`map-black-knight-area` 使用 frame `2`，避免區域材質錯配。
- 確認 `npcs.png` 是 `16` 欄、`5` 列、每個 NPC 佔 4 個水平 pose；新增 NPC 專用切格 helper，恢復完整角色高度，避免通用 `8×8` 切格截斷下半身。
- 更新村莊與相關 panel 的 5 張 visual baselines；14/14 visual 與 39/39 non-campaign browser gate 通過。
- 地圖實作提交：`2643fff`、`af72505`、`d15bc6b`、`12e77f6`、`7ac34bc`、`3e2505c`、`7df3be7`、`2dfaa27`、`e951bc2`。
- NPC 修正提交：`fbd1ef3`。
- 新增 project-original `4×4` 村莊 atlas，使用 compact plaza、crossed roads、transition tiles 與 8 個 props 重建核准構圖。
- 新增 shared `WorldProjection`；MapPresenter、EntityRenderer、camera 與 canvas pointer 共用同一 isometric／orthogonal 決策。
- 村莊資源或 presentation validation 失敗時，terrain、actors、camera 與 pointer atomic fallback 至 orthogonal projection。
- 騎士、NPC 與 row-based monster 改用完整 frame 與 feet anchor，避免 atlas quadrant fragment。
- classic atlas HUD 已全域啟用；world camera 固定 `640×384`，底部 HUD 固定 `640×96`，system controls 位於 HUD host 內。
- first-frame 與受影響的 9 張既有 visual snapshots 已鎖定；驗收證據寫入 `docs/memory/2026-07-19-isometric-village-first-frame.md`。

## Relevant files

- `docs/specs/2026-07-19-lineage-classic-ui-design.md`
- `docs/specs/2026-07-19-lineage-map-generation-design.md`
- `plans/2026-07-19-lineage-map-generation-plan.md`
- `docs/memory/2026-07-19-lineage-map-generation.md`
- `docs/memory/2026-07-19-npc-sprite-frame-repair.md`
- `docs/specs/2026-07-19-isometric-village-first-frame-design.md`
- `plans/2026-07-19-isometric-village-first-frame-plan.md`
- `docs/memory/2026-07-19-isometric-village-first-frame.md`
- `.vscode/tasks.json`
- `src/game/systems/MapPresenter.ts`
- `src/game/scenes/BootScene.ts`
- `src/game/systems/SpriteAtlas.ts`
- `src/content/data/assets.json`
- `src/content/assets.ts`
- `public/assets/maps/terrain-overworld-v2.png`
- `public/assets/maps/terrain-dungeon-v2.png`
- `public/assets/maps/isometric-village-v1.png`
- `public/assets/maps/village.map.json`
- `src/game/systems/WorldProjection.ts`
- `src/game/systems/EntityRenderer.ts`
- `tests/unit/map-presenter.test.ts`
- `tests/unit/sprite-atlas.test.ts`
- `tests/content/assets.test.ts`
- `tests/visual/visual-baselines.spec.ts-snapshots/*.png`
- `src/ui/Hud.ts`
- `src/ui/WorldUi.ts`
- `src/ui/panels/*.ts`
- `src/ui/styles.css`
- `src/game/scenes/MenuScene.ts`
- `src/game/scenes/CharacterCreateScene.ts`
- `public/assets/ui/classic-frame.png`

## Verification

- `npm run lint`：通過
- `npm run typecheck`：通過
- `npm test`：通過，39 files／283 tests
- `npm run build`：通過；client 146 modules、PWA precache 29 entries，保留 bundle size 與 PWA `inlineDynamicImports` warnings
- focused Playwright E2E：通過，10 tests
- `npx playwright test tests/visual --workers=1`：通過，15 tests
- `git diff --check`：通過
- `npm run content:index`：本次未變更 content IDs，未需重建 generated index
- `npm run verify`／seven-stage production campaign：依 first-frame 計畫未執行

## Known risks

- 只有村莊完成 production-wired isometric presentation；其他六張地圖仍使用 orthogonal projection，不得宣稱已完成全地圖對齊。
- 先前 handoff 記錄的 seven-stage campaign timeout 本輪未重跑，若要處理必須與地圖／renderer 分開調查。
- build 保留既有大 chunk 與 PWA deprecation warning，未影響本次 UI 驗收。
- 若要擴展其餘地圖，須各自確認 atlas、地形節奏、props 與 presented frame；不能由 bitmap 推導碰撞。
- 目前工作樹原有未追蹤 `.agents/`，不屬於本次 UI 設計提交。

## Next safest task

下一個最安全任務：先為下一張地圖建立獨立 actual-frame 設計與 visual approval gate；campaign timeout 若要處理，另開不碰 presentation 的診斷工作。
