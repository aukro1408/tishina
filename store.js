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

global.Shelf = { open, put, all, get, del, touch, newId };

})(typeof window !== "undefined" ? window : global);
