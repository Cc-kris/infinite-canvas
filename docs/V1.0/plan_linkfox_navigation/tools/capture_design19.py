#!/usr/bin/env python3
"""design19 前10工具视觉采集（原站/本地同 viewport）。
用法: python3 capture_design19.py --side real|local|both [--ids A,B]
产物: evidence/design19-visual-parity-20261029/<side>/<ID>/{shot.jpg,shot-full.jpg,form.json,text.txt}
"""
import argparse, json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from capture_parity import REPO, cdp, eval_in, new_tab, close_tab, wait_ready, save_shot, SNAP_JS
from TMWebDriver import TMWebDriver

EVID = os.path.join(REPO, 'docs/V1.0/plan_linkfox_navigation/evidence/design19-visual-parity-20261029')

def capture(driver, tab_id, out_dir, tag):
    os.makedirs(out_dir, exist_ok=True)
    snap = eval_in(driver, tab_id, SNAP_JS, timeout=60)
    ok = isinstance(snap, dict) and 'bodyText' in snap
    if ok:
        json.dump(snap, open(os.path.join(out_dir, 'form.json'), 'w'), ensure_ascii=False, indent=1)
        open(os.path.join(out_dir, 'text.txt'), 'w').write(snap['bodyText'])
    s1 = save_shot(driver, tab_id, os.path.join(out_dir, 'shot.jpg'), {"format":"jpeg","quality":82})
    s2 = save_shot(driver, tab_id, os.path.join(out_dir, 'shot-full.jpg'), {"format":"jpeg","quality":72,"captureBeyondViewport":True})
    return ok, s1, s2

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--side', choices=['real','local','both'], required=True)
    ap.add_argument('--ids', default='')
    ap.add_argument('--only', default='')
    ap.add_argument('--viewport', default='1908x781')
    a = ap.parse_args()
    vw, vh = (int(x) for x in a.viewport.lower().split('x'))
    man = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'design19_manifest.json')))
    if a.ids:
        ids = [s for s in a.ids.split(',') if s]
        man = [m for m in man if m['id'] in ids]
    driver = TMWebDriver()
    res = {}
    for side in (['real','local'] if a.side=='both' else [a.side]):
        for m in man:
            url = m[side]
            t0=time.time()
            tid = new_tab(driver, url)
            try:
                time.sleep(1.0)
                cdp(driver, tid, "Emulation.setDeviceMetricsOverride",
                    {"width":vw,"height":vh,"deviceScaleFactor":1,"mobile":False}, timeout=15)
                ok = wait_ready(driver, tid, min_chars=200, tries=18)
                snap_ok, s1, s2 = capture(driver, tid, os.path.join(EVID, side, m['id']), side)
                res[f"{side}:{m['id']}"] = {"url":url,"ready":ok,"snapshot":snap_ok,"shot":s1,"shot_full":s2,"sec":round(time.time()-t0,1)}
                print(f"{side} {m['id']} ready={ok} snap={snap_ok} shot={s1}/{s2} {round(time.time()-t0,1)}s", flush=True)
            except Exception as e:
                res[f"{side}:{m['id']}"] = {"url":url,"error":repr(e)[:200]}
                print(f"{side} {m['id']} ERROR {e!r}", flush=True)
            finally:
                close_tab(driver, tid)
                time.sleep(0.3)
    os.makedirs(EVID, exist_ok=True)
    p = os.path.join(EVID, '_capture.json')
    meta = json.load(open(p)) if os.path.exists(p) else {}
    meta.update(res)
    json.dump(meta, open(p,'w'), ensure_ascii=False, indent=1)
    print('DONE', len(res))

if __name__=='__main__':
    main()
