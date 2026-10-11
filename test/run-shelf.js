// Тесты полки: node run-shelf.js
require("fake-indexeddb/auto");
global.crypto = require("crypto").webcrypto;
const { JSDOM } = require("jsdom");
const pdom = new JSDOM("", {});
global.document = pdom.window.document;
global.DOMParser = pdom.window.DOMParser;
global.JSZip = require("jszip");
require("../parser.js"); // настоящие notesByNum/linkBracketNotes
require("../store.js");
const P = global.Shelf;
global.TishinaParser.parseBook = async () => ({ title: "Новое", authors: ["А"], cover: null,
  toc: [{ label: "Г", chapter: 0 }], chapters: [{ label: "Г", html: "<p>x</p>" }],
  notes: {}, annotation: "Новое описание" });
let pass = 0, failed = 0;
const ok = (c, n) => { c ? pass++ : failed++; console.log((c ? "  ✓ " : "  ✗ FAIL: ") + n); };
const mk = (id, title, prog, ago) => ({ id, title, authors: ["Автор " + id], format: "epub",
  fileName: "t.epub", cover: null, toc: [], chapters: [], progress: prog,
  addedAt: Date.now() - ago, lastOpened: Date.now() - ago });
(async () => {
  await P.put(mk("b1", "Книга один", 0.1, 3000));
  await P.put(mk("b2", "Книга два", 0.5, 1000));
  await P.put(mk("b3", "Книга три", 0, 2000));
  let all = await P.all();
  ok(all.length === 3, "3 книги сохранены");
  ok(all[0].id === "b2" && all[1].id === "b3", "сортировка по lastOpened: " + all.map(b => b.id).join(","));
  await P.touch("b1", { progress: 0.9 });
  const g = await P.get("b1");
  ok(g.progress === 0.9, "touch обновил прогресс");
  all = await P.all();
  ok(all[0].id === "b1", "touch поднял книгу наверх");
  await P.del("b2");
  ok((await P.all()).length === 2, "удаление работает");
  ok((await P.get("b2")) === undefined, "удалённый не находится");
  // автоперепарсинг устаревшей книги
  await P.put({ id: "old", title: "Старое", authors: ["А"], format: "fb2", fileName: "o.fb2",
    cover: null, toc: [], chapters: [{ label: "С", html: "<p>старое</p>" }], notes: {},
    progress: 0.4, lastRead: { ch: 0, page: 1 }, marks: [{ ch: 0, page: 0 }],
    src: new Blob([new Uint8Array(8)]), parserV: 1,
    addedAt: Date.now(), lastOpened: Date.now() });
  const rp = await P.reparseIfStale(await P.get("old"));
  ok(rp.parserV === 3 && rp.chapters[0].html === "<p>x</p>", "перепарсинг обновил главы");
  ok(rp.annotation === "Новое описание", "перепарсинг обновил описание");
  ok(rp.progress === 0.4 && rp.lastRead.page === 1 && rp.marks.length === 1, "прогресс и закладки целы");
  // свежая книга не трогается
  await P.put({ id: "fresh", title: "F", chapters: [{ label: "Г", html: "<p>y</p>" }],
    parserV: 3, src: new Blob([new Uint8Array(8)]), // parseBook мока не вызовется: parserV свежий
    addedAt: Date.now(), lastOpened: Date.now() });
  const fr = await P.reparseIfStale(await P.get("fresh"));
  ok(fr.chapters[0].html === "<p>y</p>", "свежая книга не перепарсивается");
  // без исходника — тихо пропускаем
  await P.put({ id: "nosrc", title: "N", chapters: [{ label: "Г", html: "<p>z</p>" }],
    parserV: 1, addedAt: Date.now(), lastOpened: Date.now() });
  const ns = await P.reparseIfStale(await P.get("nosrc"));
  ok(ns.chapters[0].html === "<p>z</p>", "без исходника не падаем");
  // миграция сносок без исходника: текстовые [46] → ссылки по сохранённым notes
  await P.put({ id: "oldnotes", title: "S", authors: ["А"], format: "fb2", fileName: "s.fb2",
    cover: null, toc: [], chapters: [{ label: "Г", html: "<p>Словарь Уэбстера[46] конец.</p>" }],
    notes: { n46: "Ноа Уэбстер — лексикограф." }, progress: 0.2,
    addedAt: Date.now(), lastOpened: Date.now() });
  const mn = await P.reparseIfStale(await P.get("oldnotes"));
  ok(mn.chapters[0].html.includes('data-fn="n46">[46]</a>'), "миграция привязала [46] к сноске");
  ok(mn.progress === 0.2, "прогресс цел после миграции");
  console.log(`\nИтого: ${pass} ok, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error("CRASH:", e); process.exit(1); });
