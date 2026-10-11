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
        await page.wait_for_timeout(1500)
        info = await page.evaluate("""() => {
            const top = document.getElementById("rTop");
            const a = document.querySelector('a.fn[data-fn="n_46"]');
            const r = a.getBoundingClientRect();
            const rt = top.getBoundingClientRect();
            return {
                topGone: top.classList.contains("gone"),
                topRect: {y: Math.round(rt.top), h: Math.round(rt.height), bottom: Math.round(rt.bottom)},
                linkRect: {x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height)},
                contentH: document.getElementById("rContent").clientHeight
            };
        }""")
        print("info:", info)
        await browser.close()

asyncio.run(main())
