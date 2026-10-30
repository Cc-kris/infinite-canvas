import json
from playwright.sync_api import sync_playwright
BASE="http://localhost:3000"
with sync_playwright() as p:
    ctx=p.chromium.launch_persistent_context("/tmp/r29ui/profile", headless=True, viewport={"width":1440,"height":900})
    pg=ctx.pages[0] if ctx.pages else ctx.new_page()
    log=[]
    for _ in range(6):
        pg.goto(BASE+"/canvas", wait_until="networkidle", timeout=60000); pg.wait_for_timeout(1200)
        arts=pg.locator('article')
        n=arts.count()
        if n==0: log.append("no cards left"); break
        title=(arts.first.inner_text() or "").strip().split("\n")[0]
        log.append(f"deleting {title} (cards={n})")
        arts.first.click(); pg.wait_for_timeout(2500)
        pg.locator('button[aria-label="打开画布菜单"]').first.click(); pg.wait_for_timeout(600)
        pg.locator('.ant-dropdown-menu-item:has-text("删除当前画布")').first.click(); pg.wait_for_timeout(900)
        try:
            pg.locator('.ant-modal-confirm .ant-btn-primary, .ant-modal .ant-btn-dangerous, .ant-modal .ant-btn-primary').first.click(timeout=5000)
        except Exception as e:
            log.append("confirm-fail:"+str(e)[:60])
        pg.wait_for_timeout(1800)
        log.append("now at "+pg.url)
    pg.goto(BASE+"/canvas", wait_until="networkidle", timeout=60000); pg.wait_for_timeout(1000)
    log.append("final cards=%d"%pg.locator('article').count())
    json.dump(log, open("/tmp/r29ui/out/13-canvas-cleanup.json","w"), ensure_ascii=False, indent=1)
    print("\n".join(log))
    ctx.close()
