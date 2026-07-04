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

### 主題書封色（圖書館目錄頁書封用；日夜共用，深色上配 --paper-tone 文字）
- `--theme-growth: #5B6E4F`（自我成長＝苔綠）
- `--theme-career: #3E5C76`（職場成長＝墨藍）
- `--theme-people: #96604A`（人際關係＝赭紅）
- `--theme-logic: #6B5B7B`（邏輯思考＝暮紫）
- 書封文字一律 `#F5EFE0`（暖米，四色上對比皆 ≥4.5:1）

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

## 2026-07-04 手法移植附錄：「書桌上的紙」（參考 letusibiza.com，Andy 核准方案 1，只搬手法不搬色）

1. **畫布層（桌面）**：`body` 背景改為桌面色 token——日間 `--desk: #43362A`（溫暖深咖啡桌面），夜間 `--desk: #080A06`（比紙更深一階的深夜）。桌面上永遠看得到。
2. **紙張層**：頁面內容包在 `.sheet`——`background: var(--paper)`、`border-radius: 24px`、四周 `margin: clamp(12px, 2.5vw, 28px)`（露出桌面邊框）、內部維持原 42rem 內容欄。首頁與書摘頁都套。頁腳可留在桌面上（紙外，文字用 `--paper` 的 70% 透明色）。
3. **超大細字重標題**：display 級（站名、書摘書名、藏書統計數字）→ `font-weight: 400`＋行高 1.05＋字級放大（站名 clamp(2.6rem,7vw,4.2rem)、書名 clamp(2.2rem,6vw,3.4rem)）。**內文 h2/h3 保留 700**（中文長文掃讀性優先，這是刻意偏離參考站的點）。
4. **單字體紀律不變**（Noto Serif TC 內文＋Noto Sans TC UI 小標），層級靠尺寸與留白，不加新字體。
5. **按鈕/chip 成對**：主要動作＝實心 `--accent` 膠囊（radius 999px）；次要/篩選＝1.5px 細框膠囊，選中轉實心。
6. **口語 hook**：首頁站名下加一句大字 hook「今晚，翻開一本就好。」（原副標降為小字）。
7. 圓角家族更新：紙張 24px、書封 6px、按鈕/chip 999px、其他卡 10px。陰影仍然全站禁用；紙張與桌面的層次靠色差，不靠陰影。

## anti-slop 紅線（承 harness/design-playbook.md 第 2 節）
- 禁 emoji 當結構 icon；主題標籤用文字 chip（細框）
- 禁裸 hex（一律 var(--token)）；禁漸層、毛玻璃
- 內文 ≥18px、對比 ≥4.5:1、觸控目標 ≥44px、手機無橫向捲動
