# 說話之島單機致敬版

這是一款以 2000–2003 年台灣早期《天堂》說話之島為參考的非商業單機角色扮演遊戲。玩家可在桌面瀏覽器建立 `王族`、`騎士`、`妖精` 或 `法師`，從稻草人訓練開始，經歷村莊整備、野外狩獵、黑騎士事件、地監探索與巴風特首領戰，完成篇章後繼續自由探索。

遊戲完全在瀏覽器端執行，不含伺服器、帳號、多人連線或課金。範圍與驗收標準見[設計規格](docs/specs/2026-07-17-talking-island-single-player-design.md)，實作決策見[技術脈絡](CLAUDE.md)，內建資料清單見[自動產生的內容索引](docs/specs/generated-content-index.md)。

## 支援環境

- 桌面版 Chromium 瀏覽器；自動化驗收使用 Playwright 的 `Desktop Chrome`。
- Node.js `24.x`。
- npm `11.x`。
- 畫面內部解析度固定為 `640×480`；放大時保留像素邊緣，不使用平滑縮放。

## 安裝

```bash
npm ci
```

`package-lock.json` 是相依套件版本的真相來源。若 Node.js 或 npm 的 major version 不符，請先切換至上列支援版本再安裝。

## 開發與 production preview

啟動 Vite 開發伺服器：

```bash
npm run dev
```

依終端顯示的本機網址開啟遊戲。若要檢查實際 production bundle 與 service worker，先建置再預覽：

```bash
npm run build
npm run preview
```

開發伺服器適合快速迭代，不代表離線快取已通過；離線行為應以 production preview 或正式部署版本驗證。

若使用 VS Code，可從 `Tasks: Run Task` 執行 `.vscode/tasks.json` 提供的 `Lineage: Run Game (Dev)`、`Lineage: Build`、`Lineage: Preview Production` 或 `Lineage: Verify`。

## 操作

| 輸入 | 行為 |
| --- | --- |
| 滑鼠左鍵點地面 | 尋路移動至選定格子 |
| 滑鼠左鍵點敵人 | 鎖定目標並開始自動攻擊 |
| 滑鼠左鍵點 NPC／掉落物 | 與目標互動 |
| `WASD`／方向鍵 | 向上、下、左、右移動一格 |
| `Space` | 攻擊目前目標；尚未鎖定時選擇最近的存活敵人 |
| `E` | 與最近的可互動 NPC 或物件互動 |
| `Tab` | 依距離切換仍存活的敵人 |
| `F5–F12` | 使用八格快捷列物品或技能 |
| `I` | 開關物品欄 |
| `C` | 開關角色及裝備窗 |
| `Shift+S` | 開關魔法／技能窗 |
| `Q` | 開關任務窗 |
| `M` | 開關區域地圖 |
| `Esc` | 關閉最上層視窗 |
| 滑鼠滾輪 | 在允許範圍內調整畫面倍率 |

鍵盤移動或點擊地面會取消目前的自動攻擊目標；再次按 `Space` 會選擇最近的存活敵人並開始攻擊。

## 基本遊戲流程

1. 新角色會從稻草人區開始；先靠近訓練場教官按 `E` 對話，再按 `Q` 開啟任務窗並接受「稻草人訓練」。
2. 點擊敵人開始自動攻擊；也可用 `Tab` 切換目標、`Space` 繼續攻擊。敵人倒下後靠近掉落物並按 `E` 拾取。
3. 按 `I` 開啟物品欄；點裝備可穿脫，點消耗品可使用。「放入快捷列」會放到第一格，再以 `F5` 使用。
4. 按 `Shift+S` 開啟技能窗；點技能立即對目前合法目標施放，「放入快捷列」會放到第二格，再以 `F6` 施放。
5. 靠近商店或倉庫 NPC 並按 `E`，在面板內買賣、存入或取回物品。這些操作只在角色位於正確 NPC 附近時有效。
6. 建議依序完成稻草人訓練、村莊登記、職業引導、野外物資、黑騎士事件、地監封印與巴風特回報；篇章完成後仍可在七個區域自由探索。

## 存檔、匯入與匯出

- 遊戲提供 `3` 個存檔欄；目前存檔與上一份備份儲存在目前瀏覽器 profile 的 IndexedDB。
- 遊戲在換地圖、任務階段變更、死亡重生與返回主選單時要求自動存檔；遊戲畫面也提供手動儲存。
- 同一欄寫入新進度前會保留前一份存檔，可從主選單的存檔管理還原備份。
- 匯出會下載含 schema version、game version、時間戳與 checksum 的 JSON 檔案。
- 匯入會先驗證與遷移資料，再顯示目標欄位及角色摘要；必須再次按下確認才會覆寫目標欄。
- 刪除存檔必須完整輸入該欄角色名稱；刪除後目前存檔與備份都會移除。

存檔不是 repo 內的檔案，也沒有自訂資料路徑。清除瀏覽器網站資料、改用其他 browser profile 或無痕視窗，都可能看不到原有存檔；清除資料前請先匯出需要保留的欄位。

## 離線使用

production build 透過 service worker 預先快取 HTML、JavaScript、CSS、JSON、PNG 與 web manifest。第一次使用仍需在線上完整載入，等 service worker 接管頁面後，後續才能使用已快取版本離線啟動。

更新版本時，請在線上重新開啟並重新載入頁面，讓新版 service worker 接管。離線模式不會同步存檔，也不會將資料傳送至伺服器。

## 疑難排解

- 畫面無法啟動：確認使用桌面版 Chromium、Node.js `24.x`、npm `11.x`，再重新執行 `npm ci` 與 `npm run build`。
- 顯示內容或素材驗證錯誤：啟動流程會停在選單並顯示繁體中文錯誤；請查看開發者工具 console 找出失敗的資料檔或 asset key。
- 聽不到音效：瀏覽器要求使用者互動後才允許 Web Audio。先在頁面點擊或按鍵；音訊無法初始化時不會阻擋遊戲規則執行。
- 更新後仍看到舊版：保持連線並重新載入；仍未更新時可清除該站台資料後重開，但這也會刪除 IndexedDB 存檔，務必先匯出。
- 遊戲執行中發生未處理錯誤：復原畫面會暫停遊戲並嘗試存檔，可選擇返回主選單、載入最近存檔或匯出診斷 JSON。
- 存檔匯入失敗：確認檔案是本遊戲匯出的完整 JSON，且未手動修改內容或 checksum；匯入確認前不會寫入目標欄。

## 驗證與發行

日常完整驗證：

```bash
npm run verify
```

這會依序執行 ESLint、TypeScript 型別檢查、Vitest、production build 與 Playwright E2E／visual 測試。

發行驗證另會檢查必要文件、`AGENTS.md -> CLAUDE.md` symlink、內容數量下限、素材授權 manifest 與既有的 `dist/index.html`。因此要先建置，再執行 release gate：

```bash
npm run build
npm run verify:release
```

內容識別字索引由下列命令重建，產物不可手動編輯：

```bash
npm run content:index
```

## 授權與素材

目前 repo 沒有 `LICENSE`、`COPYING` 或 `NOTICE`，因此程式碼未宣告可供他人複製、修改或再散布的授權；不要把可閱讀原始碼解讀為已採用開源授權。

內建素材 manifest 將所有隨附素材標示為 `project-original`。不得從原始遊戲客戶端擷取、複製或散布 NCsoft、遊戲橘子或其他權利人的商標與受保護素材；新增第三方素材前，必須確認可合法再散布並保留來源與授權證明。
