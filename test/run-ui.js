// Тесты рендера полки: node run-ui.js
const { JSDOM } = require("jsdom");
require("fake-indexeddb/auto");
const fs = require("fs");
const html = fs.readFileSync("../index.html", "utf8");
const body = html.split("<body>")[1].split("</body>")[0];
const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>${body}</body></html>`, { url: "http://localhost/" });
const { window } = dom;
global.window = window;
global.document = window.document;
global.location = window.location;
global.confirm = () => true;
window.scrollTo = () => {};
window.HTMLElement.prototype.scrollIntoView = () => {};
global.TishinaParser = { parseBook: async () => ({}) };
require("../store.js");
global.Shelf = window.Shelf; const Shelf = global.Shelf;
let pass = 0, failed = 0;
const ok = (c, n) => { c ? pass++ : failed++; console.log((c ? "  ✓ " : "  ✗ FAIL: ") + n); };
const q = s => document.querySelector(s), qa = s => Array.from(document.querySelectorAll(s));
(async () => {
  const now = Date.now();
  ok(html.includes(".reader{--rbg:#ffffff;") && html.includes("--rbar:rgba(255,255,255,.94);--rbgimg:none;"),
    "верх/низ белые (не красятся в фон)");
  const mk = (id, title, prog, ago, cover) => ({ id, title, authors: ["Автор " + id], format: "epub",
    fileName: "t.epub", cover: cover || null, toc: [{ label: "Глава 1", chapter: 0 }], chapters: [],
    annotation: "Аннотация " + id, progress: prog, addedAt: now - ago, lastOpened: now - ago });
  await Shelf.put(mk("b1", "Первая книга", 0.43, 1000, "data:image/png;base64,AAA"));
  await Shelf.put(mk("b2", "Вторая книга", 0.25, 2000));
  await Shelf.put(mk("b3", "Третья", 0, 3000));
  require("../app.js"); // сам делает reload() и рендер
  await new Promise(r => setTimeout(r, 300));
  ok(q("#pageTitle").textContent === "Полка", "заголовок полки");
  ok(q("#viewShelf").textContent.includes("Первая книга"), "текущая книга показана");
  ok(q("#viewShelf").textContent.includes("43%"), "прогресс 43%");
  ok(qa(".book").length === 3, "книг на полке: 3 (нашёл " + qa(".book").length + ")");
  ok(qa(".book .cover-ph").length === 2, "плейсхолдеры обложек");
  ok(q("#viewShelf img.cover") && q("#viewShelf img.cover").src.startsWith("data:image"), "обложка-картинка у текущей");
  // полка: все книги в сетке
  ok(qa(".lib-grid .book").length === 3, "в сетке 3 книги");
  // детали b1 (прогресс 43%)
  qa(".lib-grid .book")[0].click();
  await new Promise(r => setTimeout(r, 200));
  ok(q("#detail").classList.contains("open"), "детали открылись");
  ok(q("#dTitle").textContent === "Первая книга", "заголовок в деталях");
  ok(q("#dRead").textContent === "Продолжить чтение", "кнопка «продолжить»");
  ok(!q("#dProg").hidden, "прогресс виден");
  ok(q("#dPct").textContent === "43%", "кольцо 43%");
  ok(Math.abs(parseFloat(q("#dRingFg").style.strokeDashoffset) - 119.4 * 0.57) < 1, "кольцо заполнено");
  ok(q("#dDesc").textContent === "Аннотация b1", "описание");
  ok(q("#dHeroBg").style.backgroundImage.includes("data:image"), "блюр-фон из обложки");
  ok(qa("#dToc .row").length === 1, "оглавление в деталях");
  q("#dGear").click(); // Reader не загружен — не должно падать
  ok(true, "шестерёнка без ридера не падает");
  q("#dClose").click();
  await new Promise(r => setTimeout(r, 200));
  ok(!q("#detail").classList.contains("open"), "детали закрылись");
  // детали b3 (не читалась)
  qa(".lib-grid .book")[2].click();
  await new Promise(r => setTimeout(r, 200));
  ok(q("#dRead").textContent === "Читать", "кнопка «читать» для новой");
  ok(q("#dProg").hidden, "прогресс скрыт для новой");
  ok(q("#dHeroBg").classList.contains("ph"), "плейсхолдер фона без обложки");
  q("#dClose").click();
  await new Promise(r => setTimeout(r, 200));
  console.log(`\nИтого: ${pass} ok, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error("CRASH:", e); process.exit(1); });
