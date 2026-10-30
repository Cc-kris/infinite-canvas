import json, os, sys, importlib.util
B = "/Users/mac/Documents/Dev/infinite-canvas/.verify-tools/frontend-diff"
spec = importlib.util.spec_from_file_location("spec3", os.path.join(B, "spec3.py"))
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
TARGETS = ['REPLACE_GOODS','AREA_REPAIR','HAND_REPAIR','PRINTING_REPAIR','FIX_COLOR',
           'HANDHELD_GOODS','PRODUCT_SCENE','SDS_DESIGN','SCENE_TRANSFER']
out = {}
for tid in TARGETS:
    o = json.load(open(os.path.join(B,'orig-json',tid+'.json'), encoding='utf-8'))
    l = json.load(open(os.path.join(B,'local-dom2',tid+'.json'), encoding='utf-8'))
    otexts = m.uniq(m.lines_of(o.get('text')))
    ltexts = m.uniq(m.local_content_texts(l))
    lkeys = {m.norm(t) for t in ltexts}; okeys = {m.norm(t) for t in otexts}
    def hit(t, keys):
        k = m.norm(t)
        return any(k == x or (len(k) > 3 and (k in x or x in k)) for x in keys)
    missing = [t for t in otexts if not hit(t, lkeys)]
    extra = [t for t in ltexts if not hit(t, okeys)]
    out[tid] = dict(o=len(otexts), l=len(ltexts), miss=missing, extra=extra)
json.dump(out, open(os.path.join(B,'round2-state.json'),'w'), ensure_ascii=False, indent=1)
for tid,v in out.items():
    print(f"== {tid} o={v['o']} l={v['l']} miss={len(v['miss'])} extra={len(v['extra'])}")
    print("  MISS:", v['miss'])
