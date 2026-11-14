import json,os,signal,socket,subprocess,threading,time,urllib.request
APP="/Applications/Infinite Canvas.app/Contents/MacOS/Infinite Canvas"; UD="/tmp/ic-e2e"; DBG=9346
# 模拟"23210 被非画布程序占着"：只收连接、不返回 JSON
srv=socket.socket(); srv.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
srv.bind(("127.0.0.1",23210)); srv.listen(8); print("已占住 23210（不应答 HTTP）")
def acc():
    while True:
        try: c,_=srv.accept()
        except OSError: return
        threading.Thread(target=lambda c=c: (time.sleep(30), c.close()),daemon=True).start()
threading.Thread(target=acc,daemon=True).start()
p=subprocess.Popen([APP,f"--user-data-dir={UD}",f"--remote-debugging-port={DBG}","--remote-allow-origins=*"],
    stdout=open('/tmp/ic-steal.log','a'),stderr=subprocess.STDOUT,start_new_session=True)
time.sleep(20)
print("=== 日志 ==="); print(open('/tmp/ic-steal.log').read()[-500:])
for hp in (23210,23211,23212,23213):
    s=socket.socket(); r=s.connect_ex(("127.0.0.1",hp)); print(f"port {hp}: {'LISTEN' if r==0 else 'closed'}"); s.close()
try:
    urls=[x.get("url") for x in json.load(urllib.request.urlopen(f"http://127.0.0.1:{DBG}/json")) if x.get("type")=="page"]
except Exception as e: urls=["ERR "+str(e)[:40]]
print("=== 页面 ===", urls)
try: os.killpg(os.getpgid(p.pid),signal.SIGKILL)
except Exception: pass
srv.close(); print("done")
