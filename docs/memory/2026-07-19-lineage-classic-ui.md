# 說話之島經典《天堂》UI 對齊驗收

日期：`2026-07-19`

## 結論

已完成《說話之島》單機版的經典《天堂》龍之谷風格 UI 對齊。這次採用的是高層次復古介面語言：暗石灰／褐色底、銅金框線、金色小字、底部戰鬥資訊區與窄矩形面板，不複製原作客戶端畫面或素材。

## 實作內容

- `Hud` 改成固定 `640×480` 的世界區與底部三欄資訊區：訊息／聊天、HP／MP／EXP／角色狀態、目標與八格快捷列。
- shared panel 提供 `.panel-frame`、`.panel-header`、`.panel-title`、`.panel-scroll`、`.panel-status`、`.panel-action` 共用契約。
- 物品、技能、角色裝備、任務、地圖、對話、商店、倉庫、設定、存檔、主選單與建角均套用同一組 classic token 與 layout hook。
- HUD 顯示區維持 `pointer-events: none`，只有既有存檔操作保持可點，避免底部 UI 攔截 Phaser canvas 尋路。
- HUD 的 meter、快捷槽與訊息列改為重用固定 DOM 節點，避免每次 world render 重建整棵呈現樹。

## 素材與版權邊界

素材盤點確認以下既有 `project-original` 資產足夠完成畫面：

- `public/assets/ui/classic-frame.png`
- 既有 items、effects、玩家／NPC／怪物 sprite sheets

本次沒有新增或生成圖片／動畫，也沒有引入原始《天堂》客戶端資源；`src/content/data/assets.json` 不需新增 entry。

## 驗證證據

| Gate | 結果 |
| --- | --- |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS，37 files／263 tests |
| `npm run build` | PASS；僅有既有 chunk size 與 PWA deprecation warnings |
| visual baselines | PASS，14 tests；含 `800×600`、`1280×720`、`1920×1080` 置中 |
| non-campaign browser | PASS，39 tests，single worker |
| `git diff --check` | PASS |

## 未完成／限制

`npm run verify` 的七階段 production campaign 仍在 `completeEnding` 的 `CampaignDriver.moveTo`／clock loop 超過 `180s`。為確認歸因，已在 release baseline commit `3e18d26` 的獨立 worktree 重跑，得到相同 timeout；因此目前將其記為既有長流程／環境不穩定，不宣稱本次 UI 已修復該問題。

下一個最安全任務是獨立建立 campaign movement 的 focused diagnostic，確認是 path／world clock／browser timing 哪一層無進度，再決定是否修正。
