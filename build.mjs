#!/usr/bin/env node
// book-club static site generator — zero runtime deps, only Node builtins.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.join(__dirname, 'content', 'books');
const SITE_DIR = path.join(__dirname, 'site');
const BOOKS_OUT_DIR = path.join(SITE_DIR, 'books');
const SITE_BASE_URL = 'https://andy30019123agent-ship-it.github.io/book-club';

// ---------- date helpers ----------
function todayTaipei() {
  // Asia/Taipei has no DST, UTC+8. Compute directly to avoid relying on TZ env.
  const now = new Date();
  const taipei = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return taipei.toISOString().slice(0, 10);
}

// ---------- frontmatter + markdown parsing ----------
function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error('找不到 frontmatter（缺少 --- 區塊）');
  const [, fmBlock, body] = match;
  const meta = {};
  for (const line of fmBlock.split('\n')) {
    if (!line.trim()) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    meta[key] = value;
  }
  return { meta, body };
}

// inline markdown: **bold** and [text](url)
function inline(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

// parse the markdown body into an array of sections: { heading, html }
// each section starts at a "## " line; handles "### " subheadings,
// "- " dash lists (-> <ul>), "N. " numbered lists (-> <ol>), and plain
// paragraphs (blank-line separated).
function parseBody(body) {
  const lines = body.split('\n');
  const sections = [];
  let current = null;
  let htmlParts = [];
  let paragraphBuf = [];
  let listBuf = null; // { type: 'ul' | 'ol', items: [] }

  function flushParagraph() {
    if (paragraphBuf.length) {
      htmlParts.push(`<p>${inline(paragraphBuf.join(' '))}</p>`);
      paragraphBuf = [];
    }
  }
  function flushList() {
    if (listBuf) {
      const items = listBuf.items.map((it) => `<li>${inline(it)}</li>`).join('');
      htmlParts.push(`<${listBuf.type}>${items}</${listBuf.type}>`);
      listBuf = null;
    }
  }
  function flushAll() {
    flushParagraph();
    flushList();
  }
  function startSection(headingText) {
    if (current) {
      flushAll();
      current.html = htmlParts.join('\n');
      sections.push(current);
    }
    current = { heading: headingText };
    htmlParts = [];
  }

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (/^##\s+/.test(trimmed)) {
      startSection(trimmed.replace(/^##\s+/, ''));
      continue;
    }
    if (/^###\s+/.test(trimmed)) {
      flushAll();
      htmlParts.push(`<h3>${inline(trimmed.replace(/^###\s+/, ''))}</h3>`);
      continue;
    }
    if (/^-\s+/.test(trimmed)) {
      if (!listBuf || listBuf.type !== 'ul') {
        flushList();
        flushParagraph();
        listBuf = { type: 'ul', items: [] };
      }
      listBuf.items.push(trimmed.replace(/^-\s+/, ''));
      continue;
    }
    if (/^\d+\.\s+/.test(trimmed)) {
      if (!listBuf || listBuf.type !== 'ol') {
        flushList();
        flushParagraph();
        listBuf = { type: 'ol', items: [] };
      }
      listBuf.items.push(trimmed.replace(/^\d+\.\s+/, ''));
      continue;
    }
    if (trimmed === '') {
      flushAll();
      continue;
    }
    flushList();
    paragraphBuf.push(trimmed);
  }
  if (current) {
    flushAll();
    current.html = htmlParts.join('\n');
    sections.push(current);
  }
  return sections;
}

function isCardSection(heading) {
  return heading.includes('金句') || heading.includes('討論題');
}

function renderSections(sections) {
  return sections
    .map((s) => {
      const inner = `<h2>${inline(s.heading)}</h2>\n${s.html}`;
      return isCardSection(s.heading)
        ? `<section class="card-section">${inner}</section>`
        : `<section>${inner}</section>`;
    })
    .join('\n');
}

// ---------- load content ----------
function loadBooks() {
  const files = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.md'));
  return files.map((file) => {
    const raw = fs.readFileSync(path.join(CONTENT_DIR, file), 'utf8');
    const { meta, body } = parseFrontmatter(raw);
    const sections = parseBody(body);
    return { ...meta, sections };
  });
}

// ---------- shared page shell (CSS + JS) ----------
function baseStyles() {
  return `
    :root {
      --paper: #F7F1E3;
      --ink: #2B2118;
      --ink-soft: #6B5D4F;
      --accent: #8C5A2B;
      --rule: #E4D9C3;
      --card: #FFFBF0;
      --desk: #43362A;
      --desk-ink: rgba(247, 241, 227, 0.7);
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --paper: #12160F;
        --ink: #E9E2D0;
        --ink-soft: #A79E8B;
        --accent: #E8B84B;
        --rule: #2A2F24;
        --card: #1A1F15;
        --desk: #080A06;
      }
    }
    html[data-theme="dark"] {
      --paper: #12160F;
      --ink: #E9E2D0;
      --ink-soft: #A79E8B;
      --accent: #E8B84B;
      --rule: #2A2F24;
      --card: #1A1F15;
      --desk: #080A06;
    }
    html[data-theme="light"] {
      --paper: #F7F1E3;
      --ink: #2B2118;
      --ink-soft: #6B5D4F;
      --accent: #8C5A2B;
      --rule: #E4D9C3;
      --card: #FFFBF0;
      --desk: #43362A;
    }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    html { background: var(--desk); }
    body {
      margin: 0;
      background: var(--desk);
      color: var(--ink);
      font-family: "Noto Serif TC", "Songti TC", serif;
      font-size: 19px;
      line-height: 1.9;
      transition: background-color 200ms, color 200ms;
    }
    @media (max-width: 480px) {
      body { font-size: 18px; }
    }
    .sheet {
      background: var(--paper);
      border-radius: 24px;
      margin: clamp(12px, 2.5vw, 28px);
      transition: background-color 200ms;
    }
    .page-shell {
      max-width: 42rem;
      margin: 0 auto;
      padding: clamp(1.25rem, 5vw, 2.5rem);
    }
    .ui-label {
      font-family: "Noto Sans TC", sans-serif;
    }
    #progress-bar {
      position: fixed;
      top: 0;
      left: 0;
      height: 3px;
      width: 0%;
      background: var(--accent);
      z-index: 100;
    }
    .theme-toggle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5em;
      min-height: 44px;
      padding: 0.4em 1.1em;
      margin: 0 0 16px;
      border: 1px solid var(--rule);
      border-radius: 999px;
      background: var(--paper);
      color: var(--ink);
      font-family: "Noto Sans TC", sans-serif;
      font-size: 0.9rem;
      cursor: pointer;
      transition: background-color 200ms, color 200ms, border-color 200ms;
    }
    .theme-toggle:hover { border-color: var(--accent); }
    .theme-toggle .tt-icon { font-size: 1.1rem; line-height: 1; }
    .meta-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.6em;
      font-size: 0.85rem;
      color: var(--ink-soft);
      margin-bottom: 24px;
    }
    .theme-chip {
      display: inline-block;
      border: 1.5px solid var(--rule);
      border-radius: 999px;
      padding: 0.15em 0.9em;
    }
    h1 {
      font-weight: 400;
      font-size: clamp(2.2rem, 6vw, 3.4rem);
      line-height: 1.05;
      margin: 0 0 8px;
    }
    .title-en {
      font-size: 1rem;
      color: var(--ink-soft);
      margin: 0 0 24px;
    }
    .byline {
      font-family: "Noto Sans TC", sans-serif;
      color: var(--ink-soft);
      font-size: 0.95rem;
      margin: 0 0 24px;
    }
    .hook {
      font-weight: 700;
      margin: 0 0 48px;
    }
    h2 {
      font-size: 1.35rem;
      margin: 48px 0 24px;
    }
    h3 {
      font-size: 1.1rem;
      margin: 32px 0 16px;
    }
    p, ul, ol {
      margin: 0 0 24px;
    }
    ul, ol {
      padding-left: 1.4em;
    }
    li {
      margin-bottom: 0.5em;
    }
    section {
      margin-bottom: 8px;
    }
    a {
      color: var(--accent);
      text-decoration: none;
      border-bottom: 1px solid transparent;
      transition: border-color 200ms;
    }
    a:hover {
      border-bottom-color: var(--accent);
    }
    .card-section {
      background: var(--card);
      border-left: 3px solid var(--accent);
      border-radius: 10px;
      padding: clamp(1rem, 4vw, 1.5rem);
      margin: 48px 0;
    }
    .card-section h2 {
      margin-top: 0;
    }
    .tg-cta {
      margin-top: 24px;
    }
    .tg-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      padding: 0.5em 1.2em;
      border-radius: 999px;
      background: var(--accent);
      color: var(--paper);
      font-family: "Noto Sans TC", sans-serif;
      font-weight: 700;
      border-bottom: none;
    }
    .tg-button:hover {
      border-bottom: none;
      opacity: 0.9;
    }
    footer {
      margin: 0 0 clamp(12px, 2.5vw, 28px);
      padding: 0 clamp(1.25rem, 5vw, 2.5rem);
      font-family: "Noto Sans TC", sans-serif;
      color: var(--desk-ink);
      font-size: 0.9rem;
      text-align: center;
      transition: color 200ms;
    }
    footer p {
      margin: 0;
    }
    footer .footer-cite {
      font-size: 0.8rem;
      margin-top: 4px;
      opacity: 0.85;
    }
    footer a {
      color: var(--desk-ink);
      border-bottom-color: transparent;
    }
    footer a:hover {
      border-bottom-color: var(--desk-ink);
    }
    .empty-state {
      color: var(--ink-soft);
      font-family: "Noto Sans TC", sans-serif;
    }
    .archive-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .archive-list li {
      border-bottom: 1px solid var(--rule);
      padding: 16px 0;
      margin: 0;
    }
    .archive-list .archive-date {
      font-family: "Noto Sans TC", sans-serif;
      font-size: 0.85rem;
      color: var(--ink-soft);
      display: block;
      margin-bottom: 4px;
    }
    .top-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1.5rem;
    }
    .back-link {
      display: inline-flex;
      align-items: center;
      min-height: 44px;
      color: var(--ink-soft);
      border-bottom: none;
      letter-spacing: 0.08em;
    }
    .back-link:hover { color: var(--accent); }
    .fav-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      border: 1px solid var(--rule);
      border-radius: 999px;
      background: var(--card);
      color: var(--ink-soft);
      cursor: pointer;
      transition: color 200ms, border-color 200ms;
    }
    .fav-btn:hover { color: var(--accent); border-color: var(--accent); }
    .fav-btn.is-fav { color: var(--accent); border-color: var(--accent); }
    .fav-btn.is-fav svg { fill: currentColor; }
    a:focus-visible, button:focus-visible, input:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }
    li.has-quote-btn { position: relative; padding-right: 2.8rem; }
    .quote-save-btn {
      position: absolute;
      right: 0;
      top: 50%;
      transform: translateY(-50%);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      border: none;
      border-radius: 999px;
      background: transparent;
      color: var(--ink-soft);
      cursor: pointer;
      transition: color 200ms;
    }
    .quote-save-btn:hover { color: var(--accent); }
    .quote-save-btn.is-saved { color: var(--accent); }
    .quote-save-btn.is-saved svg { fill: currentColor; }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        transition: none !important;
      }
    }
  `.trim();
}

function baseScript() {
  return `
    (function () {
      var root = document.documentElement;
      var saved = localStorage.getItem('theme');
      if (saved) root.setAttribute('data-theme', saved);
      var btn = document.getElementById('theme-toggle');
      function isDark() {
        var attr = root.getAttribute('data-theme');
        if (attr === 'dark') return true;
        if (attr === 'light') return false;
        return matchMedia('(prefers-color-scheme: dark)').matches;
      }
      function setIcon() {
        if (!btn) return;
        var toLight = isDark();
        var ic = btn.querySelector('.tt-icon');
        var lb = btn.querySelector('.tt-label');
        if (ic) ic.textContent = toLight ? '☀' : '☾';
        if (lb) lb.textContent = toLight ? '切換日間' : '切換夜間';
      }
      setIcon();
      if (btn) btn.addEventListener('click', function () {
        var next = isDark() ? 'light' : 'dark';
        root.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
        setIcon();
      });
      var bar = document.getElementById('progress-bar');
      window.addEventListener('scroll', function () {
        var h = document.documentElement;
        var max = h.scrollHeight - h.clientHeight;
        bar.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + '%';
      });
    })();
  `.trim();
}

function pageShell({
  title,
  description,
  bodyHtml,
  deskFooterHtml = '',
  extraStyles = '',
  extraScript = '',
}) {
  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;700&family=Noto+Sans+TC:wght@400;700&display=swap" rel="stylesheet">
<style>
${baseStyles()}
</style>${extraStyles ? `\n<style>\n${extraStyles}\n</style>` : ''}
</head>
<body>
<div id="progress-bar"></div>
<div class="sheet">
${bodyHtml}
</div>
${deskFooterHtml}
<script>
${baseScript()}
</script>${extraScript ? `\n<script>\n${extraScript}\n</script>` : ''}
</body>
</html>
`;
}

// ---------- page builders ----------
function favButtonHtml(slug) {
  return `<button type="button" class="fav-btn" data-slug="${escapeAttr(slug)}" aria-label="收藏這本書" aria-pressed="false"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 3.5h11v17l-5.5-3.8-5.5 3.8z"/></svg></button>`;
}

function renderBookPage(book) {
  const themeChip = `<span class="theme-chip ui-label">${book.theme}</span>`;
  const dateLabel = `<span class="ui-label">${book.date}</span>`;
  const readingTime = `<span class="ui-label">閱讀 ${book.reading_time} 分鐘</span>`;
  const titleEn = book.title_en ? `<p class="title-en">${book.title_en}</p>` : '';
  const contentHtml = renderSections(book.sections);

  const body = `
<main class="page-shell">
  <div class="top-bar"><a class="back-link ui-label" href="../index.html">← 書架</a>${favButtonHtml(book.slug)}</div>
  <div class="meta-row">${dateLabel}${themeChip}${readingTime}</div>
  <h1>${book.title}</h1>
  ${titleEn}
  <p class="byline">${book.author}｜${book.year}</p>
  <p class="hook">${inline(book.hook)}</p>
  <article>
${contentHtml}
  </article>
</main>`;

  const deskFooterHtml = `<footer>
  <button id="theme-toggle" class="theme-toggle" type="button" aria-label="切換日夜模式"><span class="tt-icon">☾</span><span class="tt-label">切換夜間</span></button>
  <p><a href="../index.html">← 所有書</a></p>
</footer>`;

  return pageShell({
    title: `${book.title}｜拾頁`,
    description: book.hook,
    bodyHtml: body,
    deskFooterHtml,
    extraScript: favScript() + quoteSaveScript(book),
  });
}

// 書摘頁：金句條目加收藏鈕（存文字進 localStorage yedu-quotes）
function quoteSaveScript(book) {
  const slugJs = JSON.stringify(book.slug);
  const titleJs = JSON.stringify(book.title).replace(/</g, '\\u003c');
  return `
    (function () {
      var KEY = 'yedu-quotes';
      var SLUG = ${slugJs};
      var TITLE = ${titleJs};
      function load() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
      function save(a) { localStorage.setItem(KEY, JSON.stringify(a)); }
      var sections = Array.prototype.slice.call(document.querySelectorAll('.card-section'));
      sections.forEach(function (sec) {
        var h2 = sec.querySelector('h2');
        if (!h2 || h2.textContent.indexOf('金句') === -1) return;
        Array.prototype.slice.call(sec.querySelectorAll('li')).forEach(function (li) {
          var text = li.textContent.trim();
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'quote-save-btn';
          btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 3.5h11v17l-5.5-3.8-5.5 3.8z"/></svg>';
          function refresh() {
            var on = load().some(function (x) { return x.slug === SLUG && x.q === text; });
            btn.classList.toggle('is-saved', on);
            btn.setAttribute('aria-pressed', on ? 'true' : 'false');
            btn.setAttribute('aria-label', on ? '從金句集移除' : '收藏這句金句');
          }
          btn.addEventListener('click', function () {
            var qs = load();
            var idx = -1;
            qs.forEach(function (x, i) { if (x.slug === SLUG && x.q === text) idx = i; });
            if (idx === -1) qs.push({ slug: SLUG, title: TITLE, q: text }); else qs.splice(idx, 1);
            save(qs);
            refresh();
          });
          refresh();
          li.classList.add('has-quote-btn');
          li.appendChild(btn);
        });
      });
    })();
  `;
}

// ---------- library (index page) helpers ----------
function themeKey(theme) {
  const map = {
    自我成長: 'growth',
    職場成長: 'career',
    人際關係: 'people',
    邏輯思考: 'logic',
  };
  return map[theme] || 'growth';
}

function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;');
}

function shiftDate(dateStr, deltaDays) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function formatMonthDay(dateStr) {
  const [, m, d] = dateStr.split('-');
  return `${Number(m)}/${Number(d)}`;
}

const CN_MONTHS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
const CN_WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function monthKey(dateStr) {
  return dateStr.slice(0, 7); // "YYYY-MM"
}

function monthLabel(dateStr, withYear) {
  const [y, m] = dateStr.split('-');
  const label = `${CN_MONTHS[Number(m) - 1]}月`;
  return withYear ? `${y}·${label}` : label;
}

function weekdayLabel(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return CN_WEEKDAYS[d.getUTCDay()];
}

function renderTonightCard(book, isToday) {
  const searchKey = escapeAttr(`${book.title} ${book.author}`.toLowerCase());
  return `
    <a class="tonight-card cover-${themeKey(book.theme)}" href="books/${book.slug}.html" data-theme="${escapeAttr(book.theme)}" data-search="${searchKey}" data-slug="${escapeAttr(book.slug)}">
      ${favButtonHtml(book.slug)}
      <span class="tonight-body">
        <span class="tonight-badge ui-label">${isToday ? '今晚的書' : '最新上架'}</span>
        <span class="tonight-title">${inline(book.title)}</span>
        <span class="tonight-author">${inline(book.author)}・${book.theme}</span>
        <span class="tonight-hook">${inline(book.hook)}</span>
        <span class="tonight-foot">
          <span class="tonight-meta ui-label">${formatMonthDay(book.date)}・閱讀 ${book.reading_time} 分鐘</span>
          <span class="read-pill">開始閱讀</span>
        </span>
      </span>
    </a>`;
}

function renderCatalogCard(book, no) {
  const searchKey = escapeAttr(`${book.title} ${book.author}`.toLowerCase());
  return `
    <a class="catalog-card cover-${themeKey(book.theme)}" href="books/${book.slug}.html" data-theme="${escapeAttr(book.theme)}" data-search="${searchKey}" data-slug="${escapeAttr(book.slug)}">
      ${favButtonHtml(book.slug)}
      <span class="catalog-body">
        <span class="catalog-index ui-label">No.${String(no).padStart(3, '0')}・${book.theme}・${formatMonthDay(book.date)}</span>
        <span class="catalog-title">${inline(book.title)}</span>
        <span class="catalog-author ui-label">${inline(book.author)}</span>
        <span class="catalog-hook">${inline(book.hook)}</span>
        <span class="catalog-foot ui-label">閱讀 ${book.reading_time} 分鐘<span class="catalog-go">開始閱讀 →</span></span>
      </span>
    </a>`;
}

function renderUpcomingRow(book) {
  return `
      <li class="upcoming-row"><span class="upcoming-date">${formatMonthDay(book.date)}</span><span class="upcoming-text"><span class="upcoming-name">${inline(book.title)}</span>　<span class="upcoming-author">${inline(book.author)}</span></span></li>`;
}

function libraryStyles() {
  return `
    :root {
      --theme-growth: #5B6E4F;
      --theme-career: #3E5C76;
      --theme-people: #96604A;
      --theme-logic: #6B5B7B;
      --cover-text: #F5EFE0;
    }
    .library-shell {
      max-width: 46rem;
      margin: 0 auto;
      padding: clamp(1.5rem, 5vw, 3rem) clamp(1.1rem, 4vw, 2rem) 3.5rem;
    }
    .library-header { margin: 0.5rem 0 2.75rem; }
    .library-title {
      margin: 0;
      font-weight: 400;
      line-height: 1.05;
      font-size: clamp(3rem, 10vw, 4.4rem);
      letter-spacing: 0.14em;
    }
    .library-rule {
      width: 3.2rem;
      height: 1px;
      background: var(--accent);
      margin: 1.1rem 0 0.9rem;
    }
    .library-stats {
      margin: 0;
      color: var(--ink-soft);
      font-size: 0.84rem;
      letter-spacing: 0.12em;
    }
    .section-label {
      margin: 0 0 1.1rem;
      font-family: "Noto Sans TC", sans-serif;
      font-size: 0.8rem;
      font-weight: 700;
      letter-spacing: 0.18em;
      color: var(--ink-soft);
    }
    .tonight-section { margin-bottom: 3rem; }
    .catalog-section { margin-bottom: 3rem; }
    .upcoming-section { margin-bottom: 1rem; }

    .cover-growth { --c: var(--theme-growth); }
    .cover-career { --c: var(--theme-career); }
    .cover-people { --c: var(--theme-people); }
    .cover-logic { --c: var(--theme-logic); }

    .tonight-card, .catalog-card {
      position: relative;
      display: flex;
      background: var(--card);
      border: 1px solid var(--rule);
      border-left: 4px solid var(--c, var(--accent));
      text-decoration: none;
      color: var(--ink);
      transition: border-color 0.2s ease, transform 0.2s ease;
    }
    .tonight-card:hover, .catalog-card:hover {
      border-color: var(--accent);
      border-left-color: var(--c, var(--accent));
      transform: translateY(-2px);
    }
    .tonight-card:active, .catalog-card:active {
      transform: translateY(0) scale(0.995);
    }
    .tonight-card .fav-btn, .catalog-card .fav-btn {
      position: absolute;
      top: 0.7rem;
      right: 0.7rem;
      background: transparent;
      border-color: transparent;
    }
    .tonight-card .fav-btn:hover, .catalog-card .fav-btn:hover { border-color: var(--accent); }
    .tonight-body, .catalog-body { padding-right: 2.4rem; }
    @media (prefers-reduced-motion: reduce) {
      .tonight-card:hover, .catalog-card:hover, .tonight-card:active, .catalog-card:active { transform: none; }
    }

    .tonight-card {
      gap: clamp(1rem, 3.5vw, 1.6rem);
      border-radius: 14px;
      padding: clamp(1.15rem, 3.5vw, 1.75rem);
    }
    .tonight-body {
      display: flex;
      flex-direction: column;
      gap: 0.55rem;
      min-width: 0;
    }
    .tonight-badge {
      align-self: flex-start;
      background: var(--accent);
      color: var(--paper);
      border-radius: 999px;
      padding: 0.32rem 0.85rem;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.14em;
    }
    .tonight-title {
      font-family: "Noto Serif TC", "Songti TC", serif;
      font-weight: 700;
      font-size: clamp(1.35rem, 4.5vw, 1.7rem);
      line-height: 1.3;
    }
    .tonight-author { color: var(--ink-soft); font-size: 0.86rem; font-family: "Noto Sans TC", sans-serif; }
    .tonight-hook { font-size: 0.97rem; line-height: 1.75; opacity: 0.9; }
    .tonight-foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 0.8rem;
      margin-top: 0.4rem;
    }
    .tonight-meta { color: var(--ink-soft); font-size: 0.8rem; letter-spacing: 0.06em; }
    .read-pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      padding: 0 1.5rem;
      border-radius: 999px;
      background: var(--accent);
      color: var(--paper);
      font-family: "Noto Sans TC", sans-serif;
      font-weight: 700;
      font-size: 0.92rem;
      letter-spacing: 0.04em;
    }

    .catalog-list { display: flex; flex-direction: column; gap: 1rem; }
    .catalog-card {
      gap: 1.1rem;
      border-radius: 10px;
      padding: 1.05rem 1.2rem;
    }
    .catalog-body { display: flex; flex-direction: column; gap: 0.32rem; min-width: 0; }
    .catalog-index { font-size: 0.72rem; letter-spacing: 0.12em; color: var(--ink-soft); }
    .catalog-title {
      font-family: "Noto Serif TC", "Songti TC", serif;
      font-weight: 700;
      font-size: 1.18rem;
      line-height: 1.35;
    }
    .catalog-author { font-size: 0.82rem; color: var(--ink-soft); }
    .catalog-hook {
      font-size: 0.92rem;
      line-height: 1.7;
      opacity: 0.85;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .catalog-foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.8rem;
      margin-top: 0.4rem;
      color: var(--ink-soft);
      font-size: 0.78rem;
      letter-spacing: 0.05em;
    }
    .catalog-go { color: var(--accent); font-weight: 700; }

    .shelf-controls {
      display: flex;
      flex-direction: column;
      gap: 0.8rem;
      margin: -1rem 0 2.25rem;
    }
    .theme-filters { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .filter-chip {
      min-height: 44px;
      padding: 0 1.05rem;
      border: 1.5px solid var(--accent);
      border-radius: 999px;
      background: transparent;
      color: var(--accent);
      font-family: "Noto Sans TC", sans-serif;
      font-size: 0.88rem;
      cursor: pointer;
      transition: background-color 0.2s ease, color 0.2s ease;
    }
    .filter-chip.is-active { background: var(--accent); color: var(--paper); }
    .shelf-search {
      width: 100%;
      min-height: 44px;
      padding: 0 1rem;
      border: 1px solid var(--rule);
      border-radius: 999px;
      background: var(--card);
      color: var(--ink);
      font-family: "Noto Sans TC", sans-serif;
      font-size: 0.92rem;
    }
    .shelf-search::placeholder { color: var(--ink-soft); }

    .myshelf-section { margin-bottom: 3rem; }
    .shelf-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 1.1rem;
    }
    .shelf-head .section-label { margin: 0; }
    .see-all {
      min-height: 44px;
      padding: 0 1rem;
      border: 1px solid var(--rule);
      border-radius: 999px;
      background: transparent;
      color: var(--accent);
      font-size: 0.8rem;
      letter-spacing: 0.08em;
      cursor: pointer;
      transition: border-color 0.2s ease;
    }
    .see-all:hover { border-color: var(--accent); }
    .shelf-empty-note {
      margin: 0;
      color: var(--ink-soft);
      font-size: 0.85rem;
      letter-spacing: 0.06em;
    }
    .myshelf-strip {
      display: flex;
      gap: 0.8rem;
      overflow-x: auto;
      scroll-snap-type: x mandatory;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
      padding-bottom: 0.3rem;
    }
    .myshelf-strip::-webkit-scrollbar { display: none; }
    .strip-card {
      flex: 0 0 10.5rem;
      scroll-snap-align: start;
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
      background: var(--card);
      border: 1px solid var(--rule);
      border-left: 4px solid var(--c, var(--accent));
      border-radius: 10px;
      padding: 0.95rem 1rem;
      text-decoration: none;
      color: var(--ink);
      transition: border-color 0.2s ease, transform 0.2s ease;
    }
    .strip-card:hover { border-color: var(--accent); border-left-color: var(--c, var(--accent)); transform: translateY(-2px); }
    .strip-card:active { transform: translateY(0) scale(0.995); }
    .strip-title {
      font-family: "Noto Serif TC", "Songti TC", serif;
      font-weight: 700;
      font-size: 0.98rem;
      line-height: 1.4;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .strip-author { font-size: 0.75rem; color: var(--ink-soft); }
    .strip-theme { font-size: 0.7rem; color: var(--ink-soft); letter-spacing: 0.1em; margin-top: auto; }
    .myshelf-list { list-style: none; margin: 0; padding: 0; }
    .myshelf-row {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      border-bottom: 1px solid var(--rule);
    }
    .myshelf-row:last-child { border-bottom: none; }
    .myshelf-link {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0.6rem;
      padding: 0.75rem 0.2rem;
      text-decoration: none;
      color: var(--ink);
      border-bottom: none;
    }
    .myshelf-link:hover .myshelf-name { color: var(--accent); }
    .myshelf-name {
      font-family: "Noto Serif TC", "Songti TC", serif;
      font-weight: 700;
      font-size: 1rem;
      transition: color 0.2s ease;
    }
    .myshelf-author { font-size: 0.8rem; color: var(--ink-soft); }
    .fav-btn--row {
      position: static;
      flex: none;
      width: 40px;
      height: 40px;
      border-color: transparent;
      background: transparent;
      color: var(--accent);
    }

    .qshelf-section { margin-bottom: 3rem; }
    .qshelf-rotator {
      background: var(--card);
      border: 1px solid var(--rule);
      border-left: 3px solid var(--accent);
      border-radius: 8px;
      padding: 0.95rem 1.1rem;
      opacity: 1;
      transition: opacity 280ms ease;
    }
    .qshelf-rotator.is-fading { opacity: 0; }
    .qshelf-list { list-style: none; margin: 0; padding: 0; }
    .qshelf-row {
      position: relative;
      background: var(--card);
      border: 1px solid var(--rule);
      border-left: 3px solid var(--accent);
      border-radius: 8px;
      padding: 0.95rem 3rem 0.95rem 1.1rem;
      margin-bottom: 0.8rem;
    }
    .qshelf-quote {
      margin: 0 0 0.4rem;
      font-size: 0.95rem;
      line-height: 1.85;
    }
    .qshelf-src { margin: 0; font-size: 0.78rem; }
    .qshelf-src a {
      color: var(--ink-soft);
      border-bottom: none;
    }
    .qshelf-src a:hover { color: var(--accent); }
    .qshelf-remove {
      position: absolute;
      top: 0.6rem;
      right: 0.6rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border: none;
      border-radius: 999px;
      background: transparent;
      color: var(--ink-soft);
      cursor: pointer;
      transition: color 200ms;
    }
    .qshelf-remove:hover { color: var(--accent); }

    .upcoming-list { list-style: none; margin: 0; padding: 0; }
    .upcoming-row {
      display: flex;
      align-items: baseline;
      gap: 0.9rem;
      padding: 0.78rem 0.2rem;
      border-bottom: 1px solid var(--rule);
      color: var(--ink-soft);
    }
    .upcoming-row:last-child { border-bottom: none; }
    .upcoming-more { margin: 0.7rem 0 0; color: var(--ink-soft); font-size: 0.82rem; }
    .upcoming-date {
      flex: none;
      width: 2.8rem;
      font-family: "Noto Sans TC", sans-serif;
      font-size: 0.8rem;
      font-variant-numeric: tabular-nums;
      letter-spacing: 0.04em;
    }
    .upcoming-name {
      font-family: "Noto Serif TC", "Songti TC", serif;
      font-weight: 700;
      font-size: 0.98rem;
      color: var(--ink);
      opacity: 0.72;
    }
    .upcoming-text { min-width: 0; line-height: 1.8; }
    .upcoming-author { font-size: 0.8rem; font-family: "Noto Sans TC", sans-serif; }

    .empty-state {
      padding: 2.5rem 1rem;
      text-align: center;
      color: var(--ink-soft);
      font-size: 0.98rem;
      border: 1px dashed var(--rule);
      border-radius: 10px;
    }

    .month-filters {
      display: flex;
      gap: 0.5rem;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
      scroll-snap-type: x proximity;
      padding-bottom: 0.15rem;
    }
    .month-filters::-webkit-scrollbar { display: none; }
    .month-chip { flex: 0 0 auto; scroll-snap-align: start; }

    .month-view { margin-bottom: 3rem; }
    .month-view-head { margin-bottom: 1.1rem; }
    .month-view-head .section-label { margin: 0; }
    .day-list { display: flex; flex-direction: column; gap: 0.7rem; }
    .day-row {
      position: relative;
      display: flex;
      align-items: center;
      gap: clamp(0.7rem, 3vw, 1.1rem);
      background: var(--card);
      border: 1px solid var(--rule);
      border-left: 4px solid var(--c, var(--accent));
      border-radius: 10px;
      padding: 0.85rem 1rem;
      text-decoration: none;
      color: var(--ink);
      transition: border-color 0.2s ease, transform 0.2s ease;
    }
    a.day-row:hover {
      border-color: var(--accent);
      border-left-color: var(--c, var(--accent));
      transform: translateY(-2px);
    }
    a.day-row:active { transform: translateY(0) scale(0.995); }
    .day-row.is-locked { opacity: 0.55; }
    .day-tile {
      flex: none;
      width: 2.9rem;
      min-height: 44px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.05rem;
      font-family: "Noto Sans TC", sans-serif;
      border-right: 1px solid var(--rule);
      padding-right: clamp(0.7rem, 3vw, 1.1rem);
    }
    .day-num {
      font-size: 1.5rem;
      line-height: 1;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    .day-wk { font-size: 0.7rem; color: var(--ink-soft); letter-spacing: 0.05em; }
    .day-body { display: flex; flex-direction: column; gap: 0.2rem; min-width: 0; flex: 1; }
    .day-today {
      align-self: flex-start;
      background: var(--accent);
      color: var(--paper);
      border-radius: 999px;
      padding: 0.12rem 0.6rem;
      font-size: 0.66rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      margin-bottom: 0.1rem;
    }
    .day-title {
      font-family: "Noto Serif TC", "Songti TC", serif;
      font-weight: 700;
      font-size: 1.08rem;
      line-height: 1.35;
    }
    .day-meta { font-size: 0.76rem; color: var(--ink-soft); }
    .day-hook {
      font-size: 0.86rem;
      line-height: 1.6;
      opacity: 0.85;
      display: -webkit-box;
      -webkit-line-clamp: 1;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .day-action { flex: none; font-size: 0.8rem; }
    .day-go { color: var(--accent); font-weight: 700; letter-spacing: 0.04em; }
    .coming-pill {
      border: 1px solid var(--rule);
      border-radius: 999px;
      padding: 0.3rem 0.7rem;
      color: var(--ink-soft);
      white-space: nowrap;
    }
    @media (prefers-reduced-motion: reduce) {
      a.day-row:hover, a.day-row:active { transform: none; }
    }

    @media (max-width: 520px) {
      .tonight-card { padding: 1.1rem 1.15rem; }
      .catalog-card { padding: 0.95rem 1rem; gap: 0.9rem; }
      .read-pill { padding: 0 1.2rem; }
      .day-row { padding: 0.8rem 0.85rem; }
      .day-title { font-size: 1.02rem; }
    }
  `;
}

function libraryScript() {
  return `
    (function () {
      var themeChips = Array.prototype.slice.call(document.querySelectorAll('.filter-chip[data-filter-theme]'));
      var monthChips = Array.prototype.slice.call(document.querySelectorAll('.month-chip'));
      var favChip = document.querySelector('.filter-chip[data-filter-fav]');
      var search = document.getElementById('shelf-search');
      var cards = Array.prototype.slice.call(document.querySelectorAll('.tonight-card, .catalog-card'));
      var emptyMsg = document.getElementById('shelf-empty');
      var normalSections = Array.prototype.slice.call(
        document.querySelectorAll('.tonight-section, .catalog-section, .upcoming-section, .myshelf-section, .qshelf-section')
      );
      var monthView = document.getElementById('month-view');
      var dayList = document.getElementById('day-list');
      var monthTitle = document.getElementById('month-view-title');
      var monthEmpty = document.getElementById('month-empty');
      if (!cards.length && !monthChips.length) return;
      var activeTheme = 'all';
      var activeMonth = 'all';
      var favOnly = false;
      var THEME_KEY = { '自我成長': 'growth', '職場成長': 'career', '人際關係': 'people', '邏輯思考': 'logic' };
      function favList() {
        try { return JSON.parse(localStorage.getItem('yedu-favs')) || []; } catch (e) { return []; }
      }
      function esc(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
      }
      function applyCards() {
        var q = search ? search.value.trim().toLowerCase() : '';
        var favs = favList();
        var visible = 0;
        cards.forEach(function (card) {
          var okTheme = activeTheme === 'all' || card.getAttribute('data-theme') === activeTheme;
          var okSearch = !q || card.getAttribute('data-search').indexOf(q) !== -1;
          var okFav = !favOnly || favs.indexOf(card.getAttribute('data-slug')) !== -1;
          var show = okTheme && okSearch && okFav;
          card.style.display = show ? '' : 'none';
          if (show) visible++;
        });
        if (emptyMsg) {
          emptyMsg.textContent = favOnly && visible === 0
            ? '還沒有收藏——點卡片右上角的書籤試試'
            : '書架上還沒有這本，跟我說書名就補';
          emptyMsg.hidden = visible !== 0;
        }
      }
      function dayRowHtml(b) {
        var themeCls = 'cover-' + (THEME_KEY[b.theme] || 'growth');
        var tile = '<span class="day-tile"><span class="day-num">' + b.day +
          '</span><span class="day-wk ui-label">' + esc(b.wk) + '</span></span>';
        var body = '<span class="day-body">' +
          (b.today ? '<span class="day-today ui-label">今晚</span>' : '') +
          '<span class="day-title">' + esc(b.title) + '</span>' +
          '<span class="day-meta ui-label">' + esc(b.author) + '・' + esc(b.theme) + '</span>' +
          '<span class="day-hook">' + esc(b.hook) + '</span></span>';
        if (b.locked) {
          return '<div class="day-row is-locked ' + themeCls + '" aria-disabled="true">' +
            tile + body + '<span class="day-action coming-pill ui-label">即將上架</span></div>';
        }
        return '<a class="day-row ' + themeCls + (b.today ? ' is-today' : '') + '" href="books/' + esc(b.slug) + '.html">' +
          tile + body + '<span class="day-action day-go ui-label">讀 →</span></a>';
      }
      function renderMonth() {
        var cal = window.__calendar || [];
        var labels = window.__monthLabels || {};
        var label = labels[activeMonth] || '這個月';
        var q = search ? search.value.trim().toLowerCase() : '';
        var favs = favList();
        var shown = cal.filter(function (b) {
          if (b.mk !== activeMonth) return false;
          var okTheme = activeTheme === 'all' || b.theme === activeTheme;
          var okSearch = !q || b.search.indexOf(q) !== -1;
          var okFav = !favOnly || favs.indexOf(b.slug) !== -1;
          return okTheme && okSearch && okFav;
        });
        monthTitle.textContent = label + '・' + shown.length + ' 本';
        dayList.innerHTML = shown.map(dayRowHtml).join('');
        monthEmpty.textContent = label + '裡沒有符合的書';
        monthEmpty.hidden = shown.length !== 0;
      }
      function apply() {
        if (activeMonth === 'all') {
          if (monthView) monthView.hidden = true;
          normalSections.forEach(function (s) { s.hidden = false; });
          applyCards();
        } else {
          normalSections.forEach(function (s) { s.hidden = true; });
          if (emptyMsg) emptyMsg.hidden = true;
          if (monthView) monthView.hidden = false;
          renderMonth();
        }
      }
      window.__applyShelf = apply;
      themeChips.forEach(function (chip) {
        chip.addEventListener('click', function () {
          themeChips.forEach(function (c) { c.classList.remove('is-active'); });
          chip.classList.add('is-active');
          activeTheme = chip.getAttribute('data-filter-theme');
          apply();
        });
      });
      monthChips.forEach(function (chip) {
        chip.addEventListener('click', function () {
          monthChips.forEach(function (c) { c.classList.remove('is-active'); });
          chip.classList.add('is-active');
          activeMonth = chip.getAttribute('data-filter-month');
          apply();
        });
      });
      if (favChip) {
        favChip.addEventListener('click', function () {
          favOnly = !favOnly;
          favChip.classList.toggle('is-active', favOnly);
          favChip.setAttribute('aria-pressed', favOnly ? 'true' : 'false');
          apply();
        });
      }
      if (search) search.addEventListener('input', apply);
    })();
  `;
}

function favScript() {
  return `
    (function () {
      var KEY = 'yedu-favs';
      function load() {
        try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; }
      }
      function save(favs) { localStorage.setItem(KEY, JSON.stringify(favs)); }
      function refresh(btn) {
        var on = load().indexOf(btn.getAttribute('data-slug')) !== -1;
        btn.classList.toggle('is-fav', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        btn.setAttribute('aria-label', on ? '取消收藏' : '收藏這本書');
      }
      var btns = Array.prototype.slice.call(document.querySelectorAll('.fav-btn'));
      function esc(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
      }
      var THEME_KEY = { '自我成長': 'growth', '職場成長': 'career', '人際關係': 'people', '邏輯思考': 'logic' };
      var shelfExpanded = false;
      function renderShelf() {
        var strip = document.getElementById('myshelf-strip');
        var list = document.getElementById('myshelf-list');
        var empty = document.getElementById('myshelf-empty');
        var allBtn = document.getElementById('myshelf-all');
        if (!strip || !list || !window.__books) return;
        var favs = load();
        var mine = window.__books.filter(function (b) { return favs.indexOf(b.slug) !== -1; });
        var has = mine.length > 0;
        empty.hidden = has;
        allBtn.hidden = !has;
        strip.hidden = !has || shelfExpanded;
        list.hidden = !has || !shelfExpanded;
        allBtn.textContent = shelfExpanded ? '收合' : '觀看全部';
        allBtn.setAttribute('aria-expanded', shelfExpanded ? 'true' : 'false');
        if (!has) { strip.innerHTML = ''; list.innerHTML = ''; return; }
        strip.innerHTML = mine.map(function (b) {
          return '<a class="strip-card cover-' + (THEME_KEY[b.theme] || 'growth') + '" href="books/' + esc(b.slug) + '.html">' +
            '<span class="strip-title">' + esc(b.title) + '</span>' +
            '<span class="strip-author ui-label">' + esc(b.author) + '</span>' +
            '<span class="strip-theme ui-label">' + esc(b.theme) + '</span></a>';
        }).join('');
        list.innerHTML = mine.map(function (b) {
          return '<li class="myshelf-row">' +
            '<a class="myshelf-link" href="books/' + esc(b.slug) + '.html">' +
            '<span class="myshelf-name">' + esc(b.title) + '</span>' +
            '<span class="myshelf-author ui-label">' + esc(b.author) + '・' + esc(b.theme) + '</span></a>' +
            '<button type="button" class="fav-btn fav-btn--row is-fav" data-slug="' + esc(b.slug) + '" aria-label="從書櫃移除" aria-pressed="true">' +
            '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 3.5h11v17l-5.5-3.8-5.5 3.8z"/></svg></button></li>';
        }).join('');
      }
      var shelfAllBtn = document.getElementById('myshelf-all');
      if (shelfAllBtn) {
        shelfAllBtn.addEventListener('click', function () {
          shelfExpanded = !shelfExpanded;
          renderShelf();
        });
      }
      function toggle(slug) {
        var favs = load();
        var i = favs.indexOf(slug);
        if (i === -1) favs.push(slug); else favs.splice(i, 1);
        save(favs);
        btns.forEach(refresh);
        renderShelf();
        if (window.__applyShelf) window.__applyShelf();
      }
      btns.forEach(function (btn) {
        refresh(btn);
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          toggle(btn.getAttribute('data-slug'));
        });
      });
      var shelfList = document.getElementById('myshelf-list');
      if (shelfList) {
        shelfList.addEventListener('click', function (e) {
          var btn = e.target.closest ? e.target.closest('.fav-btn--row') : null;
          if (!btn) return;
          e.preventDefault();
          toggle(btn.getAttribute('data-slug'));
        });
      }
      renderShelf();
    })();
  `;
}

function renderIndexPage(books) {
  const today = todayTaipei();
  const eligible = books
    .filter((b) => b.date <= today)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const upcoming = books
    .filter((b) => b.date > today)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const featured = eligible[0] || null;
  const past = eligible.slice(1);
  const showControls = eligible.length >= 1;

  const headerHtml = `
  <header class="library-header">
    <h1 class="library-title">拾頁</h1>
    <div class="library-rule" aria-hidden="true"></div>
    <p class="library-stats ui-label">每晚七點・一本書的深度導讀・已上架 ${eligible.length} 本</p>
  </header>`;

  // 月份 chip：依實際有書的月份（含未上架）自動生成，由近到遠（升冪）
  const allMonths = [...new Set(books.map((b) => monthKey(b.date)))].sort();
  const multiYear = new Set(books.map((b) => b.date.slice(0, 4))).size > 1;
  const monthChipsHtml = `<div class="month-filters" role="group" aria-label="月份篩選"><button type="button" class="filter-chip month-chip is-active" data-filter-month="all">全部</button>${allMonths
    .map(
      (mk) =>
        `<button type="button" class="filter-chip month-chip" data-filter-month="${mk}">${monthLabel(
          `${mk}-01`,
          multiYear
        )}</button>`
    )
    .join('')}</div>`;

  const themes = ['全部', '自我成長', '職場成長', '人際關係', '邏輯思考'];
  const controlsHtml = showControls
    ? `
  <div class="shelf-controls">
    <input type="search" id="shelf-search" class="shelf-search" placeholder="搜尋書名或作者" aria-label="搜尋書名或作者">
    ${monthChipsHtml}
    <div class="theme-filters" role="group" aria-label="主題篩選">${themes
      .map(
        (t, i) =>
          `<button type="button" class="filter-chip${i === 0 ? ' is-active' : ''}" data-filter-theme="${
            t === '全部' ? 'all' : t
          }">${t}</button>`
      )
      .join('')}<button type="button" class="filter-chip filter-chip--fav" data-filter-fav aria-pressed="false">我的收藏</button></div>
  </div>`
    : '';

  // 月視圖容器（內容由前端 JS 依 window.__calendar 填入）
  const monthViewHtml = showControls
    ? `
  <section class="month-view" id="month-view" hidden aria-live="polite">
    <div class="month-view-head"><h2 class="section-label" id="month-view-title"></h2></div>
    <div class="day-list" id="day-list"></div>
    <p class="empty-state" id="month-empty" hidden></p>
  </section>`
    : '';

  const myshelfHtml = showControls
    ? `
  <section class="myshelf-section" id="myshelf">
    <div class="shelf-head">
      <h2 class="section-label">我的書櫃</h2>
      <button type="button" class="see-all ui-label" id="myshelf-all" hidden aria-expanded="false">觀看全部</button>
    </div>
    <div class="myshelf-strip" id="myshelf-strip" hidden></div>
    <ul class="myshelf-list" id="myshelf-list" hidden></ul>
    <p class="shelf-empty-note ui-label" id="myshelf-empty">尚未蒐藏</p>
  </section>
  <section class="qshelf-section" id="qshelf">
    <div class="shelf-head">
      <h2 class="section-label">金句集</h2>
      <button type="button" class="see-all ui-label" id="qshelf-all" hidden aria-expanded="false">觀看全部</button>
    </div>
    <div id="qshelf-rotator" class="qshelf-rotator" hidden></div>
    <ul class="qshelf-list" id="qshelf-list" hidden></ul>
    <p class="shelf-empty-note ui-label" id="qshelf-empty">尚未蒐藏</p>
  </section>`
    : '';

  let tonightHtml = '';
  if (featured) {
    tonightHtml = `
  <section class="tonight-section">${renderTonightCard(featured, featured.date === today)}
  </section>`;
  } else {
    const message = upcoming.length
      ? `圖書館開幕中，第一本書 ${formatMonthDay(upcoming[0].date)} 晚上 7 點上架`
      : '圖書館開幕中，敬請期待第一本書上架';
    tonightHtml = `
  <section class="tonight-section">
    <p class="empty-state">${message}</p>
  </section>`;
  }

  let catalogHtml = '';
  if (past.length) {
    const cardsHtml = past.map((b, i) => renderCatalogCard(b, eligible.length - (i + 1))).join('');
    catalogHtml = `
  <section class="catalog-section">
    <h2 class="section-label">藏書目錄</h2>
    <div class="catalog-list">${cardsHtml}
    </div>
  </section>`;
  }
  const emptyMsgHtml = showControls
    ? `
  <p id="shelf-empty" class="empty-state" hidden>書架上還沒有這本，跟我說書名就補</p>`
    : '';

  const upcomingShown = upcoming.slice(0, 7);
  const upcomingRest = upcoming.length - upcomingShown.length;
  const upcomingHtml = upcoming.length
    ? `
  <section class="upcoming-section">
    <h2 class="section-label">即將上架</h2>
    <ul class="upcoming-list">${upcomingShown.map(renderUpcomingRow).join('')}
    </ul>${upcomingRest > 0 ? `\n    <p class="upcoming-more ui-label">…之後還有 ${upcomingRest} 本，本月已排到 ${formatMonthDay(upcoming[upcoming.length - 1].date)}</p>` : ''}
  </section>`
    : '';

  const body = `
<main class="library-shell">
${headerHtml}
${controlsHtml}
${monthViewHtml}
${tonightHtml}
${myshelfHtml}
${catalogHtml}
${emptyMsgHtml}
${upcomingHtml}
</main>`;

  const deskFooterHtml = `<footer>
  <button id="theme-toggle" class="theme-toggle" type="button" aria-label="切換日夜模式"><span class="tt-icon">☾</span><span class="tt-label">切換夜間</span></button>
  <p class="ui-label">習慣是自我成長的複利。</p>
  <p class="ui-label footer-cite">——<a href="books/atomic-habits.html">《原子習慣》</a></p>
</footer>`;

  const booksData = eligible.map((b) => ({
    slug: b.slug,
    title: b.title,
    author: b.author,
    theme: b.theme,
    date: b.date,
  }));
  const booksJson = JSON.stringify(booksData).replace(/</g, '\\u003c');

  // 月視圖資料：全書（含未上架）升冪，帶 locked/today 旗標與日/星期
  const calendarData = books
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((b) => ({
      date: b.date,
      slug: b.slug,
      title: b.title,
      author: b.author,
      theme: b.theme,
      hook: b.hook,
      mk: monthKey(b.date),
      day: Number(b.date.split('-')[2]),
      wk: weekdayLabel(b.date),
      locked: b.date > today,
      today: b.date === today,
      search: `${b.title} ${b.author}`.toLowerCase(),
    }));
  const calendarJson = JSON.stringify(calendarData).replace(/</g, '\\u003c');
  const monthLabels = {};
  allMonths.forEach((mk) => {
    monthLabels[mk] = monthLabel(`${mk}-01`, multiYear);
  });
  const monthLabelsJson = JSON.stringify(monthLabels).replace(/</g, '\\u003c');

  return pageShell({
    title: '拾頁｜每晚一本書的深度導讀',
    description: '每晚七點，一本書的深度導讀。自我成長、職場、人際、思考，慢慢讀成一座圖書館。',
    bodyHtml: body,
    deskFooterHtml,
    extraStyles: libraryStyles(),
    extraScript:
      `window.__books = ${booksJson};\n` +
      `window.__calendar = ${calendarJson};\n` +
      `window.__monthLabels = ${monthLabelsJson};\n` +
      (showControls ? libraryScript() : '') +
      favScript() +
      quoteShelfScript(),
  });
}

// 首頁：金句集——隨機單句 5 秒輪播＋觀看全部展開（讀 yedu-quotes，可移除）
function quoteShelfScript() {
  return `
    (function () {
      var KEY = 'yedu-quotes';
      function load() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
      function esc(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
      }
      var rotator = document.getElementById('qshelf-rotator');
      var list = document.getElementById('qshelf-list');
      var empty = document.getElementById('qshelf-empty');
      var allBtn = document.getElementById('qshelf-all');
      if (!rotator || !list) return;
      var expanded = false;
      var idx = 0;
      var timer = null;
      function quoteHtml(x) {
        return '<p class="qshelf-quote">' + esc(x.q) + '</p>' +
          '<p class="qshelf-src ui-label"><a href="books/' + esc(x.slug) + '.html">《' + esc(x.title) + '》</a></p>';
      }
      function showQuote(qs, animate) {
        if (!qs.length) return;
        var x = qs[idx % qs.length];
        if (animate) {
          rotator.classList.add('is-fading');
          setTimeout(function () {
            rotator.innerHTML = quoteHtml(x);
            rotator.classList.remove('is-fading');
          }, 280);
        } else {
          rotator.innerHTML = quoteHtml(x);
        }
      }
      function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }
      function startTimer(qs) {
        stopTimer();
        if (qs.length < 2 || expanded) return;
        timer = setInterval(function () {
          idx = (idx + 1) % qs.length;
          showQuote(qs, !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        }, 5000);
      }
      function render() {
        var qs = load();
        var has = qs.length > 0;
        empty.hidden = has;
        allBtn.hidden = !has;
        rotator.hidden = !has || expanded;
        list.hidden = !has || !expanded;
        allBtn.textContent = expanded ? '收合' : '觀看全部';
        allBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        if (!has) { stopTimer(); rotator.innerHTML = ''; list.innerHTML = ''; return; }
        idx = Math.floor(Math.random() * qs.length);
        showQuote(qs, false);
        startTimer(qs);
        list.innerHTML = qs.map(function (x, i) {
          return '<li class="qshelf-row">' + quoteHtml(x) +
            '<button type="button" class="qshelf-remove" data-qi="' + i + '" aria-label="從金句集移除">' +
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></li>';
        }).join('');
      }
      allBtn.addEventListener('click', function () {
        expanded = !expanded;
        render();
      });
      list.addEventListener('click', function (e) {
        var btn = e.target.closest ? e.target.closest('.qshelf-remove') : null;
        if (!btn) return;
        var qs = load();
        qs.splice(Number(btn.getAttribute('data-qi')), 1);
        localStorage.setItem(KEY, JSON.stringify(qs));
        render();
      });
      render();
    })();
  `;
}

// ---------- main ----------
function main() {
  fs.mkdirSync(BOOKS_OUT_DIR, { recursive: true });

  const books = loadBooks();

  for (const book of books) {
    const html = renderBookPage(book);
    fs.writeFileSync(path.join(BOOKS_OUT_DIR, `${book.slug}.html`), html, 'utf8');
    console.log(`寫入 site/books/${book.slug}.html`);
  }

  const indexHtml = renderIndexPage(books);
  fs.writeFileSync(path.join(SITE_DIR, 'index.html'), indexHtml, 'utf8');
  console.log('寫入 site/index.html');

  const manifest = books
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .map((b) => ({
      date: b.date,
      slug: b.slug,
      title: b.title,
      author: b.author,
      theme: b.theme,
      hook: b.hook,
      url: `${SITE_BASE_URL}/books/${b.slug}.html`,
    }));
  fs.writeFileSync(
    path.join(SITE_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8'
  );
  console.log(`寫入 site/manifest.json（${manifest.length} 筆）`);
}

main();
