// Тесты полки: node run-shelf.js
require("fake-indexeddb/auto");
global.crypto = require("crypto").webcrypto;
require("../store.js");
const P = global.Shelf;
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
  console.log(`\nИтого: ${pass} ok, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error("CRASH:", e); process.exit(1); });
