/* Тишина · ридер — шаг 3. Пагинация на CSS-колонках.
   Открыть: Reader.open(bookId, chapterIdx, page) */
(function (global) {
"use strict";

const GAP = 48; // зазор между страницами-колонками
let book = null, chIdx = 0, page = 0, pages = 1;
let opened = false, saveTimer = null, resizeTimer = null;
let tx = null; // x начала тача
let chLens = [], totalLen = 0;

/* ---------- настройки чтения ---------- */
const SET_KEY = "tishina.read";
let set = { fontSize: 18.5, font: "serif", theme: "day", turn: "slide" };
try { Object.assign(set, JSON.parse(localStorage.getItem(SET_KEY) || "{}")); } catch (e) {}
function saveSet() { try { localStorage.setItem(SET_KEY, JSON.stringify(set)); } catch (e) {} }
function curBg() {
  if (set.bg) return set.bg;
  return ({ day: "white", sepia: "sepia", night: "night" })[set.theme] || "white";
}
function applySettings() {
  const r = $("reader");
  r.style.setProperty("--rfs", set.fontSize + "px");
  r.dataset.bg = curBg();
  r.classList.toggle("ff-sans", set.font === "sans");
  r.classList.toggle("ff-times", set.font === "times");
  r.classList.toggle("ff-georgia", set.font === "georgia");
  r.classList.toggle("ff-palatino", set.font === "palatino");
  syncSetUI();
  if (opened) layout();
}
function textLen(html) {
  const d = document.createElement("div");
  d.innerHTML = html || "";
  return (d.textContent || "").replace(/\s+/g, " ").trim().length;
}

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function bookProgress() {
  if (!book || !book.chapters.length || !totalLen) return 0;
  let done = 0;
  for (let i = 0; i < chIdx; i++) done += chLens[i];
  done += (chLens[chIdx] || 0) * ((page + 1) / pages);
  return Math.min(1, done / totalLen);
}

/* ---------- раскладка ---------- */

function dims() {
  const el = $("rContent");
  // getBoundingClientRect — дробные px; clientWidth округляет до целого,
  // из-за чего шаг колонок не совпадал с реальным и страницы «плыли» (буквы резались справа)
  const r = el.getBoundingClientRect();
  const cs = global.getComputedStyle(el);
  const w = r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const h = r.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
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
function paint(dir) {
  const el = $("rPages");
  const { w } = dims();
  const target = page * (w + GAP);
  updateChrome();
  const fx = (global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches)
    ? "none" : (set.turn || "slide");
  if (fx === "none" || !dir) { jumpTo(el, target); return; }
  if (fx === "shift") { smoothTo(el, target); return; }
  // slide / fade / curl — как в Paciuk Reader: стартовая поза → прыжок → анимация к покою
  const D = dir > 0 ? 1 : -1;
  el.style.transition = "none";
  el.style.transformOrigin = "";
  el.style.filter = "none";
  if (fx === "slide") {
    el.style.transform = `translateX(${D * 42}px) scale(0.97)`;
    el.style.opacity = "0";
  } else if (fx === "fade") {
    el.style.transform = "none";
    el.style.opacity = "0";
  } else if (fx === "curl") {
    el.style.transformOrigin = D > 0 ? "left center" : "right center";
    el.style.transform = `perspective(1400px) rotateY(${D * -14}deg) scale(0.96)`;
    el.style.opacity = "1";
    el.style.filter = "brightness(0.93)";
  }
  jumpTo(el, target);
  nextFrame(() => {
    el.style.transition = "transform .38s cubic-bezier(0.25,0.46,0.45,0.94), opacity .35s ease, filter .38s ease";
    el.style.transform = "none";
    el.style.opacity = "1";
    el.style.filter = "none";
    clearTimeout(paint._t);
    paint._t = setTimeout(() => { el.style.transition = "none"; el.style.transformOrigin = ""; }, 450);
  });
}
function jumpTo(el, left) {
  if (typeof el.scrollTo === "function") el.scrollTo({ left, behavior: "instant" });
  else el.scrollLeft = left;
}
// двойной rAF с фолбэком (jsdom/старые WebView без rAF)
function nextFrame(fn) {
  const raf = global.requestAnimationFrame;
  if (typeof raf === "function") raf(() => raf(fn));
  else setTimeout(fn, 32);
}
function smoothTo(el, target) {
  const raf = global.requestAnimationFrame, caf = global.cancelAnimationFrame;
  if (typeof raf !== "function" || typeof caf !== "function") {
    jumpTo(el, target); return;
  }
  caf(smoothTo._r);
  const from = el.scrollLeft, dx = target - from;
  if (!dx) return;
  const t0 = performance.now(), dur = 300;
  const step = now => {
    const k = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    el.scrollLeft = from + dx * e;
    if (k < 1) smoothTo._r = requestAnimationFrame(step);
  };
  smoothTo._r = requestAnimationFrame(step);
}

/* ---------- хром (панели) ---------- */

function updateChrome() {
  if (!book) return;
  const ch = book.chapters[chIdx];
  $("rTitle").textContent = book.title || "";
  $("rPct").textContent = Math.round(bookProgress() * 100) + "%";
  $("rCh").textContent = ch ? ch.label : "";
  $("rPageInfo").textContent = (page + 1) + " / " + pages;
  paintReaderInk(bookProgress() * 100);
}
/* акварельные чернила прогресса ридера */
const INK_COLORS = ["#a34a3e", "#d9755f", "#e8977c", "#bf6052", "#c4695a"];
let rInkShown = 0, rInkRaf = null;
function paintReaderInk(target) {
  const el = $("rInk"), fill = $("rInkFill");
  if (!el || !fill) return;
  if (!fill.dataset.painted) {
    const stops = INK_COLORS.map((c, i) =>
      `${c} ${(i / (INK_COLORS.length - 1) * 100).toFixed(1)}%`).join(", ");
    fill.style.background = `linear-gradient(to right, ${stops})`;
    fill.dataset.painted = "1";
  }
  const frame = () => {
    const diff = target - rInkShown;
    rInkShown += diff * .12;
    if (Math.abs(diff) < .2) rInkShown = target;
    el.style.setProperty("--p", rInkShown + "%");
    el.classList.toggle("flow", Math.abs(diff) > 1.5);
    if (rInkShown !== target) rInkRaf = requestAnimationFrame(frame);
    else { rInkRaf = null; el.classList.remove("flow"); }
  };
  if (!rInkRaf) rInkRaf = requestAnimationFrame(frame);
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

function go(p, dir) {
  page = clamp(p, 0, pages - 1);
  paint(dir);
  saveSoon();
}
function next() {
  if (page < pages - 1) { go(page + 1, 1); return; }
  if (chIdx < book.chapters.length - 1) {
    chIdx++; page = 0; setChapter(); paint(1);
  }
}
function prev() {
  if (page > 0) { go(page - 1, -1); return; }
  if (chIdx > 0) {
    chIdx--; setChapter();
    page = pages - 1; paint(-1); saveSoon();
  }
}
function setChapter() {
  const ch = book.chapters[chIdx];
  let html = `<div class="r-chapter-label">${escapeHtml(ch.label || "")}</div>` + (ch.html || "");
  // страховка: сноски проставляем при каждом рендере (на случай битого HTML в старых книгах)
  try {
    const P = global.TishinaParser;
    if (P && book.notes && Object.keys(book.notes).length) {
      html = P.linkBracketNotes(html, P.notesByNum(book.notes));
    }
  } catch (e) {}
  $("rPages").innerHTML = html;
  $("rPages").setAttribute("lang", book.lang || "ru");
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

/* ---------- шторка настроек ---------- */

function syncSetUI() {
  document.querySelectorAll("#fontSeg button").forEach(b =>
    b.classList.toggle("on", b.dataset.font === set.font));
  document.querySelectorAll("#themeSeg button").forEach(b =>
    b.classList.toggle("on", b.dataset.theme === set.theme));
  document.querySelectorAll("#fxGroup button").forEach(b =>
    b.classList.toggle("on", b.dataset.fx === (set.turn || "slide")));
  document.querySelectorAll("#bgPick button").forEach(b =>
    b.classList.toggle("on", b.dataset.bg === curBg()));
  $("fsVal").textContent = Math.round(set.fontSize);
}
function openSet() { $("rSet").classList.add("open"); }
function closeSet() { $("rSet").classList.remove("open"); }
function toggleSet() { $("rSet").classList.toggle("open"); }

/* ---------- сноски ---------- */
function showNote(text) {
  $("rNoteText").textContent = text;
  $("rNote").classList.add("open");
}
function closeNote() { $("rNote").classList.remove("open"); }
// сноска под точкой тапа: сначала хит-тест, потом геометрия (на некоторых
// Android-хромах elementFromPoint в многоколоночной вёрстке врёт)
function nearestFn(x, y) {
  const at = (px, py) => {
    if (typeof document.elementFromPoint !== "function") return null;
    const el = document.elementFromPoint(px, py);
    return el && el.closest ? el.closest("a.fn") : null;
  };
  const hit = at(x, y)
    || at(x - 22, y) || at(x + 22, y) || at(x, y - 22) || at(x, y + 22)
    || at(x - 15, y - 15) || at(x + 15, y - 15) || at(x - 15, y + 15) || at(x + 15, y + 15);
  if (hit) return hit;
  // геометрия: ищем ссылку, в чей расширенный rect попала точка
  try {
    const pad = 26;
    const links = document.querySelectorAll("#rPages a.fn");
    for (const a of links) {
      const r = a.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      if (r.right < -50 || r.left > innerWidth + 50 || r.bottom < -50 || r.top > innerHeight + 50) continue;
      if (x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad) return a;
    }
  } catch (e) {}
  return null;
}

/* ---------- шторка глав / закладок ---------- */
let drawTab = "ch";
function openDraw(tab) { drawTab = tab || drawTab; renderDraw(); $("rDraw").classList.add("open"); }
function closeDraw() { $("rDraw").classList.remove("open"); }
function getMarks() { return (book && book.marks) || []; }
function persistMarks() { if (book && global.Shelf) global.Shelf.touch(book.id, { marks: book.marks }); }
function fmtDate(ts) {
  try { return new Date(ts).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }); }
  catch (e) { return ""; }
}
function pageSnippet() {
  // первый видимый текст текущей страницы
  try {
    const crp = document.caretRangeFromPoint;
    if (typeof crp !== "function") return "";
    const r = $("rContent").getBoundingClientRect();
    const range = crp.call(document, r.left + 28, r.top + 30);
    if (!range || !range.startContainer) return "";
    const walker = document.createTreeWalker($("rPages"), NodeFilter.SHOW_TEXT);
    walker.currentNode = range.startContainer;
    let node = range.startContainer, off = range.startOffset, out = "", first = true;
    while (node) {
      let t = node.textContent || "";
      if (first) { t = t.slice(off); first = false; }
      out += t + " ";
      if (out.length > 110) break;
      node = walker.nextNode();
    }
    return out.replace(/\s+/g, " ").trim().slice(0, 100);
  } catch (e) { return ""; }
}
function addMark() {
  if (!book) return;
  book.marks = [{ ch: chIdx, page, snippet: pageSnippet(), ts: Date.now() },
    ...getMarks()].slice(0, 200);
  persistMarks(); renderBm();
}
function renderBm() {
  const ms = getMarks();
  $("rBmList").innerHTML = ms.map((m, i) => {
    const ch = book.chapters[m.ch];
    return `<div class="bm-row">
      <button class="bm-go" data-bm="${i}">
        <div class="bm-snippet">${escapeHtml(m.snippet || (ch && ch.label) || "")}</div>
        <div class="bm-meta">${escapeHtml((ch && ch.label) || "")} · стр. ${m.page + 1} · ${fmtDate(m.ts)}</div>
      </button>
      <button class="bm-del" data-del="${i}" title="Удалить">✕</button>
    </div>`;
  }).join("") || `<div class="bm-empty">Пока пусто — нажми «+ Добавить закладку»</div>`;
}
function renderAbout() {
  const b = book; if (!b) return;
  $("abCover").innerHTML = b.cover
    ? `<img src="${b.cover}" alt="">`
    : `<div class="cover-ph">${escapeHtml((b.title || "?").slice(0, 32))}</div>`;
  $("abTitle").textContent = b.title || "(без названия)";
  $("abAuthor").textContent = (b.authors || []).join(", ") || "Автор неизвестен";
  const ann = (b.annotation || "").trim();
  const d = $("abDesc");
  d.textContent = ann || "Описания нет";
  d.classList.toggle("empty", !ann);
  $("abMeta").textContent =
    `${b.format ? b.format.toUpperCase() : ""} · глав: ${b.chapters.length}`.replace(/^ · /, "");
}
function renderDraw() {
  if (!book) return;
  document.querySelectorAll("#drawTabs button").forEach(b =>
    b.classList.toggle("on", b.dataset.tab === drawTab));
  $("rDrawCh").hidden = drawTab !== "ch";
  $("rDrawBm").hidden = drawTab !== "bm";
  $("rDrawAbout").hidden = drawTab !== "about";
  if (drawTab === "ch") {
    $("rDrawCh").innerHTML = book.chapters.map((c, i) =>
      `<button class="ch-row${i === chIdx ? " cur" : ""}" data-ch="${i}">
        <span class="ch-label">${escapeHtml(c.label || "Глава " + (i + 1))}</span>
        ${i === chIdx ? `<span class="tick">✓</span>` : ""}
      </button>`).join("");
  } else if (drawTab === "bm") renderBm();
  else renderAbout();
  const ch = book.chapters[chIdx];
  $("rDrawFoot").textContent = `${ch ? ch.label : ""} · стр. ${page + 1}/${pages}`;
}

async function open(id, chapter, pg) {
  const rep = global.Shelf.reparseIfStale || (async x => x);
  const b = await rep(await global.Shelf.get(id));
  if (!b || !b.chapters.length) return;
  book = b;
  chLens = b.chapters.map(c => textLen(c.html));
  totalLen = chLens.reduce((a, x) => a + x, 0);
  const lr = b.lastRead || {};
  chIdx = clamp(chapter != null ? chapter : (lr.ch || 0), 0, b.chapters.length - 1);
  page = 0;
  opened = true;
  rInkShown = 0;
  if ($("rInkFill")) delete $("rInkFill").dataset.painted;
  $("reader").classList.add("open");
  document.body.style.overflow = "hidden";
  applySettings();
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
  $("rAa").addEventListener("click", e => { e.stopPropagation(); toggleSet(); });
  $("rSet").addEventListener("click", e => { if (e.target === $("rSet")) closeSet(); });
  $("rNote").addEventListener("click", e => { if (e.target === $("rNote") || e.target.closest("#rNoteX")) closeNote(); });
  $("fsMinus").addEventListener("click", () => {
    set.fontSize = Math.max(14, Math.round((set.fontSize - 1) * 10) / 10); saveSet(); applySettings();
  });
  $("fsPlus").addEventListener("click", () => {
    set.fontSize = Math.min(26, Math.round((set.fontSize + 1) * 10) / 10); saveSet(); applySettings();
  });
  $("fontSeg").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    set.font = b.dataset.font; saveSet(); applySettings();
  });
  $("fxGroup").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    set.turn = b.dataset.fx; saveSet(); syncSetUI();
  });
  $("bgPick").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    set.bg = b.dataset.bg; saveSet(); applySettings();
  });
  $("rMenu").addEventListener("click", e => { e.stopPropagation(); openDraw(); });
  $("rDrawX").addEventListener("click", () => closeDraw());
  $("rDraw").addEventListener("click", e => { if (e.target === $("rDraw")) closeDraw(); });
  $("drawTabs").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    drawTab = b.dataset.tab; renderDraw();
  });
  $("rDrawCh").addEventListener("click", e => {
    const b = e.target.closest("[data-ch]"); if (!b) return;
    const i = +b.dataset.ch;
    closeDraw();
    chIdx = i; page = 0; setChapter(); paint(1);
    saveSoon();
  });
  $("bmAdd").addEventListener("click", addMark);
  $("rBmList").addEventListener("click", e => {
    const del = e.target.closest("[data-del]");
    if (del) {
      const ms = getMarks(); ms.splice(+del.dataset.del, 1);
      book.marks = ms; persistMarks(); renderBm(); return;
    }
    const go2 = e.target.closest("[data-bm]");
    if (go2) {
      const m = getMarks()[+go2.dataset.bm]; if (!m) return;
      closeDraw();
      chIdx = clamp(m.ch, 0, book.chapters.length - 1);
      setChapter(); go(m.page);
    }
  });

  const content = $("rContent");
  content.addEventListener("click", e => {
    // сноска — попап вместо листания.
    // 1) прямое попадание; 2) сноска в том же абзаце (без координат — для хромов с битым хит-тестом);
    // 3) ближайшая по координатам.
    let fn = e.target.closest ? e.target.closest("a.fn") : null;
    if (!fn && e.target.closest) {
      const p = e.target.closest("p, li, blockquote");
      if (p) {
        const links = p.querySelectorAll("a.fn");
        if (links.length === 1) fn = links[0];
      }
    }
    if (!fn) fn = nearestFn(e.clientX, e.clientY);
    if (fn && book && book.notes && book.notes[fn.dataset.fn]) {
      e.stopPropagation();
      showNote(book.notes[fn.dataset.fn]);
      return;
    }
    // на тачскрине тап не листает — только свайп; тап показывает/прячет панели
    const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    if (coarse) { toggleChrome(); return; }
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

const Reader = { open, close, next, prev, go, layout, applySettings, openSettings: openSet,
  _settings: () => ({ ...set }),
  _state: () => ({ book: book && book.id, chIdx, page, pages, progress: bookProgress() }) };
global.Reader = Reader;
bind();

})(typeof window !== "undefined" ? window : global);
