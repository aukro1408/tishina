// реальный Chrome + TouchEvent на настоящей ссылке-сноске
const fs = require("fs");
const { JSDOM } = require("jsdom");
const pdom = new JSDOM("", {});
global.document = pdom.window.document;
global.DOMParser = pdom.window.DOMParser;
global.JSZip = require("jszip");
require("../parser.js");
(async () => {
  const data = new Uint8Array(fs.readFileSync(process.env.HOME + "/workspace/user/files/King_King-Stiven-Romany_14_Mizeri.iVEIDg.397170_15_gey0.fb2"));
  const b = await global.TishinaParser.parseBook({ name: "m.fb2", data });
  // найти главу с n_46
  const ch = b.chapters.find(c => c.html.includes('data-fn="n_46"'));
  console.log("глава найдена:", !!ch, "| сносок:", Object.keys(b.notes).length);
  // собрать тестовую страницу
  let html = fs.readFileSync("../index.html", "utf8");
  html = html.replace(/<script src="parser\.js[^"]*"><\/script>/, "");
    html = html.replace(/<script src="https:\/\/cdnjs[^>]*><\/script>/, "");
  const book = { id: "miz", title: b.title, authors: b.authors, format: "fb2",
    fileName: "m.fb2", cover: null, toc: b.toc.slice(0, 3),
    chapters: [{ label: ch.label, html: ch.html }],
    notes: b.notes, progress: 0, addedAt: Date.now(), lastOpened: Date.now() };
  const fake = `<script>
window.Shelf = {
  open: async () => {}, put: async (x) => x,
  all: async () => [], get: async () => ${JSON.stringify(book).replace(/</g, "\\u003c")},
  del: async () => {}, touch: async () => {}, newId: () => "x",
  reparseIfStale: async (b) => b
};
window.__toast = () => {};
</script>`;
  html = html.replace(/<script src="store\.js[^"]*"><\/script>/, fake);
  html += `<script>
(async () => {
  try {
    await Reader.open("miz");
    await new Promise(r => setTimeout(r, 800));
    const a = document.querySelector('a.fn[data-fn="n_46"]');
    if (!a) { document.title = "NOLINK"; return; }
    const r = a.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    // настоящий тач: touchstart -> touchend -> click
    const t = new Touch({ identifier: 1, target: a, clientX: cx, clientY: cy });
    a.dispatchEvent(new TouchEvent("touchstart", { touches: [t], bubbles: true, cancelable: true }));
    a.dispatchEvent(new TouchEvent("touchend", { changedTouches: [t], bubbles: true, cancelable: true }));
    a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: cx, clientY: cy }));
    await new Promise(r => setTimeout(r, 300));
    document.title = document.getElementById("rNote").classList.contains("open") ? "POPUP_OK" : "POPUP_FAIL";
  } catch (e) { document.title = "ERR " + (e && e.message); }
})();</script>`;
  fs.writeFileSync("../realtap.html", html);
  console.log("realtap.html ok");
})().catch(e => { console.error("CRASH", e); process.exit(1); });
