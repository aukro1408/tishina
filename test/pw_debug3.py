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
            window.__evts = [];
            for (const t of ["touchstart","touchend","click"]) {{
                document.getElementById("rContent").addEventListener(t, e => {{
                    const el = e.target;
                    window.__evts.push(t + " target=" + el.tagName + "." + el.className);
                }}, true);
            }}
        }}""")
        await page.evaluate("() => Reader.open('miz')")
        await page.wait_for_timeout(1200)
        # скрыть панели тапом по центру, затем перейти к странице сноски
        await page.touchscreen.tap(210, 450)
        await page.wait_for_timeout(400)
        st = await page.evaluate("""() => ({
            topGone: document.getElementById("rTop").classList.contains("gone"),
            botGone: document.getElementById("rBottom").classList.contains("gone")
        })""")
        print("panels after tap:", st)
        await page.evaluate("""() => {
            const a = document.querySelector('a.fn[data-fn="n_46"]');
            const r = a.getBoundingClientRect();
            const pw = document.getElementById("rContent").clientWidth;
            const pageIdx = Math.round(r.left / pw);
            document.getElementById("rPages").style.transform = `translateX(${-pageIdx * pw}px)`;
        }""")
        await page.wait_for_timeout(400)
        box = await page.evaluate("""() => {
            const a = document.querySelector('a.fn[data-fn="n_46"]');
            const r = a.getBoundingClientRect();
            return {x: r.left + r.width/2, y: r.top + r.height/2, w: r.width, h: r.height};
        }""")
        print("link pos:", {k: round(v,1) for k,v in box.items()})
        hit = await page.evaluate(f"""() => {{
            const el = document.elementFromPoint({box['x']}, {box['y']});
            return el ? el.tagName + "." + el.className : "null";
        }}""")
        print("elementFromPoint:", hit)
        await page.touchscreen.tap(box["x"], box["y"])
        await page.wait_for_timeout(600)
        print("events:", await page.evaluate("() => window.__evts"))
        print("popup:", "OPEN" if await page.evaluate("() => document.getElementById('rNote').classList.contains('open')") else "CLOSED")
        await browser.close()

asyncio.run(main())
