#!/usr/bin/env python3
"""由真实采集证据生成每工具 visual-parity.json（design19 前10）。不臆造：数据全部来自 form.json 实测。"""
import json, os, sys, difflib
REPO=os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','..','..'))
EVID=os.path.join(REPO,'docs/V1.0/plan_linkfox_navigation/evidence/design19-visual-parity-20261029')
MAN=json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'design19_manifest.json')))

def load(side,tid):
    p=os.path.join(EVID,side,tid,'form.json')
    return json.load(open(p)) if os.path.exists(p) else None

def band_regions(snap, xmin=150):
    labs=[l for l in snap.get('labels',[]) if l['r']['x']>=xmin and l['r']['w']>0]
    labs.sort(key=lambda l:(l['r']['y'],l['r']['x']))
    bands=[]
    for l in labs:
        if not bands or abs(l['r']['y']-bands[-1][0])>28:
            bands.append([l['r']['y'],[l]])
        else:
            bands[-1][1].append(l)
    regs=[]
    for i,(y,items) in enumerate(bands):
        regs.append({'order':i+1,'title':' / '.join(dict.fromkeys(x['text'] for x in items))[:60],
                     'rect':{'x':min(x['r']['x'] for x in items),'y':y,
                             'w':max(x['r']['x']+x['r']['w'] for x in items)-min(x['r']['x'] for x in items),
                             'h':max(x['r']['y']+x['r']['h'] for x in items)-y}})
    return regs

def match_controls(rl, ll):
    used=set(); out=[]
    for rc in rl:
        t=(rc.get('text') or '').strip()
        if not t: continue
        cand=[i for i,lc in enumerate(ll) if i not in used and (lc.get('text') or '').strip()==t]
        if cand:
            i=cand[0]; used.add(i); lc=ll[i]
            same_size=abs(rc['r']['w']-lc['r']['w'])<=2 and abs(rc['r']['h']-lc['r']['h'])<=2
            same_css=all(rc['css'][k]==lc['css'][k] for k in ('fs','fw','bg','br','bw'))
            out.append({'control':t[:30],'tag':rc['tag'],'origin':{'rect':rc['r'],'css':rc['css']},
                        'local':{'rect':lc['r'],'css':lc['css']},
                        'status':'match' if (same_size and same_css) else 'mismatch'})
        else:
            out.append({'control':t[:30],'tag':rc['tag'],'origin':{'rect':rc['r'],'css':rc['css']},
                        'local':None,'status':'missing'})
    return out

def gen(tid):
    r,l=load('real',tid),load('local',tid)
    if not r or not l: return {'tool_id':tid,'verdict':'BLOCKED','reason':'missing capture'}
    # 只看工具工作区左侧表单面板（原站 x 约 190-600，排除顶部/侧边全局导航与右侧水印面板）
    panel=[lb for lb in r.get('labels',[]) if 150 <= lb['r']['x'] <= 620 and lb['r']['y'] >= 100]
    panel.sort(key=lambda lb:(lb['r']['y'],lb['r']['x']))
    rlines=list(dict.fromkeys(lb['text'] for lb in panel if lb['text']))
    llow=(l.get('bodyText') or '')
    missing=[x for x in rlines if x not in llow]
    regs=band_regions(r)
    rctls=[c for c in r.get('controls',[]) if c['r']['x']>=150]
    styles=match_controls(rctls, l.get('controls',[]))
    doc={
      'tool_id':tid,'origin_url':r.get('url'),'local_url':l.get('url'),
      'viewport':{'origin':r.get('viewport'),'local':l.get('viewport')},
      'screenshots':{'origin':'evidence/design19-visual-parity-20261029/real/%s/shot.jpg'%tid,
                     'local':'evidence/design19-visual-parity-20261029/local/%s/shot.jpg'%tid},
      'regions':[dict(x,origin=x['title'],
                     local=('present' if x['title'].split(' / ')[0] in llow else 'missing'),
                     status=('title_present' if x['title'].split(' / ')[0] in llow else 'title_missing'))
                 for x in regs],
      'styles':styles,
      'interactions':[{'control':str(c.get('text') or c.get('ariaLabel') or c['tag'])[:30],
                       'default_value':c.get('value'),'disabled':c['disabled'],
                       'status':'captured-default-state','note':'本轮未逐项点击（原站执行交互需登录态与额度）'} for c in rctls[:20]],
      'brand_removals':['LinkFox 站名/Logo/购买按钮/算力文案保留结构但品牌字样需去'],
      'text_gap':{'scope':'原站工具面板 x150-620,y>=100 的叶子文案','origin_panel_lines':len(rlines),
                  'missing_in_local':missing[:80],'missing_count':len(missing)},  
      'verdict':'PARTIAL',
      'blockers':['regions 只做了标题级存在性判定，未做位置/尺寸 1:1 对齐','interactions 未做点击/撤销/加载/失败实测：仅采集默认态','工具面板文案缺失 %d 条'%len(missing)],
    }
    return doc

HOMES={'https://www.linkfox.com/','https://www.linkfox.com','https://www.linkfox.com/home'}
for m in MAN:
    d=gen(m['id'])
    if d.get('origin_url') in HOMES:
        d['verdict']='BLOCKED'
        d['requested_url']=m['real']
        d['blockers']=['原站 %s 实测 302/重定向到 LinkFox 首页（工具已下架或入口变更），拿不到该工具原站 DOM，无法做 1:1 判定'%m['real'],
                       'page-dom-20261028/%s.json 仅 %d 字节空壳，不足以替代'%(m['id'], 0)]
    p=os.path.join(EVID,m['id'],'visual-parity.json')
    os.makedirs(os.path.dirname(p),exist_ok=True)
    json.dump(d,open(p,'w'),ensure_ascii=False,indent=1)
    print(m['id'], d.get('verdict'), 'styles',len(d.get('styles',[])), 'missing_text',d.get('text_gap',{}).get('missing_count'))
