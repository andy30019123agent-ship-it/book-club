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
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --paper: #12160F;
        --ink: #E9E2D0;
        --ink-soft: #A79E8B;
        --accent: #E8B84B;
        --rule: #2A2F24;
        --card: #1A1F15;
      }
    }
    html[data-theme="dark"] {
      --paper: #12160F;
      --ink: #E9E2D0;
      --ink-soft: #A79E8B;
      --accent: #E8B84B;
      --rule: #2A2F24;
      --card: #1A1F15;
    }
    html[data-theme="light"] {
      --paper: #F7F1E3;
      --ink: #2B2118;
      --ink-soft: #6B5D4F;
      --accent: #8C5A2B;
      --rule: #E4D9C3;
      --card: #FFFBF0;
    }
    * { box-sizing: border-box; }
    html { background: var(--paper); }
    body {
      margin: 0;
      background: var(--paper);
      color: var(--ink);
      font-family: "Noto Serif TC", "Songti TC", serif;
      font-size: 19px;
      line-height: 1.9;
      transition: background-color 200ms, color 200ms;
    }
    @media (max-width: 480px) {
      body { font-size: 18px; }
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
    #theme-toggle {
      position: fixed;
      top: 12px;
      right: 12px;
      width: 44px;
      height: 44px;
      min-width: 44px;
      min-height: 44px;
      border: 1px solid var(--rule);
      border-radius: 10px;
      background: var(--paper);
      color: var(--ink);
      font-size: 1.2rem;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 100;
      transition: background-color 200ms, color 200ms;
    }
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
      border: 1px solid var(--rule);
      border-radius: 10px;
      padding: 0.15em 0.7em;
    }
    h1 {
      font-size: clamp(1.9rem, 5vw, 2.4rem);
      line-height: 1.35;
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
      border-radius: 10px;
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
      margin-top: 48px;
      padding-top: 24px;
      border-top: 1px solid var(--rule);
      font-family: "Noto Sans TC", sans-serif;
      color: var(--ink-soft);
      font-size: 0.9rem;
    }
    footer p {
      margin: 0 0 16px;
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
      function setIcon() { btn.textContent = isDark() ? '☀' : '☾'; }
      setIcon();
      btn.addEventListener('click', function () {
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

function pageShell({ title, description, bodyHtml }) {
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
</style>
</head>
<body>
<div id="progress-bar"></div>
<button id="theme-toggle" aria-label="切換日夜模式">☾</button>
${bodyHtml}
<script>
${baseScript()}
</script>
</body>
</html>
`;
}

// ---------- page builders ----------
function renderBookPage(book) {
  const themeChip = `<span class="theme-chip ui-label">${book.theme}</span>`;
  const dateLabel = `<span class="ui-label">${book.date}</span>`;
  const readingTime = `<span class="ui-label">閱讀 ${book.reading_time} 分鐘</span>`;
  const titleEn = book.title_en ? `<p class="title-en">${book.title_en}</p>` : '';
  const contentHtml = renderSections(book.sections);

  const body = `
<main class="page-shell">
  <div class="meta-row">${dateLabel}${themeChip}${readingTime}</div>
  <h1>${book.title}</h1>
  ${titleEn}
  <p class="byline">${book.author}｜${book.year}</p>
  <p class="hook">${inline(book.hook)}</p>
  <article>
${contentHtml}
  </article>
  <div class="tg-cta">
    <p>有想法？直接回 Telegram 訊息，就地開聊。</p>
    <a class="tg-button" href="https://t.me/Andycaiagent_bot">回 TG 聊聊</a>
  </div>
  <footer>
    <p><a href="../index.html">← 所有書</a></p>
  </footer>
</main>`;

  return pageShell({
    title: `${book.title}｜book-club`,
    description: book.hook,
    bodyHtml: body,
  });
}

function renderIndexPage(books) {
  const today = todayTaipei();
  const eligible = books
    .filter((b) => b.date <= today)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  let featureHtml;
  if (eligible.length === 0) {
    featureHtml = `
  <section class="empty-state">
    <p>今晚的書摘還在準備中，明天 7 點見。</p>
  </section>`;
  } else {
    const feature = eligible[0];
    featureHtml = `
  <section>
    <div class="meta-row">
      <span class="ui-label">${feature.date}</span>
      <span class="theme-chip ui-label">${feature.theme}</span>
      <span class="ui-label">閱讀 ${feature.reading_time} 分鐘</span>
    </div>
    <h1><a href="books/${feature.slug}.html">${feature.title}</a></h1>
    <p class="byline">${feature.author}｜${feature.year}</p>
    <p class="hook">${inline(feature.hook)}</p>
  </section>`;
  }

  const archiveItems = eligible
    .map(
      (b) => `
    <li>
      <span class="archive-date">${b.date}</span>
      <a href="books/${b.slug}.html">${b.title}</a>
      <span class="ui-label"> ｜ ${b.theme}</span>
    </li>`
    )
    .join('');

  const archiveHtml = eligible.length
    ? `
  <section>
    <h2>歸檔</h2>
    <ul class="archive-list">${archiveItems}
    </ul>
  </section>`
    : '';

  const body = `
<main class="page-shell">
${featureHtml}
${archiveHtml}
  <footer>
    <p class="ui-label">每晚 19:00，一本書的深讀。</p>
  </footer>
</main>`;

  return pageShell({
    title: '每晚讀書會｜book-club',
    description: '每天晚上一本書的深度書摘，像參與一場讀書會。',
    bodyHtml: body,
  });
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
