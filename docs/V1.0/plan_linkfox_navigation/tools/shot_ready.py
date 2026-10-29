#!/usr/bin/env python3
"""新建标签 -> 导航 -> 等指定选择器出现 -> 截图 -> 关闭标签。"""
import argparse, base64, json, sys, time
sys.path.insert(0,'/Applications/Galley.app/Contents/Resources/managed-ga/code')
from TMWebDriver import TMWebDriver

def cdp(d,tid,m,p=None,t=60):
    r=d.execute_js(json.dumps({"cmd":"cdp","method":m,"tabId":int(tid),"params":p or {}}),timeout=t)
    if isinstance(r,str): r=json.loads(r)
    while isinstance(r,dict) and set(r.keys())=={'data'} and isinstance(r['data'],dict): r=r['data']
    return r

ap=argparse.ArgumentParser()
ap.add_argument('--url',required=True); ap.add_argument('--out',required=True)
ap.add_argument('--selector',required=True); ap.add_argument('--viewport',default='1908x781')
ap.add_argument('--timeout',type=int,default=40)
a=ap.parse_args(); vw,vh=[int(x) for x in a.viewport.split('x')]
d=TMWebDriver(); tid=None
try:
    r=d.execute_js(json.dumps({"cmd":"tabs","method":"create","url":"about:blank","active":False}),timeout=60)
    if isinstance(r,str): r=json.loads(r)
    tid=r['data']['id']
    cdp(d,tid,'Emulation.setDeviceMetricsOverride',{'width':vw,'height':vh,'deviceScaleFactor':1,'mobile':False})
    cdp(d,tid,'Page.enable')
    cdp(d,tid,'Page.navigate',{'url':a.url})
    ok=False
    for i in range(a.timeout):
        time.sleep(1)
        st=cdp(d,tid,'Runtime.evaluate',{'expression':f"!!document.querySelector({a.selector!r})",'returnByValue':True})
        if (st.get('result') or {}).get('value') is True: ok=True; break
    time.sleep(1.2)
    r2=cdp(d,tid,'Page.captureScreenshot',{'format':'jpeg','quality':92})
    dat=r2.get('data')
    if dat: open(a.out,'wb').write(base64.b64decode(dat))
    print('ready',ok,'shot',bool(dat),a.out)
finally:
    if tid:
        try: cdp(d,tid,'Page.close',{})
        except Exception as e: print('close err',e)
