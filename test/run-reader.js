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
global.localStorage = window.localStorage;
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
    annotation: "Тестовое описание книги.",
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

  // настройки
  await Reader.open("b1");
  ok(Math.abs(Reader._settings().fontSize - 18.5) < 1e-9, "дефолтный размер 18.5");
  document.getElementById("fsPlus").click();
  ok(Math.abs(Reader._settings().fontSize - 19.5) < 1e-9, "размер +1");
  ok(document.getElementById("reader").style.getPropertyValue("--rfs") === "19.5px", "--rfs применён");
  document.getElementById("fsMinus").click(); document.getElementById("fsMinus").click();
  ok(Math.abs(Reader._settings().fontSize - 17.5) < 1e-9, "размер −2");
  document.querySelector('#bgPick [data-bg="night"]').click();
  ok(document.getElementById("reader").dataset.bg === "night", "ночной фон");
  ok(Reader._settings().bg === "night", "фон в настройках");
  document.querySelector('#fontSeg [data-font="sans"]').click();
  ok(document.getElementById("reader").classList.contains("ff-sans"), "sans-шрифт");
  const stored = JSON.parse(window.localStorage.getItem("tishina.read"));
  ok(stored && stored.bg === "night" && Math.abs(stored.fontSize - 17.5) < 1e-9, "настройки в localStorage");
  document.getElementById("rAa").click();
  ok(document.getElementById("rSet").classList.contains("open"), "шторка открылась");
  document.getElementById("rSet").click();
  await new Promise(r => setTimeout(r, 50));
  ok(!document.getElementById("rSet").classList.contains("open"), "шторка закрылась по тапу вне");

  // эффекты перелистывания
  ok(Reader._settings().turn === "slide", "эффект по умолчанию — слайд");
  for (const fx of ["none", "slide", "shift", "fade", "curl"]) {
    document.querySelector(`#fxGroup [data-fx="${fx}"]`).click();
    ok(Reader._settings().turn === fx, "выбран эффект " + fx);
    Reader.next(); Reader.prev();
  }
  ok(document.querySelector('#fxGroup [data-fx="curl"]').classList.contains("on"), "пилюля curl активна");
  const storedFx = JSON.parse(window.localStorage.getItem("tishina.read"));
  ok(storedFx && storedFx.turn === "curl", "эффект в localStorage");

  // шрифт Times
  document.querySelector('#fontSeg [data-font="times"]').click();
  ok(document.getElementById("reader").classList.contains("ff-times"), "times-шрифт");
  ok(Reader._settings().font === "times", "times в настройках");

  // сноски
  Reader.close();
  await Shelf.put({ id: "b2", title: "К2", authors: ["А"], format: "fb2", fileName: "b.fb2",
    cover: null, toc: [], chapters: [{ label: "Г1", html: '<p>Текст<a class="fn" data-fn="n1">[1]</a></p>' }],
    notes: { n1: "Текст пояснения" },
    progress: 0, addedAt: Date.now(), lastOpened: Date.now(), lastRead: null });
  await Reader.open("b2");
  const fnLink = document.querySelector("#rPages a.fn");
  ok(!!fnLink, "ссылка-сноска в тексте");
  fnLink.click();
  ok(document.getElementById("rNote").classList.contains("open"), "попап сноски открылся");
  ok(document.getElementById("rNoteText").textContent === "Текст пояснения", "текст сноски верный");
  document.getElementById("rNoteX").click();
  ok(!document.getElementById("rNote").classList.contains("open"), "попап закрылся");
  Reader.close();

  // шторка глав/закладок
  await Reader.open("b1");
  document.getElementById("rMenu").click();
  ok(document.getElementById("rDraw").classList.contains("open"), "шторка открылась");
  ok(document.querySelectorAll("#rDrawCh .ch-row").length === 3, "3 главы в списке");
  ok(!!document.querySelector("#rDrawCh .ch-row.cur .tick"), "текущая глава с галочкой");
  ok(document.getElementById("rDrawFoot").textContent.includes("стр."), "футер со страницей");
  document.querySelector('#rDrawCh [data-ch="2"]').click();
  s = st();
  ok(s.chIdx === 2 && s.page === 0, "переход к главе из шторки");
  ok(!document.getElementById("rDraw").classList.contains("open"), "шторка закрылась");
  // закладки
  document.getElementById("rMenu").click();
  document.querySelector('#drawTabs [data-tab="bm"]').click();
  ok(!document.getElementById("rDrawBm").hidden, "таб закладок");
  document.getElementById("bmAdd").click();
  ok(document.querySelectorAll("#rBmList .bm-row").length === 1, "закладка добавлена");
  const bmMeta = document.querySelector("#rBmList .bm-meta").textContent;
  ok(bmMeta.includes("Глава 3") && bmMeta.includes("стр. 1"), "мета закладки: " + bmMeta);
  document.querySelector("#rBmList .bm-go").click();
  s = st();
  ok(s.chIdx === 2 && s.page === 0 && !document.getElementById("rDraw").classList.contains("open"), "переход по закладке");
  document.getElementById("rMenu").click();
  document.querySelector('#drawTabs [data-tab="bm"]').click();
  document.querySelector("#rBmList [data-del]").click();
  ok(document.querySelectorAll("#rBmList .bm-row").length === 0, "закладка удалена");
  // таб «О книге»
  document.querySelector('#drawTabs [data-tab="about"]').click();
  ok(!document.getElementById("rDrawAbout").hidden, "таб о книге");
  ok(document.getElementById("abTitle").textContent === "Книга", "название в «о книге»");
  ok(document.getElementById("abAuthor").textContent === "А", "автор в «о книге»");
  ok(document.getElementById("abDesc").textContent === "Тестовое описание книги.", "описание в «о книге»");
  ok(document.getElementById("abMeta").textContent.includes("глав: 3"), "мета: " + document.getElementById("abMeta").textContent);
  document.getElementById("rDrawX").click();
  ok(!document.getElementById("rDraw").classList.contains("open"), "шторка закрыта крестиком");
  // шестерёнка на странице книги → Reader.openSettings
  Reader.openSettings();
  ok(document.getElementById("rSet").classList.contains("open"), "openSettings открывает шторку");
  document.getElementById("rSet").click();
  ok(!document.getElementById("rSet").classList.contains("open"), "шторка закрылась");
  Reader.close();

  console.log(`\nИтого: ${pass} ok, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error("CRASH:", e); process.exit(1); });
