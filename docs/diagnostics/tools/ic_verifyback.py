import json,os,signal,subprocess,time,urllib.request,websocket
APP="/Applications/Infinite Canvas.app/Contents/MacOS/Infinite Canvas"; UD="/tmp/ic-e2e"; DBG=9347
p=subprocess.Popen([APP,f"--user-data-dir={UD}",f"--remote-debugging-port={DBG}","--remote-allow-origins=*"],
    stdout=open('/tmp/ic-back.log','a'),stderr=subprocess.STDOUT,start_new_session=True)
pg=None
for _ in range(60):
    try:
        for x in json.load(urllib.request.urlopen(f"http://127.0.0.1:{DBG}/json")):
            if x.get("type")=="page" and "2321" in x.get("url",""): pg=x; break
    except Exception: pass
    if pg: break
    time.sleep(0.5)
time.sleep(5)
ws=websocket.create_connection(pg["webSocketDebuggerUrl"],timeout=60); mid=[0]
def ev(e):
    mid[0]+=1; ws.send(json.dumps({"id":mid[0],"method":"Runtime.evaluate","params":{"expression":e,"awaitPromise":True,"returnByValue":True}}))
    while True:
        r=json.loads(ws.recv())
        if r.get("id")==mid[0]:
            if "exceptionDetails" in r.get("result",{}): return "EXC:"+json.dumps(r["result"]["exceptionDetails"])[:180]
            return r.get("result",{}).get("result",{}).get("value")
print("origin:", ev("location.origin"))
print("配置里 E2E 渠道还在吗:", ev("(localStorage.getItem('infinite-canvas:ai_config_store')||'').includes('E2E-CHANNEL')"))
print("IDB app_state 键:", ev("""(async()=>{const db=await new Promise(r=>{const q=indexedDB.open('infinite-canvas');q.onsuccess=()=>r(q.result);});return JSON.stringify(await new Promise(r=>{const k=db.transaction('app_state','readonly').objectStore('app_state').getAllKeys();k.onsuccess=()=>r(k.result.map(String));}));})()"""))
try: os.killpg(os.getpgid(p.pid),signal.SIGKILL)
except Exception: pass
print("done")
