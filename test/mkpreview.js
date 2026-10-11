// node mkpreview.js [--hide] [--sepia] — собирает preview3.html для скриншотов ридера
const fs = require("fs");
const hide = process.argv.includes("--hide");
const sepia = process.argv.includes("--sepia");
const paras = [];
const t = [
  "Ночной поезд идёт через темноту мягко и уверенно. Колёса стучат: ту-дук… ту-дук… ту-дук.",
  "В купе тепло и пахнет чаем. Проводница разносит стаканы в подстаканниках.",
  "Ты лежишь на верхней полке, укрывшись одеялом, и смотришь в окно.",
  "Весь твой обычный мир остался где-то там, позади, за сотни километров.",
  "Не нужно ни о чём думать. Поезд сам знает, куда ехать.",
  "Ту-дук… ту-дук… Глаза сами закрываются. Где-то впереди — утро, новый город.",
  "А сейчас — только ночь, только стук колёс и тёплое одеяло.",
  "Утром тебя разбудит солнце, заглянувшее в окно купе."
];
for (let r = 0; r < 4; r++) t.forEach(p => paras.push("<p>" + p + "</p>"));
const seed = [{
  id: "b1", title: "Ночной поезд", authors: ["Автор"], format: "fb2", fileName: "t.fb2", cover: null,
  toc: [{ label: "Глава 1", chapter: 0 }],
  chapters: [{ label: "Глава 1", html: paras.join("") }],
  progress: 0, addedAt: Date.now(), lastOpened: Date.now()
}];

let html = fs.readFileSync("../index.html", "utf8");
const fake = `<script>
window.__errs = [];
window.onerror = function (m) { window.__errs.push(String(m)); };
const __BOOKS__ = ${JSON.stringify(seed)};
window.Shelf = {
  open: async () => {}, put: async (b) => b,
  all: async () => [...__BOOKS__],
  get: async (id) => __BOOKS__.find(b => b.id === id),
  del: async (id) => {}, touch: async () => {}, newId: () => "x"
};
window.__toast = () => {}; window.__shelfReload = () => {};

</script><style>.reader{transition:none!important}.r-top,.r-bottom{transition:none!important}</style>`;
html = html.replace(/<script src="store\.js[^"]*"><\/script>/, fake);
const openScript = `<script>
(async () => {
  try {
    await Reader.open("b1");

    ${hide ? 'document.getElementById("rTop").classList.add("gone");document.getElementById("rBottom").classList.add("gone");' : ""}
    document.title = "OPENED";
  } catch (e) { document.title = "ERR " + (e && e.message); }
})();
</script>`;
html = html.replace(/<script src="app\.js[^"]*"><\/script>/, openScript);
html = html.replace('<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>', "");
html = html.replace('<script src="parser.js"></script>', "");
fs.writeFileSync("../preview3.html", html);
console.log("preview3.html ok, hide=" + hide);
