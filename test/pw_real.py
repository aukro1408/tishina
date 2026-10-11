import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={"width":420,"height":900},
            has_touch=True, is_mobile=True, device_scale_factor=2)
        page = await ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        await page.goto("http://localhost:8901/index.html")
        # книга как после импорта v12: parserV не установлен, notes есть, ссылки уже в HTML
        book_json = open("/tmp/miz_book.json").read()
        await page.evaluate(f"""() => {{
            window.__miz = {book_json};
            delete window.__miz.parserV;  // как после v12
            const origGet = Shelf.get.bind(Shelf);
            Shelf.get = async (id) => id === "miz" ? window.__miz : origGet(id);
            // reparseIfStale НЕ мокаем — настоящий!
            const origPut = Shelf.put.bind(Shelf);
            Shelf.put = async (b) => {{ window.__miz = b; return b; }};
        }}""")
        await page.evaluate("() => Reader.open('miz')")
        await page.wait_for_timeout(1500)
        print("pageerrors:", errs)
        # проверить состояние книги после миграции
        st = await page.evaluate("""() => ({
            parserV: window.__miz.parserV,
            notesN: Object.keys(window.__miz.notes || {}).length,
            hasLink: window.__miz.chapters[0].html.includes('data-fn="n_46"')
        })""")
        print("book state:", st)
        # скрыть панели, перейти к сноске
        await page.touchscreen.tap(210, 450)
        await page.wait_for_timeout(400)
        await page.evaluate("""() => {
            const pg = document.getElementById("rPages");
            const a = document.querySelector('a.fn[data-fn="n_46"]');
            if (!a) { window.__nolink = true; return; }
            const r = a.getBoundingClientRect();
            pg.scrollTo({left: pg.scrollLeft + r.left, behavior: "instant"});
        }""")
        await page.wait_for_timeout(400)
        nolink = await page.evaluate("() => !!window.__nolink")
        print("link in DOM:", not nolink)
        if not nolink:
            box = await page.evaluate("""() => {
                const a = document.querySelector('a.fn[data-fn="n_46"]');
                const r = a.getBoundingClientRect();
                return {x: r.left + r.width/2, y: r.top + r.height/2};
            }""")
            await page.touchscreen.tap(box["x"], box["y"])
            await page.wait_for_timeout(600)
            opened = await page.evaluate("() => document.getElementById('rNote').classList.contains('open')")
            print("popup:", "OPEN" if opened else "CLOSED")
        print("pageerrors after:", errs)
        await browser.close()

asyncio.run(main())
