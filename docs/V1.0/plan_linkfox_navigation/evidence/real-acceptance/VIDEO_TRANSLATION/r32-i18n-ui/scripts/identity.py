# -*- coding: utf-8 -*-
import json, hashlib, subprocess
from playwright.sync_api import sync_playwright
REPO="/Users/mac/Documents/Dev/infinite-canvas"; PIN="f53da52afc2279701e816e9ae43a19ae66f22e63"
OUT="/tmp/r32/out"
FILES=["web/src/components/tools/workspaces/video-translation.tsx",
 "web/src/components/tools/workspaces/video-translation-honesty.tsx",
 "web/src/components/tools/tool-asset-input.tsx",
 "web/src/components/tools/tool-result.tsx",
 "web/src/components/tools/tool-task-history.tsx",
 "web/src/components/tools/tool-sidebar.tsx",
 "web/src/components/tools/tool-history-dock.tsx",
 "web/src/components/tools/task-status.tsx",
 "web/src/features/tools/tool-page.tsx",
 "web/src/i18n/locales/en-US.ts","web/src/i18n/locales/zh-CN.ts"]
def git(*a): return subprocess.run(["git","-C",REPO]+list(a),capture_output=True).stdout
blob={l.split()[3]:l.split()[2] for l in git("ls-tree","-r",PIN).decode().splitlines() if l.split() and l.split()[3] in FILES}
rows=[]
with sync_playwright() as p:
    ctx=p.chromium.launch_persistent_context("/tmp/r32/profile-id", headless=True)
    pg=ctx.pages[0]; pg.goto("http://127.0.0.1:3000/", wait_until="domcontentloaded", timeout=60000)
    for f in FILES:
        disk=open(REPO+"/"+f,"rb").read()
        disk_sha=hashlib.sha256(disk).hexdigest()
        disk_git=git("hash-object","--",f).decode().strip()
        url="/"+f.replace("web/","",1)
        raw=pg.evaluate("""async (u)=>{ const m=await import(u); return m.default; }""", url+"?raw")
        raw_sha=hashlib.sha256(raw.encode("utf-8")).hexdigest()
        tr=pg.evaluate("""async (u)=>{ const r=await fetch(u); return await r.text(); }""", url)
        tr_sha=hashlib.sha256(tr.encode("utf-8")).hexdigest()
        rows.append(dict(file=f, pin_blob=blob.get(f), disk_git_blob=disk_git, disk_sha256=disk_sha,
            page_raw_sha256=raw_sha, raw_matches_disk=(raw_sha==disk_sha), blob_matches_disk=(blob.get(f)==disk_git),
            page_transformed_sha256=tr_sha, page_transformed_bytes=len(tr.encode()),
            raw_bytes=len(raw.encode()), disk_bytes=len(disk)))
    ctx.close()
res=dict(pin=PIN, pin_short=PIN[:8], head=git("rev-parse","HEAD").decode().strip(),
         head_equals_pin=(git("rev-parse","HEAD").decode().strip()==PIN), rows=rows,
         all_raw_match=all(r["raw_matches_disk"] for r in rows), all_blob_match=all(r["blob_matches_disk"] for r in rows))
json.dump(res, open(OUT+"/07-source-identity.json","w"), ensure_ascii=False, indent=1)
for r in rows: print(r["file"].split("/")[-1], "blob=",r["pin_blob"][:10],"==",r["blob_matches_disk"], "raw==",r["raw_matches_disk"])
print("HEAD==PIN",res["head_equals_pin"],"all_raw",res["all_raw_match"],"all_blob",res["all_blob_match"])
