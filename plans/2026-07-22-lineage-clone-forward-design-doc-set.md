# 計畫：天堂 Clone 前瞻設計文件集 (Lineage Clone Forward-Design Doc Set)

## Context

目標：在 `pkg/game/lineage/` 建立經典《天堂 (Lineage)》（龍之谷版本前）clone 的完整企劃文件集——每個面向一份文件（1-5 頁）。既有三份天堂研究（`games/lineage_calculation.md` 數值實測、`monster_spawning.md` §⑦⑧ 生怪機制、`mechanisms/case_study_lineage.md` 機制對照）皆為「反推研究」；本文件集為「正向設計 (forward design)」——`mechanisms/` 與既有研究一律交叉引用、不整段複製（薄腰式慣例，見 `docs/specs/system_mechanism_guidelines_spec.md`）。

現況：`lineage/` 不存在、`plans/` 為空，無命名衝突。

## 骨架決策 (Skeleton)

不套用 `mechanisms/design_template.md` 的 11 節骨架（其「跨類型適配」「Bartle 動機映射」為通用機制模板所需，重建單一具體遊戲時會產生空洞填充）。改建 `lineage/design_template.md` 前瞻設計骨架（5-7 節）：

1. 定位與範圍 (Purpose & Scope) `[必備]` — 涵蓋什麼、排除什麼（排除項指向其他 lineage/ 檔）
2. 天堂原版行為對照 (Reference Behavior) `[必備]` — 僅摘要 + 精確指向既有研究章節，禁止複製原文
3. Clone 設計規則 (Our Design Rules) `[必備]` — 本檔核心設計內容，規則 + Mermaid 圖
4. 數值與參數表 (Values & Parameters) `[必備]` — 本 clone 採用的具體數值/公式
5. 系統邊界與交叉引用 (Boundaries & Cross-References) `[必備]` — 依賴的 `mechanisms/`、`guideline.md` 章節、其他 `lineage/*.md`；sink 是否已登記於 `mechanisms/economy_trading.md`；IP 原創表達自我檢查
6. 開放問題 (Open Questions) `[選配]`
7. 檢查清單 (Checklist) `[選配]`

格式沿用全局慣例：繁中+英文括號、不用粗體、Mermaid 邊線雙引號、小寫底線檔名。

## 目錄結構

採 `design/`、`tech/`、`ops/` 三個單層子資料夾（22 個內容檔按讀者視角分組；單層小寫英文，不違反扁平化決策）：

```tree
pkg/game/lineage/
├── README.md                          # 索引 + 使用說明 + 版權免責摘要
├── design_template.md                 # 前瞻設計骨架（5-7 節）
├── design/                            # 玩法設計（16 檔）
│   ├── world_and_maps.md              # 世界地理、城鎮/城堡分布、安全區、傳送網
│   ├── character_classes.md           # 王族/騎士/妖精/法師（+黑妖年代考據）
│   ├── stats_and_growth.md            # 六圍、等級曲線、AC/MR 衍生框架
│   ├── combat_damage_model.md         # 傷害公式、命中迴避、小怪大怪雙數值
│   ├── magic_and_skills.md            # 技能樹、詠唱/冷卻/MP、技能書 sink
│   ├── monster_design_and_spawning.md # 怪物分層、畫面內不生怪落地、掉落表
│   ├── equipment_and_items.md         # 武器/七部位防具、稀有度、低綁定策略
│   ├── enchanting_and_safety_value.md # 安定值三型、祝福卷軸跳級、爆裂 sink
│   ├── day_night_and_vision.md        # 日夜循環、夜間可見度（明確排除天氣）
│   ├── clan_and_blood_pledge.md       # 血盟：王族限定、職級權限、血盟小屋
│   ├── castle_siege_and_taxation.md   # 攻城週期、城主稅（transfer）、宣戰 sink
│   ├── pvp_pk_karma_system.md         # 開放 PK、染紅名/karma、制裁機制
│   ├── death_penalty_and_risk.md      # 扣經驗+掉裝、復活、地理風險關聯
│   ├── pets_and_familiars.md          # 寵物淺層養成之刻意決策、飼養 sink
│   ├── quests_and_endgame_gaps.md     # 任務刻意稀缺、排位/成就納入與否決策
│   └── economy_and_trading.md         # 貨幣循環、三大 sink 總表、交易通道（design/ 最後寫）
├── tech/                              # 技術（3 檔）
│   ├── server_architecture_and_protocol.md # 伺服器拓撲、同步、封包協議、反作弊
│   ├── client_architecture.md         # 2D 等角渲染、UI HUD、資產管線、效能預算
│   └── data_model_and_persistence.md  # 資料表綱要、交易一致性、伺服器端唯一真相
└── ops/                               # 交付與法務（3 檔）
    ├── development_roadmap.md         # MVP 範疇、里程碑、風險排序
    ├── monetization_and_live_ops.md   # 商業模式決策、P2W 風險控管、營運節奏
    └── legal_ip_risk.md               # IP 風險與原創表達邊界（全域強制約束檔）
```

## 逐檔交叉引用重點 (Key Cross-References)

| 檔案 | 主要引用 |
| --- | --- |
| `world_and_maps.md` | `monster_spawning.md` §⑧ 地圖面積公式；`mechanisms/map_scene_design.md`；`guideline.md` §六 |
| `character_classes.md` | `guideline.md` §三；`mechanisms/clan_system.md` 角色與權限；case study 一 |
| `stats_and_growth.md` | `games/lineage_calculation.md` AC 迴避/AC -45 bug/AC -100 與 MR 斷點 (140/180/220) |
| `combat_damage_model.md` | `games/lineage_calculation.md` 小怪大怪傷害、STR/攻速邊際效應、PVE 隨機減免；`guideline.md` §5.2-5.4 |
| `magic_and_skills.md` | `guideline.md` §5.5 §5.6；`mechanisms/item_planning.md` |
| `monster_design_and_spawning.md` | `monster_spawning.md` §⑦ 全節、§⑧ 覆蓋率甜蜜點；`mechanisms/monster_stats_spawning.md`；`guideline.md` §四 |
| `equipment_and_items.md` | `games/lineage_calculation.md` 七大防禦部位、鋼鐵套裝、鞋款對照表；`mechanisms/item_planning.md` |
| `enchanting_and_safety_value.md` | `games/lineage_calculation.md` 強化機率/跳級；`mechanisms/gambling_racing.md` EV 框架；case study 二 |
| `day_night_and_vision.md` | `guideline.md` §7.5 夜晚可見度；`mechanisms/weather_season.md`（決策性引用：不採用） |
| `clan_and_blood_pledge.md` | `mechanisms/clan_system.md` 全篇；case study 一 |
| `castle_siege_and_taxation.md` | `mechanisms/pvp_siege.md`；case study 三；`mechanisms/economy_trading.md` 消耗登記表 |
| `pvp_pk_karma_system.md` | `mechanisms/map_scene_design.md` 分區規則；case study 六 |
| `death_penalty_and_risk.md` | `monster_spawning.md` §⑦ 公平性；case study 六 |
| `pets_and_familiars.md` | `mechanisms/pet_mount.md`；case study 八（養成層較淺） |
| `quests_and_endgame_gaps.md` | case study 八、九；`mechanisms/quest_activity.md` / `ranked_ladder.md` / `achievement_system.md` |
| `economy_and_trading.md` | `mechanisms/economy_trading.md` 消耗登記表；`games/lineage_calculation.md` 艾爾穆的祝福；case study 七 |
| `server_architecture_and_protocol.md` | `guideline.md` §九；`monster_spawning.md` §③ 物件池、§④ AI 導演 |
| `client_architecture.md` | `guideline.md` §十 §十二 §十六 |
| `data_model_and_persistence.md` | `guideline.md` §十四；`lineage/design/` 血盟/城堡/交易資料需求 |
| `development_roadmap.md` | `guideline.md` 學習路線建議、§十七 §十八 |
| `monetization_and_live_ops.md` | `guideline.md` §十五；`design/economy_and_trading.md` sink/source 一致性 |
| `legal_ip_risk.md` | `guideline.md` §二十；約束全部 `design/*.md` 的原創表達 |

（case study = `mechanisms/case_study_lineage.md`，數字為其章節）

## 撰寫順序 (Writing Order)

1. 基礎先行：`lineage/README.md`（骨架版索引）+ `lineage/design_template.md`
2. `ops/legal_ip_risk.md` — 全域寫作約束，最先確立
3. `design/` 依依賴序：world → classes → stats → combat → magic → monster → equipment → enchanting → day_night → clan → siege → pvp → death → pets → quests → `economy_and_trading.md`（最後，彙總各檔 sink）
4. `tech/` 三檔（玩法定案後）：server → client → data_model
5. `ops/` 收尾：roadmap → monetization
6. 全部完成後回頭校對 `lineage/README.md` 索引

## 整合任務 (Integration)

1. 更新 `pkg/game/CLAUDE.md`：專案結構樹新增 `lineage/` 子樹；「關鍵決策」補決策 5（`lineage/` 採前瞻設計骨架而非 11 節骨架之理由）
2. 更新 `pkg/game/README.md`：業務領域索引新增「天堂 Clone 前瞻設計 (`lineage/`)」條目
3. 更新 `mechanisms/economy_trading.md` 消耗登記表：新增「死亡掉落 (death drop)」一列（來源 `lineage/design/death_penalty_and_risk.md`）；強化爆裂/消耗品已由既有列涵蓋，僅引用不重複新增
4. 本計畫檔待實作完成後，依生命週期慣例轉入 `docs/specs/`（建議另存為 `plans/2026-07-05-lineage-clone-doc-plan.md` 作為來源依據）

## IP 約束 (Copyright Constraint)

遊戲機制（公式、規則流程）不受著作權保護，可用原創文字表達；但原版文案、美術、音樂、商標名稱受保護。全部文件以自有詞彙與原創數值框架描述機制，不逐字轉貼原版文案或 wiki 內容；此規則寫入骨架第五節作為每檔自我檢查項。

## 驗證 (Verification)

- 結構完整：`lineage/` 下 24 檔（README + template + 16 design + 3 tech + 3 ops）皆存在，檔名全部小寫底線
- 格式合規：`grep -rn '\*\*' lineage/` 無粗體；Mermaid 邊線文字皆雙引號；每檔含骨架必備五節
- 薄腰檢查：每檔第二節「原版行為對照」只含摘要與引用，不含從既有研究整段搬運的表格
- 頁數：每檔 1-5 頁（約 60-300 行）
- 整合：CLAUDE.md 樹狀圖、README.md 索引、economy_trading.md 消耗登記表皆已同步
