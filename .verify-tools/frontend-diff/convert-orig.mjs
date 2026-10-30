import fs from 'node:fs';
import path from 'node:path';

const SRC = '/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/evidence/page-dom-20261028';
const OUT = '/Users/mac/Documents/Dev/infinite-canvas/.verify-tools/frontend-diff/orig-json';
fs.mkdirSync(OUT, { recursive: true });

let ok = 0, bad = [];
for (const f of fs.readdirSync(SRC)) {
  if (!f.endsWith('.json')) continue;
  const p = path.join(SRC, f);
  const raw = fs.readFileSync(p, 'utf8');
  try {
    // 证据文件是 JS 对象字面量（含 true/false/null），用 Function 求值最稳
    const obj = new Function('return (' + raw + ');')();
    fs.writeFileSync(path.join(OUT, f), JSON.stringify(obj, null, 1));
    ok++;
  } catch (e) {
    bad.push(f + ' :: ' + String(e).slice(0, 120));
  }
}
console.log('converted', ok, 'failed', bad.length);
for (const b of bad) console.log('BAD', b);
