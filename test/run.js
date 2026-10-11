// Тесты парсера: node run.js
const fs = require("fs");
const { JSDOM } = require("jsdom");
const dom = new JSDOM("", {});
global.document = dom.window.document;
global.DOMParser = dom.window.DOMParser;
global.JSZip = require("jszip");
require("../parser.js");
const P = global.TishinaParser;

let pass = 0, failed = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { failed++; console.log("  ✗ FAIL: " + name); }
}
const load = n => ({ name: n, data: new Uint8Array(fs.readFileSync(n)) });

(async () => {
  console.log("EPUB:");
  const epub = await P.parseBook(load("test.epub"));
  ok(epub.format === "epub", "format=epub");
  ok(epub.title === "Тестовая книга", "title: " + epub.title);
  ok(epub.authors.join() === "Иван Тестов", "author: " + epub.authors.join());
  ok(epub.cover && epub.cover.startsWith("data:image/png;base64,"), "cover dataURL");
  ok(epub.chapters.length === 2, "chapters=2 (got " + epub.chapters.length + ")");
  ok(epub.chapters[0].html.includes("Первый абзац тестовой главы"), "ch1 text");
  ok(!epub.chapters[0].html.includes("alert"), "script вырезан");
  ok(/<img[^>]*src="data:image\/png;base64,/.test(epub.chapters[0].html), "img → dataURL");
  ok(epub.toc.length === 2 && epub.toc[0].label === "Начало", "toc: " + epub.toc.map(t=>t.label).join(" / "));
  ok(epub.chapters[0].label === "Начало", "ch1 label");

  console.log("FB2 (windows-1251):");
  const fb2 = await P.parseBook(load("test.fb2"));
  ok(fb2.format === "fb2", "format=fb2");
  ok(fb2.title === "Тестовая FB2-книга", "title: " + fb2.title);
  ok(fb2.authors.join() === "Пётр Тестовый", "author: " + fb2.authors.join());
  ok(fb2.cover && fb2.cover.startsWith("data:image/png;base64,"), "cover dataURL");
  ok(fb2.chapters.length === 2, "chapters=2 (got " + fb2.chapters.length + ")");
  ok(fb2.chapters[0].html.includes("Ёлки-палки"), "1251 декодирована");
  ok(fb2.chapters[0].html.includes("<em>курсивом</em>"), "emphasis→em");
  ok(/<img[^>]*src="data:image\/png;base64,/.test(fb2.chapters[0].html), "fb2 img → dataURL");
  ok(fb2.chapters[0].label === "Глава первая", "label: " + fb2.chapters[0].label);

  console.log("ZIP:");
  const zip = await P.parseBook(load("test.zip"));
  ok(zip.format === "fb2" && zip.title === "Тестовая FB2-книга", "zip→fb2 внутри");

  console.log("Ошибки:");
  try { await P.parseBook({ name: "x.txt", data: new Uint8Array([1,2,3]) }); ok(false, "txt должен упасть"); }
  catch (e) { ok(e.isParseError, "txt → понятная ошибка"); }
  try { await P.parseBook({ name: "empty.fb2", data: new Uint8Array(0) }); ok(false, "пустой должен упасть"); }
  catch (e) { ok(e.isParseError, "пустой → понятная ошибка"); }

  console.log(`\nИтого: ${pass} ok, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error("CRASH:", e); process.exit(1); });
