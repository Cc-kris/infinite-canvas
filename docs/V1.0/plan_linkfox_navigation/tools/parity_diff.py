#!/usr/bin/env python3
import json, os, sys, difflib
REPO=os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','..','..'))
EVID=os.path.join(REPO,'docs/V1.0/plan_linkfox_navigation/evidence/design19-visual-parity-20261029')
def load(side,tid):
    p=os.path.join(EVID,side,tid,'form.json')
    return json.load(open(p)) if os.path.exists(p) else None
def lines(d):
    return [l.strip() for l in (d.get('bodyText') or '').split('\n') if l.strip()]
def show(tid):
    r,l=load('real',tid),load('local',tid)
    if not r or not l: print('MISSING',tid); return
    print('='*90); print(tid,'viewport real',r.get('viewport'),'local',l.get('viewport'))
    print('title real:',r.get('title')); print('title locl:',l.get('title'))
    rl,ll=lines(r),lines(l)
    print(f'\n--- TEXT diff (real {len(rl)} lines / local {len(ll)} lines) ---')
    for x in difflib.unified_diff(rl,ll,'REAL','LOCAL',lineterm='',n=0):
        print(x)
    print('\n--- CONTROLS ---')
    def cs(d):
        return [f"{c['tag']}/{c.get('type','')} '{c.get('text','')[:20]}' v={str(c.get('value'))[:12]} dis={c['disabled']} r={c['r']['x']},{c['r']['y']},{c['r']['w']}x{c['r']['h']} fs={c['css']['fs']} bg={c['css']['bg']} br={c['css']['br']}" for c in d.get('controls',[])]
    rc,lc=cs(r),cs(l)
    print(f'real controls {len(rc)} / local {len(lc)}')
    for x in difflib.unified_diff(rc,lc,'R','L',lineterm='',n=0): print(x)
if __name__=='__main__':
    for tid in (sys.argv[1:] or ['NEW_REPLACE_BG_V2']): show(tid)
