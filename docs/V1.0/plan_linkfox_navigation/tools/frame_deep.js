(() => {
  const R = el => { const r = el.getBoundingClientRect(); return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}; };
  const out = [];
  const walk = (el, depth, path) => {
    if (out.length > 400 || depth > 14) return;
    const c = getComputedStyle(el);
    if (c.display === 'none' || c.visibility === 'hidden') return;
    const r = R(el);
    const area = r.w * r.h;
    const keep = area > 4000 && r.w > 24 && r.h > 12;
    if (keep) {
      out.push({
        d: depth, p: path, tag: el.tagName.toLowerCase(),
        cls: (el.className || '').toString().trim().split(/\s+/).slice(0, 6).join(' ').slice(0, 110),
        testid: el.getAttribute('data-testid') || '',
        r,
        bg: c.backgroundColor, color: c.color,
        bt: c.borderTopWidth + ' ' + c.borderTopColor,
        br_: c.borderRightWidth + ' ' + c.borderRightColor,
        bb: c.borderBottomWidth + ' ' + c.borderBottomColor,
        rad: c.borderRadius, pad: c.padding, mar: c.margin,
        pos: c.position, disp: c.display, gap: c.gap,
        gtc: c.gridTemplateColumns.length > 60 ? c.gridTemplateColumns.slice(0, 60) + '…' : c.gridTemplateColumns,
        sh: c.boxShadow === 'none' ? '' : c.boxShadow.slice(0, 40),
        txt: (el.childElementCount === 0 ? (el.textContent || '') : (el.getAttribute('aria-label') || '')).trim().replace(/\s+/g, ' ').slice(0, 28)
      });
    }
    [...el.children].forEach((ch, i) => walk(ch, depth + 1, path + '/' + i));
  };
  walk(document.body, 0, '');
  const q = s => { const el = document.querySelector(s); if (!el) return null; const c = getComputedStyle(el); return {r: R(el), bg: c.backgroundColor, color: c.color, pad: c.padding, br: c.borderRightWidth + ' ' + c.borderRightColor, rad: c.borderRadius}; };
  return {
    url: location.href,
    viewport: {w: innerWidth, h: innerHeight},
    theme: {htmlCls: document.documentElement.className, bodyBg: getComputedStyle(document.body).backgroundColor, colorScheme: getComputedStyle(document.documentElement).colorScheme},
    key: {
      appHeader: q('header'),
      toolSidebar: q('[data-testid=tool-sidebar]'),
      workspace: q('[data-testid=tool-workspace]'),
      main: q('main')
    },
    nodes: out
  };
})()
