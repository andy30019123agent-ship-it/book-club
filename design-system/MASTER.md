# book-club 設計規範（MASTER）

> 方向：**書房夜讀風**——Andy 於 2026-07-04 核准（TG「風格先1」）。深夜檯燈下讀實體書的感覺：暖、靜、不刺眼。任何頁面色/字/距只准引用本檔 token。

## 色彩（CSS custom properties）
### 日間（預設 light）
- `--paper: #F7F1E3`（暖米紙）
- `--ink: #2B2118`（深咖啡墨）
- `--ink-soft: #6B5D4F`（次要文字）
- `--accent: #8C5A2B`（皮革棕，連結/強調）
- `--rule: #E4D9C3`（分隔線）
- `--card: #FFFBF0`（引文/金句底）
### 夜間（prefers-color-scheme: dark ＋手動切換）
- `--paper: #12160F`（墨綠黑）
- `--ink: #E9E2D0`（暖米字）
- `--ink-soft: #A79E8B`
- `--accent: #E8B84B`（暖檯燈黃）
- `--rule: #2A2F24`
- `--card: #1A1F15`

## 字體
- 標題與內文：`"Noto Serif TC", "Songti TC", serif`（Google Fonts，僅載 400/700 兩字重）
- UI 小標（日期、主題 chip、閱讀時間）：`"Noto Sans TC", sans-serif`
- 內文 19px／行高 1.9／段距 1.4em；手機 18px。標題階層 clamp：h1 1.9~2.4rem、h2 1.35rem、h3 1.1rem
- 中文與英數之間半形空格；標點懸掛不強求

## 版式
- 單欄置中，內文欄寬 max 42rem；頁面左右 padding clamp(1.25rem, 5vw, 2.5rem)
- 縱向節奏 8 的倍數；區塊間 48px、段落間 24px
- 金句區：`--card` 底＋左側 3px `--accent` 邊線＋Serif 斜體不用（中文斜體醜，用字重）
- 討論題區：卡片＋「回 TG 聊聊」按鈕（連到 t.me；tg://不穩不用）
- 進度條：頁面頂部細線（scroll progress，3px，`--accent`），JS 10 行內
- 圓角統一 10px；陰影禁用（平面層次，用邊線和色差）

## 動效
- 只有 hover 連結下劃線淡入與夜間切換的 color transition 200ms；respect prefers-reduced-motion
- 禁：進場動畫、視差、打字機效果

## anti-slop 紅線（承 harness/design-playbook.md 第 2 節）
- 禁 emoji 當結構 icon；主題標籤用文字 chip（細框）
- 禁裸 hex（一律 var(--token)）；禁漸層、毛玻璃
- 內文 ≥18px、對比 ≥4.5:1、觸控目標 ≥44px、手機無橫向捲動
