#!/usr/bin/env python3
"""design19 前10工具 非视觉维度采集（原站 vs 本地）：逐控件默认值 + 案例/同款 DOM。

产物: evidence/design19-nv-20261029/<side>/<ID>.json
用法: python3 design19_nv_capture.py --side real|local|both [--ids A,B] [--no-click]
"""
import argparse
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
EVID = os.path.join(REPO, 'docs/V1.0/plan_linkfox_navigation/evidence/design19-nv-20261029')
ENGINE = "/Applications/Galley.app/Contents/Resources/managed-ga/code"
if ENGINE not in sys.path:
    sys.path.insert(0, ENGINE)
from TMWebDriver import TMWebDriver  # noqa: E402

SNAP_JS = open(os.path.join(HERE, 'design19_nv_snap.js'), encoding='utf-8').read()
_UNUSED = r"""
(() => {
 const out = {url: location.href, title: document.title};
 const vis = el => { const r=el.getBoundingClientRect(), c=getComputedStyle(el);
   return r.width>2&&r.height>2&&c.visibility!=='hidden'&&c.display!=='none'&&c.opacity!=='0'; };
 const txt = (el,n)=> (el.innerText||el.textContent||'').replace(/\s+/g,' ').trim().slice(0,n||80);
 const labOf = el => {
   let t='';
   if (el.labels && el.labels.length) t = txt(el.labels[0],60);
   if (!t) { const l=el.closest('label'); if(l) t=txt(l,60); }
   if (!t) { const p=el.parentElement; if(p) t=txt(p,60); }
   if (!t) t = el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name') || '';
   return t;
 };
 const rect = el => { const r=el.getBoundingClientRect(); return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}; };
 const seen = new Set();
 const controls = [];
 const push = (el, extra) => {
   if (!vis(el)) return;
   const r = rect(el);
   const key = [el.tagName, el.type||'', el.name||'', labOf(el), r.x, r.y].join('|');
   if (seen.has(key)) return; seen.add(key);
   let value = null, checked = null, selected = null, options = null;
   if (el.tagName === 'SELECT') { value = el.value; options = [...el.options].map(o=>({t:txt(o,40),v:o.value,s:o.selected})); selected = (el.options[el.selectedIndex]||{}).text || null; }
   else if (el.type === 'radio' || el.type === 'checkbox') { checked = el.checked; value = el.value; }
   else if ('value' in el && el.tagName !== 'BUTTON') { value = el.value; }
   controls.push(Object.assign({
     tag: el.tagName.toLowerCase(), type: el.type || '', role: el.getAttribute('role'),
     label: labOf(el), text: txt(el,80), value, checked, selected, options,
     placeholder: el.getAttribute('placeholder'), ariaChecked: el.getAttribute('aria-checked'),
     ariaSelected: el.getAttribute('aria-selected'), ariaValueNow: el.getAttribute('aria-valuenow'),
     disabled: !!el.disabled, r
   }, extra||{}));
 };
 const SEL = 'input,textarea,select,button,[role="switch"],[role="tab"],[role="radio"],[role="checkbox"],[role="slider"],[contenteditable="true"]';
 [...document.querySelectorAll(SEL)].forEach(el => push(el));
 // 可见的“当前已选”chip：radio/标签组（无 input 的自绘控件）
 const chips = [...document.querySelectorAll('div,span,label,li')].filter(vis).filter(el=>{
   const t=txt(el,20); if(!t||t.length>20) return false;
   if (el.querySelector('input,textarea,select,button')) return false;
   const c=getComputedStyle(el); if(c.cursor!=='pointer') return false;
   const r=el.getBoundingClientRect(); return r.width<=240&&r.height<=56;
 }).map(el=>{ const c=getComputedStyle(el);
   return {text:txt(el,20), cls:(el.className||'').toString().slice(0,80), active: el.getAttribute('aria-selected')==='true' || /(active|selected|checked|current)/i.test((el.className||'').toString()), bg:c.backgroundColor, color:c.color};
 });
 const tabs = [...document.querySelectorAll('[role="tab"], .ant-tabs-tab, [class*="tab"]')].filter(vis).map(el=>({
   text:txt(el,24), selected: el.getAttribute('aria-selected'), cls:(el.className||'').toString().slice(0,100)
 })).filter(t=>t.text);
 const bodyText = (document.body.innerText||'').replace(/\n{2,}/g,'\n');
 const caseCount = (bodyText.match(/一键做同款/g)||[]).length;
 const caseTab = /优秀案例/.test(bodyText);
 const imgs = [...document.querySelectorAll('img')].filter(vis).length;
 out.bodyText = bodyText.slice(0,12000);
 out.controls = controls; out.chips = chips; out.tabs = tabs;
 out.caseModule = {caseTab, cases:caseCount, imgs, hasCaseWord:/优秀案例|成功案例|案例/.test(bodyText)};
 return out;
})()
"""


def cdp(driver, tab_id, method, params=None, timeout=40):
    payload = json.dumps({"cmd": "cdp", "method": method, "tabId": int(tab_id), "params": params or {}})
    r = driver.execute_js(payload, timeout=timeout)
    if isinstance(r, str):
        try:
            r = json.loads(r)
        except Exception:
            return r
    while isinstance(r, dict) and set(r.keys()) == {'data'} and isinstance(r['data'], dict):
        r = r['data']
    return r


def eval_in(driver, tab_id, expr, timeout=60):
    r = cdp(driver, tab_id, "Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True}, timeout)
    if isinstance(r, dict) and 'result' in r:
        return r['result'].get('value')
    return r


def new_tab(driver, url):
    r = driver.execute_js(json.dumps({"cmd": "tabs", "method": "create", "url": url, "active": False}), timeout=30)
    if isinstance(r, str):
        r = json.loads(r)
    return r['data']['id']


def close_tab(driver, tab_id):
    try:
        cdp(driver, tab_id, "Page.close", timeout=10)
    except Exception:
        pass


def wait_ready(driver, tab_id, min_chars=200, tries=20):
    for _ in range(tries):
        time.sleep(1)
        try:
            st = eval_in(driver, tab_id, "({s:document.readyState,n:(document.body&&document.body.innerText||'').length})", timeout=20)
            if isinstance(st, dict) and st.get('s') == 'complete' and st.get('n', 0) > min_chars:
                time.sleep(1.5)
                return True
        except Exception:
            pass
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--side', choices=['real', 'local', 'both'], required=True)
    ap.add_argument('--ids', default='')
    ap.add_argument('--no-click', action='store_true')
    ap.add_argument('--viewport', default='1908x900')
    a = ap.parse_args()
    vw, vh = (int(x) for x in a.viewport.lower().split('x'))
    man = json.load(open(os.path.join(HERE, 'design19_manifest.json')))
    if a.ids:
        ids = [s for s in a.ids.split(',') if s]
        man = [m for m in man if m['id'] in ids]
    driver = TMWebDriver()
    for side in (['real', 'local'] if a.side == 'both' else [a.side]):
        os.makedirs(os.path.join(EVID, side), exist_ok=True)
        for m in man:
            url = m[side]
            t0 = time.time()
            tid = new_tab(driver, url)
            try:
                time.sleep(1.2)
                cdp(driver, tid, "Emulation.setDeviceMetricsOverride",
                    {"width": vw, "height": vh, "deviceScaleFactor": 1, "mobile": False}, timeout=15)
                ok = wait_ready(driver, tid)
                snap = eval_in(driver, tid, SNAP_JS, timeout=90)
                if not isinstance(snap, dict):
                    raise RuntimeError('snapshot failed: %r' % (snap,))
                snap['capture'] = {'side': side, 'url': url, 'ready': ok, 'sec': round(time.time() - t0, 1)}
                # 点击“优秀案例”tab，抓卡片与同款 DOM（真实点击，只读）
                if not a.no_click and snap.get('caseModule', {}).get('caseTab'):
                    clicked = eval_in(driver, tid, r"""
                    (() => {
                      const t=[...document.querySelectorAll('[role="tab"],.ant-tabs-tab,div,span')]
                        .find(el=>(el.innerText||'').trim()==='优秀案例');
                      if(!t) return false;
                      t.click(); return true;
                    })()
                    """, timeout=30)
                    time.sleep(3.0)
                    snap2 = eval_in(driver, tid, SNAP_JS, timeout=90)
                    if isinstance(snap2, dict):
                        snap['casePanel'] = {
                            'clicked': clicked,
                            'bodyText': snap2.get('bodyText', '')[:8000],
                            'caseModule': snap2.get('caseModule'),
                            'tabs': snap2.get('tabs'),
                            'controls': snap2.get('controls'),
                        }
                out = os.path.join(EVID, side, m['id'] + '.json')
                json.dump(snap, open(out, 'w'), ensure_ascii=False, indent=1)
                cm = snap.get('caseModule', {})
                print(f"{side} {m['id']} ready={ok} ctrls={len(snap.get('controls',[]))} caseTab={cm.get('caseTab')} 同款={cm.get('cases')} {round(time.time()-t0,1)}s", flush=True)
            except Exception as e:
                print(f"{side} {m['id']} ERROR {e!r}", flush=True)
            finally:
                close_tab(driver, tid)
                time.sleep(0.4)


if __name__ == '__main__':
    main()
