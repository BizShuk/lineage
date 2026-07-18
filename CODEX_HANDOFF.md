# Codex Handoff

## Current goal

將《說話之島》單機版的主選單、建角、HUD 與遊戲面板，統一成早期《天堂》龍之谷狩獵場景的復古桌面 UI，同時維持原創素材與既有遊戲規則。

## Phase

`polish`／設計規格完成，等待規格審閱。

## Latest completed work

- 完成完整 UI 對齊設計：HUD、共用 panel、主選單、建角、素材策略、技術邊界、分階段品質閘門。
- 決定優先重用 `public/assets/ui/classic-frame.png` 與既有 `project-original` sprites；只有確認素材缺口後才產製原創圖片／動畫。
- 設計文件已提交：`e155617 docs: define classic lineage ui alignment`。

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

- 設計文件 placeholder scan：通過
- `git diff --check`：通過
- 尚未修改程式，因此尚未執行遊戲測試或視覺 baseline。

## Known risks

- 經典 HUD 重新編排可能需要調整現有 visual baseline 與 fixture selector，但不得破壞既有 action、focus scope、ARIA 與 canvas 尺寸契約。
- `classic-frame.png` 的切片與不同 viewport 下的可讀性尚待實作後驗證。
- 目前工作樹原有未追蹤 `.agents/`，不屬於本次 UI 設計提交。

## Next safest task

使用者確認設計文件後，建立實作計畫，再先完成 UI token、共用框體與 HUD 的 focused slice。
