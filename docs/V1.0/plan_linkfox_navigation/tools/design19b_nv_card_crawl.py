#!/usr/bin/env python3
"""design19b-nv：在已登录原站「批量生图」大类页逐卡点击，记录子工具真实 URL。

产物: evidence/design19b-nv-final/real-map/cards.json
"""
import json
import os
import sys
import time

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
OUT = os.path.join(REPO, 'docs/V1.0/plan_linkfox_navigation/evidence/design19b-nv-final/real-map
...[Truncated]...
    with open(os.path.join(OUT, 'cards.json'), 'w') as f:
        json.dump(res, f, ensure_ascii=False, indent=1)
    for k, v in res.items():
        print(k, '=>', v)
    cdp(d, tid, "Page.close")


if __name__ == '__main__':
    main()
