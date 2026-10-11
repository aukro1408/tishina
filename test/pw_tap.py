import json, asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={"width":420,"height":900},
            has_touch=True, is_mobile=True, device_scale_factor=2)
        page = await ctx.new_page()
        # грузим книгу через Shelf-мок: вставляем напрямую в IndexedDB нельзя, поэтому патчим страницу
        await page.goto("http://localhost:8901/index.html")
        # подменяем Shelf.get чтобы вернуть нашу книгу
        book_json = open("/tmp/miz_book.json").read()
        await page.evaluate(f"""() => {{
            window.__miz = {book_json};
            const origGet = Shelf.get.bind(Shelf);
            Shelf.get = async (id) => id === "miz" ? window.__miz : origGet(id);
            Shelf.reparseIfStale = async (b) => b;
        }}""")
        await page.evaluate("() => Reader.open('miz')")
        await page.wait_for_timeout(1500)
        # найти ссылку-сноску
        box = await page.evaluate("""() => {
            const a = document.querySelector('a.fn[data-fn="n_46"]');
            if (!a) return null;
            const r = a.getBoundingClientRect();
            return {x: r.left + r.width/2, y: r.top + r.height/2, w: r.width, h: r.height};
        }""")
        print("link box:", box)
        if not box:
            print("RESULT: NOLINK"); await browser.close(); return
        # листаем к странице со сноской
        await page.evaluate("""() => {
            const a = document.querySelector('a.fn[data-fn="n_46"]');
            const r = a.getBoundingClientRect();
            const pw = document.getElementById("rContent").clientWidth;
            const cur = parseFloat((document.getElementById("rPages").style.transform.match(/-?[\d.]+/)||[0])[0]) || 0;
            const pageIdx = Math.round((r.left - cur) / pw);
            document.getElementById("rPages").style.transform = `translateX(${-pageIdx * pw}px)`;
        }""")
        await page.wait_for_timeout(400)
        box = await page.evaluate("""() => {
            const a = document.querySelector('a.fn[data-fn="n_46"]');
            const r = a.getBoundingClientRect();
            return {x: r.left + r.width/2, y: r.top + r.height/2, w: r.width, h: r.height};
        }""")
        print("link box on page:", box)
        # настоящий тап по центру ссылки
        await page.touchscreen.tap(box["x"], box["y"])
        await page.wait_for_timeout(600)
        opened = await page.evaluate("() => document.getElementById('rNote').classList.contains('open')")
        print("RESULT:", "POPUP_OK" if opened else "POPUP_FAIL")
        # если не открылся — проверить что произошло (панели?)
        panels = await page.evaluate("() => document.getElementById('rTop').classList.contains('gone')")
        print("panels hidden:", panels)
        await browser.close()

asyncio.run(main())
