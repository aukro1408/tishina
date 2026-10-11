// превью страницы книги
const fs = require("fs");
let html = fs.readFileSync("../index.html", "utf8");
// вырезать скрипты парсера/ридера, оставить store+app
html = html.replace(/<script src="parser\.js[^"]*"><\/script>/, "");
html = html.replace(/<script src="reader\.js[^"]*"><\/script>/, "");
html = html.replace(/<script src="https:\/\/cdnjs[^>]*><\/script>/, "");
const seed = [{
  id: "b1", title: "Восхождение", authors: ["Николас Биндж"], format: "fb2", fileName: "v.fb2",
  cover: null, toc: [{ label: "Глава 1", chapter: 0 }, { label: "Глава 2", chapter: 1 }],
  chapters: [], annotation: "Огромная покрытая снегом гора неожиданно появляется посреди Тихого океана. Никто не знает, когда конкретно она возникла и как объяснить факт её существования.",
  progress: 0.15, lastRead: { ch: 0, page: 3 }, addedAt: Date.now(), lastOpened: Date.now()
}];
const fake = `<script>
window.Shelf = {
  open: async () => {}, put: async (b) => b,
  all: async () => ${JSON.stringify(seed)},
  get: async (id) => ${JSON.stringify(seed)}.find(b => b.id === id),
  del: async (id) => {}, touch: async () => {}, newId: () => "x"
};
window.__toast = () => {};
</script>`;
html = html.replace(/<script src="store\.js[^"]*"><\/script>/, fake);
html += `<script>
(async () => {
  await new Promise(r => setTimeout(r, 400));
  document.querySelector('[data-open="b1"]').click();
  await new Promise(r => setTimeout(r, 500));
  document.title = "OPENED";
})();</script>`;
fs.writeFileSync("../dpreview.html", html);
console.log("dpreview.html ok");
