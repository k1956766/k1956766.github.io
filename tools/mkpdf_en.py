from playwright.sync_api import sync_playwright
import sys
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={"width":1100,"height":900})
    pg.goto(sys.argv[2] if len(sys.argv)>2 else "http://localhost:4000/en/cv/", wait_until="networkidle"); pg.wait_for_timeout(1500)
    pg.emulate_media(media="print")
    pg.pdf(path=sys.argv[1], format="A4", print_background=True, prefer_css_page_size=True,
           display_header_footer=True, header_template="<span></span>",
           footer_template='<div style="width:100%;font-size:8px;color:#8a94a3;padding:0 14mm;display:flex;justify-content:space-between;font-family:sans-serif"><span>Kanghyeok Im · CV · k1956766.github.io</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>')
    b.close()
