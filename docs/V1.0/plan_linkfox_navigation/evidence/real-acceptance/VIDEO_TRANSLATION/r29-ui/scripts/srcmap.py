import json, re, base64, hashlib, urllib.request, os
BASE="http://localhost:3000"; REPO="/Users/mac/Documents/Dev/infinite-canvas"
res={}
for rel in ["web/src/components/tools/workspaces/video-translation.tsx",
            "web/src/components/tools/workspaces/video-translation-honesty.tsx",
            "web/src/features/tools/adapters/video-translation.ts"]:
    txt=urllib.request.urlopen(BASE+"/"+rel.replace("web/",""),timeout=25).read().decode()
    m=re.search(r'sourceMappingURL=data:application/json;(?:charset=utf-8;)?base64,([A-Za-z0-9+/=]+)', txt)
    if not m:
        res[rel]={"error":"no sourcemap"}; continue
    sm=json.loads(base64.b64decode(m.group(1)))
    sc=(sm.get("sourcesContent") or [None])[0]
    disk=open(os.path.join(REPO,rel),encoding="utf-8").read()
    res[rel]={"sources":sm.get("sources"),"hasContent":sc is not None,
              "content_equal_disk": sc==disk,
              "content_sha":hashlib.sha256((sc or "").encode()).hexdigest()[:16],
              "disk_sha":hashlib.sha256(disk.encode()).hexdigest()[:16],
              "content_len":len(sc or ""),"disk_len":len(disk)}
json.dump(res, open("/tmp/r29ui/out/10-vite-sourcemap-identity.json","w"), ensure_ascii=False, indent=1)
print(json.dumps(res, ensure_ascii=False, indent=1))
