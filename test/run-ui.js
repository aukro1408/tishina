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
  const mk = (id, title, prog, ago, cover) => ({ id, title, authors: ["Автор " + id], format: "epub",
    fileName: "t.epub", cover: cover || null, toc: [{ label: "Глава 1", chapter: 0 }], chapters: [],
    progress: prog, addedAt: now - ago, lastOpened: now - ago });
  await Shelf.put(mk("b1", "Первая книга", 0.43, 1000, "data:image/png;base64,AAA"));
  await Shelf.put(mk("b2", "Вторая книга", 0.25, 2000));
  await Shelf.put(mk("b3", "Третья", 0, 3000));
  require("../app.js"); // сам делает reload() и рендер
  await new Promise(r => setTimeout(r, 300));
  ok(q("#pageTitle").textContent === "Читаю сейчас", "заголовок вкладки");
  ok(q("#viewNow").textContent.includes("Первая книга"), "текущая книга показана");
  ok(q("#viewNow").textContent.includes("43%"), "прогресс 43%");
  ok(qa(".rec").length === 2, "недавних: 2 (нашёл " + qa(".rec").length + ")");
  ok(qa(".rec .cover-ph").length === 2, "плейсхолдеры обложек");
  ok(q("#viewNow img.cover") && q("#viewNow img.cover").src.startsWith("data:image"), "обложка-картинка у текущей");
  // вкладка Библиотека
  q('[data-tab="lib"]').click();
  ok(q("#pageTitle").textContent === "Библиотека", "переключение вкладки");
  ok(qa(".lib-grid .book").length === 3, "в сетке 3 книги");
  // детали
  qa(".lib-grid .book")[0].click();
  await new Promise(r => setTimeout(r, 200));
  ok(q("#detail").classList.contains("open"), "детали открылись");
  ok(q("#dTitle").textContent === "Первая книга", "заголовок в деталях");
  ok(qa("#dToc .row").length === 1, "оглавление в деталях");
  q("#dClose").click();
  await new Promise(r => setTimeout(r, 200));
  ok(!q("#detail").classList.contains("open"), "детали закрылись");
  console.log(`\nИтого: ${pass} ok, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error("CRASH:", e); process.exit(1); });
