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
  ok(fb2.notes && fb2.notes.n1 && fb2.notes.n1.includes("пояснения-сноски"), "сноска из notes body: " + (fb2.notes && fb2.notes.n1));
  ok(fb2.chapters[0].html.includes('class="fn" data-fn="n1"'), "ссылка-сноска → a.fn");
  ok(fb2.chapters[0].html.includes('data-fn="n46">[46]</a>'), "текстовая [46] → синяя сноска");
  ok(fb2.notes.n46 && fb2.notes.n46.includes("Уэбстер"), "текст сноски 46");
  ok(fb2.annotation === "Аннотация тестовой книги для проверки.", "аннотация: " + fb2.annotation);

  console.log("ZIP:");
  const zip = await P.parseBook(load("test.zip"));
  ok(zip.format === "fb2" && zip.title === "Тестовая FB2-книга", "zip→fb2 внутри");

  console.log("EPUB сноски:");
  const z2 = new global.JSZip();
  z2.file("mimetype", "application/epub+zip");
  z2.file("META-INF/container.xml", '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  z2.file("OEBPS/content.opf", '<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>T</dc:title><dc:language>ru</dc:language><dc:identifier id="id">t</dc:identifier></metadata><manifest><item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="ch2.xhtml" media-type="application/xhtml+xml"/><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/></manifest><spine toc="ncx"><itemref idref="c1"/><itemref idref="c2"/></spine></package>');
  z2.file("OEBPS/ch1.xhtml", '<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>1</title></head><body><h1>Глава 1</h1><p>Текст со сноской<a href="#ft1">[1]</a> дальше.</p></body></html>');
  z2.file("OEBPS/ch2.xhtml", '<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>2</title></head><body><h1>Примечания</h1><section id="ft1"><p>Это текст пояснения к сноске номер один, достаточно длинный чтобы пройти порог длины.</p></section></body></html>');
  z2.file("OEBPS/toc.ncx", '<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head/><docTitle><text>T</text></docTitle><navMap><navPoint id="n1" playOrder="1"><navLabel><text>Глава 1</text></navLabel><content src="ch1.xhtml"/></navPoint></navMap></ncx>');
  const eb = await P.parseBook({ name: "fn.epub", data: await z2.generateAsync({ type: "uint8array" }) });
  ok(eb.notes && eb.notes.ft1 && eb.notes.ft1.includes("пояснения к сноске"), "epub: сноска найдена");
  ok(eb.chapters[0].html.includes('data-fn="ft1"'), "epub: ссылка → a.fn");
  ok(!eb.chapters[0].html.includes('href="#ft1"'), "epub: href убран");

  console.log("Ошибки:");
  try { await P.parseBook({ name: "x.txt", data: new Uint8Array([1,2,3]) }); ok(false, "txt должен упасть"); }
  catch (e) { ok(e.isParseError, "txt → понятная ошибка"); }
  try { await P.parseBook({ name: "empty.fb2", data: new Uint8Array(0) }); ok(false, "пустой должен упасть"); }
  catch (e) { ok(e.isParseError, "пустой → понятная ошибка"); }

  console.log(`\nИтого: ${pass} ok, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error("CRASH:", e); process.exit(1); });
