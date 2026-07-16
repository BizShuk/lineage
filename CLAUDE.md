# Lineage 專案技術脈絡

## 專案目標

本 repo 實作桌面瀏覽器離線執行的《天堂》說話之島單機致敬版。玩家文案使用繁體中文，程式識別字使用英文。規則、內容與驗收以[設計規格](docs/specs/2026-07-17-talking-island-single-player-design.md)為準，工作順序以[實作計畫](plans/2026-07-17-talking-island-implementation.md)為準。

## 技術架構

```text
.
├── public/                    # 離線 manifest 與合法素材
├── src/
│   ├── app/                   # Phaser 啟動、設定與遊戲版本
│   ├── core/                  # 純 TypeScript 遊戲規則與 domain events
│   ├── content/               # Zod schema、JSON 載入及 typed catalog
│   ├── world/                 # 網格、尋徑、AI 與世界模擬
│   ├── storage/               # IndexedDB 存檔、checksum 與 migration
│   ├── game/                  # Phaser scenes 與 presentation adapters
│   ├── ui/                    # DOM overlay 與視窗呈現
│   ├── main.ts                # Browser composition root
│   └── service-worker.ts      # 離線資源快取
├── tests/
│   ├── unit/                  # 純規則單元測試
│   ├── content/               # 內容完整性測試
│   ├── integration/           # 跨模組流程測試
│   ├── e2e/                   # Playwright 玩家流程
│   └── visual/                # 視覺基準測試
├── scripts/                   # 內容索引與 release 驗證
├── docs/specs/                # 已核准規格
├── docs/memory/               # 歷史操作與決策 retrospective
└── plans/                     # 進行中實作計畫
```

## 依賴邊界

```text
app/game/ui ──> world ──> core
      │           │
      ├────────> content
      └────────> storage
```

- `core` 不得 import Phaser、DOM、IndexedDB 或具體 JSON 檔案。
- `content` 驗證版本化 JSON，再轉為 typed catalog；遊戲規則不得直接讀未驗證資料。
- `game` 將 Phaser input 與 rendering 轉接至 `core`、`world`，不得成為規則來源。
- `storage` 只序列化穩定的 domain state，不得保存 Phaser object。
- `ui` 只負責 DOM overlay，不得計算戰鬥或任務結果。
- repo 不得直接依賴其他應用層專案；共用能力須下沉至框架層。

## 關鍵命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 啟動 Vite 開發伺服器 |
| `npm run build` | 型別檢查並建立 production bundle |
| `npm run typecheck` | 執行嚴格 TypeScript 檢查 |
| `npm run lint` | 執行 ESLint，禁止 warning |
| `npm test` | 執行 Vitest 單元、內容與整合測試 |
| `npm run test:e2e` | 執行 Playwright E2E 與 visual 測試 |
| `npm run verify` | 執行完整發行驗證鏈 |

## 內容下限與固定規則

| 類型 | 要求 |
| --- | --- |
| 職業 | `王族`、`騎士`、`妖精`、`法師`共 4 個 |
| 能力值 | 力量、敏捷、體質、智力、精神、魅力共 6 項 |
| 等級 | 完整支援 1–15；預期通關等級 12–15 |
| 區域 | 村莊、稻草人區、北部野外、海岸、黑騎士區、地監一樓、地監二樓共 7 區 |
| NPC | 至少 15 名 |
| 敵人 | 至少 10 種普通怪物，加黑騎士精英、克特事件與巴風特 |
| 物品 | 至少 40 件 |
| 魔法／技能 | 至少 20 項 |
| 任務 | 6 階段主線、4 條職業引導分支、至少 6 個支線 |
| 畫面 | 內部 viewport 固定 `640×480`，放大時不得平滑像素 |
| 存檔 | 3 個存檔欄；含 schema version、game version、timestamp、checksum |

- AC 數字越低代表防禦越強。
- 等級範圍為 1–15，首輪通關時間目標為 3–5 小時。
- 不實作伺服器、帳號、多人連線、PVP、血盟、攻城、玩家交易、交易所或課金。
- 所有素材必須原創或可合法再散布，不得複製原始遊戲客戶端資源。
- 每項行為變更遵循 TDD：先觀察 focused test 因預期原因失敗，再做最小實作並跑相關完整測試。
