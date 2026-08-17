# Unified Interface 補齊 (Unified Interface Bootstrap)

日期：2026-08-18

## 補齊了什麼

缺件稽核 (`~/projects` 全域結構稽核) 顯示本 repo 只缺一項統一介面檔案：

- 新增 `docs/terminology.md` — 分內容目錄、世界模擬、存檔與復原四節，另附狀態值、
  數值規則與縮寫表；每筆出處均指到 `src/` 下的具體檔案或 `src/content/data/` 的 JSON。

未動：`README.md`、`CLAUDE.md`、`AGENTS.md`（已為 symlink，`verify:release` 會檢查）、
`README.todo`、`docs/specs/`（含 script 產物 `generated-content-index.md`）、
`plans/`、`docs/memory/README.md` 與五份既有紀錄、任何程式碼與內容 JSON。

## 閱讀時值得留底的現況

- `CLAUDE.md` 的品質高於一般專案：模組邊界、fixed timestep、autosave reason 清單、
  release gate 順序都寫成可驗證的硬規則。因此建術語表時大多數條目可以直接從 CLAUDE.md
  取語意、再回程式碼確認字面值，兩邊沒有發現分岔。
- `verify:release` 是這個 repo 少見的`文件即 gate`設計：它檢查 `AGENTS.md → CLAUDE.md`
  symlink 的 target 是否恰為 `CLAUDE.md`，並要求 `README.md`、`CLAUDE.md`、`README.todo`、
  `docs/memory/` 存在。也就是說統一介面的一部分在本 repo 是`可執行斷言`而非慣例。
  新增的 `docs/terminology.md` 目前不在該 gate 的檢查清單內。
- release 順序反直覺且已寫進文件：preflight 在跑內建 build gate 前就要求 `dist/index.html`
  存在，所以必須先 `npm run build` 再 `npm run verify:release`。這種順序依賴很容易在
  CI 上被寫反，值得留底。
- 任務系統有一個隱含預設值：quest definition 未宣告 `stages` 時，`quests.ts` 會補上
  單一階段 `{ id: 'in-progress' }`。這個字面值不會出現在任何 JSON 裡，只能從程式碼讀出，
  已收入術語表狀態值一節。
- 授權現況需要謹慎表述：repo 沒有 `LICENSE`／`COPYING`／`NOTICE`，README 明確要求
  「不得把可閱讀原始碼解讀為已採用開源授權」，而素材 manifest 則要求所有 entry 為
  `project-original`。兩者是不同層次的限制，文件中不可混為一談。
