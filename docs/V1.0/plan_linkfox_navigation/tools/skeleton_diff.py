#!/usr/bin/env python3
"""骨架对比：把双端 form.json 的 controls/labels 按 y,x 排序输出，便于逐区对齐。"""
import json, os, sys

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '..'))
EVID = os.path.join(REPO, 'docs/V1.0/plan_linkfox_navigation/evidence/design19-visual-parity-20261029')


def load(side, tid):
    p = os.path.join(EVID, side, tid, 'form.json')
    return json.load(open(p)) if os.path.exists(p) else None


def rows(d, kinds=('controls', 'labels')):
    out = []
    for k in kinds:
        for c in d.get(k) or []:
            t = (c.get('text') or c.get('ph') or '').replace('\n', ' ')[:34]
            r = c.get('r') or {}
            css = c.get('css') or {}
            out.append((r.get('y', 0), r.get('x', 0), k[0], t, r, css))
    out.sort(key=lambda r: (r[0], r[1]))
    return out


def main():
    for tid in sys.argv[1:]:
        r, l = load('real', tid), load('local', tid)
        print('=' * 110)
        print(tid, 'REAL' if r else '-', 'LOCAL' if l else '-')
        for tag, d in (('R', r), ('L', l)):
            if not d:
                continue
            print('-' * 50, tag, d.get('url', '')[:70])
            for y, x, k, t, rr, css in rows(d):
                if rr.get('w', 0) < 8:
                    continue
                print(f'{tag} {k} y{y:4d} x{x:4d} {rr.get("w")}x{rr.get("h")} fs={css.get("fs")} '
                      f'c={css.get("color")} bg={css.get("bg")} br={css.get("br")} | {t}')


if __name__ == '__main__':
    main()
