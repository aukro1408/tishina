/* nowcard.js — свечение карточки «Читаю сейчас» из цветов обложки + цитата */
(function() {
  const CACHE_KEY = "tishina.nowcard.colors";
  const FALLBACK = ["#a34a3e", "#d9755f", "#c65b4e", "#e8977c"];

  function getCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); } catch (e) { return {}; }
  }
  function setCache(id, colors) {
    try {
      const c = getCache();
      c[id] = colors;
      localStorage.setItem(CACHE_KEY, JSON.stringify(c));
    } catch (e) {}
  }

  // извлекаем до 5 доминирующих цветов из обложки
  function extractColors(img, cb) {
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const W = 48, H = 72;
      canvas.width = W; canvas.height = H;
      ctx.drawImage(img, 0, 0, W, H);
      const data = ctx.getImageData(0, 0, W, H).data;
      const buckets = {};
      for (let i = 0; i < data.length; i += 16) {
        const r = data[i], g = data[i+1], b = data[i+2];
        // пропускаем слишком тёмные и слишком светлые (порог ниже для тёмных обложек)
        const mx = Math.max(r,g,b), mn = Math.min(r,g,b);
        if (mx < 18 || mn > 235) continue;
        // квантуем
        const key = [r>>5, g>>5, b>>5].join(",");
        buckets[key] = buckets[key] || { n: 0, r: 0, g: 0, b: 0 };
        buckets[key].n++;
        buckets[key].r += r; buckets[key].g += g; buckets[key].b += b;
      }
      const sorted = Object.values(buckets).sort((a,b) => b.n - a.n).slice(0, 5);
      if (!sorted.length) return cb(FALLBACK);
      const colors = sorted.map(s => {
        const r = Math.round(s.r/s.n), g = Math.round(s.g/s.n), b = Math.round(s.b/s.n);
        return "#" + [r,g,b].map(v => v.toString(16).padStart(2,"0")).join("");
      });
      // добиваем до 5 fallback-цветами если мало
      while (colors.length < 5) colors.push(FALLBACK[colors.length % FALLBACK.length]);
      cb(colors);
    } catch (e) { cb(FALLBACK); }
  }

  function applyGlow(card, colors) {
    // убираем старый glow
    const old = card.querySelector(".nowcard-glow");
    if (old) old.remove();
    const glow = document.createElement("div");
    glow.className = "nowcard-glow";
    glow.setAttribute("aria-hidden", "true");
    // три пятна из цветов обложки
    const spots = [colors[0], colors[1], colors[2]].map((c, i) => {
      const dur = [11, 14, 17][i];
      const pos = [
        "left:-10%;top:-20%;width:70%;height:80%",
        "right:-15%;top:10%;width:60%;height:70%",
        "left:20%;bottom:-25%;width:80%;height:60%"
      ][i];
      return `<span class="nowcard-spot" style="background:${c};${pos};animation-duration:${dur}s"></span>`;
    }).join("");
    glow.innerHTML = spots + `<span class="nowcard-shade"></span>`;
    card.insertBefore(glow, card.firstChild);
  }

  function applyQuote(card, quote) {
    let q = card.querySelector(".nowcard-quote");
    if (!quote) { if (q) q.remove(); return; }
    if (!q) {
      q = document.createElement("div");
      q.className = "nowcard-quote";
      const info = card.querySelector(".hero-info");
      const author = info && info.querySelector(".hero-author");
      if (author && author.parentNode) {
        author.parentNode.insertBefore(q, author.nextSibling);
      } else if (info) {
        info.appendChild(q);
      } else {
        card.appendChild(q);
      }
    }
    q.innerHTML = `<span class="nowcard-qline"></span><span class="nowcard-qtext">${escapeHtml(quote)}</span>`;
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }

  function enhance() {
    const card = document.querySelector(".hero-card");
    if (!card) return;
    // находим книгу
    let bookId = card.getAttribute("data-open");
    let book = null;
    try {
      if (window.Shelf) {
        const getBooks = (typeof Shelf.all === "function") ? Shelf.all() : [];
        // Shelf.all может быть промисом
        if (getBooks && typeof getBooks.then === "function") {
          getBooks.then(list => {
            const b = (list||[]).find(x => String(x.id) === String(bookId));
            if (b) enhanceWithBook(card, b);
            else enhanceFallback(card);
          });
          return;
        }
        book = (getBooks||[]).find(x => String(x.id) === String(bookId));
      }
    } catch (e) {}
    if (book) enhanceWithBook(card, book);
    else enhanceFallback(card);
  }

  function enhanceFallback(card) {
    // без книги — пробуем цитату из кэша по заголовку
    const title = (card.querySelector(".hero-title")||{}).textContent || "";
    try {
      const qc = JSON.parse(localStorage.getItem("tishina.nowcard.quotes")||"{}");
      if (qc[title]) applyQuote(card, qc[title]);
    } catch (e) {}
    applyGlow(card, FALLBACK);
  }

  function enhanceWithBook(card, book) {
    const id = book.id;
    // цитата
    const quote = book.lastRead && book.lastRead.quote;
    if (quote) {
      applyQuote(card, quote);
      try {
        const qc = JSON.parse(localStorage.getItem("tishina.nowcard.quotes")||"{}");
        qc[book.title] = quote;
        localStorage.setItem("tishina.nowcard.quotes", JSON.stringify(qc));
      } catch (e) {}
    }
    // цвета
    const cached = getCache()[id];
    if (cached) { applyGlow(card, cached); return; }
    const img = card.querySelector(".hero-cover img");
    if (img) {
      const done = () => extractColors(img, colors => {
        setCache(id, colors);
        // проверяем что карточка всё ещё та же книга
        const cur = document.querySelector(".hero-card");
        if (cur === card) applyGlow(card, colors);
      });
      if (img.complete && img.naturalWidth) done();
      else { img.addEventListener("load", done, { once: true }); img.addEventListener("error", () => applyGlow(card, FALLBACK), { once: true }); }
    } else {
      applyGlow(card, FALLBACK);
    }
  }

  // CSS
  const css = `
.nowcard-glow{position:absolute;inset:0;overflow:hidden;border-radius:inherit;pointer-events:none;z-index:0}
.hero-card{position:relative;overflow:hidden}
.hero-card .hero-cover,.hero-card .hero-info{position:relative;z-index:1}
.nowcard-spot{position:absolute;border-radius:50%;filter:blur(38px);opacity:.5;animation:nowcardfloat 14s ease-in-out infinite}
@keyframes nowcardfloat{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(6%,-8%) scale(1.08)}66%{transform:translate(-5%,6%) scale(.94)}}
.nowcard-shade{position:absolute;inset:0;background:linear-gradient(to right,transparent 55%,rgba(20,8,5,.45))}
.nowcard-quote{display:flex;gap:8px;margin:8px 0 10px;align-items:flex-start}
.nowcard-qline{flex:0 0 3px;align-self:stretch;background:#c65b4e;border-radius:2px;opacity:.9}
.nowcard-qtext{font-style:italic;font-family:'Tishina Times',Georgia,serif;font-size:14px;line-height:1.5;color:#b79a8f;opacity:.95}`;
  const st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  // запускаем после отрисовки главной
  function init() { setTimeout(enhance, 400); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
  // пере-применяем при возврате на главную (SPA)
  let lastCard = null;
  setInterval(() => {
    const card = document.querySelector(".hero-card");
    if (card && card !== lastCard) { lastCard = card; setTimeout(enhance, 300); }
    if (!card) lastCard = null;
  }, 1500);
})();
