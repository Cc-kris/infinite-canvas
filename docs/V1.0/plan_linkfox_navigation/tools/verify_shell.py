#!/usr/bin/env python3
"""B12 终验：同一段 JS（verify_shell.js）双端采集，逐 rect / computed style 归一化对比。

python3 verify_shell.py --width 1908          # 双端采集 + 对比
python3 verify_shell.py --width 1908 --show   # 只看已有结果
"""
import argparse, json, math, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from probe_frame import TMWebDriver, cdp, new_tab, close_tab, eval_in, wait_ready

HERE = os.path.dirname(os.path.abspath(__file__))
EVID = os.path.join(HERE, '..', 'evidence', 'b12-shell-final-20261029')
JS = open(os.path.join(HERE, 'verify_shell.js'), encoding='utf-8').read()
URLS = {'real': 'https://www.linkfox.com/draw/ai-outpainting',
        'local': 'http://127.0.0.1:3000/tools/ecommerce-suite/ai-outpainting'}


def _oklch_to_rgb(s):
    try:
        body = s[s.index('(') + 1:s.rindex(')')].replace('/', ' ').split()
        L, C, H = float(body[0]), float(body[1]), float(body[2])
        a = float(body[3]) if len(body) > 3 else 1.0
        h = math.radians(H)
        A, B = C * math.cos(h), C * math.sin(h)
        l_ = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
        m_ = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
        s_ = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3
        r = 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_
        g = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_
        b = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.7076147010 * s_
        f = lambda x: round(max(0.0, min(1.0, x)) ** (1 / 2.2) * 255)
        return f'rgba({f(r)}, {f(g)}, {f(b)}, {round(a, 3)})'
    except Exception:
        return s


import re as _re


def norm(v):
    if isinstance(v, str) and v.startswith('oklch('):
        return _oklch_to_rgb(v)
    if isinstance(v, str) and 'gradient' in v:
        return _re.sub(r'\s\d+%', '', v)
    return v


def flatten(d, pre=''):
    out = {}
    if isinstance(d, dict):
        for k, v in d.items():
            out.update(flatten(v, f'{pre}.{k}' if pre else k))
    elif isinstance(d, list):
        for i, v in enumerate(d):
            out.update(flatten(v, f'{pre}[{i}]'))
    else:
        out[pre] = norm(d)
    return out


def collect(side, width):
    drv = TMWebDriver()
    tid = new_tab(drv, URLS[side])
    try:
        cdp(drv, tid, 'Emulation.setDeviceMetricsOverride',
            {'width': width, 'height': 781, 'deviceScaleFactor': 1, 'mobile': False})
        wait_ready(drv, tid, 50)
        import time
        time.sleep(2.5)
        body = JS.replace('__SIDE__', side)
        raw = eval_in(drv, tid, '(()=>{try{return ' + body + '}catch(e){return JSON.stringify({error:String((e&&e.stack)||e)})}})()', timeout=90)
        data = json.loads(raw)
        print(f'[{side} {width}] collected: promo={bool(data.get("promo"))} header={bool(data.get("header"))}')
        return data
    finally:
        close_tab(drv, tid)


def save(side, width, data):
    os.makedirs(EVID, exist_ok=True)
    p = os.path.join(EVID, f'verify-{width}-{side}.json')
    json.dump(data, open(p, 'w'), ensure_ascii=False, indent=1)
    print('wrote', p)


# 说明：原站促销条是品牌图（无文本），本地用自有文案替代；「免费得算力」原站为
# 外层深色文字 + 内层红色文字，采集器命中的是外层，故颜色差异记录为已知差异。
ALLOW = (
    'side', 'theme.htmlCls', 'theme.colorScheme', 'vp.',
    'promo.text', 'user.free.leaf.css.color',
)


def allowed(k):
    return any(k.startswith(a) for a in ALLOW)


def compare(width):
    real = json.load(open(os.path.join(EVID, f'verify-{width}-real.json')))
    loc = json.load(open(os.path.join(EVID, f'verify-{width}-local.json')))
    fr, fl = flatten(real), flatten(loc)
    keys = [k for k in fr if k in fl and not allowed(k)]
    rows, metric = [], []
    for k in keys:
        a, b = fr[k], fl[k]
        if isinstance(a, (int, float)) and isinstance(b, (int, float)):
            tol = 2.0 if '.rect.' in k else 0.01
            ok = abs(a - b) <= tol
            rows.append((k, a, b, f'{b - a:+.1f}', 'PASS' if ok else 'DIFF'))
            metric.append({'id': k, 'real': a, 'local': b, 'delta': round(b - a, 2), 'pass': ok})
        else:
            ok = str(a) == str(b)
            rows.append((k, a, b, '', 'PASS' if ok else 'DIFF'))
            metric.append({'id': k, 'real': a, 'local': b, 'delta': None, 'pass': ok})
    json.dump({'width': width, 'metrics': metric,
               'pass': sum(1 for m in metric if m['pass']), 'total': len(metric)},
              open(os.path.join(EVID, f'verify-{width}.json'), 'w'), ensure_ascii=False, indent=1)
    showed = [r for r in rows if r[4] == 'DIFF']
    print(f'\n== {width}px: {len(metric) - len(showed)}/{len(metric)} PASS ==')
    for r in showed:
        print(f'  DIFF {r[0]:46} real={r[1]!r:28} local={r[2]!r} ({r[3]})')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--width', type=int, default=1908)
    ap.add_argument('--side', choices=['real', 'local'])
    a = ap.parse_args()
    if a.side:
        save(a.side, a.width, collect(a.side, a.width))
    else:
        for s in ('real', 'local'):
            save(s, a.width, collect(s, a.width))
        compare(a.width)
