import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={"width":420,"height":900},
            has_touch=True, is_mobile=True, device_scale_factor=2)
        page = await ctx.new_page()
        # как в ридере: колонки + трансформ
        await page.set_content("""
        <style>
        a.fn{color:#2f7cf6;text-decoration:none;display:inline-block;
          font-size:.75em;vertical-align:super;line-height:1;cursor:pointer;
          padding:12px 10px;margin:-12px -10px}
        body{margin:0;font-size:18px}
        #c{position:absolute;inset:0;overflow:hidden}
        #pg{column-width:420px;column-fill:auto;height:100%;column-gap:0}
        p{margin:0 0 1em}
        </style>
        <div id="c"><div id="pg">
        """ + "<p>Текст абзаца. " * 5 + 'Словарь Уэбстера<a class="fn" data-fn="n_46">[46]</a>.' + "</p>" + "<p>Ещё текст. " * 40 + "</p>" + """
        </div></div>
        <script>
        window.__hit = null;
        document.addEventListener("click", e => {
          window.__hit = e.target.tagName + "." + e.target.className;
        });
        </script>
        """)
        await page.wait_for_timeout(500)
        # перейти к колонке со сноской
        for idx in range(0, 10):
            await page.evaluate(f"() => document.getElementById('pg').style.transform = `translateX(${-idx * 420}px)`")
            await page.wait_for_timeout(150)
            bx = await page.evaluate('''() => document.querySelector("a.fn").getBoundingClientRect().left''')
            if 0 < bx < 420:
                print("found at page", idx)
                break
        await page.wait_for_timeout(400)
        box = await page.evaluate("""() => {
            const a = document.querySelector("a.fn");
            const r = a.getBoundingClientRect();
            return {x: r.left + r.width/2, y: r.top + r.height/2, w: r.width, h: r.height};
        }""")
        print("link rect:", {k: round(v,1) for k,v in box.items()})
        hit = await page.evaluate(f"""() => {{
            const el = document.elementFromPoint({box['x']}, {box['y']});
            return el ? el.tagName + "." + el.className : "null";
        }}""")
        print("elementFromPoint:", hit)
        await page.touchscreen.tap(box["x"], box["y"])
        await page.wait_for_timeout(400)
        print("click target:", await page.evaluate("() => window.__hit"))
        await browser.close()

asyncio.run(main())
