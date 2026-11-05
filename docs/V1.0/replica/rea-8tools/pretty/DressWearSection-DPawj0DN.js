import { o as e } from "./rolldown-runtime-Da7WdEYL.js";
import { r as t, x as n } from "./react-qdxTBA-_.js";
import { r } from "./mobx-Dz9VxtfR.js";
import { Tt as i } from "./utils-s6-B6XWS.js";
import { F as a, q as o } from "./lib-antd-BlrvMpdd.js";
import { v as s } from "./types-C93xjyms.js";
import { t as c } from "./style.module-CTnsKp5f.js";
import { t as l } from "./ImageBox-B_O_xIhx.js";
import { a as u, o as d } from "./types-B4nhWtN5.js";
import { r as f, t as p } from "./imageModelConfig-DvE3QhTc.js";
var m = e(n()),
  h = t(),
  g = {
    [s.HIGH]: `高`,
    [s.MEDIUM]: `中`,
    [s.LOW]: `低`,
    [s.XHIGH]: `超高`,
    [s.MAX]: `最大`,
    none: `-`,
  },
  _ = r(
    ({ data: e, curSubData: t, curImageData: n, isBatchGenerateImages: r }) => {
      let s = i.instance.userStore?.teamInfo?.id ?? ``,
        [_, v] = (0, m.useState)({});
      (0, m.useEffect)(() => {
        (async () => {
          let e = await f(p.WEAR_COLLECTION),
            t = {};
          (e.data ?? []).forEach((e) => {
            t[e.code] || (t[e.code] = e.name);
          }),
            v(t);
        })();
      }, [s]);
      let y = (0, m.useMemo)(
          () => e.extendFields?.subParamList?.find((e) => e.type === u.SCENE),
          [e.extendFields?.subParamList],
        ),
        b = (0, m.useMemo)(
          () =>
            r
              ? n?.extendFields?.imageList?.[0]
              : t?.extendFields?.imageList?.[0],
          [n, t, r],
        ),
        x = (0, m.useMemo)(
          () => (r ? n?.extendFields?.type : n?.extendField?.type),
          [n, r],
        ),
        S = (0, m.useMemo)(() => {
          let e = r ? n?.extendFields : t?.extendFields;
          if (e?.brandName) return e.brandName;
          if (r)
            try {
              let e = n?.extendFields?.brandKey;
              return e ? e?.brandName || `未命名品牌基因` : `智能品牌基因`;
            } catch {
              return `智能品牌基因`;
            }
          else {
            let e = t?.extendFields?.brandKey;
            if (typeof t?.extendFields?.brandKey == `string`)
              try {
                e = JSON.parse(t?.extendFields?.brandKey);
              } catch {}
            return e ? e?.brandName || `未命名品牌基因` : `智能品牌基因`;
          }
        }, [t?.extendFields?.brandKey, t?.extendFields?.brandName, r]),
        C = (0, m.useMemo)(() => {
          if (
            ![
              u.APLUS_PRO,
              u.APLUS,
              u.CUSTOM,
              u.APLUS_CUSTOM,
              u.APLUS_PHONE,
            ].includes(x)
          )
            return e.extendFields?.aspectRatio
              ? e.extendFields?.aspectRatio
              : `默认比例`;
          if (x === u.APLUS_PHONE) return `手机A+图`;
          if (x === u.APLUS_CUSTOM || x === u.CUSTOM) {
            let i = r
              ? n?.extendFields?.aspectRatio ||
                n?.extendFields?.aPlusAspectRatio
              : t?.extendFields?.aPlusAspectRatio ||
                e.extendFields?.aPlusAspectRatio;
            return i ? `自定义A+ (${i})` : d[x] || `自定义A+`;
          }
          if (r && x === u.APLUS) {
            let e = n?.extendFields?.userSelectedSize;
            if (e) {
              let t = String(e).replace(`:`, `*`);
              return t === `1464*610` || t === `1464*600`
                ? `高级A+图`
                : `普通A+图`;
            }
            let t = n?.extendFields?.aspectRatio;
            return t ? `自定义A+ (${t})` : d[x] || `普通A+图`;
          }
          let i = d[x];
          return i ? (i.endsWith(`图`) ? i : `${i}图`) : `未知图类型`;
        }, [x, n, t, e.extendFields, r]),
        w = !!(t.extendFields?.noText ?? e.extendFields?.noText),
        T =
          typeof t.extendFields?.categoryPath == `string`
            ? t.extendFields.categoryPath.trim()
            : ``,
        E = (0, m.useMemo)(() => {
          let t = e.extendFields?.configData?.complianceLibs;
          return {
            sensitiveLibName: t?.sensitiveLibName,
            replaceLibName: t?.replaceLibName,
          };
        }, [e.extendFields]);
      return (0, h.jsxs)(h.Fragment, {
        children: [
          x && [u.SIZE].includes(x) && b
            ? (0, h.jsxs)(`div`, {
                className: c.row,
                children: [
                  (0, h.jsx)(`div`, {
                    className: c.lbl,
                    children: `输入图（仅参考主图）：`,
                  }),
                  (0, h.jsx)(l, {
                    thumUrl: b.imageThumbUrl || b.imageUrl,
                    src: b.imageUrl,
                  }),
                ],
              })
            : (0, h.jsxs)(`div`, {
                className: c.row,
                children: [
                  (0, h.jsx)(`div`, { className: c.lbl, children: `输入图：` }),
                  (0, h.jsx)(a.PreviewGroup, {
                    children: (0, h.jsx)(o, {
                      wrap: !0,
                      children: t?.extendFields?.imageList?.map((e, t) =>
                        (0, h.jsx)(
                          l,
                          {
                            thumUrl: e.imageThumbUrl || e.imageUrl,
                            src: e.imageUrl,
                          },
                          t,
                        ),
                      ),
                    }),
                  }),
                ],
              }),
          (0, h.jsxs)(`div`, {
            className: c.row,
            children: [
              (0, h.jsx)(`div`, { className: c.lbl, children: `品牌基因：` }),
              (0, h.jsx)(`div`, { className: c.val, children: S }),
            ],
          }),
          e.extendFields?.provider &&
            (0, h.jsxs)(`div`, {
              className: c.row,
              children: [
                (0, h.jsx)(`div`, { className: c.lbl, children: `模型：` }),
                (0, h.jsx)(`div`, {
                  className: c.val,
                  children:
                    _[e.extendFields.provider] || e.extendFields?.provider,
                }),
              ],
            }),
          e.extendFields?.quality &&
            (0, h.jsxs)(`div`, {
              className: c.row,
              children: [
                (0, h.jsx)(`div`, { className: c.lbl, children: `生图品质：` }),
                (0, h.jsx)(`div`, {
                  className: c.val,
                  children: g[e.extendFields.quality] ?? e.extendFields.quality,
                }),
              ],
            }),
          e.extendFields?.resolution &&
            (0, h.jsxs)(`div`, {
              className: c.row,
              children: [
                (0, h.jsx)(`div`, { className: c.lbl, children: `分辨率：` }),
                (0, h.jsx)(`div`, {
                  className: c.val,
                  children: e.extendFields?.resolution,
                }),
              ],
            }),
          (0, h.jsxs)(`div`, {
            className: c.row,
            children: [
              (0, h.jsx)(`div`, { className: c.lbl, children: `无字模式：` }),
              (0, h.jsx)(`div`, {
                className: c.val,
                children: w ? `开` : `关`,
              }),
            ],
          }),
          E.sensitiveLibName &&
            (0, h.jsxs)(`div`, {
              className: c.row,
              children: [
                (0, h.jsx)(`div`, { className: c.lbl, children: `敏感词库：` }),
                (0, h.jsx)(`div`, {
                  className: c.val,
                  children: E.sensitiveLibName,
                }),
              ],
            }),
          E.replaceLibName &&
            (0, h.jsxs)(`div`, {
              className: c.row,
              children: [
                (0, h.jsx)(`div`, { className: c.lbl, children: `替换词库：` }),
                (0, h.jsx)(`div`, {
                  className: c.val,
                  children: E.replaceLibName,
                }),
              ],
            }),
          x &&
            (0, h.jsxs)(`div`, {
              className: c.row,
              children: [
                (0, h.jsx)(`div`, { className: c.lbl, children: `生成类型：` }),
                (0, h.jsx)(`div`, {
                  className: c.val,
                  children: [
                    u.APLUS_PRO,
                    u.APLUS,
                    u.CUSTOM,
                    u.APLUS_CUSTOM,
                    u.APLUS_PHONE,
                  ].includes(x)
                    ? `A+图`
                    : d[x],
                }),
              ],
            }),
          x &&
            (0, h.jsxs)(`div`, {
              className: c.row,
              children: [
                (0, h.jsx)(`div`, { className: c.lbl, children: `生图比例：` }),
                (0, h.jsx)(`div`, { className: c.val, children: C }),
              ],
            }),
          T &&
            (0, h.jsxs)(`div`, {
              className: c.row,
              children: [
                (0, h.jsx)(`div`, { className: c.lbl, children: `商品类目：` }),
                (0, h.jsx)(`div`, { className: c.val, children: T }),
              ],
            }),
          x === u.SCENE &&
            (0, h.jsx)(h.Fragment, {
              children: r
                ? (0, h.jsxs)(h.Fragment, {
                    children: [
                      (0, h.jsxs)(`div`, {
                        className: c.row,
                        children: [
                          (0, h.jsx)(`div`, {
                            className: c.lbl,
                            children: `智能模式：`,
                          }),
                          (0, h.jsx)(`div`, {
                            className: c.val,
                            children: e.extendFields?.needIntelligent
                              ? `开`
                              : `关`,
                          }),
                        ],
                      }),
                      n?.extendFields?.sceneImageUrl &&
                        (0, h.jsxs)(`div`, {
                          className: c.row,
                          children: [
                            (0, h.jsx)(`div`, {
                              className: c.lbl,
                              children: `场景参考图：`,
                            }),
                            (0, h.jsx)(`div`, {
                              className: c.val,
                              children: (0, h.jsx)(l, {
                                src: n?.extendFields?.sceneImageUrl,
                                thumUrl:
                                  n?.extendFields?.sceneThumb ||
                                  n?.extendFields?.sceneImageUrl,
                              }),
                            }),
                          ],
                        }),
                      y?.modelImageUrl &&
                        (0, h.jsxs)(`div`, {
                          className: c.row,
                          children: [
                            (0, h.jsx)(`div`, {
                              className: c.lbl,
                              children: `模特参考图：`,
                            }),
                            (0, h.jsx)(`div`, {
                              className: c.val,
                              children: (0, h.jsx)(l, {
                                src: y?.modelImageUrl,
                                thumUrl: y?.modelImageUrl,
                              }),
                            }),
                          ],
                        }),
                      y?.prompt &&
                        (0, h.jsxs)(`div`, {
                          className: c.row,
                          children: [
                            (0, h.jsx)(`div`, {
                              className: c.lbl,
                              children: `用户描述：`,
                            }),
                            (0, h.jsx)(`div`, {
                              className: c.val,
                              children: y?.prompt,
                            }),
                          ],
                        }),
                    ],
                  })
                : (0, h.jsxs)(h.Fragment, {
                    children: [
                      t?.extendFields?.sceneImageUrl &&
                        (0, h.jsxs)(`div`, {
                          className: c.row,
                          children: [
                            (0, h.jsx)(`div`, {
                              className: c.lbl,
                              children: `场景参考图：`,
                            }),
                            (0, h.jsx)(`div`, {
                              className: c.val,
                              children: (0, h.jsx)(l, {
                                src: t?.extendFields?.sceneImageUrl,
                                thumUrl: t?.extendFields?.sceneImageUrl,
                              }),
                            }),
                          ],
                        }),
                      t?.extendFields?.modelImageUrl &&
                        (0, h.jsxs)(`div`, {
                          className: c.row,
                          children: [
                            (0, h.jsx)(`div`, {
                              className: c.lbl,
                              children: `模特参考图：`,
                            }),
                            (0, h.jsx)(`div`, {
                              className: c.val,
                              children: (0, h.jsx)(l, {
                                src: t?.extendFields?.modelImageUrl,
                                thumUrl: t?.extendFields?.modelImageUrl,
                              }),
                            }),
                          ],
                        }),
                      t?.extendFields?.modelAndSceneInfo &&
                        (0, h.jsxs)(`div`, {
                          className: c.row,
                          children: [
                            (0, h.jsx)(`div`, {
                              className: c.lbl,
                              children: `用户描述：`,
                            }),
                            (0, h.jsx)(`div`, {
                              className: c.val,
                              children: t?.extendFields?.modelAndSceneInfo,
                            }),
                          ],
                        }),
                    ],
                  }),
            }),
          n?.extendField?.sellPoint &&
            (0, h.jsxs)(`div`, {
              className: c.row,
              children: [
                (0, h.jsx)(`div`, {
                  className: c.lbl,
                  children: `该图对应的卖点：`,
                }),
                (0, h.jsx)(`div`, {
                  className: c.val,
                  children: n?.extendField?.sellPoint,
                }),
              ],
            }),
          [
            u.POINT,
            u.SIZE,
            u.INS,
            u.APLUS_PRO,
            u.APLUS,
            u.CUSTOM,
            u.APLUS_CUSTOM,
            u.APLUS_PHONE,
          ].includes(x) &&
            (0, h.jsx)(h.Fragment, {
              children:
                r && e.extendFields?.sellerPoint
                  ? (0, h.jsxs)(`div`, {
                      className: c.row,
                      children: [
                        (0, h.jsx)(`div`, {
                          className: c.lbl,
                          children: `卖点：`,
                        }),
                        (0, h.jsx)(`div`, {
                          className: c.val,
                          style: { maxHeight: `100px`, overflowY: `auto` },
                          children: e.extendFields?.sellerPoint,
                        }),
                      ],
                    })
                  : e.extendFields?.productInfo &&
                    (0, h.jsxs)(`div`, {
                      className: c.row,
                      children: [
                        (0, h.jsx)(`div`, {
                          className: c.lbl,
                          children: `商品信息：`,
                        }),
                        (0, h.jsx)(`div`, {
                          className: c.val,
                          style: { maxHeight: `100px`, overflowY: `auto` },
                          children: t?.extendFields?.productInfo,
                        }),
                      ],
                    }),
            }),
          (([
            u.APLUS_PRO,
            u.APLUS,
            u.CUSTOM,
            u.APLUS_CUSTOM,
            u.APLUS_PHONE,
          ].includes(x) &&
            !!t.extendFields?.aPlusStyles?.length) ||
            (x === u.POINT && !!t.extendFields?.pointStyles?.length)) &&
            n?.extendField?.layoutImageUrl &&
            (0, h.jsx)(h.Fragment, {
              children: (0, h.jsxs)(`div`, {
                className: c.row,
                children: [
                  (0, h.jsx)(`div`, { className: c.lbl, children: `排版：` }),
                  (0, h.jsx)(`div`, {
                    className: c.val,
                    children: (0, h.jsx)(l, {
                      className: c.layoutImage,
                      src: n?.extendField?.layoutImageUrl,
                      thumUrl:
                        n?.extendField?.layoutImageThumbUrl ||
                        n?.extendField?.layoutImageUrl,
                    }),
                  }),
                ],
              }),
            }),
        ],
      });
    },
  );
export { _ as default };
