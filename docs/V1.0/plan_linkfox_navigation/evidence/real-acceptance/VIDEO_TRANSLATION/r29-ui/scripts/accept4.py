import json, hashlib, urllib.request, os, re
from playwright.sync_api import sync_playwright
BASE="http://localhost:3000"; TOOL=BASE+"/tools/ai-video/video-translation"; OUT="/tmp/r29ui/out"
REPO="/Users/mac/Documents/Dev/infinite-canvas"
def w(n,o): json.dump(o, open(f"{OUT}/{n}","w"), ensure_ascii=False, indent=1)

# --- 1) vite ?raw unpack compare ---
ident={"files":{}}
for rel in ["web/src/components/tools/workspaces/video-translation.tsx",
            "web/src/components/tools/workspaces/video-translation-honesty.tsx",
            "web/src/features/tools/adapters/video-translation.ts",
            "web/src/components/tools/workspaces/video.tsx"]:
    url=BASE+"/"+rel.replace("web/","")+"?raw"
    served=urllib.request.urlopen(url, timeout=20).read().decode()
    m=re.match(r'^export default (".*")\s*;?\s*$', served, re.S)
    unpacked=json.loads(m.group(1)) if m else None
    disk=open(os.path.join(REPO,rel),"r",encoding="utf-8").read()
    ident["files"][rel]={"unpacked_equal_disk": (unpacked==disk) if unpacked is not None else False,
        "served_sha":hashlib.sha256((unpacked or served).encode()).hexdigest(),
        "disk_sha":hashlib.sha256(disk.encode()).hexdigest(),
        "len":len(disk), "url":url}
w("10-vite-module-identity.json", ident)

with sync_playwright() as p:
    ctx=p.chromium.launch_persistent_context("/tmp/r29ui/profile", headless=True, viewport={"width":1440,"height":900})
    pg=ctx.pages[0] if ctx.pages else ctx.new_page()
    pg.goto(TOOL, wait_until="networkidle", timeout=90000); pg.wait_for_timeout(1200)
    # contrast via canvas sampling
    def metrics():
        return pg.evaluate("""() => {
          const e=document.querySelector('[data-testid="video-translation-honesty-notice"]');
          const c=getComputedStyle(e); const t=e.querySelector('[data-testid="video-translation-honesty-body"]')||e;
          const ct=getComputedStyle(t);
          const cv=document.createElement('canvas'); cv.width=cv.height=1; const g=cv.getContext('2d');
          const px=(col)=>{g.clearRect(0,0,1,1); g.fillStyle='#000'; g.fillStyle=col; g.fillRect(0,0,1,1); return Array.from(g.getImageData(0,0,1,1).data.slice(0,3));};
          const lum=(rgb)=>{const f=rgb.map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);});return 0.2126*f[0]+0.7152*f[1]+0.0722*f[2];};
          const bg=px(c.backgroundColor), fg=px(ct.color);
          const L1=lum(bg), L2=lum(fg);
          return {bgOklch:c.backgroundColor, fgOklch:ct.color, bgRGB:bg, fgRGB:fg,
                  contrast: +(((Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05)).toFixed(2)),
                  fontSize:ct.fontSize, lineHeight:ct.lineHeight, titleFontSize:getComputedStyle(e.querySelector('[data-testid="video-translation-honesty-title"]')).fontSize};
        }""")
    zh=metrics()
    # switch to EN
    pg.evaluate("() => localStorage.setItem('infinite-canvas:locale','en-US')")
    pg.reload(wait_until="networkidle"); pg.wait_for_timeout(1500)
    en=metrics()
    # chinese residue in EN
    residue=pg.evaluate("""() => {
      const han=/[\\u4e00-\\u9fff]/;
      const out=[];
      const walk=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
      while(walk.nextNode()){
        const n=walk.currentNode; const s=(n.nodeValue||'').trim();
        if(!s||!han.test(s)) continue;
        const el=n.parentElement; if(!el) continue;
        const st=getComputedStyle(el); if(st.display==='none'||st.visibility==='hidden') continue;
        out.push({text:s.slice(0,60), tag:el.tagName, cls:String(el.className).slice(0,60), testid:el.getAttribute('data-testid'),
                  path:(()=>{let p=[],e=el;for(let i=0;i<4&&e;i++){p.unshift(e.tagName.toLowerCase()+(e.getAttribute('data-testid')?'['+e.getAttribute('data-testid')+']':''));e=e.parentElement;}return p.join('>');})()});
      }
      return out;
    }""")
    inputs=pg.evaluate("""() => Array.from(document.querySelectorAll('select')).map(s=>Array.from(s.options).map(o=>o.text))""")
    w("11-en-residue-and-contrast.json", {"zh":zh,"en":en,"residueCount":len(residue),"residue":residue[:40],
        "selectOptionTexts_en":inputs})
    # restore zh
    ctx.close()
print("done4")
