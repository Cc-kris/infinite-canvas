import json, hashlib, urllib.request, os
from playwright.sync_api import sync_playwright
BASE="http://localhost:3000"; TOOL=BASE+"/tools/ai-video/video-translation"; OUT="/tmp/r29ui/out"
REPO="/Users/mac/Documents/Dev/infinite-canvas"
console=[]; pageerrs=[]; failed=[]
def w(n,o): json.dump(o, open(f"{OUT}/{n}","w"), ensure_ascii=False, indent=1)

# ---- vite raw identity ----
vid={"files":{}}
for rel in ["web/src/components/tools/workspaces/video-translation.tsx",
            "web/src/components/tools/workspaces/video-translation-honesty.tsx",
            "web/src/features/tools/adapters/video-translation.ts"]:
    url=BASE+"/"+rel.replace("web/","")+"?raw"
    try:
        served=urllib.request.urlopen(url, timeout=20).read()
    except Exception as e:
        vid["files"][rel]={"error":str(e)[:120]}; continue
    disk=open(os.path.join(REPO,rel),"rb").read()
    vid["files"][rel]={"served_sha":hashlib.sha256(served).hexdigest(),
                       "disk_sha":hashlib.sha256(disk).hexdigest(),
                       "equal":served==disk, "served_len":len(served), "disk_len":len(disk),
                       "url":url}
w("10-vite-module-identity.json", vid)

with sync_playwright() as p:
    ctx=p.chromium.launch_persistent_context("/tmp/r29ui/profile", headless=True, viewport={"width":1440,"height":900})
    pg=ctx.pages[0] if ctx.pages else ctx.new_page()
    pg.on("console", lambda m: console.append({"t":m.type,"x":m.text[:180]}) if m.type in ("error","warning") else None)
    pg.on("pageerror", lambda e: pageerrs.append(str(e)[:180]))
    pg.on("requestfailed", lambda r: failed.append({"u":r.url[:160],"err":str(r.failure)[:80]}))
    def state():
        return pg.evaluate("""() => ({
          url:location.href,
          nodeIds:Array.from(document.querySelectorAll('[data-node-id]')).map(e=>e.getAttribute('data-node-id')),
          nodeCount:document.querySelectorAll('[data-node-id]').length,
          stage: (()=>{const e=document.querySelector('[style*="transform"]');return null;})(),
          title:(document.title||''),
          leftPanel:(document.body.innerText||'').slice(0,120)
        })""")
    c8={"steps":[]}
    pg.goto(BASE+"/canvas", wait_until="networkidle", timeout=90000); pg.wait_for_timeout(1200)
    # reuse existing test canvas "无限画布 3" if present, else create
    card=pg.locator('article', has_text="无限画布 3").first
    if card.count()==0:
        pg.get_by_role("button", name="新建画布").first.click(); pg.wait_for_timeout(3000)
    else:
        card.click(); pg.wait_for_timeout(3000)
    project_url=pg.url; c8["projectUrl"]=project_url
    c8["titleTag"]=pg.title()
    if pg.locator('[data-node-id]').count()==0:
        pg.locator('[data-canvas-bottom-toolbar] button[aria-label="文本"]').first.click(); pg.wait_for_timeout(2000)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(800)
    c8["s0"]=state(); c8["bookmarkTitle"]=pg.evaluate("()=>{const m=document.body.innerText;const i=m.indexOf('无限画布');return m.slice(0,0);}")
    # leave canvas via canvas menu -> 我的画布
    pg.locator('button[aria-label="打开画布菜单"]').first.click(); pg.wait_for_timeout(700)
    pg.locator('.ant-dropdown-menu-item:has-text("我的画布")').first.click(); pg.wait_for_timeout(2500)
    c8["afterMenuToLibrary"]=state()
    # top-nav tool entry: AI视频 -> 视频翻译
    pg.locator('a[href="/tools/ai-video"]').first.click(); pg.wait_for_timeout(2200)
    c8["aiVideoUrl"]=pg.url
    pg.locator('a[href="/tools/ai-video/video-translation"]').first.click(); pg.wait_for_timeout(2500)
    c8["toolUrl"]=pg.url
    c8["toolNoticeCount"]=pg.locator('[data-testid="video-translation-honesty-notice"]').count()
    # return via nav 我的画布 then reopen project card
    pg.locator('a[href="/canvas"]').first.click(); pg.wait_for_timeout(2500)
    c8["backLibraryUrl"]=pg.url
    pg.locator('article').first.click(); pg.wait_for_timeout(3000)
    c8["s1AfterReturn"]=state(); c8["reopenedUrl"]=pg.url
    # browser back chain from tool page
    pg.locator('button[aria-label="打开画布菜单"]').first.click(); pg.wait_for_timeout(600)
    pg.locator('.ant-dropdown-menu-item:has-text("我的画布")').first.click(); pg.wait_for_timeout(2000)
    pg.locator('a[href="/tools/ai-video"]').first.click(); pg.wait_for_timeout(1500)
    pg.locator('a[href="/tools/ai-video/video-translation"]').first.click(); pg.wait_for_timeout(2000)
    pg.go_back(); pg.wait_for_timeout(1500); c8["goBack1"]=pg.url
    pg.go_back(); pg.wait_for_timeout(2000); c8["goBack2"]=pg.url
    pg.goto(project_url, wait_until="networkidle", timeout=60000); pg.wait_for_timeout(2500)
    c8["s2AfterBrowserBack"]=state()
    c8["nodePreserved"]=c8["s2AfterBrowserBack"]["nodeIds"]==c8["s0"]["nodeIds"] and len(c8["s0"]["nodeIds"])>0
    c8["consoleTail"]=console[-8:]
    w("08-canvas-roundtrip.json", c8)
    w("98-network-desktop.json", {"failed":failed[:20]})

    # ---------- mobile ----------
    m=ctx.new_page(); m.set_viewport_size({"width":390,"height":844})
    m.goto(TOOL, wait_until="networkidle", timeout=90000); m.wait_for_timeout(1500)
    c9={}
    c9["metrics"]=m.evaluate("""() => ({innerWidth:innerWidth, docScrollWidth:document.documentElement.scrollWidth, bodyScrollWidth:document.body.scrollWidth, hasHScroll:document.documentElement.scrollWidth>innerWidth+1, dpr:devicePixelRatio})""")
    c9["overflowing"]=m.evaluate("""() => Array.from(document.querySelectorAll('main *')).filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.right>innerWidth+1;}).slice(0,12).map(e=>({tag:e.tagName,cls:String(e.className).slice(0,50),testid:e.getAttribute('data-testid'),right:Math.round(e.getBoundingClientRect().right)}))""")
    c9["notice"]=m.evaluate("""() => {const e=document.querySelector('[data-testid="video-translation-honesty-notice"]');const r=e.getBoundingClientRect();const c=getComputedStyle(e);const b=e.querySelector('[data-testid="video-translation-honesty-body"]');return {rect:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)},fontSize:c.fontSize,color:c.color,bg:c.backgroundColor,bodyFont:b?getComputedStyle(b).fontSize:null,bodyRight:b?Math.round(b.getBoundingClientRect().right):null,clippedX:e.scrollWidth>e.clientWidth+1,clippedY:e.scrollHeight>e.clientHeight+1,fullyInViewport:r.left>=0&&r.right<=innerWidth};}""")
    c9["switch"]=m.evaluate("""() => {const s=document.querySelector('[role=switch]');const r=s.getBoundingClientRect();return {rect:{x:Math.round(r.x),w:Math.round(r.width),h:Math.round(r.height),right:Math.round(r.right)},ariaChecked:s.getAttribute('aria-checked'),disabled:s.disabled===true};}""")
    c9["selects"]=m.evaluate("""() => Array.from(document.querySelectorAll('select')).map(s=>{const r=s.getBoundingClientRect();return {w:Math.round(r.width),right:Math.round(r.right),val:s.value};})""")
    c9["forbiddenEn"]=m.evaluate("""() => {const t=document.body.innerText.toLowerCase();return ['translation complete','dubbed','lip-synced','subtitles generated','source language detected'].map(p=>({p,hit:t.includes(p)}));}""")
    c9["bodySnippet"]=m.evaluate("""() => document.body.innerText.slice(0,900)""")
    w("09-mobile.json", c9)
    ctx.close()
print("done3")
