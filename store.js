/* Тишина · полка — IndexedDB. Книги целиком на устройстве. */
(function (global) {
"use strict";

const DB_NAME = "tishina";
const DB_VER = 1;
let db = null;

function open() {
  return new Promise((resolve, reject) => {
    if (db) return resolve();
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains("books")) d.createObjectStore("books", { keyPath: "id" });
    };
    req.onsuccess = () => { db = req.result; resolve(); };
    req.onerror = () => reject(req.error);
  });
}
function store(mode) { return db.transaction("books", mode).objectStore("books"); }
function req2promise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function put(book) {
  await open();
  book.updatedAt = Date.now();
  await req2promise(store("readwrite").put(book));
  return book;
}
async function all() {
  await open();
  const list = await req2promise(store("readonly").getAll());
  return list.sort((a, b) => (b.lastOpened || b.addedAt || 0) - (a.lastOpened || a.addedAt || 0));
}
async function get(id) { await open(); return req2promise(store("readonly").get(id)); }
async function del(id) { await open(); return req2promise(store("readwrite").delete(id)); }
async function touch(id, patch) {
  const b = await get(id);
  if (!b) return null;
  Object.assign(b, patch || {}, { lastOpened: Date.now() });
  return put(b);
}
function newId() {
  return (crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now() + "-" + Math.random().toString(36).slice(2));
}

// парсер обновился, а книга импортирована старой версией:
// 1) если есть исходник — тихо перепарсить (прогресс/закладки сохранить);
// 2) без исходника — хотя бы привязать текстовые [N] к уже сохранённым сноскам.
async function reparseIfStale(b) {
  const P = global.TishinaParser || {};
  const V = P.VERSION || 0;
  if (!b || (b.parserV || 0) >= V) return b;
  if (b.src && P.parseBook) {
    try {
      const buf = await b.src.arrayBuffer();
      const p = await P.parseBook({ name: b.fileName || "book", data: new Uint8Array(buf) });
      const keep = { progress: b.progress, lastRead: b.lastRead, marks: b.marks };
      Object.assign(b, {
        title: p.title, authors: p.authors, cover: p.cover,
        toc: p.toc, chapters: p.chapters, notes: p.notes, annotation: p.annotation,
        parserV: V
      }, keep);
      await put(b);
      return b;
    } catch (e) { console.warn("re-parse:", e && e.message); }
  }
  if (b.notes && P.notesByNum && P.linkBracketNotes) {
    try {
      const byNum = P.notesByNum(b.notes);
      if (Object.keys(byNum).length) {
        let changed = false;
        for (const ch of b.chapters || []) {
          const html2 = P.linkBracketNotes(ch.html, byNum);
          if (html2 !== ch.html) { ch.html = html2; changed = true; }
        }
        if (changed) { b.parserV = V; await put(b); }
      }
    } catch (e) { console.warn("notes-migrate:", e && e.message); }
  }
  return b;
}

global.Shelf = { open, put, all, get, del, touch, newId, reparseIfStale };

})(typeof window !== "undefined" ? window : global);
