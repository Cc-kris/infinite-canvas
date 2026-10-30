import json, time
from playwright.sync_api import sync_playwright

BASE="http://localhost:3000"
TOOL=BASE+"/tools/ai-video/video-translation"
OUT="/tmp/r29ui/out"

def js(pg, code):
    return pg.evaluate(code)

def rect(e):
    return {"x": round(e["x"],1), "y": round(e["y"],1), "w": round(e["width"],1), "h": round(e["height"],1)}

console_errs=[]
page_errs=[]
reqs=[]

with sync_playwright() as p:
    ctx=p.chromium.launch_persistent_context("/tmp/r29ui/profile", headless=True, viewport={"width":1440,"height":900})
    pg=ctx.pages[0] if ctx.pages else ctx.new_page()
    pg.on("console", lambda m: console_errs.append({"type":m.type,"text":m.text[:300]}) if m.type in ("error","warning") else None)
    pg.on("pageerror", lambda e: page_errs.append(str(e)[:300]))
    pg.on("request", lambda r: reqs.append({"m":r.method,"u":r.url[:200]}))

    pg.goto(TOOL, wait_until="networkidle", timeout=90000)
    pg.wait_for_timeout(900)

    # ---------------- C1 notice ----------------
    c1={}
    c1["count"]=pg.locator('[data-testid="video-translation-honesty-notice"]').count()
    if c1["count"]:
        n=pg.locator('[data-testid="video-translation-honesty-notice"]').first
        box=n.bounding_box()
        c1["rect"]=rect(box)
        c1["aria"]=js(pg, """() => {const e=document.querySelector('[data-testid="video-translation-honesty-notice"]');const c=getComputedStyle(e);return {role:e.getAttribute('role'),ariaLive:e.getAttribute('aria-live'),tag:e.tagName,bg:c.backgroundColor,color:c.color,border:c.borderColor,pos:c.position,display:c.display,vis:c.visibility,op:c.opacity,fontSize:c.fontSize};}""")
        c1["text"]=n.inner_text()
        c1["children"]=js(pg, """() => {const e=document.querySelector('[data-testid="video-translation-honesty-notice"]');return Array.from(e.querySelectorAll('*')).map(x=>({tag:x.tagName,testid:x.getAttribute('data-testid'),role:x.getAttribute('role'),text:(x.innerText||'').trim().slice(0,60)}));}""")
        c1["buttonsInside"]=js(pg, """() => {const e=document.querySelector('[data-testid="video-translation-honesty-notice"]');return e.querySelectorAll('button,[role=button]').length;}""")
        c1["visible"]=n.is_visible()
        # viewport intersection at top
        c1["inViewport"]=js(pg, """() => {const r=document.querySelector('[data-testid="video-translation-honesty-notice"]').getBoundingClientRect();return {top:r.top,bottom:r.bottom,vh:innerHeight,fully:(r.top>=0&&r.bottom<=innerHeight)};}""")
    # subtitle / header texts
    c1["draftBadge"]=js(pg, """() => {const e=document.querySelector('[data-testid="video-translation-draft-badge"]');if(!e)return null;const r=e.getBoundingClientRect();const c=getComputedStyle(e);return {text:e.innerText.trim(),rect:{x:r.x,y:r.y,w:r.width,h:r.height},bg:c.backgroundColor,color:c.color,fontSize:c.fontSize};}""")
    c1["header"]=js(pg, """() => {const h=document.querySelector('h1');return h?{text:h.innerText.trim(),next:(h.parentElement||{}).innerText.slice(0,300)}:null;}""")
    json.dump(c1, open(OUT+"/01-notice-desktop.json","w"), ensure_ascii=False, indent=1)

    # ---------------- C2 subtitle experiment ----------------
    c2=js(pg, """() => {
      const t=document.body.innerText;
      const m=t.split('\\n').map(s=>s.trim()).filter(Boolean);
      return {lines:m.filter(s=>s.includes('实验')||s.includes('非逐句')||s.includes('重生成')||s.includes('口型')).slice(0,15)};
    }""")
    json.dump(c2, open(OUT+"/02-subtitle-desktop.json","w"), ensure_ascii=False, indent=1)

    # ---------------- C3 language labels + prompt-only ----------------
    c3={}
    c3["selects"]=js(pg, """() => Array.from(document.querySelectorAll('select')).map((s,i)=>({i,id:s.id,value:s.value,aria:s.getAttribute('aria-label'),label:(s.closest('label')?s.closest('label').innerText.replace(/\\n/g,' | '):'').slice(0,120),opts:Array.from(s.options).map(o=>o.value)}))""")
    c3["hints"]=js(pg, """() => Array.from(document.querySelectorAll('[data-testid]')).map(e=>({id:e.getAttribute('data-testid'),text:(e.innerText||'').trim().slice(0,160),tag:e.tagName}))""")
    # prompt composition via live module (Vite dev, same code the page runs)
    c3["prompts"]=js(pg, """async () => {
      const reg = await import('/src/features/tools/registry/video-translation.ts');
      const ad = await import('/src/features/tools/adapters/video-translation.ts');
      const base = reg.createVideoTranslationValues({sourceLanguage:'auto', targetLanguage:'en'});
      const p1 = ad.composeVideoTranslationPrompt(base);
      const p2 = ad.composeVideoTranslationPrompt({...base, sourceLanguage:'zh'});
      const p3 = ad.composeVideoTranslationPrompt({...base, targetLanguage:'ja'});
      const fields = ad.buildVideoTranslationFields({...base, targetLanguage:'ja'}, {name:'demo.mp4', url:'blob:demo'});
      return {keys:Object.keys(p1), en:p1, zhSrc:p2, jaTgt:p3, fields, audit: ad.auditVideoTranslationFields(fields)};
    }""")
    # network during language switch
    reqs.clear()
    src_sel = pg.locator("select").nth(0)
    src_sel.select_option("zh"); pg.wait_for_timeout(400)
    tgt_sel = pg.locator("select").nth(1)
    tgt_sel.select_option("ja"); pg.wait_for_timeout(700)
    pg.locator("select").nth(1).select_option("en"); pg.wait_for_timeout(400)
    c3["requestsDuringLanguageChange"]=[r for r in reqs if "/@vite" not in r["u"] and "/node_modules/" not in r["u"] and not r["u"].endswith((".ts",".tsx",".css",".js",".map"))]
    c3["selectValuesAfter"]=js(pg, """() => Array.from(document.querySelectorAll('select')).map(s=>s.value)""")
    c3["snapshotTextAfter"]=js(pg, """() => {const e=document.querySelector('[data-testid="video-translation-input-snapshot"], [data-testid*="snapshot"]');return e?e.innerText.trim().slice(0,600):null;}""")
    json.dump(c3, open(OUT+"/03-language-desktop.json","w"), ensure_ascii=False, indent=1)

    # ---------------- C4 lipSync switch ----------------
    c4={}
    sw=pg.locator('[role="switch"]').first
    c4["count"]=pg.locator('[role="switch"]').count()
    c4["before"]=js(pg, """() => {const s=document.querySelector('[role=switch]');const c=getComputedStyle(s);const r=s.getBoundingClientRect();return {ariaChecked:s.getAttribute('aria-checked'),ariaDisabled:s.getAttribute('aria-disabled'),disabled:s.disabled===true,tabIndex:s.tabIndex,cursor:c.cursor,opacity:c.opacity,pointerEvents:c.pointerEvents,rect:{x:r.x,y:r.y,w:r.width,h:r.height},outline:c.outlineStyle,text:(s.parentElement||s).innerText.trim().slice(0,200)};}""")
    try:
        sw.click(timeout=3000, force=True)
        c4["clickError"]=None
    except Exception as e:
        c4["clickError"]=str(e)[:200]
    pg.wait_for_timeout(400)
    c4["after"]=js(pg, """() => {const s=document.querySelector('[role=switch]');return {ariaChecked:s.getAttribute('aria-checked'),ariaDisabled:s.getAttribute('aria-disabled'),disabled:s.disabled===true,checkedProp:s.checked===true};}""")
    c4["blockerAfterClick"]=js(pg, """() => {const e=document.querySelector('[data-testid="video-translation-capability-blocker"]');return e?e.innerText.trim():null;}""")
    json.dump(c4, open(OUT+"/04-lipsync-desktop.json","w"), ensure_ascii=False, indent=1)

    # ---------------- C5 outputNum ----------------
    c5={}
    out_sel = pg.locator("label:has-text('输出数量') select").first
    c5["options"]=js(pg, """() => {const s=Array.from(document.querySelectorAll('select')).find(x=>x.closest('label')&&x.closest('label').innerText.includes('输出数量'));return {value:s.value,opts:Array.from(s.options).map(o=>({v:o.value,t:o.text}))};}""")
    c5["hint"]=js(pg, """() => {const e=document.querySelector('[data-testid="video-translation-output-hint"]');return e?e.innerText.trim():null;}""")
    out_sel.select_option("2"); pg.wait_for_timeout(500)
    c5["afterSelect2"]=js(pg, """() => {const s=Array.from(document.querySelectorAll('select')).find(x=>x.closest('label')&&x.closest('label').innerText.includes('输出数量'));const b=document.querySelector('[data-testid="video-translation-capability-blocker"]');const submit=Array.from(document.querySelectorAll('button')).find(x=>/生成|提交|开始/.test(x.innerText));return {value:s.value,blocker:b?b.innerText.trim():null,submit:{text:submit?submit.innerText.trim():null,disabled:submit?submit.disabled:null}};}""")
    out_sel.select_option("4"); pg.wait_for_timeout(300)
    c5["afterSelect4"]=js(pg, """() => {const s=Array.from(document.querySelectorAll('select')).find(x=>x.closest('label')&&x.closest('label').innerText.includes('输出数量'));const b=document.querySelector('[data-testid="video-translation-capability-blocker"]');return {value:s.value,blocker:b?b.innerText.trim():null};}""")
    out_sel.select_option("1"); pg.wait_for_timeout(300)
    c5["afterBackTo1"]=js(pg, """() => {const s=Array.from(document.querySelectorAll('select')).find(x=>x.closest('label')&&x.closest('label').innerText.includes('输出数量'));const b=document.querySelector('[data-testid="video-translation-capability-blocker"]');return {value:s.value,blocker:b?b.innerText.trim():null};}""")
    json.dump(c5, open(OUT+"/05-outputnum-desktop.json","w"), ensure_ascii=False, indent=1)

    # ---------------- C6 badges + forbidden copy ----------------
    c6={}
    c6["badges"]=js(pg, """() => Array.from(document.querySelectorAll('[data-testid="video-translation-draft-badge"],[data-testid="video-translation-result-badge"]')).map(e=>{const r=e.getBoundingClientRect();const c=getComputedStyle(e);return {id:e.getAttribute('data-testid'),text:e.innerText.trim(),rect:{x:r.x,y:r.y,w:r.width,h:r.height},bg:c.backgroundColor,color:c.color,border:c.borderColor,fontSize:c.fontSize};})""")
    c6["resultArea"]=js(pg, """() => {const t=document.body.innerText;const i=t.indexOf('结果');return t.slice(i, i+600);}""")
    c6["historyArea"]=js(pg, """() => {const t=document.body.innerText;const i=t.indexOf('历史记录');return i>=0?t.slice(i,i+500):null;}""")
    c6["forbidden_zh"]=js(pg, """() => {const pats=['翻译完成','已译制','已对口型','已生成字幕','已识别源语言','专业翻译','准确翻译'];const t=document.body.innerText;return pats.map(p=>({p,hit:t.includes(p)}));}""")
    json.dump(c6, open(OUT+"/06-badges-desktop.json","w"), ensure_ascii=False, indent=1)

    # ---------------- C7 locale switch ----------------
    c7={}
    def snap(locale_tag):
        return js(pg, """() => {
          const t=document.body.innerText;
          return {locale:localStorage.getItem('infinite-canvas:locale'),
                  htmlLang:document.documentElement.lang,
                  hasUndefined:/\\bundefined\\b/.test(t),
                  rawKeyMatches:(t.match(/\\b(?:videoTranslation|translation|tool)\\.[a-zA-Z][a-zA-Z0-9_.]{2,}/g)||[]).slice(0,10),
                  notice:(document.querySelector('[data-testid="video-translation-honesty-notice"]')||{innerText:''}).innerText.trim().slice(0,400),
                  badge:(document.querySelector('[data-testid="video-translation-draft-badge"]')||{innerText:''}).innerText.trim(),
                  resultTitle:(Array.from(document.querySelectorAll('*')).find(e=>/result|Result/.test(e.getAttribute&&e.getAttribute('data-testid')||''))||{innerText:''}).innerText,
                  head:t.slice(0,500)};}""")
    c7["before"]=snap("zh")
    pg.locator('button[aria-label*="English"], button[aria-label*="中文"], button:has-text("中")').first.click()
    pg.wait_for_timeout(900)
    c7["afterEnglish"]=snap("en")
    c7["enBody"]=js(pg, """() => document.body.innerText.slice(0,3000)""")
    pg.locator('button[aria-label*="中文"], button[aria-label*="Chinese"], button:has-text("EN")').first.click()
    pg.wait_for_timeout(900)
    c7["afterChinese"]=snap("zh")
    # i18n key parity by module
    c7["keyDiff"]=js(pg, """async () => {
      const zh=(await import('/src/i18n/locales/zh-CN.ts')).default;
      const en=(await import('/src/i18n/locales/en-US.ts')).default;
      const flat=(o,p='',acc=[])=>{for(const k of Object.keys(o)){const v=o[k];const np=p?p+'.'+k:k;if(v&&typeof v==='object')flat(v,np,acc);else acc.push(np);}return acc;};
      const zk=new Set(flat(zh)), ek=new Set(flat(en));
      const vtZh=flat(zh.videoTranslation||{},'videoTranslation');
      const vtEn=flat(en.videoTranslation||{},'videoTranslation');
      return {zhCount:zk.size,enCount:ek.size,missingInEn:[...zk].filter(k=>!ek.has(k)).slice(0,20),missingInZh:[...ek].filter(k=>!zk.has(k)).slice(0,20),
              vtZhCount:vtZh.length,vtEnCount:vtEn.length,vtMissingInEn:vtZh.filter(k=>!vtEn.includes(k)),vtMissingInZh:vtEn.filter(k=>!vtZh.includes(k))};
    }""")
    c7["consoleErrors"]=console_errs[-10:]
    json.dump(c7, open(OUT+"/07-locale-desktop.json","w"), ensure_ascii=False, indent=1)

    json.dump({"console":console_errs,"pageErrors":page_errs}, open(OUT+"/99-console-desktop.json","w"), ensure_ascii=False, indent=1)
    ctx.close()
print("desktop done")
