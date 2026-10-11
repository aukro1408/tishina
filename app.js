/* Тишина · полка — шаг 2. Список книг, импорт, детали. */
(function () {
"use strict";
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let books = [];
let detailId = null;
let toastTimer = null;

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
}
function coverHTML(b, cls) {
  cls = cls || "cover";
  return b.cover
    ? `<img class="${cls}" src="${b.cover}" alt="">`
    : `<div class="${cls} cover-ph">${esc((b.title || "?").slice(0, 32))}</div>`;
}
function pct(b) { return Math.round((b.progress || 0) * 100); }

/* ---------- рендер: одна полка ---------- */

function renderShelf() {
  const v = $("viewShelf");
  if (!books.length) {
    v.innerHTML = `<div class="empty">
      <img class="empty-img" src="empty-books.png?v=30" alt="">
      <p>Пока пусто.<br>Добавь первую книгу —<br>epub, fb2 или zip.</p>
      <button class="read-btn" data-add>Добавить книгу</button></div>`;
    return;
  }
  const cur = books[0];
  const now = Date.now();
  const bookCard = b => {
    const prog = b.progress || 0;
    const isNew = !prog && (now - (b.addedAt || 0)) < 7 * 24 * 3600 * 1000;
    const pc = prog > 0 ? Math.round(prog * 100) + "%" : "";
    return `
    <div class="book" data-open="${b.id}">
      <div class="cover-wrap">${coverHTML(b)}
        <button class="bdots" data-menu="${b.id}" title="Меню">⋮</button>
        ${isNew ? `<span class="bnew">NEW</span>` : (pc ? `<span class="bprog">${pc}</span>` : ``)}
      </div>
      <div class="bt">${esc(b.title)}</div>
      <div class="ba">${esc((b.authors || []).join(", ") || "Автор неизвестен")}</div>
    </div>`;
  };
  v.innerHTML = `
    <div class="hero-card" data-open="${cur.id}">
      <div class="hero-cover">${coverHTML(cur)}</div>
      <div class="hero-info">
        <div class="hero-label">Читаю сейчас</div>
        <div class="hero-title">${esc(cur.title)}</div>
        <div class="hero-author">${esc((cur.authors || []).join(", ") || "Автор неизвестен")}</div>
        <div class="pbar"><i style="width:${pct(cur)}%"></i></div>
        <div class="hero-foot">
          <span class="hero-pct">${pct(cur)}%</span>
          <button class="read-btn hero-btn" data-read="${cur.id}">${pct(cur) > 0 ? "Продолжить" : "Читать"}</button>
        </div>
      </div>
    </div>
    <div class="sec">Все книги</div>
    <div class="lib-grid">${books.map(bookCard).join("")}</div>`;
}

function render() {
  const tc = $("topCount");
  if (books.length) {
    const n = books.length;
    const word = n % 10 === 1 && n % 100 !== 11 ? "книга" : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? "книги" : "книг");
    tc.textContent = `${n} ${word}`;
    tc.hidden = false;
  } else tc.hidden = true;
  renderShelf();
}

async function reload() { books = await Shelf.all(); render(); }

/* ---------- меню книги ---------- */
let menuId = null;
function openBookMenu(id) {
  const b = books.find(x => x.id === id);
  if (!b) return;
  menuId = id;
  $("bmTitle").textContent = b.title || "Книга";
  $("bookMenu").classList.add("open");
}
function closeBookMenu() { $("bookMenu").classList.remove("open"); menuId = null; }

/* ---------- детали ---------- */

async function openDetail(id) {
  const rep = Shelf.reparseIfStale || (async x => x);
  const b = await rep(await Shelf.get(id));
  if (!b) return;
  detailId = id;
  const hb = $("dHeroBg");
  if (b.cover) { hb.style.backgroundImage = `url("${b.cover}")`; hb.classList.remove("ph"); }
  else { hb.style.backgroundImage = ""; hb.classList.add("ph"); }
  $("dCover").innerHTML = coverHTML(b);
  $("dTitle").textContent = b.title || "(без названия)";
  $("dAuthor").textContent = (b.authors || []).join(", ") || "Автор неизвестен";
  const started = !!(b.lastRead || (b.progress || 0) > 0);
  $("dRead").textContent = started ? "Продолжить чтение" : "Читать";
  const p = pct(b);
  $("dProg").hidden = !(p > 0);
  $("dPct").textContent = p + "%";
  $("dRingFg").style.strokeDashoffset = (119.4 * (1 - p / 100)).toFixed(1);
  const ann = (b.annotation || "").trim();
  $("dDescSec").hidden = !ann;
  $("dDesc").textContent = ann;
  $("dToc").innerHTML = (b.toc || []).map((t, i) =>
    `<div class="row" data-goto="${i}"><span>${esc(t.label)}</span><span class="n">${i + 1}</span></div>`).join("");
  $("detail").scrollTop = 0;
  $("detail").classList.add("open");
  document.body.style.overflow = "hidden";
  Shelf.touch(id, {});
}
function closeDetail() {
  $("detail").classList.remove("open");
  document.body.style.overflow = "";
  detailId = null;
  reload();
}

/* ---------- импорт ---------- */

async function importFile(file) {
  if (!file) return;
  toast("Открываем книгу…");
  try {
    const buf = await file.arrayBuffer();
    const u8 = new Uint8Array(buf);
    const parsed = await TishinaParser.parseBook({ name: file.name, data: u8 });
    const book = {
      id: Shelf.newId(),
      title: parsed.title, authors: parsed.authors, format: parsed.format,
      fileName: parsed.fileName, cover: parsed.cover,
      toc: parsed.toc, chapters: parsed.chapters,
      notes: parsed.notes || {},
      annotation: parsed.annotation || "",
      src: new Blob([u8], { type: file.type || "" }),
      parserV: TishinaParser.VERSION,
      progress: 0, addedAt: Date.now(), lastOpened: Date.now()
    };
    await Shelf.put(book);
    await reload();
    openDetail(book.id);
    toast("«" + (book.title || "Книга") + "» — на полке ✓");
  } catch (e) {
    console.error(e);
    toast("Не получилось: " + (e && e.message ? e.message : "ошибка"));
  }
}

/* ---------- события ---------- */

document.addEventListener("click", e => {
  const add = e.target.closest("[data-add]");
  if (add) { $("fileInput").click(); return; }
  const read = e.target.closest("[data-read]");
  if (read) { e.stopPropagation(); Reader.open(read.dataset.read); return; }
  const menu = e.target.closest("[data-menu]");
  if (menu) { e.stopPropagation(); openBookMenu(menu.dataset.menu); return; }
  const open = e.target.closest("[data-open]");
  if (open) { openDetail(open.dataset.open); return; }
  const goto = e.target.closest("[data-goto]");
  if (goto) { const id = detailId, ch = +goto.dataset.goto; closeDetail(); Reader.open(id, ch); return; }
});
$("addBtn").onclick = () => $("fileInput").click();
$("fileInput").onchange = e => { importFile(e.target.files[0]); e.target.value = ""; };
/* навбар */
$("navHome").onclick = () => { window.scrollTo({ top: 0, behavior: "smooth" }); };
$("navSet").onclick = () => { if (window.Reader) window.Reader.openSettings(); };
$("dClose").onclick = closeDetail;
$("dGear").onclick = () => { if (window.Reader) window.Reader.openSettings(); };
$("dRead").onclick = () => { const id = detailId; closeDetail(); Reader.open(id); };
$("dDel").onclick = async () => {
  if (!detailId) return;
  if (!confirm("Удалить книгу с полки?")) return;
  await Shelf.del(detailId);
  closeDetail();
  toast("Книга удалена");
};
/* меню книги */
$("bmCancel").onclick = closeBookMenu;
$("bookMenu").addEventListener("click", e => { if (e.target === $("bookMenu")) closeBookMenu(); });
$("bmOpen").onclick = () => { const id = menuId; closeBookMenu(); if (id) openDetail(id); };
$("bmDelShelf").onclick = async () => {
  const id = menuId;
  if (!id) return;
  const b = books.find(x => x.id === id);
  if (!confirm(`Убрать «${b ? b.title : "книгу"}» с полки?`)) return;
  closeBookMenu();
  await Shelf.del(id);
  await reload();
  toast("Убрано с полки");
};
$("bmDelDevice").onclick = async () => {
  const id = menuId;
  if (!id) return;
  const b = books.find(x => x.id === id);
  if (!confirm(`Удалить «${b ? b.title : "книгу"}» с устройства?\nКнига и все данные будут стёрты безвозвратно.`)) return;
  closeBookMenu();
  await Shelf.del(id);
  await reload();
  toast("Удалено с устройства");
};
document.addEventListener("keydown", e => { if (e.key === "Escape") closeDetail(); });

window.__toast = toast;
window.__shelfReload = reload;

reload();
})();
