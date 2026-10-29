(() => {
  const out = { url: location.href, title: document.title };
  const vis = el => {
    const r = el.getBoundingClientRect(), c = getComputedStyle(el);
    return r.width > 2 && r.height > 2 && c.visibility !== 'hidden' && c.display !== 'none' && c.opacity !== '0';
  };
  const txt = (el, n) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, n || 80);
  const labOf = el => {
    let t = '';
    if (el.labels && el.labels.length) t = txt(el.labels[0], 60);
    if (!t) { const l = el.closest('label'); if (l) t = txt(l, 60); }
    if (!t) { const p = el.parentElement; if (p) t = txt(p, 60); }
    return t || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name') || '';
  };
  const rect = el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const stateOf = el => {
    if (el.getAttribute('aria-checked') != null) return el.getAttribute('aria-checked');
    if (el.getAttribute('aria-selected') != null) return el.getAttribute('aria-selected');
    const ds = el.getAttribute('data-state');
    if (ds) return ds;
    const c = (el.className || '').toString();
    if (/(^|[^a-z])(active|checked|selected|current)([^a-z]|$)/i.test(c)) return 'active';
    if (el.tagName === 'INPUT' && (el.type === 'radio' || el.type === 'checkbox')) return el.checked ? 'true' : 'false';
    return '';
  };
  const seen = new Set();
  const controls = [];
  const cbSel = 'input,textarea,select,button,[role="switch"],[role="tab"],[role="radio"],[role="checkbox"],[role="slider"],[role="option"],[contenteditable="true"]';
  document.querySelectorAll(cbSel).forEach(el => {
    if (!vis(el)) return;
    const r = rect(el);
    const key = [el.tagName, el.type || '', el.name || '', labOf(el), r.x, r.y].join('|');
    if (seen.has(key)) return;
    seen.add(key);
    let value = null, checked = null, selected = null, options = null;
    if (el.tagName === 'SELECT') {
      value = el.value;
      options = [...el.options].map(o => ({ t: txt(o, 40), v: o.value, s: o.selected }));
      selected = (el.options[el.selectedIndex] || {}).text || null;
    } else if (el.type === 'radio' || el.type === 'checkbox') {
      checked = el.checked; value = el.value;
    } else if ('value' in el && el.tagName !== 'BUTTON') {
      value = el.value;
    }
    controls.push({
      tag: el.tagName.toLowerCase(), type: el.type || '', role: el.getAttribute('role'),
      label: labOf(el), text: txt(el, 80), value, checked, selected, options,
      placeholder: el.getAttribute('placeholder'), state: stateOf(el),
      ariaValueNow: el.getAttribute('aria-valuenow'),
      disabled: !!el.disabled, r
    });
  });
  // antd 已选值
  const antSelected = [...document.querySelectorAll('.ant-select-selection-item,.ant-tabs-tab-active,.ant-radio-wrapper-checked,.ant-checkbox-wrapper-checked')]
    .filter(vis).map(el => ({ text: txt(el, 40), cls: (el.className || '').toString().slice(0, 90) }));
  // 选项组：同一父容器内 2~10 个可点纯文本叶子
  const leaf = [...document.querySelectorAll('div,span,label,li,button')].filter(vis).filter(el => {
    const t = txt(el, 16);
    if (!t || t.length > 16) return false;
    if (el.querySelector('input,textarea,select,button,[role="radio"],[role="option"]')) return false;
    const c = getComputedStyle(el);
    return c.cursor === 'pointer' || !!el.getAttribute('role');
  });
  const byParent = new Map();
  for (const el of leaf) {
    const p = el.parentElement; if (!p) continue;
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p).push(el);
  }
  const optionGroups = [];
  for (const [p, kids] of byParent) {
    const texts = [...new Set(kids.map(k => txt(k, 16)))].slice(0, 10);
    if (texts.length < 2 || texts.length > 10) continue;
    const active = kids.filter(k => ['true', 'checked', 'active', 'on'].includes(stateOf(k))).map(k => txt(k, 16));
    const label = (p.previousElementSibling ? txt(p.previousElementSibling, 40) : '') || (p.parentElement && p.parentElement.previousElementSibling ? txt(p.parentElement.previousElementSibling, 40) : '');
    optionGroups.push({ label, options: texts, active: [...new Set(active)], count: texts.length, r: rect(p) });
  }
  // 已选中元素（跨框架：class/aria/data-state 任一命中）
  const activeEls = [...document.querySelectorAll('div,span,label,li,button,a')].filter(vis).map(el => {
    const c = (el.className || '').toString();
    const st = stateOf(el);
    const isActive = ['true', 'checked', 'active', 'on'].includes(st) || /(^|[^a-z])(active|selected|checked|current)([^a-z]|$)/i.test(c);
    if (!isActive) return null;
    const t = txt(el, 24);
    if (!t || t.length > 24) return null;
    const p = el.parentElement;
    return { text: t, cls: c.slice(0, 80), parentText: p ? txt(p, 50) : '', r: rect(el) };
  }).filter(Boolean);
  const bodyText = (document.body.innerText || '').replace(/\n{2,}/g, '\n');
  out.bodyText = bodyText.slice(0, 12000);
  out.controls = controls;
  out.antSelected = antSelected;
  out.optionGroups = optionGroups;
  out.caseModule = {
    caseTab: /优秀案例/.test(bodyText),
    hasCaseWord: /优秀案例|成功案例/.test(bodyText),
    sameStyle: (bodyText.match(/一键做同款|做同款/g) || []).length,
    imgs: [...document.querySelectorAll('img')].filter(vis).length,
  };
  return out;
})()
