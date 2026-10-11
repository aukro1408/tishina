import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={"width":420,"height":900},
            has_touch=True, is_mobile=True, device_scale_factor=2)
        page = await ctx.new_page()
        await page.goto("http://localhost:8901/index.html")
        book_json = open("/tmp/miz_book.json").read()
        await page.evaluate(f"""() => {{
            window.__miz = {book_json};
            const origGet = Shelf.get.bind(Shelf);
            Shelf.get = async (id) => id === "miz" ? window.__miz : origGet(id);
            Shelf.reparseIfStale = async (b) => b;
        }}""")
        await page.evaluate("() => Reader.open('miz')")
        await page.wait_for_timeout(1200)
        # скрыть панели
        await page.touchscreen.tap(210, 450)
        await page.wait_for_timeout(400)
        # перейти к странице сноски через scrollLeft (как делает ридер)
        await page.evaluate("""() => {
            const pg = document.getElementById("rPages");
            const a = document.querySelector('a.fn[data-fn="n_46"]');
            const r = a.getBoundingClientRect();
            // scrollLeft такой, чтобы колонка со сноской была видима
            const target = pg.scrollLeft + r.left;
            pg.scrollTo({left: target, behavior: "instant"});
        }""")
        await page.wait_for_timeout(400)
        box = await page.evaluate("""() => {
            const a = document.querySelector('a.fn[data-fn="n_46"]');
            const r = a.getBoundingClientRect();
            return {x: r.left + r.width/2, y: r.top + r.height/2, w: Math.round(r.width), h: Math.round(r.height)};
        }""")
        print("link:", box)
        hit = await page.evaluate(f"""() => {{
            const el = document.elementFromPoint({box['x']}, {box['y']});
            return el ? el.tagName + "." + el.className : "null";
        }}""")
        print("elementFromPoint:", hit)
        await page.touchscreen.tap(box["x"], box["y"])
        await page.wait_for_timeout(600)
        opened = await page.evaluate("() => document.getElementById('rNote').classList.contains('open')")
        print("popup:", "OPEN" if opened else "CLOSED")
        if opened:
            txt = await page.evaluate("() => document.getElementById('rNoteText').textContent.slice(0, 60)")
            print("note text:", txt)
        await browser.close()

asyncio.run(main())
