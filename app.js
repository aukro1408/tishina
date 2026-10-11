/* Тишина · полка — шаг 2. Список книг, импорт, детали. */
(function () {
"use strict";
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let books = [];
let tab = "now";
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

/* ---------- рендер ---------- */

function renderNow() {
  const v = $("viewNow");
  if (!books.length) {
    v.innerHTML = `<div class="empty"><div class="big">📚</div>
      <p>Пока пусто.<br>Добавь первую книгу —<br>epub, fb2 или zip.</p>
      <button class="read-btn" data-add>Добавить книгу</button></div>`;
    return;
  }
  const cur = books[0];
  const rest = books.slice(1, 7);
  v.innerHTML = `
    <div class="now-card" data-open="${cur.id}">
      ${coverHTML(cur)}
      <div class="now-info">
        <p class="t">${esc(cur.title)}</p>
        <p class="a">${esc((cur.authors || []).join(", ") || "Автор неизвестен")}</p>
        <div class="pbar"><i style="width:${pct(cur)}%"></i></div>
        <div class="pct">${pct(cur)}%</div>
        <button class="read-btn" data-read="${cur.id}">Читать</button>
      </div>
    </div>
    ${rest.length ? `<div class="sec">Недавние</div><div class="recent">` +
      rest.map(b => `<div class="rec" data-open="${b.id}">
        ${coverHTML(b)}
        <div class="rt">${esc(b.title)}</div><div class="rp">${pct(b)}%</div>
      </div>`).join("") + `</div>` : ""}`;
}

function renderLib() {
  const v = $("viewLib");
  if (!books.length) {
    v.innerHTML = `<div class="empty"><div class="big">📚</div><p>Библиотека пуста.</p></div>`;
    return;
  }
  v.innerHTML = `<div class="lib-grid">` + books.map(b => `
    <div class="book" data-open="${b.id}">
      ${coverHTML(b)}
      <div class="bt">${esc(b.title)}</div>
      <div class="ba">${esc((b.authors || []).join(", ") || "Автор неизвестен")}</div>
    </div>`).join("") + `</div>`;
}

function render() {
  $("pageTitle").textContent = tab === "now" ? "Читаю сейчас" : "Библиотека";
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("on", t.dataset.tab === tab));
  $("viewNow").classList.toggle("hidden", tab !== "now");
  $("viewLib").classList.toggle("hidden", tab !== "lib");
  renderNow(); renderLib();
}

async function reload() { books = await Shelf.all(); render(); }

/* ---------- детали ---------- */

async function openDetail(id) {
  const b = await Shelf.get(id);
  if (!b) return;
  detailId = id;
  $("dCover").innerHTML = coverHTML(b);
  $("dTitle").textContent = b.title || "(без названия)";
  $("dAuthor").textContent = (b.authors || []).join(", ") || "Автор неизвестен";
  $("dToc").innerHTML = (b.toc || []).map((t, i) =>
    `<div class="row" data-goto="${i}"><span>${esc(t.label)}</span><span class="n">${i + 1}</span></div>`).join("");
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
    const parsed = await TishinaParser.parseBook(file);
    const book = {
      id: Shelf.newId(),
      title: parsed.title, authors: parsed.authors, format: parsed.format,
      fileName: parsed.fileName, cover: parsed.cover,
      toc: parsed.toc, chapters: parsed.chapters,
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
  const t = e.target.closest(".tab");
  if (t) { tab = t.dataset.tab; render(); window.scrollTo(0, 0); return; }
  const read = e.target.closest("[data-read]");
  if (read) { e.stopPropagation(); Reader.open(read.dataset.read); return; }
  const open = e.target.closest("[data-open]");
  if (open) { openDetail(open.dataset.open); return; }
  const goto = e.target.closest("[data-goto]");
  if (goto) { const id = detailId, ch = +goto.dataset.goto; closeDetail(); Reader.open(id, ch); return; }
});
$("addBtn").onclick = () => $("fileInput").click();
$("fileInput").onchange = e => { importFile(e.target.files[0]); e.target.value = ""; };
$("dClose").onclick = closeDetail;
$("dRead").onclick = () => { const id = detailId; closeDetail(); Reader.open(id); };
$("dDel").onclick = async () => {
  if (!detailId) return;
  if (!confirm("Удалить книгу с полки?")) return;
  await Shelf.del(detailId);
  closeDetail();
  toast("Книга удалена");
};
document.addEventListener("keydown", e => { if (e.key === "Escape") closeDetail(); });

window.__toast = toast;
window.__shelfReload = reload;

const qTab = new URLSearchParams(location.search).get("tab");
if (qTab === "lib") tab = "lib";
reload();
})();
