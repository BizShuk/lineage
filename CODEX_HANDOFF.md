# Codex Handoff

## Current goal

將《說話之島》單機版的主選單、建角、HUD 與遊戲面板，統一成早期《天堂》龍之谷狩獵場景的復古桌面 UI，同時維持原創素材與既有遊戲規則。

## Phase

`polish`／經典 UI 對齊已完成；保留一項與本次 UI 無關的既有 campaign E2E timeout。

## Latest completed work

- 完成完整 UI 對齊設計：HUD、共用 panel、主選單、建角、素材策略、技術邊界、分階段品質閘門。
- 完成 HUD 三欄底部資訊區：訊息、HP／MP／EXP／角色狀態、目標與八格快捷列。
- 完成共用 panel 框體、標題、捲動區、狀態列、交易／倉庫／任務／地圖／對話／設定語意 class。
- 完成物品、法術、角色裝備槽與主選單／建角 overlay 的經典 UI skin。
- HUD render 改為重用固定 DOM 節點；顯示區保持 pointer-through，避免攔截世界 canvas 尋路。
- 素材盤點確認 `classic-frame.png`、既有 sprites／effects 已足夠；本次沒有新增圖片或動畫。
- 主要提交：`61c89d1`、`4560f17`、`afb3592`、`98c64cb`、`fab0911`、`138077c`、`6bd0c22`。

## Relevant files

- `docs/specs/2026-07-19-lineage-classic-ui-design.md`
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
- `npm test`：通過，37 files／263 tests
- `npm run build`：通過；保留既有 bundle size 與 PWA `inlineDynamicImports` warnings
- `npx playwright test --grep-invert "seven-stage" --workers=1`：通過，39 tests
- `npx playwright test tests/visual/visual-baselines.spec.ts --workers=1`：通過，14 tests
- `git diff --check`：通過
- `npm run verify`：唯一失敗為既有七階段 campaign 在 `completeEnding` movement loop 超過 `180s`；release baseline `3e18d26` 以相同錯誤重現，未歸因於本次 UI。

## Known risks

- 完整 production campaign 的長流程 timeout 尚未解決；下一輪應獨立追查 `CampaignDriver` 的 movement／clock loop，不要把 UI 變更混入修正。
- build 保留既有大 chunk 與 PWA deprecation warning，未影響本次 UI 驗收。
- 目前工作樹原有未追蹤 `.agents/`，不屬於本次 UI 設計提交。

## Next safest task

獨立診斷 campaign timeout；若需修改 world／clock，先建立 focused failing test，並維持本次 UI 的 39/39 non-campaign browser gate。
