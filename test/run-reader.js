// Тесты пагинации: node run-reader.js
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
window.scrollTo = () => {};
window.HTMLElement.prototype.scrollIntoView = () => {};
global.__toast = () => {};
global.__shelfReload = () => {};
require("../store.js");
global.Shelf = window.Shelf;
require("../reader.js");
const Reader = window.Reader;

let pass = 0, failed = 0;
const ok = (c, n) => { c ? pass++ : failed++; console.log((c ? "  ✓ " : "  ✗ FAIL: ") + n); };
const st = () => Reader._state();

(async () => {
  const now = Date.now();
  const ch = i => ({ label: "Глава " + (i + 1), html: "<p>текст</p>" });
  await Shelf.put({ id: "b1", title: "Книга", authors: ["А"], format: "epub", fileName: "b.epub",
    cover: null, toc: [], chapters: [ch(0), ch(1), ch(2)],
    progress: 0, addedAt: now, lastOpened: now, lastRead: { ch: 1, page: 2 } });

  Reader._measure = () => 5; // стаб: 5 страниц в главе

  await Reader.open("b1");
  let s = st();
  ok(s.chIdx === 1 && s.page === 2, `восстановили место: ch=${s.chIdx} page=${s.page}`);
  ok(document.getElementById("reader").classList.contains("open"), "ридер открыт");
  ok(document.getElementById("rPageInfo").textContent === "3 / 5", "счётчик страниц: " + document.getElementById("rPageInfo").textContent);

  Reader.next(); Reader.next(); // page 4
  s = st(); ok(s.page === 4 && s.chIdx === 1, "листание вперёд");
  Reader.next(); // -> глава 2
  s = st(); ok(s.chIdx === 2 && s.page === 0, "переход на следующую главу");
  Reader.prev(); // -> конец главы 1
  s = st(); ok(s.chIdx === 1 && s.page === 4, "назад в конец прошлой главы");
  Reader.go(99); s = st(); ok(s.page === 4, "go клампится");
  Reader.go(-5); s = st(); ok(s.page === 0, "go вниз клампится");

  // прогресс: (1 + 1/5) / 3 = 0.4
  Reader.go(0); s = st();
  ok(Math.abs(s.progress - 0.4) < 1e-9, "прогресс глав-взвешенный: " + s.progress);

  await Reader.open("b1", 2);
  s = st(); ok(s.chIdx === 2 && s.page === 0, "open с главой");

  Reader.close();
  await new Promise(r => setTimeout(r, 50));
  const saved = await Shelf.get("b1");
  ok(saved.lastRead && saved.lastRead.ch === 2 && saved.lastRead.page === 0, "место сохранено при закрытии");
  ok(!document.getElementById("reader").classList.contains("open"), "ридер закрыт");

  console.log(`\nИтого: ${pass} ok, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error("CRASH:", e); process.exit(1); });
