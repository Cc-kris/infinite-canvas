#!/usr/bin/env python3
"""顶栏细粒度探针：主导航项 / 徽标 / 右侧用户区 / 促销条关闭按钮。

用法: python3 probe_head.py --side real --url URL --width 1280
产物: evidence/b12-shell-final-20261029/head-<side>-<width>.json
"""
import argparse, json, os, sys, time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from probe_frame import TMWebDriver, cdp, new_tab, close_tab, eval_in, wait_ready

EVID = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'evidence', 'b12-shell-final-20261029')

JS = r"""
(() => {
  const R = el => { const r = el.getBoundingClientRect(); return {x:+r.x.toFixed(1),y:+r.y.toFixed(1),w:+r.width.toFixed(1),h:+r.height.toFixed(1)}; };
  const S = el => { const c = getComputedStyle(el); return {bg:c.backgroundColor,color:c.color,fs:c.fontSize,fw:c.fontWeight,lh:c.lineHeight,br:c.borderRadius,pad:c.padding,mar:c.margin,border:c.borderTopWidth+'/'+c.borderTopColor,disp:c.display,pos:c.position,z:c.zIndex,ff:c.fontFamily.split(',')[0]}; };
  const T = el => (el.innerText || '').replace(/\s+/g, ' ').trim();
  const out = {vp:{w:innerWidth,h:innerHeight,scrollW:document.documentElement.scrollWidth},heads:[],navItems:[],right:[],promo:null,close:null};
  // 顶栏：y 在 50..120 之间、宽度 >= 90% 视口的 div
  for (const el of document.querySelectorAll('div,header')) {
    const r = el.getBoundingClientRect();
    if (r.width >= innerWidth * 0.9 && r.height >= 40 && r.height <= 90 && r.y >= 0 && r.y < 130) out.heads.push({tag:el.tagName.toLowerCase(), cls:el.className.toString().slice(0,60), rect:R(el), css:S(el), text:T(el).slice(0,60)});
  }
  // 主导航项：水平排列、顶栏内的链接/span，含中文标签
  const heads = Array.from(document.querySelectorAll('div,header')).filter(el => { const r = el.getBoundingClientRect(); return r.y >= 40 && r.y < 120 && r.height >= 40 && r.height <= 90 && r.width >= innerWidth*0.9 && getComputedStyle(el).backgroundColor !== 'rgba(0, 0, 0, 0)'; });
  const scope = heads[0] || document.body;
  // 右侧用户区：顶栏内 x 靠右的容器及其子项
  const rightBox = Array.from(scope.querySelectorAll('div')).filter(el => { const r = el.getBoundingClientRect(); return r.x > innerWidth*0.55 && r.height >= 30 && r.height <= 40 && r.width >= 40; }).pop();
  if (rightBox) {
    out.rightBox = { cls: rightBox.className.toString().slice(0,50), rect: R(rightBox), css: S(rightBox) };
    out.rightKids = Array.from(rightBox.querySelectorAll('*')).filter(el => el.getBoundingClientRect().width > 0).slice(0, 40)
      .map(el => ({ tag: el.tagName.toLowerCase(), cls: el.className.toString().slice(0,45), rect: R(el), css: S(el), text: T(el).slice(0, 14) }));
  }
  for (const el of scope.querySelectorAll('a,span,div')) {
    const t = T(el);
    if (!t || t.length > 8 || el.children.length > 2) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 14 || r.height > 40 || r.width < 16) continue;
    out.navItems.push({tag:el.tagName.toLowerCase(), cls:el.className.toString().slice(0,50), rect:R(el), css:S(el), text:t});
  }
  const promo = document.querySelector('[class*="_wrap_"]') || document.querySelector('.ant-carousel');
  if (promo) { out.promo = {cls: promo.className.toString().slice(0,60), rect:R(promo), css:S(promo)}; }
  const cl = document.querySelector('[aria-label^="close"],.anticon-close');
  if (cl) { out.close = {rect:R(cl), css:S(cl), cls: cl.className.toString().slice(0,50)}; }
  out.html = document.documentElement.outerHTML.length;
  return JSON.stringify(out);
})()
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--side', required=True)
    ap.add_argument('--url', required=True)
    ap.add_argument('--width', type=int, default=1908)
    a = ap.parse_args()
    os.makedirs(EVID, exist_ok=True)
    d = TMWebDriver()
    tid = new_tab(d, a.url)
    try:
        cdp(d, tid, 'Emulation.setDeviceMetricsOverride',
            {'width': a.width, 'height': 900, 'deviceScaleFactor': 1, 'mobile': False}, timeout=15)
        time.sleep(2.2)
        wait_ready(d, tid)
        time.sleep(0.8)
        raw = eval_in(d, tid, JS, timeout=90)
        data = json.loads(raw) if isinstance(raw, str) else raw
        p = os.path.join(EVID, f'head-{a.side}-{a.width}.json')
        json.dump(data, open(p, 'w'), ensure_ascii=False, indent=1)
        print(json.dumps({'file': p, 'vw': data['vp'], 'heads': [(h['rect'], h['css']['bg'], h['css']['pad']) for h in data['heads']],
                          'nav': [(n['text'], n['rect']) for n in data['navItems']], 'promo': data['promo'] and data['promo']['rect'],
                          'close': data['close'] and data['close']['rect']}, ensure_ascii=False, indent=1)[:3000])
    finally:
        close_tab(d, tid)


if __name__ == '__main__':
    main()
