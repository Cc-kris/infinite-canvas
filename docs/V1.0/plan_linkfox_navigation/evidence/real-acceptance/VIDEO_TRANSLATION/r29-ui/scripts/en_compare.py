import json
from playwright.sync_api import sync_playwright
BASE="http://localhost:3000"
with sync_playwright() as p:
    ctx=p.chromium.launch_persistent_context("/tmp/r29ui/profile", headless=True, viewport={"width":1440,"height":900})
    pg=ctx.pages[0] if ctx.pages else ctx.new_page()
    pg.goto(BASE+"/tools/ai-video/video-translation", wait_until="networkidle", timeout=90000)
    pg.evaluate("() => localStorage.setItem('infinite-canvas:locale','en-US')")
    res={}
    def count(url):
        pg.goto(url, wait_until="networkidle", timeout=90000); pg.wait_for_timeout(1500)
        return pg.evaluate("""() => {
          const han=/[\\u4e00-\\u9fff]/; let zh=0,tot=0;
          const walk=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
          while(walk.nextNode()){const n=walk.currentNode;const s=(n.nodeValue||'').trim();if(!s)continue;
            const el=n.parentElement;if(!el)continue;const st=getComputedStyle(el);if(st.display==='none'||st.visibility==='hidden')continue;
            tot++; if(han.test(s)) zh++;}
          return {zh,tot,ratio:+(zh/Math.max(tot,1)).toFixed(3),htmlLang:document.documentElement.lang};
        }""")
    res["video-translation"]=count(BASE+"/tools/ai-video/video-translation")
    res["image-to-video(existing)"]=count(BASE+"/tools/ai-video/image-to-video")
    res["ecommerce-suite(existing)"]=count(BASE+"/tools/ecommerce-suite")
    pg.evaluate("() => localStorage.setItem('infinite-canvas:locale','zh-CN')")
    json.dump(res, open("/tmp/r29ui/out/12-en-locale-coverage.json","w"), ensure_ascii=False, indent=1)
    print(json.dumps(res,ensure_ascii=False,indent=1))
    ctx.close()
