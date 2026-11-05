import { o as e } from "./rolldown-runtime-Da7WdEYL.js";
import { r as t, x as n } from "./react-qdxTBA-_.js";
import { r } from "./mobx-Dz9VxtfR.js";
import { F as i, V as a, jt as o, q as s } from "./lib-antd-BlrvMpdd.js";
import { Qn as c } from "./tools-CxaYXPQE.js";
import { t as l } from "./style.module-CTnsKp5f.js";
import { t as u } from "./ImageBox-B_O_xIhx.js";
import { n as d } from "./const-wC5F4NZN.js";
var f = e(n()),
  p = t(),
  m = ({
    imageUrl: e,
    maskUrl: t,
    uniqueId: n,
    maskSuffix: r = ``,
    style: i,
    className: a,
  }) => {
    let o = `${n}_${r}`;
    return (0, p.jsxs)(`svg`, {
      width: `100%`,
      height: `100%`,
      style: { display: `block`, position: `absolute`, top: 0, left: 0 },
      className: a,
      children: [
        (0, p.jsx)(`defs`, {
          children: (0, p.jsx)(`mask`, {
            id: o,
            children: (0, p.jsx)(`image`, {
              href: t,
              width: `100%`,
              height: `100%`,
              preserveAspectRatio: `xMidYMid meet`,
              style: { filter: `invert(1)` },
            }),
          }),
        }),
        (0, p.jsx)(`image`, {
          href: e,
          width: `100%`,
          height: `100%`,
          preserveAspectRatio: `xMidYMid meet`,
          mask: `url(#${o})`,
          style: {
            filter: `contrast(0) invert(54%) sepia(82%) saturate(6959%) hue-rotate(259deg)`,
            opacity: 0.5,
          },
        }),
      ],
    });
  },
  h = e(o()),
  g = r(
    ({
      isXsyTeam: e,
      data: t,
      curSubData: n,
      curImageData: r,
      isBatchGenerateImages: o,
    }) => {
      let g = (0, f.useMemo)(
        () => ({
          modelHeadImageThumb:
            t.extendFields?.customModel?.modelHeadImageThumb ??
            t.extendFields?.modelHeadImageThumb,
          modelHeadImageUrl:
            t.extendFields?.customModel?.modelHeadImageUrl ??
            t.extendFields?.modelHeadImageUrl,
          modelImageThumb:
            t.extendFields?.modelImageThumb ?? r?.extendFields?.modelImageThumb,
          modelImageUrl:
            t.extendFields?.modelImageUrl ?? r?.extendFields?.modelImageUrl,
          modelMarketId: t.extendFields?.modelMarketId,
          modelMarketType: t.extendFields?.modelMarketType,
          modelTabType: t.extendFields?.modelTabType,
        }),
        [t, r],
      );
      return (0, p.jsxs)(p.Fragment, {
        children: [
          !o &&
            [c.AI_DRESSING_V2].includes(t.type) &&
            (0, p.jsxs)(`div`, {
              className: l.row,
              children: [
                (0, p.jsx)(`div`, { className: l.lbl, children: `任务类型：` }),
                (0, p.jsx)(`div`, {
                  className: l.val,
                  children:
                    t.batchFlag ||
                    (t.extendFields?.modelPoseList &&
                      t.extendFields?.modelPoseList?.length > 1)
                      ? `套图任务`
                      : `单图任务`,
                }),
              ],
            }),
          (0, p.jsxs)(`div`, {
            className: l.row,
            children: [
              (0, p.jsx)(`div`, { className: l.lbl, children: `原始服装图：` }),
              (0, p.jsx)(`div`, {
                className: l.val,
                children: [
                  t.extendFields?.upperOriginUrl,
                  t.extendFields?.downOriginUrl,
                  t.extendFields?.suitOriginUrl,
                ]
                  .filter(Boolean)
                  .map((e, t) =>
                    (0, p.jsx)(
                      u,
                      {
                        thumUrl: e,
                        src: e,
                        style: { width: 100, height: 100 },
                      },
                      t,
                    ),
                  ),
              }),
            ],
          }),
          c.AI_DRESSING === t?.type &&
            (g?.modelHeadImageUrl || g?.modelImageUrl) &&
            (0, p.jsxs)(`div`, {
              className: l.row,
              children: [
                (0, p.jsx)(`div`, {
                  className: l.lbl,
                  children: `选择替换模特：`,
                }),
                (0, p.jsx)(`div`, {
                  className: l.val,
                  style: { marginBottom: 10 },
                  children: g?.modelHeadImageUrl
                    ? `自定义模特`
                    : d?.[g?.modelMarketType ?? `1`],
                }),
                (0, p.jsx)(`div`, {
                  className: l.val,
                  children: (0, p.jsx)(`div`, {
                    className: l.imageBox,
                    children: (0, p.jsxs)(u, {
                      thumUrl: g?.modelHeadImageUrl
                        ? g?.modelHeadImageThumb
                        : g?.modelImageThumb,
                      src: g?.modelHeadImageUrl
                        ? g?.modelHeadImageUrl
                        : g?.modelImageUrl,
                      style: { width: 100, height: 100 },
                      children: [
                        t?.disenabledFlow &&
                          t?.extendFields?.modelMarketType === `4` &&
                          (0, p.jsx)(`span`, {
                            className: l.iconTry,
                            children: (0, p.jsx)(`span`, { children: `试` }),
                          }),
                        t?.disenabledFlow &&
                          t?.extendFields?.modelMarketType === `3` &&
                          (0, p.jsx)(`span`, {
                            className: l.iconLimit,
                            children: (0, p.jsx)(`span`, { children: `禁` }),
                          }),
                      ],
                    }),
                  }),
                }),
              ],
            }),
          c.AI_DRESSING_V2 === t?.type &&
            (g?.modelImageUrl || n?.extendFields?.modelImageUrl) &&
            (0, p.jsxs)(`div`, {
              className: l.row,
              children: [
                (0, p.jsx)(`div`, { className: l.lbl, children: `模特参考图` }),
                (0, p.jsx)(`div`, {
                  className: l.val,
                  children: (0, p.jsxs)(`div`, {
                    className: l.imageUrl,
                    id: `seg-preview3`,
                    style: { width: 100, height: 100 },
                    children: [
                      (0, p.jsx)(i, {
                        src: t?.batchFlag
                          ? n?.extendFields?.modelImageUrl
                          : g?.modelImageUrl,
                        preview: {
                          mask: (0, p.jsx)(a, { style: { color: `#fff` } }),
                          src: t?.batchFlag
                            ? n?.extendFields?.modelImageUrl
                            : g?.modelImageUrl,
                          imageRender: () =>
                            (0, p.jsxs)(`div`, {
                              className: (0, h.default)(
                                l.previewImageWrapper,
                                l.withMask,
                              ),
                              children: [
                                (0, p.jsx)(`img`, {
                                  src: t?.batchFlag
                                    ? n?.extendFields?.modelImageUrl
                                    : g?.modelImageUrl,
                                }),
                                t.extendFields?.modelMaskResultUrl
                                  ? (0, p.jsx)(`img`, {
                                      className: l.resultMask,
                                      src: t.extendFields?.modelMaskResultUrl,
                                    })
                                  : r?.extendFields?.modelMaskImageUrl &&
                                    (0, p.jsx)(m, {
                                      imageUrl: t?.batchFlag
                                        ? n?.extendFields?.modelImageUrl
                                        : g?.modelImageUrl,
                                      maskUrl: r.extendFields.modelMaskImageUrl,
                                      uniqueId: t.id,
                                      maskSuffix: `preview`,
                                    }),
                              ],
                            }),
                          toolbarRender: () => null,
                          getContainer: () =>
                            document.getElementById(`seg-preview3`) ||
                            document.body,
                        },
                      }),
                      t.extendFields?.modelMaskResultUrl
                        ? (0, p.jsx)(`div`, {
                            className: l.mask,
                            children: (0, p.jsx)(`img`, {
                              src: t.extendFields.modelMaskResultUrl,
                            }),
                          })
                        : r?.extendFields?.modelMaskImageUrl &&
                          (0, p.jsx)(m, {
                            imageUrl: t?.batchFlag
                              ? n?.extendFields?.modelImageUrl
                              : g?.modelImageUrl,
                            maskUrl: r.extendFields.modelMaskImageUrl,
                            uniqueId: t.id,
                            maskSuffix: `main`,
                          }),
                    ],
                  }),
                }),
              ],
            }),
          r?.extendField?.modelPoseUrl &&
            (0, p.jsxs)(`div`, {
              className: l.row,
              children: [
                (0, p.jsx)(`div`, { className: l.lbl, children: `姿势：` }),
                (0, p.jsx)(`div`, {
                  className: l.val,
                  children: (0, p.jsx)(s, {
                    className: l.poseList,
                    children: (0, p.jsxs)(`div`, {
                      className: l.poseItem,
                      children: [
                        (0, p.jsx)(u, {
                          thumUrl: r.extendField?.modelPoseUrl,
                          src: r.extendField?.modelPoseUrl,
                          style: { width: 80, height: 80 },
                        }),
                        (0, p.jsx)(`p`, {
                          children: r.extendField?.modelPoseName,
                        }),
                      ],
                    }),
                  }),
                }),
              ],
            }),
          c.AI_DRESSING_V2 === t?.type &&
            t.extendFields?.step &&
            (0, p.jsxs)(`div`, {
              className: l.row,
              children: [
                (0, p.jsx)(`div`, { className: l.lbl, children: `步长：` }),
                (0, p.jsx)(`div`, {
                  className: l.val,
                  children: t.extendFields?.step,
                }),
              ],
            }),
          !t.extendFields?.version &&
          ((t.extendFields?.scene && !t.extendFields?.scenePrompt) ||
            t.extendFields?.sceneCustomPrompt ||
            t.extendFields?.sceneChangeBg)
            ? (0, p.jsxs)(`div`, {
                className: l.row,
                children: [
                  (0, p.jsx)(`div`, { className: l.lbl, children: `场景：` }),
                  (0, p.jsx)(`div`, {
                    className: l.val,
                    children:
                      t.extendFields?.scene ??
                      t.extendFields?.sceneCustomPrompt ??
                      ``,
                  }),
                ],
              })
            : null,
          t.type === c.AI_DRESSING &&
          (t.extendFields?.scenePrompt || t.extendFields?.sceneCustomPrompt)
            ? (0, p.jsxs)(`div`, {
                className: l.row,
                children: [
                  (0, p.jsx)(`div`, {
                    className: l.lbl,
                    children: `自定义描述：`,
                  }),
                  (0, p.jsx)(`div`, {
                    className: l.val,
                    children:
                      t.extendFields?.scenePrompt ||
                      t.extendFields?.sceneCustomPrompt,
                  }),
                ],
              })
            : null,
        ],
      });
    },
  );
export { g as default };
