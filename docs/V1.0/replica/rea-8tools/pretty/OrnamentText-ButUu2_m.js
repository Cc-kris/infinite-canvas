import { o as e, t } from "./rolldown-runtime-Da7WdEYL.js";
import { r as n, x as r } from "./react-qdxTBA-_.js";
import { r as i } from "./mobx-Dz9VxtfR.js";
import { c as a, n as o, wt as s } from "./utils-s6-B6XWS.js";
import {
  Ct as c,
  E as l,
  Lt as u,
  N as d,
  T as f,
  ft as p,
  jt as m,
  kt as h,
  q as g,
  rt as _,
} from "./lib-antd-BlrvMpdd.js";
import { Ii as v, Qn as y, pr as b, ri as x } from "./tools-CxaYXPQE.js";
import { n as S } from "./adoptionUtils-CGP3GLty.js";
import { t as C } from "./points-CPrSlBen.js";
import { t as w } from "./store-DQN9yT0P.js";
import { i as T } from "./markdown-Dq_pZcrt.js";
import { t as E } from "./GenerateBtn-CXZAlBcP.js";
import { t as D } from "./DrawResultList-CF8ppqGu.js";
var O = e(r()),
  k = {
    body: `_body_zy8mx_1`,
    left: `_left_zy8mx_9`,
    configWrapper: `_configWrapper_zy8mx_15`,
    row: `_row_zy8mx_26`,
    inputBox: `_inputBox_zy8mx_36`,
    inputWrapper: `_inputWrapper_zy8mx_55`,
    createBtn: `_createBtn_zy8mx_68`,
    imageCount: `_imageCount_zy8mx_80`,
    right: `_right_zy8mx_123`,
    header: `_header_zy8mx_130`,
    historyBtn: `_historyBtn_zy8mx_146`,
    result: `_result_zy8mx_176`,
  },
  A = {
    content: `_content_1j5gw_1`,
    active: `_active_1j5gw_16`,
    imageBox: `_imageBox_1j5gw_21`,
    info: `_info_1j5gw_34`,
    popBody: `_popBody_1j5gw_53`,
    popContent: `_popContent_1j5gw_64`,
    header: `_header_1j5gw_70`,
    searchItem: `_searchItem_1j5gw_79`,
    container: `_container_1j5gw_88`,
    itemBox: `_itemBox_1j5gw_100`,
    modelItem: `_modelItem_1j5gw_112`,
  },
  j = e(m());
function M(e, t) {
  if (e == null) return {};
  var n = {},
    r = Object.keys(e),
    i,
    a;
  for (a = 0; a < r.length; a++)
    (i = r[a]), !(t.indexOf(i) >= 0) && (n[i] = e[i]);
  return n;
}
function N() {
  return (
    (N = Object.assign
      ? Object.assign.bind()
      : function (e) {
          for (var t = 1; t < arguments.length; t++) {
            var n = arguments[t];
            for (var r in n)
              Object.prototype.hasOwnProperty.call(n, r) && (e[r] = n[r]);
          }
          return e;
        }),
    N.apply(this, arguments)
  );
}
function P(e, t) {
  return (
    (P = Object.setPrototypeOf
      ? Object.setPrototypeOf.bind()
      : function (e, t) {
          return (e.__proto__ = t), e;
        }),
    P(e, t)
  );
}
function F(e, t) {
  (e.prototype = Object.create(t.prototype)),
    (e.prototype.constructor = e),
    P(e, t);
}
function I(e, t, n) {
  if (n || arguments.length === 2)
    for (var r = 0, i = t.length, a; r < i; r++)
      (a || !(r in t)) &&
        ((a ||= Array.prototype.slice.call(t, 0, r)), (a[r] = t[r]));
  return e.concat(a || Array.prototype.slice.call(t));
}
var L = t((e) => {
    var t =
        /; *([!#$%&'*+.^_`|~0-9A-Za-z-]+) *= *("(?:[\u000b\u0020\u0021\u0023-\u005b\u005d-\u007e\u0080-\u00ff]|\\[\u000b\u0020-\u00ff])*"|[!#$%&'*+.^_`|~0-9A-Za-z-]+) */g,
      n = /\\([\u000b\u0020-\u00ff])/g,
      r = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+\/[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
    e.parse = i;
    function i(e) {
      if (!e) throw TypeError(`argument string is required`);
      var i = typeof e == `object` ? a(e) : e;
      if (typeof i != `string`)
        throw TypeError(`argument string is required to be a string`);
      var s = i.indexOf(`;`),
        c = s === -1 ? i.trim() : i.slice(0, s).trim();
      if (!r.test(c)) throw TypeError(`invalid media type`);
      var l = new o(c.toLowerCase());
      if (s !== -1) {
        var u, d, f;
        for (t.lastIndex = s; (d = t.exec(i)); ) {
          if (d.index !== s) throw TypeError(`invalid parameter format`);
          (s += d[0].length),
            (u = d[1].toLowerCase()),
            (f = d[2]),
            f.charCodeAt(0) === 34 &&
              ((f = f.slice(1, -1)),
              f.indexOf(`\\`) !== -1 && (f = f.replace(n, `$1`))),
            (l.parameters[u] = f);
        }
        if (s !== i.length) throw TypeError(`invalid parameter format`);
      }
      return l;
    }
    function a(e) {
      var t;
      if (
        (typeof e.getHeader == `function`
          ? (t = e.getHeader(`content-type`))
          : typeof e.headers == `object` &&
            (t = e.headers && e.headers[`content-type`]),
        typeof t != `string`)
      )
        throw TypeError(`content-type header is missing from object`);
      return t;
    }
    function o(e) {
      (this.parameters = Object.create(null)), (this.type = e);
    }
  })(),
  R = new Map(),
  z = function (e) {
    return e.cloneNode(!0);
  },
  B = function () {
    return window.location.protocol === `file:`;
  },
  V = function (e, t, n) {
    var r = new XMLHttpRequest();
    (r.onreadystatechange = function () {
      try {
        if (!/\.svg/i.test(e) && r.readyState === 2) {
          var t = r.getResponseHeader(`Content-Type`);
          if (!t) throw Error(`Content type not found`);
          var i = (0, L.parse)(t).type;
          if (!(i === `image/svg+xml` || i === `text/plain`))
            throw Error(`Invalid content type: ${i}`);
        }
        if (r.readyState === 4) {
          if (r.status === 404 || r.responseXML === null)
            throw Error(
              B()
                ? `Note: SVG injection ajax calls do not work locally without adjusting security settings in your browser. Or consider using a local webserver.`
                : `Unable to load SVG file: ` + e,
            );
          if (r.status === 200 || (B() && r.status === 0)) n(null, r);
          else
            throw Error(
              `There was a problem injecting the SVG: ` +
                r.status +
                ` ` +
                r.statusText,
            );
        }
      } catch (e) {
        if ((r.abort(), e instanceof Error)) n(e, r);
        else throw e;
      }
    }),
      r.open(`GET`, e),
      (r.withCredentials = t),
      r.overrideMimeType && r.overrideMimeType(`text/xml`),
      r.send();
  },
  H = {},
  U = function (e, t) {
    (H[e] = H[e] || []), H[e].push(t);
  },
  ee = function (e) {
    for (
      var t = function (t, n) {
          setTimeout(function () {
            if (Array.isArray(H[e])) {
              var n = R.get(e),
                r = H[e][t];
              n instanceof SVGSVGElement && r(null, z(n)),
                n instanceof Error && r(n),
                t === H[e].length - 1 && delete H[e];
            }
          }, 0);
        },
        n = 0,
        r = H[e].length;
      n < r;
      n++
    )
      t(n);
  },
  te = function (e, t, n) {
    if (R.has(e)) {
      var r = R.get(e);
      if (r === void 0) {
        U(e, n);
        return;
      }
      if (r instanceof SVGSVGElement) {
        n(null, z(r));
        return;
      }
    }
    R.set(e, void 0),
      U(e, n),
      V(e, t, function (t, n) {
        t
          ? R.set(e, t)
          : n.responseXML?.documentElement instanceof SVGSVGElement &&
            R.set(e, n.responseXML.documentElement),
          ee(e);
      });
  },
  ne = function (e, t, n) {
    V(e, t, function (e, t) {
      e
        ? n(e)
        : t.responseXML?.documentElement instanceof SVGSVGElement &&
          n(null, t.responseXML.documentElement);
    });
  },
  re = 0,
  ie = function () {
    return ++re;
  },
  W = [],
  G = {},
  ae = `http://www.w3.org/2000/svg`,
  K = `http://www.w3.org/1999/xlink`,
  q = function (e, t, n, r, i, a, o) {
    var s = e.getAttribute(`data-src`) || e.getAttribute(`src`);
    if (!s) {
      o(Error(`Invalid data-src or src attribute`));
      return;
    }
    if (W.indexOf(e) !== -1) {
      W.splice(W.indexOf(e), 1), (e = null);
      return;
    }
    W.push(e),
      e.setAttribute(`src`, ``),
      (r ? te : ne)(s, i, function (r, i) {
        if (!i) {
          W.splice(W.indexOf(e), 1), (e = null), o(r);
          return;
        }
        var c = e.getAttribute(`id`);
        c && i.setAttribute(`id`, c);
        var l = e.getAttribute(`title`);
        l && i.setAttribute(`title`, l);
        var u = e.getAttribute(`width`);
        u && i.setAttribute(`width`, u);
        var d = e.getAttribute(`height`);
        d && i.setAttribute(`height`, d);
        var f = Array.from(
          new Set(
            I(
              I(
                I([], (i.getAttribute(`class`) || ``).split(` `), !0),
                [`injected-svg`],
                !1,
              ),
              (e.getAttribute(`class`) || ``).split(` `),
              !0,
            ),
          ),
        )
          .join(` `)
          .trim();
        i.setAttribute(`class`, f);
        var p = e.getAttribute(`style`);
        p && i.setAttribute(`style`, p), i.setAttribute(`data-src`, s);
        var m = [].filter.call(e.attributes, function (e) {
          return /^data-\w[\w-]*$/.test(e.name);
        });
        if (
          (Array.prototype.forEach.call(m, function (e) {
            e.name && e.value && i.setAttribute(e.name, e.value);
          }),
          n)
        ) {
          var h = {
              clipPath: [`clip-path`],
              "color-profile": [`color-profile`],
              cursor: [`cursor`],
              filter: [`filter`],
              linearGradient: [`fill`, `stroke`],
              marker: [`marker`, `marker-start`, `marker-mid`, `marker-end`],
              mask: [`mask`],
              path: [],
              pattern: [`fill`, `stroke`],
              radialGradient: [`fill`, `stroke`],
            },
            g,
            _,
            v,
            y,
            b;
          Object.keys(h).forEach(function (e) {
            (g = e), (v = h[e]), (_ = i.querySelectorAll(g + `[id]`));
            for (
              var t = function (e, t) {
                  (y = _[e].id), (b = y + `-` + ie());
                  var n;
                  Array.prototype.forEach.call(v, function (e) {
                    n = i.querySelectorAll(`[` + e + `*="` + y + `"]`);
                    for (var t = 0, r = n.length; t < r; t++) {
                      var a = n[t].getAttribute(e);
                      (a && !a.match(RegExp(`url\\("?#` + y + `"?\\)`))) ||
                        n[t].setAttribute(e, `url(#` + b + `)`);
                    }
                  });
                  for (
                    var r = i.querySelectorAll(`[*|href]`),
                      a = [],
                      o = 0,
                      s = r.length;
                    o < s;
                    o++
                  ) {
                    var c = r[o].getAttributeNS(K, `href`);
                    c && c.toString() === `#` + _[e].id && a.push(r[o]);
                  }
                  for (var l = 0, u = a.length; l < u; l++)
                    a[l].setAttributeNS(K, `href`, `#` + b);
                  _[e].id = b;
                },
                n = 0,
                r = _.length;
              n < r;
              n++
            )
              t(n);
          });
        }
        i.removeAttribute(`xmlns:a`);
        for (
          var x = i.querySelectorAll(`script`),
            S = [],
            C,
            w,
            T = 0,
            E = x.length;
          T < E;
          T++
        )
          (w = x[T].getAttribute(`type`)),
            (!w ||
              w === `application/ecmascript` ||
              w === `application/javascript` ||
              w === `text/javascript`) &&
              ((C = x[T].innerText || x[T].textContent),
              C && S.push(C),
              i.removeChild(x[T]));
        if (S.length > 0 && (t === `always` || (t === `once` && !G[s]))) {
          for (var D = 0, O = S.length; D < O; D++) Function(S[D])(window);
          G[s] = !0;
        }
        var k = i.querySelectorAll(`style`);
        if (
          (Array.prototype.forEach.call(k, function (e) {
            e.textContent += ``;
          }),
          i.setAttribute(`xmlns`, ae),
          i.setAttribute(`xmlns:xlink`, K),
          a(i),
          !e.parentNode)
        ) {
          W.splice(W.indexOf(e), 1),
            (e = null),
            o(Error(`Parent node is null`));
          return;
        }
        e.parentNode.replaceChild(i, e),
          W.splice(W.indexOf(e), 1),
          (e = null),
          o(null, i);
      });
  },
  oe = function (e, t) {
    var n = t === void 0 ? {} : t,
      r = n.afterAll,
      i = r === void 0 ? function () {} : r,
      a = n.afterEach,
      o = a === void 0 ? function () {} : a,
      s = n.beforeEach,
      c = s === void 0 ? function () {} : s,
      l = n.cacheRequests,
      u = l === void 0 ? !0 : l,
      d = n.evalScripts,
      f = d === void 0 ? `never` : d,
      p = n.httpRequestWithCredentials,
      m = p === void 0 ? !1 : p,
      h = n.renumerateIRIElements,
      g = h === void 0 ? !0 : h;
    if (e && `length` in e)
      for (var _ = 0, v = 0, y = e.length; v < y; v++)
        q(e[v], f, g, u, m, c, function (t, n) {
          o(t, n), e && `length` in e && e.length === ++_ && i(_);
        });
    else
      e
        ? q(e, f, g, u, m, c, function (t, n) {
            o(t, n), i(1), (e = null);
          })
        : i(0);
  },
  J = e(T()),
  se = function (e) {
    return (e?.ownerDocument || document).defaultView || window;
  },
  ce = function (e, t) {
    for (var n in e) if (!(n in t)) return !0;
    for (var r in t) if (e[r] !== t[r]) return !0;
    return !1;
  },
  le = [
    `afterInjection`,
    `beforeInjection`,
    `desc`,
    `evalScripts`,
    `fallback`,
    `httpRequestWithCredentials`,
    `loading`,
    `renumerateIRIElements`,
    `src`,
    `title`,
    `useRequestCache`,
    `wrapper`,
  ],
  Y = `http://www.w3.org/2000/svg`,
  X = `http://www.w3.org/1999/xlink`,
  Z = (function (e) {
    F(t, e);
    function t() {
      var t,
        n = [...arguments];
      return (
        (t = e.call.apply(e, [this].concat(n)) || this),
        (t.initialState = { hasError: !1, isLoading: !0 }),
        (t.state = t.initialState),
        (t._isMounted = !1),
        (t.reactWrapper = void 0),
        (t.nonReactWrapper = void 0),
        (t.refCallback = function (e) {
          t.reactWrapper = e;
        }),
        t
      );
    }
    var n = t.prototype;
    return (
      (n.renderSVG = function () {
        var e = this;
        if (this.reactWrapper instanceof se(this.reactWrapper).Node) {
          var t = this.props,
            n = t.desc,
            r = t.evalScripts,
            i = t.httpRequestWithCredentials,
            a = t.renumerateIRIElements,
            o = t.src,
            s = t.title,
            c = t.useRequestCache,
            l = this.props.onError,
            u = this.props.beforeInjection,
            d = this.props.afterInjection,
            f = this.props.wrapper,
            p,
            m;
          f === `svg`
            ? ((p = document.createElementNS(Y, f)),
              p.setAttribute(`xmlns`, Y),
              p.setAttribute(`xmlns:xlink`, X),
              (m = document.createElementNS(Y, f)))
            : ((p = document.createElement(f)),
              (m = document.createElement(f))),
            p.appendChild(m),
            (m.dataset.src = o),
            (this.nonReactWrapper = this.reactWrapper.appendChild(p));
          var h = function (t) {
            if ((e.removeSVG(), !e._isMounted)) {
              l(t);
              return;
            }
            e.setState(
              function () {
                return { hasError: !0, isLoading: !1 };
              },
              function () {
                l(t);
              },
            );
          };
          oe(m, {
            afterEach: function (t, n) {
              if (t) {
                h(t);
                return;
              }
              e._isMounted &&
                e.setState(
                  function () {
                    return { isLoading: !1 };
                  },
                  function () {
                    try {
                      d(n);
                    } catch (e) {
                      h(e);
                    }
                  },
                );
            },
            beforeEach: function (e) {
              if ((e.setAttribute(`role`, `img`), n)) {
                var t = e.querySelector(`:scope > desc`);
                t && e.removeChild(t);
                var r = document.createElement(`desc`);
                (r.innerHTML = n), e.prepend(r);
              }
              if (s) {
                var i = e.querySelector(`:scope > title`);
                i && e.removeChild(i);
                var a = document.createElement(`title`);
                (a.innerHTML = s), e.prepend(a);
              }
              try {
                u(e);
              } catch (e) {
                h(e);
              }
            },
            cacheRequests: c,
            evalScripts: r,
            httpRequestWithCredentials: i,
            renumerateIRIElements: a,
          });
        }
      }),
      (n.removeSVG = function () {
        var e;
        (e = this.nonReactWrapper) != null &&
          e.parentNode &&
          (this.nonReactWrapper.parentNode.removeChild(this.nonReactWrapper),
          (this.nonReactWrapper = null));
      }),
      (n.componentDidMount = function () {
        (this._isMounted = !0), this.renderSVG();
      }),
      (n.componentDidUpdate = function (e) {
        var t = this;
        ce(N({}, e), this.props) &&
          this.setState(
            function () {
              return t.initialState;
            },
            function () {
              t.removeSVG(), t.renderSVG();
            },
          );
      }),
      (n.componentWillUnmount = function () {
        (this._isMounted = !1), this.removeSVG();
      }),
      (n.render = function () {
        var e = this.props;
        e.afterInjection, e.beforeInjection, e.desc, e.evalScripts;
        var t = e.fallback;
        e.httpRequestWithCredentials;
        var n = e.loading;
        e.renumerateIRIElements, e.src, e.title, e.useRequestCache;
        var r = e.wrapper,
          i = M(e, le),
          a = r;
        return O.createElement(
          a,
          N(
            {},
            i,
            { ref: this.refCallback },
            r === `svg` ? { xmlns: Y, xmlnsXlink: X } : {},
          ),
          this.state.isLoading && n && O.createElement(n, null),
          this.state.hasError && t && O.createElement(t, null),
        );
      }),
      t
    );
  })(O.Component);
(Z.defaultProps = {
  afterInjection: function () {},
  beforeInjection: function () {},
  desc: ``,
  evalScripts: `never`,
  fallback: null,
  httpRequestWithCredentials: !1,
  loading: null,
  onError: function () {},
  renumerateIRIElements: !0,
  title: ``,
  useRequestCache: !0,
  wrapper: `div`,
}),
  (Z.propTypes = {
    afterInjection: J.func,
    beforeInjection: J.func,
    desc: J.string,
    evalScripts: J.oneOf([`always`, `once`, `never`]),
    fallback: J.oneOfType([J.func, J.object, J.string]),
    httpRequestWithCredentials: J.bool,
    loading: J.oneOfType([J.func, J.object, J.string]),
    onError: J.func,
    renumerateIRIElements: J.bool,
    src: J.string.isRequired,
    title: J.string,
    useRequestCache: J.bool,
    wrapper: J.oneOf([`div`, `span`, `svg`]),
  });
var Q = n(),
  ue = ({ value: e, onChange: t, triggerNode: n }) => {
    let [r, i] = (0, O.useState)(!1),
      [a, o] = (0, O.useState)([]);
    (0, O.useEffect)(() => {
      s();
    }, []);
    let s = async () => {
        let e = await v(b.ORNAMENT_TEXT);
        e.code === 200 &&
          (o(e.data), t?.(e.data?.[0].style ?? ``, e.data?.[0]));
      },
      l = (0, Q.jsx)(`div`, {
        className: A.popContent,
        children: (0, Q.jsx)(`div`, {
          className: A.container,
          children: (0, Q.jsx)(g, {
            size: [10, 10],
            wrap: !0,
            children: a.map((n) =>
              (0, Q.jsxs)(
                `div`,
                {
                  className: A.itemBox,
                  children: [
                    (0, Q.jsxs)(
                      `div`,
                      {
                        className: (0, j.default)(A.modelItem, {
                          [A.active]: n.style === e,
                        }),
                        onClick: () => {
                          t?.(n.style, n);
                        },
                        children: [
                          (0, Q.jsx)(Z, {
                            src: n.imageUrl,
                            afterInjection: (e) => {
                              let t = e.querySelector(`path`)?.getBBox();
                              e.setAttribute(
                                `viewBox`,
                                `0 0 ${t?.width} ${t?.height}`,
                              );
                            },
                            beforeInjection: (e) => {
                              e.classList.add(`svg-class-name`),
                                e.setAttribute(
                                  `style`,
                                  `width: 120px; height: 120px;`,
                                );
                            },
                            renumerateIRIElements: !1,
                          }),
                          n.style === e && (0, Q.jsx)(h, {}),
                        ],
                      },
                      n.id,
                    ),
                    (0, Q.jsx)(`p`, { children: n.style }),
                  ],
                },
                n.id,
              ),
            ),
          }),
        }),
      }),
      d = () => n ?? document.body,
      f = (0, O.useMemo)(
        () =>
          `${a.find((t) => t.style === e)?.imageUrl ?? a?.[0]?.imageUrl ?? ``}`,
        [e, a],
      );
    return (0, Q.jsx)(c, {
      content: l,
      trigger: [`click`],
      placement: `right`,
      overlayClassName: A.popBody,
      onOpenChange: i,
      getPopupContainer: d,
      children: (0, Q.jsxs)(`div`, {
        className: (0, j.default)(A.content, { [A.active]: r }),
        children: [
          (0, Q.jsx)(`div`, {
            className: A.imageBox,
            children:
              f &&
              (0, Q.jsx)(Z, {
                src: f,
                afterInjection: (e) => {
                  let t = e.querySelector(`path`)?.getBBox();
                  e.setAttribute(`viewBox`, `0 0 ${t?.width} ${t?.height}`);
                },
                beforeInjection: (e) => {
                  e.classList.add(`svg-class-name`),
                    e.setAttribute(`style`, `width: 52px; height: 52px;`);
                },
                renumerateIRIElements: !1,
              }),
          }),
          (0, Q.jsxs)(`div`, {
            className: A.info,
            children: [
              (0, Q.jsx)(`p`, { children: `字体` }),
              (0, Q.jsx)(`span`, { children: e }),
            ],
          }),
          (0, Q.jsx)(u, {}),
        ],
      }),
    });
  },
  $ = {
    content: `_content_726gv_1`,
    active: `_active_726gv_16`,
    imageBox: `_imageBox_726gv_21`,
    info: `_info_726gv_34`,
    popBody: `_popBody_726gv_53`,
    popContent: `_popContent_726gv_60`,
    header: `_header_726gv_66`,
    searchItem: `_searchItem_726gv_75`,
    container: `_container_726gv_84`,
    itemBox: `_itemBox_726gv_94`,
    modelItem: `_modelItem_726gv_104`,
  },
  de = [
    {
      id: 1,
      title: `两边加环`,
      imageUrl: `/web-assets/both-D7g1Qwje.png`,
      value: `both`,
    },
    {
      id: 2,
      title: `左边加环`,
      imageUrl: `/web-assets/left-C3QCZnrM.png`,
      value: `left`,
    },
    {
      id: 3,
      title: `右边加环`,
      imageUrl: `/web-assets/right-pZ0s7x9c.png`,
      value: `right`,
    },
    {
      id: 4,
      title: `不加环`,
      imageUrl: `/web-assets/none-DTx5xFOU.png`,
      value: `none`,
    },
  ],
  fe = ({ value: e, onChange: t, triggerNode: n }) => {
    let [r, i] = (0, O.useState)(!1),
      a = (0, Q.jsx)(`div`, {
        className: $.popContent,
        children: (0, Q.jsx)(`div`, {
          className: $.container,
          children: (0, Q.jsx)(g, {
            size: [10, 10],
            wrap: !0,
            children: de.map((n) =>
              (0, Q.jsxs)(
                `div`,
                {
                  className: $.itemBox,
                  children: [
                    (0, Q.jsxs)(
                      `div`,
                      {
                        className: (0, j.default)($.modelItem, {
                          [$.active]: n.value === e,
                        }),
                        onClick: () => {
                          t?.(n.value);
                        },
                        children: [
                          (0, Q.jsx)(`img`, { src: n.imageUrl }),
                          n.value === e && (0, Q.jsx)(h, {}),
                        ],
                      },
                      n.id,
                    ),
                    (0, Q.jsx)(`p`, { children: n.title }),
                  ],
                },
                n.id,
              ),
            ),
          }),
        }),
      }),
      o = (0, O.useMemo)(() => de.find((t) => t.value === e), [e]);
    return (0, Q.jsx)(c, {
      content: a,
      trigger: [`click`],
      placement: `right`,
      arrow: !1,
      align: { offset: [20, 0] },
      overlayClassName: $.popBody,
      onOpenChange: i,
      getPopupContainer: () => n ?? document.body,
      children: (0, Q.jsxs)(`div`, {
        className: (0, j.default)($.content, { [$.active]: r }),
        children: [
          (0, Q.jsx)(`div`, {
            className: $.imageBox,
            children: (0, Q.jsx)(`img`, { src: o?.imageUrl }),
          }),
          (0, Q.jsxs)(`div`, {
            className: $.info,
            children: [
              (0, Q.jsx)(`p`, { children: `挂环位置` }),
              (0, Q.jsx)(`span`, { children: o?.title }),
            ],
          }),
          (0, Q.jsx)(u, {}),
        ],
      }),
    });
  },
  pe = i(() => {
    let [e, t] = (0, O.useState)(``),
      [n, r] = (0, O.useState)(10),
      [i, c] = (0, O.useState)(`both`),
      [u, m] = (0, O.useState)(``),
      [h, g] = (0, O.useState)(!1),
      [v, b] = (0, O.useState)(),
      T = (0, O.useRef)(),
      { rebuildId: A, id: j, adoptID: M } = s.parse(location.search);
    (0, O.useEffect)(() => {
      A
        ? (P(A), window.history.replaceState({}, ``, location.pathname))
        : j && (P(j), window.history.replaceState({}, ``, location.pathname));
    }, [A]),
      (0, O.useEffect)(() => {
        v && L(v);
      }, [v]);
    let N = (e) => {
        a.onPageClick(o.PAGE_NAME.ORNAMENT_TEXT, e);
      },
      P = async (e) => {
        try {
          let t = await x(e);
          t && t.code === 200 && R(t.data);
        } catch {}
      },
      F = () => {
        if (!u) {
          l.warning(`请输入想要生成的文字内容`);
          return;
        }
        N(`开始生成`), I();
      },
      I = async () => {
        g(!0);
        try {
          (
            await S(
              {
                type: y.ORNAMENT_TEXT,
                prompt: u,
                extendFields: {
                  fontname: e,
                  fontSize: n,
                  left: [`both`, `left`].includes(i),
                  right: [`both`, `right`].includes(i),
                },
              },
              M,
            )
          ).code === 200 &&
            (T.current?.onRefresh(), w.getStatusInfo(), N(`开始生成`));
        } catch (e) {
          if (e.msgKey) throw Error(e.msgKey);
        } finally {
          g(!1);
        }
      },
      L = (e) => {
        u
          ? f.confirm({
              title: `替换已填写的内容？`,
              content: `您已经填写了内容，确定用新的内容替换已填写的内容？`,
              onOk: () => {
                R(e);
              },
              onCancel: () => {
                b(void 0);
              },
            })
          : R(e);
      },
      R = (e) => {
        m(e?.prompt ?? ``),
          t(e?.extendFields?.fontname ?? ``),
          r(e?.extendFields?.fontSize ?? 10),
          e?.extendFields?.left && e?.extendFields?.right
            ? c(`both`)
            : e?.extendFields?.left
              ? c(`left`)
              : e?.extendFields?.right
                ? c(`right`)
                : c(`none`);
      };
    return (0, Q.jsxs)(`div`, {
      className: k.body,
      children: [
        (0, Q.jsxs)(`div`, {
          className: k.left,
          children: [
            (0, Q.jsxs)(`div`, {
              className: k.configWrapper,
              children: [
                (0, Q.jsxs)(`div`, {
                  className: k.row,
                  children: [
                    (0, Q.jsx)(`p`, { children: `文字内容` }),
                    (0, Q.jsx)(`div`, {
                      className: k.inputBox,
                      children: (0, Q.jsx)(d.TextArea, {
                        value: u,
                        onChange: (e) => {
                          m(e.target.value.replace(/[^a-zA-Z]/g, ``));
                        },
                        placeholder: `输入想要生成的文字内容，仅支持输入英文、不要包含空格，例如：jewelry`,
                        rows: 3,
                        maxLength: 50,
                        showCount: !0,
                        bordered: !1,
                      }),
                    }),
                  ],
                }),
                (0, Q.jsx)(ue, { value: e, onChange: t }),
                (0, Q.jsx)(fe, { value: i, onChange: c }),
                (0, Q.jsxs)(`div`, {
                  className: k.row,
                  style: { marginTop: 16 },
                  children: [
                    (0, Q.jsx)(`p`, { children: `字体大小` }),
                    (0, Q.jsxs)(`div`, {
                      className: k.inputWrapper,
                      children: [
                        (0, Q.jsx)(_, {
                          value: n,
                          onChange: (e) => {
                            r(e === null ? void 0 : Math.floor(e));
                          },
                          onBlur: (e) => {
                            e.target.value || r(10);
                          },
                          controls: !1,
                          style: { width: 60 },
                          min: 1,
                          max: 200,
                          step: 1,
                        }),
                        (0, Q.jsx)(`span`, { children: `pt` }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
            (0, Q.jsx)(`div`, {
              className: k.createBtn,
              children: (0, Q.jsx)(E, {
                block: !0,
                onClick: F,
                loading: h,
                disabled: !u,
                costPoint: C.ORNAMENT_TEXT.generatePoints,
                children: `立即生成`,
              }),
            }),
          ],
        }),
        (0, Q.jsxs)(`div`, {
          className: k.right,
          children: [
            (0, Q.jsx)(`div`, {
              className: k.header,
              children: (0, Q.jsx)(p, {
                items: [{ key: `1`, label: `生成结果` }],
                tabBarGutter: 14,
              }),
            }),
            (0, Q.jsx)(`div`, {
              className: k.result,
              children: (0, Q.jsx)(D, {
                onRef: T,
                type: y.ORNAMENT_TEXT,
                onTrack: (0, O.useCallback)((e) => {
                  N(e);
                }, []),
                onRebuild: (0, O.useCallback)((e) => {
                  L(e), N(`点击再次编辑`);
                }, []),
              }),
            }),
          ],
        }),
      ],
    });
  });
export { pe as default };
