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
        await page.touchscreen.tap(210, 450)
        await page.wait_for_timeout(400)
        await page.evaluate("""() => {
            const pg = document.getElementById("rPages");
            const a = document.querySelector('a.fn[data-fn="n_46"]');
            const r = a.getBoundingClientRect();
            pg.scrollTo({left: pg.scrollLeft + r.left, behavior: "instant"});
        }""")
        await page.wait_for_timeout(400)
        # тап на 20px левее центра ссылки (в зоне псевдо-элемента)
        box = await page.evaluate("""() => {
            const a = document.querySelector('a.fn[data-fn="n_46"]');
            const r = a.getBoundingClientRect();
            return {x: r.left + r.width/2 - 20, y: r.top + r.height/2};
        }""")
        print("tap at:", {k: round(v,1) for k,v in box.items()})
        await page.touchscreen.tap(box["x"], box["y"])
        await page.wait_for_timeout(600)
        opened = await page.evaluate("() => document.getElementById('rNote').classList.contains('open')")
        print("popup (tap 20px left):", "OPEN" if opened else "CLOSED")
        await browser.close()

asyncio.run(main())
