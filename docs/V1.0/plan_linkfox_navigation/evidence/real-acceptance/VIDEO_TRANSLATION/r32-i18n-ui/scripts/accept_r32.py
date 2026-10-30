# -*- coding: utf-8 -*-
"""r32 EN/ZH i18n real-browser acceptance for VIDEO_TRANSLATION.
Read-only: no upload, no generation, no key access, no source edits."""
import json, os, sys, hashlib, subprocess, urllib.request, re
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3000"
REPO = "/Users/mac/Documents/Dev/infinite-canvas"
OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/r32/out"
PIN = sys.argv[2] if len(sys.argv) > 2 else subprocess.check_output(["git","-C",REPO,"rev-parse","HEAD"]).decode().strip()
os.makedirs(OUT, exist_ok=True)

COLLECT_JS = r"""
() => {
  const han = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
  const vis = (el) => { const s = getComputedStyle(el); const r = el.getBoundingClientRect();
    return s.display!=='none' && s.visibility!=='hidden' && +s.opacity>0 && (r.width>0||r.height>0); };
  const regionOf = (el) => {
    let e = el;
    while (e && e !== document.body) {
      const tid = e.getAttribute && e.getAttribute('data-testid');
      if (tid) return tid;
      if (e.tagName === 'H1') return 'h1';
      if (e.tagName === 'HEADER') return 'header';
      if (e.tagName === 'ASIDE') return 'aside';
      e = e.parentElement;
    }
    return 'body';
  };
  const box = (sel) => {
    const e = document.querySelector(sel);
    if (!e) return null;
    const r = e.getBoundingClientRect(), c = getComputedStyle(e);
    return { testid: sel, exists: true, text: (e.innerText||'').trim().slice(0,1200),
      rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      visible: vis(e), fontSize: c.fontSize, lineHeight: c.lineHeight, color: c.color, bg: c.backgroundColor };
  };
  const emptyStates = () => {
    const ids = ['tool-result-empty','tool-task-history-empty','video-translation-empty'];
    return ids.map(id => { const e = document.querySelector('[data-testid="'+id+'"]');
      return e ? { id, text: (e.innerText||'').trim() } : { id, missing: true }; });
  };
  const nodeResidue = () => {
    const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      const n = w.currentNode; const t = (n.nodeValue||'').trim();
      if (!t || !han.test(t)) continue;
      const el = n.parentElement; if (!el || !vis(el)) continue;
      out.push({ text: t.slice(0,140), tag: el.tagName, testid: el.getAttribute('data-testid'),
        region: regionOf(el), inOption: !!el.closest('option'),
        inSelect: !!el.closest('select'), role: el.getAttribute('role'),
        cls: String(el.className||'').slice(0,80) });
    }
    return out;
  };
  const attrResidue = () => {
    const out = []; const attrs = ['aria-label','title','placeholder','alt','aria-description','aria-valuetext'];
    for (const el of document.querySelectorAll('*')) {
      if (!vis(el)) continue;
      for (const a of attrs) {
        const v = el.getAttribute && el.getAttribute(a);
        if (v && han.test(v)) out.push({ attr: a, value: v.slice(0,120), tag: el.tagName,
          testid: el.getAttribute('data-testid'), region: regionOf(el) });
      }
    }
    return out;
  };
  const options = () => Array.from(document.querySelectorAll('select')).map(s => ({
    id: s.getAttribute('data-testid'), value: s.value,
    options: Array.from(s.options).map(o => ({ text: o.text, value: o.value })) }));
  const controls = () => {
    const q = (sel) => document.querySelector(sel);
    const sw = q('[data-testid="video-translation-lipsync-switch"]');
    const submit = q('[data-testid="video-translation-submit"]');
    const outNum = Array.from(document.querySelectorAll('select')).find(s => /output|count/i.test(s.getAttribute('data-testid')||''));
    const desc = (el) => el ? { ariaChecked: el.getAttribute('aria-checked'), disabled: el.disabled,
      ariaDisabled: el.getAttribute('aria-disabled'), role: el.getAttribute('role'),
      cursor: getComputedStyle(el).cursor, opacity: getComputedStyle(el).opacity,
      text: (el.innerText||'').trim() } : null;
    return { lipsync: desc(sw), submit: submit ? { text: (submit.innerText||'').trim(), disabled: submit.disabled } : null,
      outputSelect: outNum ? { id: outNum.getAttribute('data-testid'), value: outNum.value,
        count: outNum.options.length, texts: Array.from(outNum.options).map(o=>o.text) } : null };
  };
  const blocks = {
    h1: (() => { const e = document.querySelector('h1'); return e ? { text: (e.innerText||'').trim(), rect: (r=>[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)])(e.getBoundingClientRect()) } : null; })(),
    breadcrumb: (() => { const h = document.querySelector('header'); return h ? (h.innerText||'').trim().slice(0,300) : null; })(),
    aside: (() => { const e = document.querySelector('aside'); return e ? (e.innerText||'').trim().slice(0,600) : null; })(),
    notice: box('[data-testid="video-translation-honesty-notice"]'),
    noticeTitle: box('[data-testid="video-translation-honesty-title"]'),
    noticeBody: box('[data-testid="video-translation-honesty-body"]'),
    badge: box('[data-testid="video-translation-capability-badge"]'),
    draftBadge: box('[data-testid="video-translation-draft-badge"]'),
    dropzone: box('[data-testid="tool-asset-dropzone"]'),
    uploadSection: box('[data-testid="video-translation-config"]'),
    language: box('[data-testid="video-translation-language"]'),
    languageBadge: box('[data-testid="video-translation-language-badge"]'),
    languageHint: box('[data-testid="video-translation-language-hint"]'),
    lipsync: box('[data-testid="video-translation-lipsync"]'),
    lipsyncHint: box('[data-testid="video-translation-lipsync-hint"]'),
    outputHint: box('[data-testid="video-translation-output-hint"]'),
    aspectSummary: box('[data-testid="video-translation-aspect-summary"]'),
    aspectNotice: box('[data-testid="video-translation-aspect-notice"]'),
    result: box('[data-testid="tool-result"]'),
    resultEmpty: box('[data-testid="tool-result-empty"]'),
    history: box('[data-testid="video-translation-history"]'),
    historyCount: box('[data-testid="tool-task-history-count"]'),
    historyEmpty: box('[data-testid="tool-task-history-empty"]'),
    historyHint: box('[data-testid="video-translation-history-hint"]'),
    workspace: box('[data-testid="tool-workspace"]')
  };
  return { locale: localStorage.getItem('infinite-canvas:locale'), htmlLang: document.documentElement.lang,
    docTitle: document.title, url: location.href, innerWidth: innerWidth, innerHeight: innerHeight,
    scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight,
    bodyText: document.body.innerText, blocks, emptyStates: emptyStates(), controls: controls(),
    residue: nodeResidue(), attrResidue: attrResidue(), options: options() };
}
"""

def w(name, obj):
    with open(os.path.join(OUT, name), "w") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    print("wrote", name, file=sys.stderr)

def net_console(pg, sink):
    pg.on("request", lambda r: sink.append(("req", r.method, r.url)))
    pg.on("requestfailed", lambda r: sink.append(("failed", r.method, r.url, r.failure)))
    pg.on("console", lambda m: sink.append(("console", m.type, m.text[:200])) if m.type in ("error","warning") else None)
    pg.on("pageerror", lambda e: sink.append(("pageerror", str(e)[:300])))

def shot_snapshot(pg, tag=None):
    return pg.evaluate(COLLECT_JS)

def run_desktop():
    net = []
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context("/tmp/r32/profile-desk", headless=True,
                viewport={"width":1440,"height":900}, locale="en-US")
        pg = ctx.pages[0]; net_console(pg, net)
        # 1) start in zh
        pg.goto(BASE + "/", wait_until="domcontentloaded", timeout=60000)
        pg.evaluate("() => localStorage.setItem('infinite-canvas:locale','zh-CN')")
        pg.goto(BASE + "/tools/ai-video/video-translation", wait_until="networkidle", timeout=90000)
        pg.wait_for_timeout(2000)
        zh = shot_snapshot(pg)
        w("01-zh-desktop.json", zh)
        # 2) switch to EN via real UI control (top-nav locale toggle, aria-label 切换到 English)
        clicked = None
        pre = pg.evaluate("""() => { const b=[...document.querySelectorAll('button')].find(x=>/English/i.test(x.getAttribute('aria-label')||'')); return b?{aria:b.getAttribute('aria-label'), text:(b.innerText||'').trim()}:null; }""")
        try:
            pg.locator("button[aria-label*='English']").first.click()
            clicked = "topnav button[aria-label*=English] %r" % (pre,)
            pg.wait_for_timeout(1800)
        except Exception as e:
            clicked = "switch-failed: %s" % e
        pg.wait_for_timeout(1200)
        en = shot_snapshot(pg)
        en["_switch"] = clicked
        w("02-en-desktop.json", en)
        # 3) switch back to zh via UI
        back = None
        try:
            preb = pg.evaluate("""() => { const b=[...document.querySelectorAll('button')].find(x=>/中文|Chinese/i.test(x.getAttribute('aria-label')||'')); return b?{aria:b.getAttribute('aria-label'), text:(b.innerText||'').trim()}:null; }""")
            pg.locator("button[aria-label*='中文'], button[aria-label*='Chinese']").first.click()
            back = "topnav back %r" % (preb,)
            pg.wait_for_timeout(1800)
        except Exception as e:
            back = "failed: %s" % e
        zh2 = shot_snapshot(pg)
        zh2["_switch"] = back
        w("03-zh-back-desktop.json", zh2)
        # network/console
        w("90-network-console-desktop.json", {"events": net})
        ctx.close()
    return {"zh": zh, "en": en, "zh2": zh2, "net": net}

def run_mobile(vw=375, vh=812):
    res = {}
    net = []
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context("/tmp/r32/profile-mob", headless=True,
                viewport={"width":vw,"height":vh}, locale="en-US", is_mobile=True, has_touch=True,
                device_scale_factor=2)
        pg = ctx.pages[0]; net_console(pg, net)
        pg.goto(BASE + "/", wait_until="domcontentloaded", timeout=60000)
        pg.evaluate("() => localStorage.setItem('infinite-canvas:locale','en-US')")
        pg.goto(BASE + "/tools/ai-video/video-translation", wait_until="networkidle", timeout=90000)
        pg.wait_for_timeout(2500)
        snap = shot_snapshot(pg)
        # overflow scan
        snap["overflow"] = pg.evaluate("""() => {
          const vw = innerWidth; const bad = [];
          for (const el of document.querySelectorAll('body *')) {
            const s = getComputedStyle(el); if (s.display==='none'||s.visibility==='hidden') continue;
            const r = el.getBoundingClientRect();
            if (r.width>0 && (r.right > vw + 1 || r.left < -1)) bad.push({ tag: el.tagName,
              testid: el.getAttribute('data-testid'), left: Math.round(r.left), right: Math.round(r.right),
              w: Math.round(r.width), text: (el.innerText||'').trim().slice(0,50) });
          }
          return { vw, docScrollWidth: document.documentElement.scrollWidth, bad: bad.slice(0,20), badCount: bad.length };
        }""")
        w("04-en-mobile375.json", snap)
        # zh on mobile
        pg.evaluate("() => localStorage.setItem('infinite-canvas:locale','zh-CN')")
        pg.reload(wait_until="networkidle"); pg.wait_for_timeout(2000)
        snapz = shot_snapshot(pg)
        w("05-zh-mobile375.json", snapz)
        w("91-network-console-mobile.json", {"events": net})
        res = {"en": snap, "zh": snapz, "net": net}
        ctx.close()
    return res

def run_nav():
    out = {}
    net = []
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context("/tmp/r32/profile-nav", headless=True,
                viewport={"width":1440,"height":900}, locale="en-US")
        pg = ctx.pages[0]; net_console(pg, net)
        # A. home -> tools listing -> VT entry
        pg.goto(BASE + "/", wait_until="networkidle", timeout=90000); pg.wait_for_timeout(2000)
        out["home"] = pg.evaluate("""() => {
          const links = Array.from(document.querySelectorAll('a[href]')).map(a => ({href: a.getAttribute('href'), text: (a.innerText||'').trim().slice(0,50)}));
          return { url: location.href, title: document.title, h1: (document.querySelector('h1')||{}).innerText,
                   links: links.slice(0,80), linkCount: links.length,
                   hasWorkspace: !!document.querySelector('[data-testid="tool-workspace"]'),
                   bodyTextHead: document.body.innerText.slice(0,800) };
        }""")
        # click "AI Video" nav entry
        try:
            pg.locator("a[href*='/tools/ai-video']").first.click()
            pg.wait_for_load_state("networkidle"); pg.wait_for_timeout(1500)
            out["tools_ai_video"] = pg.evaluate("""() => ({url: location.href, testids: Array.from(document.querySelectorAll('[data-testid]')).map(e=>e.getAttribute('data-testid')).slice(0,40),
              links: Array.from(document.querySelectorAll('a[href*="video-translation"]')).map(a=>({href:a.getAttribute('href'),text:(a.innerText||'').trim()}))})""")
        except Exception as e:
            out["tools_ai_video"] = {"error": str(e)}
        try:
            pg.goto(BASE + "/tools/ai-video", wait_until="networkidle", timeout=60000); pg.wait_for_timeout(1200)
            out["tools_list"] = pg.evaluate("""() => ({url: location.href, h1: (document.querySelector('h1')||{}).innerText,
               entries: Array.from(document.querySelectorAll('a[href*="/tools/ai-video/"]')).map(a=>({href:a.getAttribute('href'),text:(a.innerText||'').trim()})).slice(0,30)})""")
            # click VT entry from list
            pg.locator("a[href*='/tools/ai-video/video-translation']").first.click()
            pg.wait_for_load_state("networkidle"); pg.wait_for_timeout(1500)
            out["entry_from_list"] = pg.evaluate("""() => ({url: location.href, h1: (document.querySelector('h1')||{}).innerText,
               notice: (document.querySelector('[data-testid="video-translation-honesty-notice"]')||{}).innerText,
               workspace: !!document.querySelector('[data-testid="tool-workspace"]')})""")
        except Exception as e:
            out["entry_from_list"] = {"error": str(e)}
        # B. canvas entry
        pg.goto(BASE + "/canvas", wait_until="networkidle", timeout=90000); pg.wait_for_timeout(2500)
        out["canvas"] = pg.evaluate("""() => {
          const links = Array.from(document.querySelectorAll('a[href]')).map(a => ({href: a.getAttribute('href'), text: (a.innerText||'').trim().slice(0,40)}));
          return { url: location.href, title: document.title, hasCanvas: !!document.querySelector('canvas, [data-testid*="canvas"], .react-flow'),
            testids: Array.from(document.querySelectorAll('[data-testid]')).map(e=>e.getAttribute('data-testid')).slice(0,40),
            links: links.slice(0,60), bodyTextHead: document.body.innerText.slice(0,600) };
        }""")
        w("06-navigation.json", out)
        w("92-network-console-nav.json", {"events": net})
        ctx.close()
    return out

def source_identity():
    """Compare Vite-served module sourcesContent sha256 with git blob at PIN."""
    mods = [
        "web/src/components/tools/workspaces/video-translation.tsx",
        "web/src/components/tools/workspaces/video-translation-honesty.tsx",
        "web/src/components/tools/tool-asset-input.tsx",
        "web/src/components/tools/tool-task-history.tsx",
        "web/src/components/tools/tool-shell.tsx",
        "web/src/i18n/locales/en-US.ts",
        "web/src/i18n/locales/zh-CN.ts",
        "web/src/features/tools/adapters/video-translation.ts",
    ]
    res = {"pin": PIN, "modules": {}}
    for rel in mods:
        url = BASE + "/" + rel[len("web/"):]
        entry = {"url": url}
        try:
            served = urllib.request.urlopen(url, timeout=30).read().decode("utf-8", "replace")
            entry["served_sha256"] = hashlib.sha256(served.encode()).hexdigest()
            entry["served_bytes"] = len(served)
            m = re.search(r"sourceMappingURL=data:application/json[;,]base64,([A-Za-z0-9+/=]+)", served)
            if m:
                import base64
                sm = json.loads(base64.b64decode(m.group(1)).decode())
                sc = sm.get("sourcesContent") or []
                entry["sources"] = sm.get("sources")
                entry["sourcesContent_sha256"] = [hashlib.sha256((c or "").encode()).hexdigest() for c in sc]
                entry["sourcesContent_len"] = [len(c or "") for c in sc]
            else:
                entry["sourcemap"] = None
        except Exception as e:
            entry["error"] = str(e)
        try:
            blob = subprocess.check_output(["git","-C",REPO,"show","%s:%s" % (PIN, rel)])
            entry["git_blob_sha256"] = hashlib.sha256(blob).hexdigest()
            entry["git_blob_len"] = len(blob)
        except subprocess.CalledProcessError as e:
            entry["git_blob_error"] = str(e)
        entry["match"] = entry.get("git_blob_sha256") in (entry.get("sourcesContent_sha256") or [])
        res["modules"][rel] = entry
    # HEAD + tree state
    res["head"] = subprocess.check_output(["git","-C",REPO,"rev-parse","HEAD"]).decode().strip()
    res["head_subject"] = subprocess.check_output(["git","-C",REPO,"log","-1","--pretty=%s"]).decode().strip()
    res["dirty_src"] = subprocess.check_output(["git","-C",REPO,"status","--porcelain","--","web/src"]).decode().strip().splitlines()
    w("07-source-identity.json", res)
    return res

if __name__ == "__main__":
    which = sys.argv[3] if len(sys.argv) > 3 else "all"
    if which in ("all","desk"): run_desktop()
    if which in ("all","mob"): run_mobile()
    if which in ("all","nav"): run_nav()
    if which in ("all","src"): source_identity()
    print("DONE", which)
