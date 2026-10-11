/* Тишина · ридер — шаг 3. Пагинация на CSS-колонках.
   Открыть: Reader.open(bookId, chapterIdx, page) */
(function (global) {
"use strict";

const GAP = 48; // зазор между страницами-колонками
let book = null, chIdx = 0, page = 0, pages = 1;
let opened = false, saveTimer = null, resizeTimer = null;
let tx = null; // x начала тача

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function bookProgress() {
  if (!book || !book.chapters.length) return 0;
  return (chIdx + (page + 1) / pages) / book.chapters.length;
}

/* ---------- раскладка ---------- */

function dims() {
  const el = $("rContent");
  const cs = global.getComputedStyle(el);
  const w = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const h = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  return { w: Math.max(50, w), h: Math.max(50, h) };
}
function realMeasure() {
  const c = $("rPages"), { w } = dims();
  const step = w + GAP;
  return Math.max(1, Math.ceil((c.scrollWidth + 1) / step));
}
function measure() {
  return typeof Reader._measure === "function" ? Reader._measure() : realMeasure();
}
function layout() {
  if (!book) return;
  const c = $("rPages"), { w, h } = dims();
  c.style.columnWidth = w + "px";
  c.style.columnGap = GAP + "px";
  c.style.height = h + "px";
  pages = measure();
  page = clamp(page, 0, pages - 1);
  paint();
}
function paint() {
  const { w } = dims();
  $("rPages").scrollLeft = page * (w + GAP);
  updateChrome();
}

/* ---------- хром (панели) ---------- */

function updateChrome() {
  if (!book) return;
  const ch = book.chapters[chIdx];
  $("rTitle").textContent = book.title || "";
  $("rPct").textContent = Math.round(bookProgress() * 100) + "%";
  $("rCh").textContent = ch ? ch.label : "";
  $("rPageInfo").textContent = (page + 1) + " / " + pages;
  $("rBar").style.width = (bookProgress() * 100) + "%";
}
function toggleChrome() {
  $("rTop").classList.toggle("gone");
  $("rBottom").classList.toggle("gone");
}
function showChrome() {
  $("rTop").classList.remove("gone");
  $("rBottom").classList.remove("gone");
}

/* ---------- навигация ---------- */

function go(p) {
  page = clamp(p, 0, pages - 1);
  paint();
  saveSoon();
}
function next() {
  if (page < pages - 1) { go(page + 1); return; }
  if (chIdx < book.chapters.length - 1) {
    chIdx++; page = 0; setChapter();
    if (global.__toast) global.__toast(book.chapters[chIdx].label);
  }
}
function prev() {
  if (page > 0) { go(page - 1); return; }
  if (chIdx > 0) {
    chIdx--; setChapter();
    page = pages - 1; paint(); saveSoon();
  }
}
function setChapter() {
  const ch = book.chapters[chIdx];
  $("rPages").innerHTML =
    `<div class="r-chapter-label">${escapeHtml(ch.label || "")}</div>` + (ch.html || "");
  $("rPages").scrollLeft = 0;
  layout();
  showChrome();
}
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------- сохранение места ---------- */

function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (book && global.Shelf) {
      global.Shelf.touch(book.id, { progress: bookProgress(), lastRead: { ch: chIdx, page } });
    }
  }, 600);
}

/* ---------- открыть / закрыть ---------- */

async function open(id, chapter, pg) {
  const b = await global.Shelf.get(id);
  if (!b || !b.chapters.length) return;
  book = b;
  const lr = b.lastRead || {};
  chIdx = clamp(chapter != null ? chapter : (lr.ch || 0), 0, b.chapters.length - 1);
  page = 0;
  opened = true;
  $("reader").classList.add("open");
  document.body.style.overflow = "hidden";
  showChrome();
  setChapter();
  if (pg != null) go(pg);
  else if (chapter == null && lr.page) go(lr.page);
  global.Shelf.touch(b.id, {});
}
async function close() {
  opened = false;
  clearTimeout(saveTimer);
  if (book && global.Shelf) {
    await global.Shelf.touch(book.id, { progress: bookProgress(), lastRead: { ch: chIdx, page } });
  }
  book = null;
  $("reader").classList.remove("open");
  document.body.style.overflow = "";
  if (global.__shelfReload) global.__shelfReload();
}

/* ---------- события ---------- */

function bind() {
  if (bind.done) return; bind.done = true;
  $("rBack").addEventListener("click", e => { e.stopPropagation(); close(); });

  const content = $("rContent");
  content.addEventListener("click", e => {
    const x = e.clientX, w = window.innerWidth;
    if (x < w * 0.32) prev();
    else if (x > w * 0.68) next();
    else toggleChrome();
  });
  content.addEventListener("touchstart", e => { tx = e.touches[0].clientX; }, { passive: true });
  content.addEventListener("touchend", e => {
    if (tx == null) return;
    const dx = e.changedTouches[0].clientX - tx;
    tx = null;
    if (dx < -60) next();
    else if (dx > 60) prev();
  }, { passive: true });
  document.addEventListener("keydown", e => {
    if (!opened) return;
    if (e.key === "ArrowRight" || e.key === " ") next();
    else if (e.key === "ArrowLeft") prev();
    else if (e.key === "Escape") close();
  });
  window.addEventListener("resize", () => {
    if (!opened) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layout, 200);
  });
  // шрифты могли подгрузиться позже — перераскладываем один раз
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (opened) layout(); });
}

const Reader = { open, close, next, prev, go, layout,
  _state: () => ({ book: book && book.id, chIdx, page, pages, progress: bookProgress() }) };
global.Reader = Reader;
bind();

})(typeof window !== "undefined" ? window : global);
