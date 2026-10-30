import json,sys
sys.path.insert(0,'.'); import spec3
TOOLS=["VIDEO_REPLICATION","SALE_VIDEO","IMAGE_TO_VIDEO","AI_VIDEO_EDITING","VIDEO_TRANSLATION","VIDEO_CONCAT"]
for tid in TOOLS:
    o=json.load(open(f'orig-json/{tid}.json')); l=json.load(open(f'local-dom2/{tid}.json'))
    otexts=spec3.uniq(spec3.lines_of(o.get('text')))
    ltexts=spec3.uniq(spec3.local_content_texts(l))
    lkeys={spec3.norm(t) for t in ltexts}; okeys={spec3.norm(t) for t in otexts}
    def hit(t,keys):
        k=spec3.norm(t); return any(k==x or (len(k)>3 and (k in x or x in k)) for x in keys)
    miss=[t for t in otexts if not hit(t,lkeys)]; ext=[t for t in ltexts if not hit(t,okeys)]
    print(f"{tid:18} o={len(otexts):3d} l={len(ltexts):3d} MISS={len(miss):3d} EXTRA={len(ext):3d}")
    print("   MISS:", " | ".join(miss))
    print("   EXT :", " | ".join(ext))
