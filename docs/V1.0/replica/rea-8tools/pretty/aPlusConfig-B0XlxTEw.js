import { r as e } from "./consts-BDsiNS4L.js";
var t = (e) => e?.sceneType ?? {},
  n = (e) => ({
    sceneType: {
      [e.pro]: { checked: !0, num: 4 },
      [e.phone]: { checked: !1, num: 4 },
      [e.normal]: { checked: !1, num: 4 },
      [e.custom]: { checked: !1, num: 4 },
    },
  }),
  r = (e) => ({
    sceneType: {
      [e.pro]: { checked: !1, num: 4 },
      [e.phone]: { checked: !1, num: 4 },
      [e.normal]: { checked: !1, num: 4 },
      [e.custom]: { checked: !1, num: 4 },
    },
  }),
  i = (e, i) => {
    let a = t(e),
      o = t(r(i));
    if (!Object.keys(o).some((e) => Object.prototype.hasOwnProperty.call(a, e)))
      return n(i);
    let s = {};
    return (
      Object.entries(o).forEach(([e, t]) => {
        s[e] = a[e] ? { ...t, ...a[e] } : t;
      }),
      { sceneType: s }
    );
  },
  a = (e) =>
    Object.values(t(e)).reduce((e, t) => e + (t.checked ? (t.num ?? 0) : 0), 0),
  o = (e, n) => {
    if (n <= 0) return e;
    let r = { ...t(e) };
    return (
      Object.keys(r).forEach((e) => {
        r[e] = { ...r[e], num: n };
      }),
      { ...e, sceneType: r }
    );
  },
  s = (e) => {
    try {
      if (typeof localStorage > `u`) return 0;
      let t = localStorage.getItem(e);
      if (!t) return 0;
      let n = JSON.parse(t);
      return Array.isArray(n?.aPlusStyles) ? n.aPlusStyles.length : 0;
    } catch {
      return 0;
    }
  },
  c = (e, n, r = 0, i = 4) => {
    if (n > 0 || r <= 0) return e;
    let a = { ...t(e) },
      o = Object.entries(a).filter(([, e]) => e?.checked);
    return o.length < 2 || !o.every(([, e]) => e.num === r)
      ? e
      : (o.forEach(([e]) => {
          a[e] = { ...a[e], num: i };
        }),
        { ...e, sceneType: a });
  },
  l = (e) => {
    if (!e) return;
    let [t, n] = e.split(`:`).map((e) => Number(e));
    if (!(!t || !n)) return { width: t, height: n };
  },
  u = (e, n = `custom`) => {
    let r = t(e)[n];
    if (!r?.checked) return;
    let i = r.customConfig;
    if (!(!i?.width || !i.height)) return `${i.width}:${i.height}`;
  },
  d = (e) => {
    let n = e.enabled !== !1 && !!t(e.config)[e.customType]?.checked;
    return {
      ...(e.styles.length
        ? {
            aPlusStyles: e.styles.map((e) => ({
              id: e.id,
              style: e.style,
              imageUrl: e.imageUrl,
              materialSource: e.materialSource,
              tabType: e.tabType,
            })),
          }
        : {}),
      ...(e.noText ? { noText: !0 } : {}),
      ...(n && e.targetWidth > 0 && e.targetHeight > 0
        ? { aPlusTargetWidth: e.targetWidth, aPlusTargetHeight: e.targetHeight }
        : {}),
    };
  },
  f = new Set(Object.values(e)),
  p = (t) =>
    Array.isArray(t)
      ? t.map((t) => {
          let n = t,
            r = n.tabType && f.has(n.tabType) ? n.tabType : e.RECOMMEND;
          return {
            id: n.id || n.styleId || ``,
            styleId: n.styleId,
            style: n.style || ``,
            imageUrl: n.imageUrl || ``,
            materialSource: n.materialSource ?? 0,
            tabType: r,
          };
        })
      : [],
  m = (e, t) => ({
    ...(e.length
      ? {
          pointStyles: e.map((e) => ({
            id: e.id,
            style: e.style,
            imageUrl: e.imageUrl,
            materialSource: e.materialSource,
            tabType: e.tabType,
          })),
        }
      : {}),
    ...(t ? { noText: !0 } : {}),
  }),
  h = (e) => (typeof e == `number` && Number.isInteger(e) && e > 0 ? e : 4),
  g = (e) => {
    let t = e.type;
    if (t === `APlusCustom`) {
      let t = e.APlusAspectRatio || e.aspectRatio;
      return t ? `自定义A+ (${t})` : `自定义A+图`;
    }
    return t === `APlusHasPhone`
      ? `手机A+图`
      : t === `APlusPro`
        ? `高级A+图`
        : t === `A+`
          ? e.isAPlusPro === !0
            ? `高级A+图`
            : e.isAPlusPro === !1
              ? `普通A+图`
              : e.APlusAspectRatio
                ? `自定义A+ (${e.APlusAspectRatio})`
                : `普通A+图`
          : null;
  },
  _ = (e, n) => {
    let r = t(e),
      i = r[n.pro],
      a = r[n.phone],
      o = r[n.normal],
      s = r[n.custom],
      c = n.phoneSub ?? n.phone,
      l = [];
    if (
      (i?.checked &&
        (l.push({ type: n.normal, outputNum: h(i.num), isAPlusPro: !0 }),
        a?.checked && l.push({ type: c, outputNum: h(i.num), isAPlusPro: !0 })),
      o?.checked &&
        l.push({ type: n.normal, outputNum: h(o.num), isAPlusPro: !1 }),
      s?.checked)
    ) {
      let t = u(e, n.custom);
      l.push({
        type: n.customSub,
        outputNum: h(s.num),
        ...(t ? { APlusAspectRatio: t } : {}),
      });
    }
    return l;
  },
  v = (e, n, r, i) => {
    let a = t(e),
      o = a[n.pro],
      s = a[n.phone],
      c = a[n.normal],
      l = a[n.custom],
      d = n.phoneSub ?? n.phone,
      f = [];
    if (
      (o?.checked &&
        (f.push({
          type: n.normal,
          outputNum: h(o.num),
          isAPlusPro: !0,
          userSelectedSize: r,
        }),
        s?.checked && f.push({ type: d, outputNum: h(o.num) })),
      c?.checked &&
        f.push({
          type: n.normal,
          outputNum: h(c.num),
          isAPlusPro: !1,
          userSelectedSize: i,
        }),
      l?.checked)
    ) {
      let t = u(e, n.custom);
      f.push({
        type: n.customSub,
        outputNum: h(l.num),
        ...(t ? { aspectRatio: t, APlusAspectRatio: t } : {}),
      });
    }
    return f;
  },
  y = (e, t, n, r) => {
    let i = l(r);
    e[t] = { checked: !0, num: h(n), ...(i ? { customConfig: i } : {}) };
  },
  b = (e, t) => {
    let n = e[t.pro],
      r = e[t.phone];
    return (
      r?.checked && (n?.checked ? (r.num = n.num) : (r.checked = !1)),
      {
        open: Object.values(e).some((e) => e.checked),
        config: { sceneType: e },
      }
    );
  },
  x = (e, n, i) => {
    let a = t(r(n)),
      o = n.phoneSub ?? n.phone,
      s = e.some((e) => e.type === n.customSub) ? void 0 : i;
    return (
      e.forEach((e) => {
        let t = h(e.outputNum);
        if (e.type === n.customSub) {
          y(a, n.custom, t, e.APlusAspectRatio || e.aspectRatio);
          return;
        }
        if (e.type === o) {
          a[n.phone] = { checked: !0, num: t };
          return;
        }
        e.type === n.normal &&
          (s
            ? y(a, n.custom, t, s)
            : e.isAPlusPro
              ? (a[n.pro] = { checked: !0, num: t })
              : (a[n.normal] = { checked: !0, num: t }));
      }),
      b(a, n)
    );
  },
  S = (e, n, i) => {
    let a = t(r(n)),
      o = n.phoneSub ?? n.phone;
    return (
      e.forEach((e) => {
        let t = h(e.outputNum);
        if (e.type === n.customSub) {
          y(a, n.custom, t, e.APlusAspectRatio || e.aspectRatio);
          return;
        }
        if (e.type === o) {
          a[n.phone] = { checked: !0, num: t };
          return;
        }
        if (e.type === n.normal) {
          let r = e.APlusAspectRatio || e.aspectRatio;
          r
            ? y(a, n.custom, t, r)
            : e.isAPlusPro === !0 ||
                (e.isAPlusPro === void 0 &&
                  (e.userSelectedSize === i ||
                    e.userSelectedSize === `1464*610`))
              ? (a[n.pro] = { checked: !0, num: t })
              : (a[n.normal] = { checked: !0, num: t });
        }
      }),
      b(a, n)
    );
  };
export {
  n as a,
  a as c,
  c as d,
  g as f,
  o as g,
  x as h,
  _ as i,
  i as l,
  p as m,
  v as n,
  u as o,
  S as p,
  m as r,
  t as s,
  d as t,
  s as u,
};
