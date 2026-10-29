#!/usr/bin/env python3
"""B12 共享框架终验探针：促销条 / 顶栏 / 用户区 / 侧栏 / 浅色主题 / 窄屏。

用法:
  python3 probe_shell_final.py --side real --url "https://www.linkfox.com/draw/ai-outpainting" --width 1908
  python3 probe_shell_final.py --side local --url "http://127.0.0.1:3000/tools/ecommerce-suite/ai-outpainting" --width 1908

产物: evidence/b12-shell-final-20261029/<side>-<width>.json (+shot.jpg)
"""
import argparse
import base64
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from probe_frame import TMWebDriver, cdp, new_tab, close_tab, eval_in, wait_ready  # noqa: E402

EVID = os.path.abspath(os.path.join(HERE, '..', 'evidence', 'b12-shell-final-20261029'))

JS = r"""
(() => {
  const R = el => { const r = el.getBoundingClientRect(); return {x:+r.x.toFixed(1),y:+r.y.toFixed(1),w:+r.width.toFixed(1),h:+r.height.toFixed(1)}; };
  const S = el => { const c = getComputedStyle(el); return {
    bg:c.backgroundColor, color:c.color, fs:c.fontSize, fw:c.fontWeight, lh:c.lineHeight,
    br:c.borderRadius, pad:c.padding, mar:c.margin, border:c.borderTopWidth+'/'+c.borderTopColor,
    disp:c.display, pos:c.position, z:c.zIndex, shadow:c.boxShadow.slice(0,90), ff:c.fontFamily.split(',')[0]}; };
  const info = (el, extra={}) => el ? Object.assign({tag:el.tagName.toLowerCase(), cls:(el.className||'').toString().slice(0,110), rect:R(el), css:S(el), text:(el.innerText||'').trim().replace(/\s+/g,' ').slice(0,60)}, extra) : null;
  const vis = el => { if(!el) return false; const c=getComputedStyle(el), r=el.getBoundingClientRect(); return c.display!=='none' && c.visibility!=='hidden' && r.width>0 && r.height>0; };
  const q = s => document.querySelector(s);
  const byText = (re, scope=document) => [...scope.querySelectorAll('a,button,span,div,p')].filter(e=>vis(e) && re.test((e.innerText||'').trim()) && (e.innerText||'').trim().length < 24);

  // 1. header 及其直接子结构
  const header = q('header') || q('[data-testid=tools-nav-primary]')?.closest('header');
  const headerKids = header ? [...header.querySelectorAll('*')].slice(0,0) : [];
  // 2. 促销条：原站 ._wrap_scegn_1 / local [data-testid=promo-bar]
  const promo = q('._wrap_scegn_1') || q('[data-testid=promo-bar]');
  const promoSel = promo ? (promo.className||'') : '';
  const promoKids = promo ? [...promo.querySelectorAll('*')].filter(vis).slice(0,12).map(e=>info(e)) : [];
  // 3. 用户区：免费得算力/积分/购买/头像
  const userRes = {
    freeQuota: byText(/免费得算力|免费算力/).slice(0,3).map(e=>info(e)),
    credits: byText(/^积分/).slice(0,4).map(e=>info(e)),
    buy: byText(/^(购买|升级|VIP|会员)/).slice(0,4).map(e=>info(e)),
    login: byText(/^(登录|登入|Log ?in)/).slice(0,4).map(e=>info(e)),
    avatar: [...document.querySelectorAll('img[class*=avatar], img[class*=Avatar], [class*=avatar]')].filter(vis).slice(0,4).map(e=>info(e)),
  };
  // 4. 右侧容器（header 最后一个 flex 子）
  let rightBox = null, rightKids = [];
  if (header) {
    const box = [...header.querySelectorAll('div')].filter(d => { const r=d.getBoundingClientRect(); return r.width>200 && r.x > innerWidth*0.5 && r.height>20 && vis(d); });
    rightBox = box.length ? info(box[box.length-1]) : null;
    if (box.length) rightKids = [...box[box.length-1].children].filter(vis).map(e=>info(e));
  }
  // 5. 侧栏
  const aside = q('aside') || q('[data-testid=tool-sidebar]');
  const asideRows = aside ? [...aside.querySelectorAll('a,li,button')].filter(vis).slice(0,8).map(e=>info(e)) : [];
  const asideFoot = aside ? [...aside.querySelectorAll('*')].filter(e=>vis(e)&&/免责声明|Disclaimer/i.test((e.innerText||''))&&(e.innerText||'').trim().length<12).map(e=>info(e)) : [];
  // 6. 主题
  const theme = {
    htmlCls: document.documentElement.className,
    htmlStyle: document.documentElement.getAttribute('style'),
    bodyBg: getComputedStyle(document.body).backgroundColor,
    bodyColor: getComputedStyle(document.body).color,
    colorScheme: getComputedStyle(document.documentElement).colorScheme,
    storedTheme: (()=>{try{return JSON.stringify({ls: localStorage.getItem('infinite-canvas:theme')||localStorage.getItem('theme'), mql: matchMedia('(prefers-color-scheme: dark)').matches})}catch(e){return 'n/a'}})(),
  };
  const main = q('main') || q('[data-testid=tool-workspace]');
  const nav = header ? q('nav') : null;
  return JSON.stringify({
    url: location.href, title: document.title, ready: document.readyState,
    vp: {w:innerWidth, h:innerHeight, scrollW:document.documentElement.scrollWidth, scrollH:document.documentElement.scrollHeight, dpr:devicePixelRatio},
    theme,
    header: info(header),
    nav: info(nav),
    promo: promo ? Object.assign(info(promo), {kids:promoKids, close: promoKids.length ? promoKids.filter(k=>/close|关闭/i.test(k.cls+k.text)).slice(0,3) : []}) : null,
    promoHtml: promo ? promo.outerHTML.slice(0,900) : null,
    rightBox, rightKids, userRes,
    aside: info(aside), asideRows, asideFoot,
    main: info(main),
  }, null, 1);
})()
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--side', required=True)
    ap.add_argument('--url', required=True)
    ap.add_argument('--width', type=int, default=1908)
    ap.add_argument('--height', type=int, default=781)
    ap.add_argument('--wait', type=float, default=1.6)
    ap.add_argument('--shot', action='store_true')
    args = ap.parse_args()

    os.makedirs(EVID, exist_ok=True)
    driver = TMWebDriver()
    tid = new_tab(driver, args.url)
    try:
        time.sleep(1.0)
        cdp(driver, tid, 'Emulation.setDeviceMetricsOverride',
            {'width': args.width, 'height': args.height, 'deviceScaleFactor': 1, 'mobile': False}, timeout=15)
        time.sleep(args.wait)
        wait_ready(driver, tid)
        time.sleep(0.8)
        raw = eval_in(driver, tid, JS, timeout=90)
        data = json.loads(raw) if isinstance(raw, str) else raw
        out = os.path.join(EVID, f'{args.side}-{args.width}.json')
        json.dump(data, open(out, 'w'), ensure_ascii=False, indent=1)
        shot_ok = False
        if args.shot:
            r = cdp(driver, tid, 'Page.captureScreenshot', {'format': 'jpeg', 'quality': 75})
            d = r.get('data') if isinstance(r, dict) else None
            if d:
                open(os.path.join(EVID, f'{args.side}-{args.width}.jpg'), 'wb').write(base64.b64decode(d))
                shot_ok = True
        print(json.dumps({'side': args.side, 'width': args.width, 'vw': data.get('vp', {}).get('w'),
                          'theme': data.get('theme', {}).get('bodyBg'), 'header': (data.get('header') or {}).get('rect'),
                          'promo': (data.get('promo') or {}).get('rect'), 'aside': (data.get('aside') or {}).get('rect'),
                          'shot': shot_ok}, ensure_ascii=False))
    finally:
        close_tab(driver, tid)


if __name__ == '__main__':
    main()
