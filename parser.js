/* Тишина · парсер книг — шаг 1.
   EPUB / FB2 / ZIP → единый формат:
   { format, fileName, title, authors[], lang, cover(dataURL|null),
     toc:[{label, chapter}], chapters:[{label, html}] }
   Работает в браузере (JSZip из CDN) и в node (тесты).
*/
(function (global) {
"use strict";

function fail(msg) { const e = new Error(msg); e.isParseError = true; throw e; }

/* ---------- мелкие помощники ---------- */

function parseXml(text) {
  const doc = new global.DOMParser().parseFromString(text, "application/xml");
  const err = doc.getElementsByTagName("parsererror")[0];
  if (err) fail("Битый XML: " + (err.textContent || "").slice(0, 160));
  return doc;
}

// элементы по локальному имени, без привязки к неймспейсу (fb2/opus любят ns)
function els(root, name) {
  let list = [];
  if (root.getElementsByTagNameNS) {
    try { list = Array.from(root.getElementsByTagNameNS("*", name)); } catch (e) {}
  }
  if (!list.length && root.getElementsByTagName) list = Array.from(root.getElementsByTagName(name));
  return list;
}
function first(root, name) { return els(root, name)[0] || null; }
function textOf(root, name) {
  const el = first(root, name);
  return el ? (el.textContent || "").trim().replace(/\s+/g, " ") : "";
}
function hrefOf(el) {
  if (!el || !el.getAttribute) return "";
  return el.getAttribute("l:href") || el.getAttributeNS("http://www.w3.org/1999/xlink", "href")
      || el.getAttribute("href") || "";
}
function resolvePath(base, rel) {
  // base: "OEBPS/content.opf", rel: "ch1.xhtml" | "../img/a.png"
  const b = base.split("/"); b.pop();
  const parts = rel.split("#")[0].split("/");
  for (const p of parts) {
    if (!p || p === ".") continue;
    if (p === "..") b.pop(); else b.push(p);
  }
  return b.join("/");
}
function extOf(name) { const m = /\.([a-z0-9]+)$/i.exec(name || ""); return m ? m[1].toLowerCase() : ""; }
function mimeForExt(ext) {
  return { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
           webp: "image/webp", svg: "image/svg+xml" }[ext] || "image/png";
}
/* Текстовые [N] → ссылки-сноски (как MoonReader/Paciuk): если есть сноска
   с таким номером, подсвечиваем синим. */
function notesByNum(notes) {
  const m = {};
  for (const id of Object.keys(notes || {})) {
    const d = String(id).match(/(\d+)$/);
    if (d && !m[d[1]]) m[d[1]] = id;
  }
  return m;
}
function linkBracketNotes(html, byNum) {
  if (!html || !byNum || !Object.keys(byNum).length) return html;
  if (!/\[\d{1,3}\]/.test(html)) return html;
  try {
    const doc = global.document.implementation.createHTMLDocument("");
    doc.body.innerHTML = html;
    const NF = (global.document.defaultView || {}).NodeFilter;
    if (!NF) return html;
    const walker = doc.createTreeWalker(doc.body, NF.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    const re = /\[(\d{1,3})\]/g;
    for (const node of nodes) {
      if (node.parentElement && node.parentElement.closest("a.fn")) continue;
      const text = node.textContent;
      re.lastIndex = 0;
      if (!re.test(text)) continue;
      re.lastIndex = 0;
      const frag = doc.createDocumentFragment();
      let last = 0, m, any = false;
      while ((m = re.exec(text))) {
        const id = byNum[m[1]];
        if (!id) continue;
        any = true;
        if (m.index > last) frag.appendChild(doc.createTextNode(text.slice(last, m.index)));
        const a = doc.createElement("a");
        a.setAttribute("class", "fn");
        a.setAttribute("data-fn", id);
        a.textContent = m[0];
        frag.appendChild(a);
        last = m.index + m[0].length;
      }
      if (any) {
        if (last < text.length) frag.appendChild(doc.createTextNode(text.slice(last)));
        node.parentNode.replaceChild(frag, node);
      }
    }
    return doc.body.innerHTML;
  } catch (e) { return html; }
}

function u8ToBase64(u8) {
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}

/* ---------- санитайзер главы ---------- */

const KEEP = { P:1, H1:1, H2:1, H3:1, H4:1, BLOCKQUOTE:1, UL:1, OL:1, LI:1, BR:1, HR:1,
  EM:1, I:1, STRONG:1, B:1, U:1, SUP:1, SUB:1, IMG:1, DIV:1, SECTION:1, ARTICLE:1,
  HEADER:1, FOOTER:1, SPAN:1, PRE:1, CODE:1, FIGURE:1, FIGCAPTION:1, A:1, TABLE:1,
  THEAD:1, TBODY:1, TR:1, TD:1, TH:1 };
const DROP = { SCRIPT:1, STYLE:1, LINK:1, META:1, TITLE:1, FORM:1, INPUT:1, BUTTON:1,
  IFRAME:1, OBJECT:1, EMBED:1, AUDIO:1, VIDEO:1 };

function sanitize(node, doc, imgResolver) {
  // возвращает DocumentFragment с чистым содержимым
  const frag = doc.createDocumentFragment();
  function walk(src, dst) {
    for (const n of Array.from(src.childNodes)) {
      if (n.nodeType === 3) { // текст — как есть (пробелы схлопнет HTML)
        dst.appendChild(doc.createTextNode(n.textContent));
        continue;
      }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName.toUpperCase().split(":").pop();
      if (DROP[tag]) continue;
      if (!KEEP[tag]) { walk(n, dst); continue; } // неизвестный тег — разворачиваем
      const el = doc.createElement(tag.toLowerCase());
      const nid = n.getAttribute("id");
      if (nid) el.setAttribute("id", nid); // якоря для сносок
      if (tag === "IMG") {
        const src = n.getAttribute("src") || hrefOf(n);
        const dataUrl = imgResolver ? imgResolver(src) : null;
        if (dataUrl) el.setAttribute("src", dataUrl);
        else continue; // картинку не нашли — пропускаем
        const alt = n.getAttribute("alt"); if (alt) el.setAttribute("alt", alt);
      } else if (tag === "A") {
        const h = n.getAttribute("href"); if (h) el.setAttribute("href", h);
      }
      walk(n, el);
      // пустые блочные без картинок — выкидываем
      if (!el.textContent.trim() && !el.querySelector("img") && /^(P|DIV|H1|H2|H3|H4|SPAN)$/.test(tag)) continue;
      dst.appendChild(el);
    }
  }
  walk(node, frag);
  const div = doc.createElement("div");
  div.appendChild(frag);
  return div.innerHTML;
}

/* ---------- EPUB ---------- */

async function parseEpub(u8, fileName, onProgress) {
  const JSZip = global.JSZip;
  if (!JSZip) fail("JSZip не загружен");
  const zip = await JSZip.loadAsync(u8);
  const names = Object.keys(zip.files);

  const containerFile = names.find(n => n.toLowerCase() === "meta-inf/container.xml");
  if (!containerFile) fail("EPUB: нет META-INF/container.xml");
  const container = parseXml(await zip.file(containerFile).async("string"));
  const rootfile = first(container, "rootfile");
  const opfPath = rootfile && rootfile.getAttribute("full-path");
  if (!opfPath) fail("EPUB: не найден rootfile в container.xml");

  const opf = parseXml(await zip.file(opfPath).async("string"));
  const metadata = first(opf, "metadata") || opf;

  const title = textOf(metadata, "title") || fileName.replace(/\.[^.]+$/, "");
  const authors = els(metadata, "creator").map(c => (c.textContent || "").trim()).filter(Boolean);
  const lang = textOf(metadata, "language");
  const annotation = (textOf(metadata, "description") || "").replace(/\s+/g, " ").trim().slice(0, 2000);
  const genres = els(metadata, "subject").map(s => (s.textContent || "").trim()).filter(Boolean);

  // manifest: id -> {href, type}
  const manifest = {};
  for (const item of els(opf, "item")) {
    const id = item.getAttribute("id");
    if (id) manifest[id] = {
      href: resolvePath(opfPath, item.getAttribute("href") || ""),
      type: item.getAttribute("media-type") || "",
      props: item.getAttribute("properties") || ""
    };
  }
  // обложка
  let cover = null;
  let coverId = null;
  for (const id of Object.keys(manifest)) if (/\bcover-image\b/.test(manifest[id].props)) coverId = id;
  if (!coverId) {
    const metaCover = els(opf, "meta").find(m => m.getAttribute("name") === "cover");
    if (metaCover) coverId = metaCover.getAttribute("content");
  }
  if (coverId && manifest[coverId] && zip.file(manifest[coverId].href)) {
    const data = await zip.file(manifest[coverId].href).async("uint8array");
    cover = "data:" + mimeForExt(extOf(manifest[coverId].href)) + ";base64," + u8ToBase64(data);
  }

  // spine → порядок глав
  const spine = els(opf, "itemref").map(r => r.getAttribute("idref")).filter(id => manifest[id]);
  if (!spine.length) fail("EPUB: пустой spine");

  const imgCache = {};
  async function imgDataUrl(absPath) {
    if (imgCache[absPath] !== undefined) return imgCache[absPath];
    const f = zip.file(absPath);
    let url = null;
    if (f) {
      const data = await f.async("uint8array");
      url = "data:" + mimeForExt(extOf(absPath)) + ";base64," + u8ToBase64(data);
    }
    imgCache[absPath] = url;
    return url;
  }

  const chapters = [];
  const cleanDoc = () => global.document.implementation.createHTMLDocument("");
  let n = 0;
  for (const id of spine) {
    const entry = manifest[id];
    const f = zip.file(entry.href);
    if (!f) continue;
    const raw = await f.async("string");
    const xdoc = parseXml(raw);
    const body = first(xdoc, "body") || xdoc;
    // санитайзер оставляет src как есть, подменим их на dataURL ниже
    let html = sanitize(body, cleanDoc(), src => src || "");
    const used = [];
    html = html.replace(/<img([^>]*)src="([^"]*)"/g, (m, rest, src) => {
      if (/^(https?:|data:)/i.test(src)) return m; // внешние/data — как есть
      used.push(src);
      return `<img${rest}src="__IMG${used.length - 1}__"`;
    });
    for (let i = 0; i < used.length; i++) {
      const url = await imgDataUrl(resolvePath(entry.href, used[i]));
      html = html.split(`__IMG${i}__`).join(url || "");
    }
    html = html.replace(/<img[^>]*src="__IMG\d+__"[^>]*>/g, "") // не нашли — убрать
               .replace(/<img[^>]*src=""[^>]*>/g, "");
    let label = textOf(xdoc, "title");
    if (!label) {
      const m = /<h[1-3][^>]*>(.*?)<\/h[1-3]>/.exec(html);
      label = m ? m[1].replace(/<[^>]+>/g, "").trim().slice(0, 80) : "";
    }
    if (!label) label = "Глава " + (++n); else n++;
    chapters.push({ label, html });
    if (onProgress) onProgress(chapters.length, spine.length);
  }
  if (!chapters.length) fail("EPUB: не нашли глав");

  // сноски: ссылки #id → попап, если цель с текстом найдена в главах
  try {
    const mkDoc = html => {
      const d = global.document.implementation.createHTMLDocument("");
      d.body.innerHTML = html;
      return d;
    };
    const idIndex = {};
    for (const ch of chapters) {
      mkDoc(ch.html).querySelectorAll("[id]").forEach(el => {
        const t = (el.textContent || "").replace(/\s+/g, " ").trim();
        if (t.length > 30 && !idIndex[el.id]) idIndex[el.id] = t;
      });
    }
    var epubNotes = {};
    for (const ch of chapters) {
      const d = mkDoc(ch.html);
      let touched = false;
      d.querySelectorAll("a[href]").forEach(a => {
        const href = a.getAttribute("href") || "";
        const hi = href.indexOf("#");
        const id = hi >= 0 ? href.slice(hi + 1) : "";
        const txt = id && idIndex[id];
        if (txt) {
          a.setAttribute("class", ((a.getAttribute("class") || "") + " fn").trim());
          a.setAttribute("data-fn", id);
          a.removeAttribute("href");
          epubNotes[id] = txt;
        } else {
          a.replaceWith(...a.childNodes); // битая/внешняя ссылка — просто текст
        }
        touched = true;
      });
      if (touched) ch.html = d.body.innerHTML;
    }
  } catch (e) { var epubNotes = {}; }
  // текстовые [N] без <a> → тоже сноски
  const epubByNum = notesByNum(epubNotes);
  if (Object.keys(epubByNum).length) for (const ch of chapters) ch.html = linkBracketNotes(ch.html, epubByNum);

  // оглавление: nav (epub3) → ncx → fallback по главам
  let toc = [];
  const navId = Object.keys(manifest).find(id => /\bnav\b/.test(manifest[id].props));
  if (navId && zip.file(manifest[navId].href)) {
    try {
      const navDoc = parseXml(await zip.file(manifest[navId].href).async("string"));
      const navs = els(navDoc, "nav");
      const tocNav = navs.find(n => (n.getAttribute("type") || n.getAttribute("epub:type") || "").includes("toc")) || navs[0];
      if (tocNav) {
        const links = Array.from(tocNav.getElementsByTagName("a"));
        const hrefs = spine.map(id => manifest[id].href);
        toc = links.map(a => {
          const href = resolvePath(manifest[navId].href, a.getAttribute("href") || "");
          const ci = hrefs.findIndex(h => h === href);
          return { label: (a.textContent || "").trim().slice(0, 120), chapter: ci < 0 ? 0 : ci };
        }).filter(t => t.label);
      }
    } catch (e) { /* fallback ниже */ }
  }
  if (!toc.length) {
    const ncxId = Object.keys(manifest).find(id => manifest[id].type === "application/x-dtbncx+xml");
    if (ncxId && zip.file(manifest[ncxId].href)) {
      try {
        const ncx = parseXml(await zip.file(manifest[ncxId].href).async("string"));
        const hrefs = spine.map(id => manifest[id].href);
        for (const np of els(ncx, "navPoint")) {
          const label = textOf(np, "text");
          const content = first(np, "content");
          const src = content ? content.getAttribute("src") : "";
          const href = resolvePath(manifest[ncxId].href, src);
          const ci = hrefs.findIndex(h => h === href);
          if (label) toc.push({ label: label.slice(0, 120), chapter: ci < 0 ? 0 : ci });
        }
      } catch (e) {}
    }
  }
  if (!toc.length) toc = chapters.map((c, i) => ({ label: c.label, chapter: i }));

  return { format: "epub", fileName, title, authors, lang, cover, toc, chapters, notes: epubNotes || {}, annotation, genres };
}

/* ---------- FB2 ---------- */

function fb2Decode(u8) {
  // кодировка из XML-декларации; fb2 часто в windows-1251
  const head = new global.TextDecoder("utf-8", { fatal: false }).decode(u8.subarray(0, 300));
  const m = /encoding=["']([^"']+)["']/i.exec(head);
  let enc = m ? m[1].toLowerCase() : "utf-8";
  const alias = { "windows-1251": "windows-1251", "win-1251": "windows-1251", "cp1251": "windows-1251",
                  "utf8": "utf-8", "utf-8": "utf-8", "koi8-r": "koi8-r" };
  enc = alias[enc] || "utf-8";
  try { return new global.TextDecoder(enc, { fatal: false }).decode(u8); }
  catch (e) { return new global.TextDecoder("utf-8", { fatal: false }).decode(u8); }
}

function parseFb2(u8, fileName, onProgress) {
  const text = fb2Decode(u8);
  const doc = parseXml(text);
  const fb = first(doc, "FictionBook") || doc;

  const desc = first(fb, "description");
  const ti = desc ? first(desc, "title-info") : null;
  const title = (ti ? textOf(ti, "book-title") : "") || fileName.replace(/\.[^.]+$/, "");
  const authors = ti ? els(ti, "author").map(a =>
    [textOf(a, "first-name"), textOf(a, "middle-name"), textOf(a, "last-name")]
      .filter(Boolean).join(" ")).filter(Boolean) : [];
  const lang = ti ? textOf(ti, "lang") : "";
  const annEl = ti ? first(ti, "annotation") : null;
  const annotation = annEl ? (annEl.textContent || "").replace(/\s+/g, " ").trim().slice(0, 2000) : "";
  const genres = ti ? els(ti, "genre").map(g => (g.textContent || "").trim()).filter(Boolean) : [];

  // бинарники → dataURL
  const binaries = {};
  for (const b of els(fb, "binary")) {
    const id = b.getAttribute("id");
    if (id) binaries["#" + id] = "data:" + (b.getAttribute("content-type") || "image/jpeg") +
      ";base64," + (b.textContent || "").replace(/\s+/g, "");
  }
  let cover = null;
  if (ti) {
    const cp = first(ti, "coverpage");
    if (cp) { const img = first(cp, "image"); const h = hrefOf(img); if (h && binaries[h]) cover = binaries[h]; }
  }

  // тело → главы по секциям верхнего уровня
  const bodies = els(fb, "body");
  const main = bodies.find(b => !b.getAttribute("name")) || bodies[0];
  if (!main) fail("FB2: нет <body>");

  // сноски: все именованные body (notes и др.), кроме основного
  const notes = {};
  for (const b of bodies) {
    if (b === main) continue;
    for (const s of Array.from(b.getElementsByTagName("section"))) {
      const id = s.getAttribute("id");
      if (id && !notes[id]) {
        const t = (s.textContent || "").replace(/\s+/g, " ").trim();
        if (t) notes[id] = t;
      }
    }
  }

  const sections = Array.from(main.childNodes).filter(n => n.nodeType === 1 &&
    n.tagName.split(":").pop().toLowerCase() === "section");

  const hdoc = global.document.implementation.createHTMLDocument("");
  function nodeToHtml(node, dst) {
    for (const n of Array.from(node.childNodes)) {
      if (n.nodeType === 3) {
        if (n.textContent.trim()) dst.appendChild(hdoc.createTextNode(n.textContent));
        continue;
      }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName.split(":").pop().toLowerCase();
      const P = hdoc.createElement("p");
      if (tag === "p" || tag === "v") {
        inlineChildren(n, P); if (P.textContent.trim()) dst.appendChild(P);
      } else if (tag === "subtitle" || tag === "title") {
        const h = hdoc.createElement("h3"); inlineChildren(n, h);
        if (h.textContent.trim()) dst.appendChild(h);
      } else if (tag === "empty-line") {
        dst.appendChild(hdoc.createElement("br"));
      } else if (tag === "image") {
        const h = hrefOf(n);
        if (h && binaries[h]) {
          const img = hdoc.createElement("img"); img.setAttribute("src", binaries[h]);
          dst.appendChild(img);
        }
      } else if (tag === "epigraph" || tag === "cite") {
        const q = hdoc.createElement("blockquote"); nodeToHtml(n, q);
        if (q.textContent.trim()) dst.appendChild(q);
      } else if (tag === "poem" || tag === "stanza" || tag === "section") {
        nodeToHtml(n, dst);
      } else if (tag === "text-author") {
        const em = hdoc.createElement("p"); em.style.textAlign = "right";
        const i = hdoc.createElement("em"); inlineChildren(n, i); em.appendChild(i);
        if (em.textContent.trim()) dst.appendChild(em);
      }
      // остальное (table и пр.) — пропускаем на шаге 1
    }
  }
  function inlineChildren(node, dst) {
    for (const n of Array.from(node.childNodes)) {
      if (n.nodeType === 3) { dst.appendChild(hdoc.createTextNode(n.textContent)); continue; }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName.split(":").pop().toLowerCase();
      if (tag === "image") {
        const h = hrefOf(n);
        if (h && binaries[h]) { const img = hdoc.createElement("img"); img.setAttribute("src", binaries[h]); dst.appendChild(img); }
        continue;
      }
      const map = { "strong": "strong", "emphasis": "em", "strikethrough": "s", "sub": "sub", "sup": "sup", "code": "code" };
      const htmlTag = map[tag];
      if (htmlTag) { const el = hdoc.createElement(htmlTag); inlineChildren(n, el); dst.appendChild(el); }
      else if (tag === "a") {
        const href = hrefOf(n);
        const id = href.startsWith("#") ? href.slice(1) : null;
        if (id && notes[id]) {
          // сноска → попап в ридере
          const a = hdoc.createElement("a");
          a.setAttribute("class", "fn"); a.setAttribute("data-fn", id);
          inlineChildren(n, a); dst.appendChild(a);
        } else inlineChildren(n, dst); // обычная ссылка — просто текст
      }
      else inlineChildren(n, dst); // прочие — разворачиваем
    }
  }

  const chapters = [];
  const list = sections.length ? sections : [main];
  list.forEach((sec, i) => {
    const t = first(sec, "title");
    const label = t ? t.textContent.trim().replace(/\s+/g, " ").slice(0, 120)
                    : (sections.length ? "Глава " + (i + 1) : title);
    const div = hdoc.createElement("div");
    nodeToHtml(sec, div);
    const html = div.innerHTML.trim();
    if (html) chapters.push({ label, html });
    if (onProgress) onProgress(i + 1, list.length);
  });
  if (!chapters.length) fail("FB2: не нашли текст");

  // текстовые [N] без <a> → тоже сноски
  const byNum = notesByNum(notes);
  if (Object.keys(byNum).length) for (const ch of chapters) ch.html = linkBracketNotes(ch.html, byNum);

  const toc = chapters.map((c, i) => ({ label: c.label, chapter: i }));
  return { format: "fb2", fileName, title, authors, lang, cover, toc, chapters, notes, annotation, genres };
}

/* ---------- ZIP ---------- */

async function parseZip(u8, fileName, onProgress) {
  const JSZip = global.JSZip;
  if (!JSZip) fail("JSZip не загружен");
  const zip = await JSZip.loadAsync(u8);
  const files = Object.keys(zip.files).filter(n => !zip.files[n].dir);
  const books = files.filter(n => /\.(epub|fb2)$/i.test(n));
  if (!books.length) fail("ZIP: внутри нет .epub или .fb2 (нашли: " + files.slice(0, 5).join(", ") + "…)");
  // самый «книжный» файл: epub в приоритете, иначе первый
  books.sort((a, b) => (/\..epub$/i.test(a) ? 0 : 1) - (/\..epub$/i.test(b) ? 0 : 1));
  const inner = books[0];
  const data = await zip.file(inner).async("uint8array");
  const innerName = inner.split("/").pop();
  if (/\.epub$/i.test(innerName)) return parseEpub(data, innerName, onProgress);
  return parseFb2(data, innerName, onProgress);
}

/* ---------- вход ---------- */

async function parseBook(input, onProgress) {
  // input: File/Blob с .name, либо {name, data:Uint8Array}
  let name, u8;
  if (input && input.data) { name = input.name; u8 = input.data; }
  else {
    name = input.name || "book";
    const buf = await input.arrayBuffer();
    u8 = new Uint8Array(buf);
  }
  if (!u8.length) fail("Пустой файл");
  const ext = extOf(name);
  if (onProgress) onProgress(0, 0, "Читаем файл…");
  if (ext === "epub") return parseEpub(u8, name, onProgress);
  if (ext === "fb2") return parseFb2(u8, name, onProgress);
  if (ext === "zip") return parseZip(u8, name, onProgress);
  // пробуем угадать по содержимому: zip начинается с PK
  if (u8[0] === 0x50 && u8[1] === 0x4B) return parseZip(u8, name + ".zip", onProgress);
  if (/^\s*</.test(fb2Decode(u8.subarray(0, 200)))) {
    const t = fb2Decode(u8.subarray(0, 2000));
    if (/FictionBook/i.test(t)) return parseFb2(u8, name + ".fb2", onProgress);
  }
  fail("Неизвестный формат. Поддерживаются .epub, .fb2, .zip");
}

global.TishinaParser = { parseBook, parseEpub, parseFb2, parseZip, VERSION: 4,
  notesByNum, linkBracketNotes,
  _helpers: { els, textOf, resolvePath, fb2Decode } };

})(typeof window !== "undefined" ? window : global);
