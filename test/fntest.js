// проверка: клик по a.fn открывает попап
const fs = require("fs");
const { JSDOM } = require("jsdom");
const html = fs.readFileSync("../index.html", "utf8");
const body = html.split("<body>")[1].split("</body>")[0];
const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>${body}</body></html>`, { url: "http://localhost/" });
const { window } = dom;
global.window = window; global.document = window.document;
global.navigator = window.navigator; global.location = window.location;
global.requestAnimationFrame = cb => setTimeout(cb, 0);
window.HTMLElement.prototype.scrollTo = function (x) { this.scrollLeft = x; };
Object.defineProperty(window.HTMLElement.prototype, "clientWidth", { get() { return 400; } });
Object.defineProperty(window.HTMLElement.prototype, "clientHeight", { get() { return 800; } });
window.HTMLElement.prototype.getBoundingClientRect = function () {
  return { left: 0, top: 0, right: 400, bottom: 800, width: 400, height: 800, x: 0, y: 0 };
};
window.HTMLElement.prototype.scrollIntoView = () => {};
window.scrollTo = () => {};
const ch = i => ({ label: "Глава " + (i + 1),
  html: `<p>Текст главы ${i + 1}. Словарь Уэбстера<a class="fn" data-fn="n46">[46]</a> и ещё текст.</p>`.repeat(30) });
global.Shelf = {
  open: async () => {}, put: async b => b, del: async () => {},
  all: async () => [], get: async () => null,
  touch: async (id, patch) => {}, newId: () => "x"
};
require("../store.js"); global.Shelf = window.Shelf;
require("../reader.js");
const Reader = window.Reader;
(async () => {
  // подменяем get чтобы вернуть книгу со сноской
  const book = { id: "b1", title: "T", authors: ["A"], format: "fb2", fileName: "t.fb2",
    cover: null, toc: [], chapters: [ch(0)], notes: { n46: "Ноа Уэбстер — лексикограф." },
    progress: 0, addedAt: Date.now(), lastOpened: Date.now() };
  global.Shelf.get = async () => book;
  global.Shelf.touch = async () => {};
  await Reader.open("b1");
  await new Promise(r => setTimeout(r, 300));
  const a = document.querySelector("a.fn");
  console.log("ссылка найдена:", !!a, a && a.textContent, a && a.dataset.fn);
  // симулируем клик
  const ev = new window.MouseEvent("click", { bubbles: true, cancelable: true, clientX: 200, clientY: 400 });
  a.dispatchEvent(ev);
  await new Promise(r => setTimeout(r, 100));
  console.log("попап открыт:", document.getElementById("rNote").classList.contains("open"));
  console.log("текст попапа:", document.getElementById("rNoteText").textContent);
  // тап рядом со сноской (мимо на ~15px) — nearestFn должен найти ссылку
  document.getElementById("rNoteX").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const span = document.createElement("span");
  span.textContent = "мимо";
  document.getElementById("rPages").appendChild(span);
  document.elementFromPoint = (x, y) => (Math.hypot(x - 200, y - 400) < 30 ? a : span);
  span.dispatchEvent(new window.MouseEvent("click", { bubbles: true, clientX: 212, clientY: 408 }));
  await new Promise(r => setTimeout(r, 100));
  const nearOk = document.getElementById("rNote").classList.contains("open");
  console.log("попап открыт при тапе рядом:", nearOk);
  if (!nearOk) process.exit(1);
  process.exit(0);
})().catch(e => { console.error("CRASH:", e); process.exit(1); });
