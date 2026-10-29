(() => {
  const SIDE = '__SIDE__';
  const R = el => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
  const C = (el, props) => { if (!el) return null; const cs = getComputedStyle(el); const o = {}; props.forEach(p => { o[p] = cs[p]; }); if (o.borderRadius) o.borderRadius = rad(o.borderRadius); return o; };
  const q = sel => document.querySelector(sel);
  const th = () => Array.from(document.querySelectorAll('div,header')).filter(el => {
    const r = el.getBoundingClientRect(); const bg = getComputedStyle(el).backgroundColor;
    return r.y >= 40 && r.y < 120 && r.height >= 40 && r.height <= 90 && r.width >= innerWidth * 0.9 && bg !== 'rgba(0, 0, 0, 0)';
  })[0];
  const txt = (t, tag) => Array.from(document.querySelectorAll(tag || 'a,span,button,div')).filter(e => e.textContent.replace(/\s/g, '') === t.replace(/\s/g, '') && e.getBoundingClientRect().width > 0).sort((a, b) => a.getBoundingClientRect().width - b.getBoundingClientRect().width)[0];

  const transparent = c => !c || c === 'rgba(0, 0, 0, 0)' || c === 'transparent';
  // 原站把底色放在外层容器、文字在内层；本地把两者合在同一元素。统一取"有底色的外壳"。
  const chrome = el => { if (!el) return null; let e = el; for (let i = 0; i < 4 && transparent(getComputedStyle(e).backgroundColor); i++) { if (!e.parentElement) break; e = e.parentElement; } return e; };
  const rad = v => { const n = parseFloat(v); return n >= 1000 ? '50%' : v; };

  const header = SIDE === 'local' ? q('[data-testid="shell-top-nav"]') : th();
  const out = { side: SIDE, vp: { w: innerWidth, h: innerHeight, scrollW: document.documentElement.scrollWidth } };
  out.theme = { bodyBg: getComputedStyle(document.body).backgroundColor, colorScheme: getComputedStyle(document.documentElement).colorScheme, htmlCls: document.documentElement.className };
  out.header = header ? { rect: R(header), css: C(header, ['backgroundColor', 'zIndex', 'borderBottomWidth', 'borderBottomColor']) } : null;

  // 促销条：本地按 wrapper 高度定位；原站 _wrap_ + ant-carousel
  const promo = SIDE === 'local'
    ? q('[data-testid="shell-promo-bar"]')
    : Array.from(document.querySelectorAll('div')).filter(el => { const r = el.getBoundingClientRect(); return Math.abs(r.y) < 2 && Math.abs(r.height - 50) < 2 && r.width >= innerWidth * 0.95; })[0];
  out.promo = promo ? { rect: R(promo), css: C(promo, ['position', 'zIndex', 'overflow']), text: promo.textContent.trim().slice(0, 40) } : null;
  const close = promo ? (promo.querySelector('[data-testid="shell-promo-close"]') || promo.querySelector('.anticon-close') || promo.querySelector('button')) : null;
  out.promoClose = close ? { rect: R(close), css: C(close, ['position', 'color', 'fontSize']) } : null;

  // 导航项（顶栏内水平排列、有文字的最小元素）
  const navWrap = header ? Array.from(header.querySelectorAll('div')).filter(el => { const r = el.getBoundingClientRect(); return r.height >= 20 && r.height <= 30 && r.width > 200; })[0] : null;
  out.navItems = navWrap ? Array.from(navWrap.querySelectorAll('a,span')).filter(el => el.getBoundingClientRect().width > 0 && el.textContent.trim() && el.querySelectorAll('a,span').length === 0).slice(0, 14).map(el => ({
    text: el.textContent.trim().slice(0, 8), rect: R(el), css: C(el, ['fontSize', 'color', 'fontWeight', 'lineHeight']),
  })) : [];
  out.navWrap = navWrap ? R(navWrap) : null;

  const avatar0 = SIDE === 'local' ? q('[data-testid="shell-user-avatar"]') : q('.ant-avatar');
  const name0 = SIDE === 'local' ? q('[data-testid="shell-user-name"]') : leafBy('用户6991');
  const sub0 = SIDE === 'local' ? q('[data-testid="shell-user-account-type"]') : leafBy('个人账号');
  const pill = SIDE === 'local' ? q('[data-testid="shell-user-points"]') : (q('[class*="_pointsPopover"]') || null);
  // 用户区：同时度量「叶子文本」与「最近的有底色/渐变的外壳」，避免两端 DOM 层级不同导致错位
  function N(t) { return t.replace(/\s/g, ''); }
  function leafBy(key, localSel) {
    if (SIDE === 'local' && localSel) {
      const host = q(localSel);
      if (host) return Array.from(host.querySelectorAll('*')).filter(e => e.childElementCount === 0 && N(e.textContent) === N(key))[0] || host;
    }
    const all = Array.from(document.querySelectorAll('*')).filter(e => e.childElementCount <= 1 && N(e.textContent) === N(key) && e.getBoundingClientRect().width > 0);
    return all.sort((a, b) => a.getBoundingClientRect().width - b.getBoundingClientRect().width)[0] || null;
  }
  const painted = e => { const c = getComputedStyle(e); return !transparent(c.backgroundColor) || (c.backgroundImage && c.backgroundImage !== 'none'); };
  const chipOf = leaf => { if (!leaf) return null; let e = leaf; for (let i = 0; i < 4 && e; i++) { if (painted(e) && e.getBoundingClientRect().width <= leaf.getBoundingClientRect().width + 70) return e; e = e.parentElement; } return null; };
  const m = (key, localSel) => {
    const leaf = leafBy(key, localSel); const chip = chipOf(leaf);
    return {
      leaf: leaf ? { rect: R(leaf), css: C(leaf, ['color', 'fontSize', 'fontWeight', 'lineHeight']) } : null,
      chip: chip ? { rect: R(chip), css: C(chip, ['backgroundColor', 'backgroundImage', 'borderRadius', 'padding']) } : null,
    };
  };
  out.user = {
    learn: m('学习中心', '[data-testid="shell-user-learning-center"]'),
    free: m('免费得算力', '[data-testid="shell-user-free-quota"]'),
    buy: m('购买', '[data-testid="shell-user-buy"]'),
    points: m('0', '[data-testid="shell-user-points-value"]'),
    avatar: avatar0 && { rect: R(avatar0), css: C(avatar0, ['backgroundColor', 'color', 'fontSize', 'borderRadius']) },
    name: name0 && { rect: R(name0), css: C(name0, ['color', 'fontSize', 'lineHeight']) },
    sub: sub0 && { rect: R(sub0), css: C(sub0, ['color', 'fontSize', 'lineHeight']) },
    pill: pill && { rect: R(pill), css: C(pill, ['backgroundColor', 'borderRadius']) },
  };

  const aside = q('aside') || Array.from(document.querySelectorAll('div')).filter(el => { const r = el.getBoundingClientRect(); return Math.abs(r.width - 180) < 2 && r.height > innerHeight * 0.5; })[0];
  out.aside = aside ? { rect: R(aside), css: C(aside, ['backgroundColor', 'borderRightWidth']) } : null;
  const main = document.querySelector('main') || (aside ? aside.nextElementSibling : null);
  out.main = main ? { rect: R(main), css: C(main, ['backgroundColor']) } : null;
  return JSON.stringify(out);
})()
