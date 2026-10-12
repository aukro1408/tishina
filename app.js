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
/* доминантный цвет обложки для прогресс-бара */
function coverColor(src, cb) {
  if (!src || !src.startsWith("data:")) { cb(null); return; }
  const img = new Image();
  img.onload = () => {
    try {
      const c = document.createElement("canvas");
      c.width = 24; c.height = 36;
      const x = c.getContext("2d");
      x.drawImage(img, 0, 0, 24, 36);
      const d = x.getImageData(0, 0, 24, 36).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 16) {
        r += d[i]; g += d[i+1]; b += d[i+2]; n++;
      }
      r = Math.round(r/n); g = Math.round(g/n); b = Math.round(b/n);
      cb(`rgb(${r},${g},${b})`);
    } catch(e) { cb(null); }
  };
  img.onerror = () => cb(null);
  img.src = src;
}

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
        <div class="ink-progress" id="heroInk">
          <div class="ink-track">
            <div class="ink-wrap"><div class="ink-fill" id="heroInkFill"></div></div>
            <div class="ink-grain"></div>
          </div>
        </div>
        <div class="hero-foot">
          <span class="hero-pct">${pct(cur)}%</span>
          <button class="read-btn hero-btn liquid-btn" data-read="${cur.id}">
            <div class="liquid">
              <span class="blob b1"></span><span class="blob b2"></span>
              <span class="blob b3"></span><span class="blob b4"></span>
              <span class="blob touch"></span>
            </div>
            <span class="frost"></span>
            <span class="edge"></span>
            <span class="grain"></span>
            <span class="label">${pct(cur) > 0 ? "Продолжить" : "Читать"}</span>
          </button>
        </div>
      </div>
    </div>
    <div class="sec">Все книги</div>
    <div class="lib-grid">${books.map(bookCard).join("")}</div>`;
  /* акварельный прогресс в терракотовых цветах */
  const inkEl = v.querySelector("#heroInk");
  const inkFill = v.querySelector("#heroInkFill");
  const targetP = pct(cur);
  const INK = ["#a34a3e", "#d9755f", "#e8977c", "#bf6052", "#c4695a"];
  inkFill.style.background = `linear-gradient(to right, ${INK.map((c, i) =>
    `${c} ${(i / (INK.length - 1) * 100).toFixed(1)}%`).join(", ")})`;
  /* чернила растекаются до прогресса */
  let shown = 0;
  const flowInk = () => {
    const diff = targetP - shown;
    shown += diff * .08;
    if (Math.abs(diff) < .3) shown = targetP;
    inkEl.style.setProperty("--p", shown + "%");
    inkEl.classList.toggle("flow", Math.abs(diff) > 2);
    if (shown !== targetP) requestAnimationFrame(flowInk);
    else inkEl.classList.remove("flow");
  };
  setTimeout(flowInk, 350);
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
  /* количество страниц (~1800 символов на страницу) */
  try {
    const chars = (b.chapters || []).reduce((s, c) => s + String((c && c.html) || c || "").replace(/<[^>]+>/g, "").length, 0);
    const pages = Math.max(1, Math.round(chars / 1800));
    $("dPages").textContent = pages + " стр.";
  } catch(e) { $("dPages").textContent = ""; }
  const started = !!(b.lastRead || (b.progress || 0) > 0);
  $("dReadLabel").textContent = started ? "Продолжить чтение" : "Читать";
  const p = pct(b);
  $("dProg").hidden = !(p > 0);
  /* луна в iframe */
  try {
    const mf = $("moonFrame");
    if (mf) mf.src = "moon.html?p=" + p;
  } catch(e){}
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
function showView(name) {
  const isSet = name === "settings";
  $("viewShelf").hidden = isSet;
  document.querySelector(".top").style.display = isSet ? "none" : "";
  $("viewSettings").hidden = !isSet;
  $("navHome").classList.toggle("on", !isSet);
  $("navSet").classList.toggle("on", isSet);
  window.scrollTo(0, 0);
}
$("navHome").onclick = () => {
  if (window.Reader) { try { window.Reader.close(); } catch(e){} }
  if (typeof closeDetail === "function") closeDetail();
  showView("shelf");
};
$("navSet").onclick = () => {
  if (window.Reader) { try { window.Reader.close(); } catch(e){} }
  if (typeof closeDetail === "function") closeDetail();
  showView("settings");
};
/* фейковые переключатели настроек */
document.addEventListener("click", e => {
  const sw = e.target.closest(".switch");
  if (sw) sw.classList.toggle("on");
});
$("dClose").onclick = closeDetail;
$("dMenu").onclick = () => { if (detailId) openBookMenu(detailId); };
/* жидкие кнопки — касание следует за пальцем */
(() => {
  let tx = 0, ty = 0, cx = 0, cy = 0, raf = null, cur = null;
  const loop = () => {
    if (!cur) return;
    cx += (tx - cx) * .12; cy += (ty - cy) * .12;
    const t = cur.querySelector(".touch");
    if (t) { t.style.left = cx + "px"; t.style.top = cy + "px"; }
    raf = requestAnimationFrame(loop);
  };
  const setPos = (e, jump) => {
    const r = cur.getBoundingClientRect();
    tx = e.clientX - r.left; ty = e.clientY - r.top;
    if (jump) { cx = r.width / 2; cy = r.height / 2; }
  };
  document.addEventListener("pointerdown", e => {
    const btn = e.target.closest(".liquid-btn");
    if (!btn) return;
    cur = btn;
    setPos(e, true); btn.classList.add("touching");
    if (!raf) loop();
    if (navigator.vibrate) navigator.vibrate(12);
  });
  document.addEventListener("pointermove", e => { if (cur) setPos(e, false); });
  const end = () => {
    if (!cur) return;
    cur.classList.remove("touching");
    const b = cur; cur = null;
    setTimeout(() => { cancelAnimationFrame(raf); raf = null; }, 450);
  };
  document.addEventListener("pointerup", end);
  document.addEventListener("pointercancel", end);
})();
$("dRead").addEventListener("click", () => { const id = detailId; closeDetail(); Reader.open(id); });
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

// переключатель темы луны (без названия)
(function(){
  var sw = document.getElementById("moonThemeSw");
  if (!sw) return;
  var theme = "dark";
  try { theme = localStorage.getItem("moonTheme") || "dark"; } catch(e){}
  function apply(t){
    sw.classList.toggle("on", t !== "light");
    sw.setAttribute("aria-checked", t !== "light");
  }
  apply(theme);
  sw.addEventListener("click", function(){
    theme = theme === "light" ? "dark" : "light";
    try { localStorage.setItem("moonTheme", theme); } catch(e){}
    apply(theme);
  });
})();

window.__toast = toast;
window.__shelfReload = reload;

// параллакс шапки главной
(function(){
  var top = document.querySelector(".top");
  if (!top) return;
  var reduce = matchMedia("(prefers-reduced-motion:reduce)").matches;
  if (reduce) return;
  addEventListener("scroll", function(){
    var y = Math.max(0, scrollY);
    top.style.backgroundPosition = "center " + (y * .28) + "px";
  }, {passive:true});
})();

reload().then(() => {
  if (localStorage.getItem("tishina.goto") === "settings") {
    localStorage.removeItem("tishina.goto");
    showView("settings");
  }
});
})();
