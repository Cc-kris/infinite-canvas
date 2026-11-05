import { o as e } from "./rolldown-runtime-Da7WdEYL.js";
import { r as t, x as n } from "./react-qdxTBA-_.js";
import {
  Ct as r,
  E as i,
  Lt as a,
  jt as o,
  kt as s,
  q as c,
} from "./lib-antd-BlrvMpdd.js";
import { Ii as l } from "./tools-CxaYXPQE.js";
var u = e(n()),
  d = {
    content: `_content_1eiv0_1`,
    active: `_active_1eiv0_16`,
    imageBox: `_imageBox_1eiv0_21`,
    info: `_info_1eiv0_34`,
    popBody: `_popBody_1eiv0_53`,
    popContent: `_popContent_1eiv0_64`,
    header: `_header_1eiv0_70`,
    searchItem: `_searchItem_1eiv0_79`,
    container: `_container_1eiv0_88`,
    itemBox: `_itemBox_1eiv0_100`,
    modelItem: `_modelItem_1eiv0_109`,
  },
  f = e(o()),
  p = t(),
  m = ({
    type: e,
    value: t,
    onChange: n,
    triggerNode: o,
    trackHandle: m,
    onTrack: h,
  }) => {
    let [g, _] = (0, u.useState)(!1),
      [v, y] = (0, u.useState)([]);
    (0, u.useEffect)(() => {
      b();
    }, []);
    let b = async () => {
        let t = await l(e);
        t.code === 200 &&
          (y(t.data), n?.(t.data?.[0].style ?? ``, t.data?.[0]));
      },
      x = (0, p.jsx)(`div`, {
        className: d.popContent,
        children: (0, p.jsx)(`div`, {
          className: d.container,
          children: (0, p.jsx)(c, {
            size: [10, 10],
            wrap: !0,
            children: v.map((e) =>
              (0, p.jsxs)(
                `div`,
                {
                  className: d.itemBox,
                  children: [
                    (0, p.jsxs)(
                      `div`,
                      {
                        className: (0, f.default)(d.modelItem, {
                          [d.active]: e.style === t,
                        }),
                        onClick: () => {
                          n?.(e.style, e);
                        },
                        children: [
                          (0, p.jsx)(`img`, {
                            src: `${e.imageUrl}?x-oss-process=image/resize,h_270,m_lfit`,
                          }),
                          e.style === t && (0, p.jsx)(s, {}),
                        ],
                      },
                      e.id,
                    ),
                    (0, p.jsx)(`p`, { children: e.style }),
                  ],
                },
                e.id,
              ),
            ),
          }),
        }),
      }),
      S = () => o ?? document.body,
      C = (0, u.useMemo)(() => {
        let e = v.find((e) => e.style === t);
        return (
          t &&
            !e &&
            v.length > 0 &&
            (i.error(`${t}风格已下架，请选择其他风格`),
            n?.(v?.[0].style ?? ``, v?.[0])),
          e?.imageUrl
            ? `${e?.imageUrl ?? v?.[0]?.imageUrl}?x-oss-process=image/resize,h_120`
            : ``
        );
      }, [t, v]);
    return (0, p.jsx)(r, {
      content: x,
      trigger: [`click`],
      placement: `right`,
      overlayClassName: d.popBody,
      onOpenChange: (e) => {
        m?.(`点击-选择风格`), _(e), e && h?.();
      },
      getPopupContainer: S,
      children: (0, p.jsxs)(`div`, {
        className: (0, f.default)(d.content, { [d.active]: g }),
        children: [
          (0, p.jsx)(`div`, {
            className: d.imageBox,
            children: C && (0, p.jsx)(`img`, { src: C }),
          }),
          (0, p.jsxs)(`div`, {
            className: d.info,
            children: [
              (0, p.jsx)(`p`, { children: `参考风格` }),
              (0, p.jsx)(`span`, { children: t ?? `生成的图片参考的风格` }),
            ],
          }),
          (0, p.jsx)(a, {}),
        ],
      }),
    });
  };
export { m as t };
