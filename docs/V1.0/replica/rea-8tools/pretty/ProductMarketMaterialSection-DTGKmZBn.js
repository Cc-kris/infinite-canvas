import { o as e } from "./rolldown-runtime-Da7WdEYL.js";
import { r as t, x as n } from "./react-qdxTBA-_.js";
import { r } from "./mobx-Dz9VxtfR.js";
import { Tt as i } from "./utils-s6-B6XWS.js";
import { F as a, q as o } from "./lib-antd-BlrvMpdd.js";
import { v as s } from "./types-C93xjyms.js";
import { t as c } from "./style.module-CTnsKp5f.js";
import { t as l } from "./ImageBox-B_O_xIhx.js";
import { r as u, t as d } from "./imageModelConfig-DvE3QhTc.js";
import { f } from "./aPlusConfig-B0XlxTEw.js";
var p = e(n()),
  m = t(),
  h = {
    [s.HIGH]: `高`,
    [s.MEDIUM]: `中`,
    [s.LOW]: `低`,
    [s.XHIGH]: `超高`,
    [s.MAX]: `最大`,
    none: `-`,
  },
  g = r(
    ({
      data: e,
      curSubData: t,
      curImageData: n,
      isBatchGenerateImages: r,
      originImageWH: s,
    }) => {
      let g = i.instance.userStore?.teamInfo?.id ?? ``,
        [_, v] = (0, p.useState)({});
      (0, p.useEffect)(() => {
        (async () => {
          let e = await u(d.PRODUCT_MARKET_MATERIAL_V2),
            t = {};
          (e.data ?? []).forEach((e) => {
            t[e.code] || (t[e.code] = e.name);
          }),
            v(t);
        })();
      }, [g]);
      let y = f(n?.extendFields ?? {});
      return (0, m.jsxs)(m.Fragment, {
        children: [
          (0, m.jsxs)(`div`, {
            className: c.row,
            children: [
              (0, m.jsx)(`div`, { className: c.lbl, children: `原图：` }),
              (0, m.jsx)(a.PreviewGroup, {
                children: (0, m.jsx)(o, {
                  wrap: !0,
                  children: t?.extendFields?.imageList?.map((e, t) =>
                    (0, m.jsx)(
                      l,
                      { thumUrl: e.imageThumbUrl, src: e.imageUrl },
                      t,
                    ),
                  ),
                }),
              }),
            ],
          }),
          !!s?.width &&
            !!s?.height &&
            (0, m.jsxs)(`div`, {
              className: c.row,
              children: [
                (0, m.jsx)(`div`, { className: c.lbl, children: `原图尺寸：` }),
                (0, m.jsx)(`div`, {
                  className: c.val,
                  children: `${s?.width} * ${s?.height}`,
                }),
              ],
            }),
          t.extendFields?.isPro !== void 0 &&
            (0, m.jsxs)(`div`, {
              className: c.row,
              children: [
                (0, m.jsx)(`div`, { className: c.lbl, children: `模型选择：` }),
                (0, m.jsx)(`div`, {
                  className: c.val,
                  children: t.extendFields?.isPro ? `高品质模型` : `基础模型`,
                }),
              ],
            }),
          (0, m.jsxs)(`div`, {
            className: c.row,
            children: [
              (0, m.jsx)(`div`, { className: c.lbl, children: `品牌基因：` }),
              (0, m.jsx)(`div`, {
                className: c.val,
                children: t.extendFields?.brandKey
                  ? t.extendFields?.brandKey?.brandName || `未命名品牌基因`
                  : `智能品牌基因`,
              }),
            ],
          }),
          e.extendFields?.provider &&
            (0, m.jsxs)(`div`, {
              className: c.row,
              children: [
                (0, m.jsx)(`div`, { className: c.lbl, children: `模型：` }),
                (0, m.jsx)(`div`, {
                  className: c.val,
                  children:
                    _[e.extendFields.provider] || e.extendFields?.provider,
                }),
              ],
            }),
          e.extendFields?.quality &&
            (0, m.jsxs)(`div`, {
              className: c.row,
              children: [
                (0, m.jsx)(`div`, { className: c.lbl, children: `生图品质：` }),
                (0, m.jsx)(`div`, {
                  className: c.val,
                  children: h[e.extendFields.quality] ?? e.extendFields.quality,
                }),
              ],
            }),
          e.extendFields?.resolution &&
            (0, m.jsxs)(`div`, {
              className: c.row,
              children: [
                (0, m.jsx)(`div`, { className: c.lbl, children: `分辨率：` }),
                (0, m.jsx)(`div`, {
                  className: c.val,
                  children: e.extendFields?.resolution,
                }),
              ],
            }),
          (0, m.jsxs)(`div`, {
            className: c.row,
            children: [
              (0, m.jsx)(`div`, {
                className: c.lbl,
                children: n?.extendFields?.type ? `生成类型：` : `景别：`,
              }),
              t?.extendFields?.sceneType === `scene` &&
                (0, m.jsx)(`div`, { className: c.val, children: `场景图` }),
              t?.extendFields?.sceneType === `closeUp` &&
                (0, m.jsx)(`div`, { className: c.val, children: `特写图` }),
              t?.extendFields?.sceneType === `` &&
                (0, m.jsx)(`div`, {
                  className: c.val,
                  children: `场景图+特写图`,
                }),
              n?.extendFields?.type === `scene` &&
                (0, m.jsx)(`div`, { className: c.val, children: `场景图` }),
              n?.extendFields?.type === `closeUp` &&
                (0, m.jsxs)(`div`, {
                  className: c.val,
                  children: [
                    `特写图`,
                    n?.extendFields?.isWhiteBackground ? `-白底` : ``,
                  ],
                }),
              n?.extendFields?.type === `closeUpWhite` &&
                (0, m.jsx)(`div`, { className: c.val, children: `特写白底图` }),
              n?.extendFields?.type === `whiteBg` &&
                (0, m.jsx)(`div`, { className: c.val, children: `白底图` }),
              n?.extendFields?.type === `sellPoint` &&
                (0, m.jsx)(`div`, { className: c.val, children: `卖点图` }),
              n?.extendFields?.type === `size_chart` &&
                (0, m.jsx)(`div`, { className: c.val, children: `商品尺寸图` }),
              !!y && (0, m.jsx)(`div`, { className: c.val, children: y }),
            ],
          }),
          n?.extendFields?.type === `APlusCustom`
            ? (0, m.jsxs)(`div`, {
                className: c.row,
                children: [
                  (0, m.jsx)(`div`, {
                    className: c.lbl,
                    children: `生图比例：`,
                  }),
                  (0, m.jsx)(`div`, {
                    className: c.val,
                    children:
                      n?.extendFields?.APlusAspectRatio ||
                      n?.extendFields?.aspectRatio ||
                      `自定义比例`,
                  }),
                ],
              })
            : [`A+`, `APlusPro`, `APlusHasPhone`].includes(
                  n?.extendFields?.type,
                )
              ? null
              : (0, m.jsxs)(`div`, {
                  className: c.row,
                  children: [
                    (0, m.jsx)(`div`, {
                      className: c.lbl,
                      children: `生图比例：`,
                    }),
                    (0, m.jsx)(`div`, {
                      className: c.val,
                      children: t.extendFields?.aspectRatio || `默认比例`,
                    }),
                  ],
                }),
          !!n?.width &&
            !!n?.height &&
            (0, m.jsxs)(`div`, {
              className: c.row,
              children: [
                (0, m.jsx)(`div`, { className: c.lbl, children: `生图尺寸：` }),
                (0, m.jsx)(`div`, {
                  className: c.val,
                  children: `${n?.width} * ${n?.height}`,
                }),
              ],
            }),
          n?.extendField?.sellPoint &&
            (0, m.jsxs)(`div`, {
              className: c.row,
              children: [
                (0, m.jsx)(`div`, {
                  className: c.lbl,
                  children: `该图对应的卖点：`,
                }),
                (0, m.jsx)(`div`, {
                  className: c.val,
                  children: n?.extendField?.sellPoint,
                }),
              ],
            }),
          ![`whiteBg`].includes(n?.extendFields?.type) &&
            (0, m.jsxs)(`div`, {
              className: c.row,
              children: [
                (0, m.jsx)(`div`, { className: c.lbl, children: `商品信息：` }),
                (0, m.jsx)(`div`, {
                  className: c.val,
                  style: { maxHeight: `100px`, overflowY: `auto` },
                  children: t?.extendFields?.sellerPoint,
                }),
              ],
            }),
          !1,
        ],
      });
    },
  );
export { g as default };
