# 2026-07-19 等角村莊 First-frame 驗收

## 結論

說話之島村莊已使用 project-original [`isometric-village-v1.png`](../../public/assets/maps/isometric-village-v1.png)、shared `2:1` projection、feet-anchored actors、`640×384` camera 與 `640×96` classic HUD 產生實際 Phaser frame，並經使用者視覺核准。核准畫面已接入正常遊戲路徑，不再依賴 preview presenter。

核准 baseline 位於 [`isometric-village-first-frame-chromium-darwin.png`](../../tests/visual/isometric-village-first-frame.spec.ts-snapshots/isometric-village-first-frame-chromium-darwin.png)，解析度為 `1280×720`。

## 視覺與版權邊界

- `tiles-overworld.png` 只作 project-original art-direction reference。
- 新 atlas 為 project-original，不包含 Lineage 客戶端素材、Logo、字體或地圖。
- atlas 為 `1024×1024 RGBA`、`4×4` 固定格線；每格 `256×256`，ground 使用 `32×16` presented diamond。
- NPC、騎士與 row-based monster 使用完整 frame 與腳底 anchor，不再顯示 atlas 局部切片。
- 其他六張地圖仍使用既有 orthogonal presenter；本次未生成其 atlas，也未宣稱完成其視覺對齊。

## 技術邊界

- grid、碰撞、A*、NPC anchors、任務、戰鬥與存檔未變。
- village presentation data 只決定 atlas ground pattern、props 與 screen projection；domain state 仍使用正交整數座標。
- atlas、必要 frame 或 presentation validation 失敗時，村莊 terrain、actors、camera 與 pointer 會 atomic fallback 至 orthogonal projection。
- pointer 先經 shared `WorldProjection.screenToGrid()` inverse mapping，再提交既有 movement command。
- Phaser logical canvas 維持 `640×480`；world camera 為 `640×384`，底部 DOM HUD 為 `640×96`。

## 驗證證據

| Gate | 結果 |
| --- | --- |
| `git diff --check` | exit `0` |
| `npm run lint` | exit `0`，zero warnings |
| `npm run typecheck` | exit `0` |
| `npm test` | `39` files、`283` tests passed |
| `npm run build` | exit `0`；client `146` modules，PWA precache `29` entries |
| focused Playwright E2E | `10` tests passed；涵蓋 isometric pointer、HUD、movement/combat、PNG 與 row-based monster animation |
| `npx playwright test tests/visual --workers=1` | `15` tests passed；含 first-frame baseline、11 個畫面 baseline 與 3 個 viewport checks |

Production build 仍回報既有的 `>500 kB` chunk warning，以及 PWA build 的 `inlineDynamicImports` deprecation warning；兩者未阻斷 build。本輪依 first-frame 計畫未執行 `npm run verify` 或 seven-stage production campaign。

## 後續

下一個獨立設計／計畫才處理其餘六張地圖；不得直接複製村莊 props、不得從 bitmap 推導 collision，也不得把 presentation 規則回寫至 domain grid。
