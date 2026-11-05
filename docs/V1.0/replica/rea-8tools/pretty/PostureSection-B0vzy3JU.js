import { o as e } from "./rolldown-runtime-Da7WdEYL.js";
import { r as t, x as n } from "./react-qdxTBA-_.js";
import { r } from "./mobx-Dz9VxtfR.js";
import { F as i, V as a } from "./lib-antd-BlrvMpdd.js";
import { Qn as o } from "./tools-CxaYXPQE.js";
import { t as s } from "./style.module-CTnsKp5f.js";
import { t as c } from "./ImageBox-B_O_xIhx.js";
import { t as l } from "./consts-BaX1MwRS.js";
var u = e(n()),
  d = t(),
  f = r(
    ({ data: e, curSubData: t, curImageData: n, isBatchGenerateImages: r }) => {
      let f = (0, u.useMemo)(
          () =>
            r
              ? n.extendFields?.tabType === l.MY_POSTURE
                ? `我的姿势`
                : n.extendFields?.tabType === l.TEAM_POSTURE
                  ? `团队姿势`
                  : `官方姿势`
              : e.extendFields?.tabType || t.extendFields?.tabType
                ? e.extendFields?.tabType == l.MY_POSTURE ||
                  t.extendFields?.tabType === l.MY_POSTURE
                  ? `我的姿势`
                  : e.extendFields?.tabType == l.TEAM_POSTURE ||
                      t.extendFields?.tabType === l.TEAM_POSTURE
                    ? `团队姿势`
                    : `官方姿势`
                : e.extendFields?.uploadId
                  ? `我的姿势`
                  : `官方姿势`,
          [r, t.extendFields?.tabType, n.extendFields?.tabType],
        ),
        p = (0, u.useMemo)(() => {
          switch (e.type) {
            case o.AI_POSTURE:
              return r
                ? (n.extendFields?.promptId || n.extendFields?.uploadId) &&
                  n.extendFields?.postureUrl
                  ? (0, d.jsxs)(d.Fragment, {
                      children: [
                        (0, d.jsx)(`p`, {
                          className: s.poseTitle,
                          children: f,
                        }),
                        (0, d.jsx)(`div`, {
                          className: s.imageUrl,
                          id: `seg-preview2`,
                          style: { width: 100, height: `auto` },
                          children: (0, d.jsx)(i, {
                            src: n.extendFields?.postureUrl,
                            preview: {
                              mask: (0, d.jsx)(a, { style: { color: `#fff` } }),
                              src: n.extendFields?.postureUrl,
                              toolbarRender: () => null,
                              getContainer: () =>
                                document.getElementById(`seg-preview2`) ||
                                document.body,
                            },
                          }),
                        }),
                        (0, d.jsx)(`p`, {
                          className: s.poseName,
                          children: n.extendFields.postureName,
                        }),
                      ],
                    })
                  : n?.extendFields?.promptId
                    ? (0, d.jsxs)(d.Fragment, {
                        children: [
                          (0, d.jsx)(`p`, {
                            className: s.poseTitle,
                            children: `官方姿势`,
                          }),
                          (0, d.jsx)(`p`, {
                            children: n?.extendFields?.prompt,
                          }),
                        ],
                      })
                    : (0, d.jsxs)(d.Fragment, {
                        children: [
                          (0, d.jsx)(`p`, {
                            className: s.poseTitle,
                            children: `自定义描述`,
                          }),
                          (0, d.jsx)(`p`, {
                            children:
                              n?.extendFields?.prompt || t?.prompt || e?.prompt,
                          }),
                        ],
                      })
                : (e.extendFields?.promptId || e.extendFields?.uploadId) &&
                    e.extendFields?.postureUrl
                  ? (0, d.jsxs)(d.Fragment, {
                      children: [
                        (0, d.jsx)(`p`, {
                          className: s.poseTitle,
                          children: f,
                        }),
                        (0, d.jsx)(`div`, {
                          className: s.imageUrl,
                          id: `seg-preview2`,
                          style: { width: 100, height: `auto` },
                          children: (0, d.jsx)(i, {
                            src: e.extendFields?.postureUrl,
                            preview: {
                              mask: (0, d.jsx)(a, { style: { color: `#fff` } }),
                              src: e.extendFields?.postureUrl,
                              toolbarRender: () => null,
                              getContainer: () =>
                                document.getElementById(`seg-preview2`) ||
                                document.body,
                            },
                          }),
                        }),
                        (0, d.jsx)(`p`, {
                          className: s.poseName,
                          children: e.extendFields.postureName,
                        }),
                      ],
                    })
                  : (t.extendFields?.promptId || t.extendFields?.uploadId) &&
                      t.extendFields?.postureUrl
                    ? (0, d.jsxs)(d.Fragment, {
                        children: [
                          (0, d.jsx)(`p`, {
                            className: s.poseTitle,
                            children: f,
                          }),
                          (0, d.jsx)(`div`, {
                            className: s.imageUrl,
                            id: `seg-preview2`,
                            style: { width: 100, height: `auto` },
                            children: (0, d.jsx)(i, {
                              src: t.extendFields?.postureUrl,
                              preview: {
                                mask: (0, d.jsx)(a, {
                                  style: { color: `#fff` },
                                }),
                                src: t.extendFields?.postureUrl,
                                toolbarRender: () => null,
                                getContainer: () =>
                                  document.getElementById(`seg-preview2`) ||
                                  document.body,
                              },
                            }),
                          }),
                          (0, d.jsx)(`p`, {
                            className: s.poseName,
                            children: t.extendFields.postureName,
                          }),
                        ],
                      })
                    : n?.extendField?.promptId && n?.extendField?.postureUrl
                      ? (0, d.jsxs)(d.Fragment, {
                          children: [
                            (0, d.jsx)(`p`, {
                              className: s.poseTitle,
                              children: `官方姿势`,
                            }),
                            (0, d.jsx)(`div`, {
                              className: s.imageUrl,
                              id: `seg-preview2`,
                              style: { width: 100, height: `auto` },
                              children: (0, d.jsx)(i, {
                                src: n?.extendField?.postureUrl,
                                preview: {
                                  mask: (0, d.jsx)(a, {
                                    style: { color: `#fff` },
                                  }),
                                  src: n?.extendField?.postureUrl,
                                  toolbarRender: () => null,
                                  getContainer: () =>
                                    document.getElementById(`seg-preview2`) ||
                                    document.body,
                                },
                              }),
                            }),
                            (0, d.jsx)(`p`, {
                              className: s.poseName,
                              children: n?.extendField?.prompt,
                            }),
                          ],
                        })
                      : n?.extendField?.promptId
                        ? (0, d.jsxs)(d.Fragment, {
                            children: [
                              (0, d.jsx)(`p`, {
                                className: s.poseTitle,
                                children: `官方姿势`,
                              }),
                              (0, d.jsx)(`p`, {
                                children: n?.extendField?.prompt,
                              }),
                            ],
                          })
                        : (0, d.jsxs)(d.Fragment, {
                            children: [
                              (0, d.jsx)(`p`, {
                                className: s.poseTitle,
                                children: `自定义描述`,
                              }),
                              (0, d.jsx)(`p`, {
                                children:
                                  n?.extendField?.prompt ||
                                  t.prompt ||
                                  e.prompt,
                              }),
                            ],
                          });
            default:
              return e.prompt;
          }
        }, [e.type, t, n]),
        m = (0, u.useMemo)(
          () => (r ? e.extendFields?.url : e.imageUrl),
          [e.extendFields?.url, e.imageUrl],
        ),
        h = (0, u.useMemo)(
          () => (r ? e.extendFields?.thumb : e.imageThumb),
          [e.extendFields?.thumb, e.imageThumb],
        );
      return (0, d.jsxs)(d.Fragment, {
        children: [
          !r &&
            (0, d.jsxs)(`div`, {
              className: s.row,
              children: [
                (0, d.jsx)(`div`, { className: s.lbl, children: `任务类型：` }),
                (0, d.jsx)(`div`, {
                  className: s.val,
                  children: e.batchFlag ? `套图任务` : `单图任务`,
                }),
              ],
            }),
          (0, d.jsxs)(`div`, {
            className: s.row,
            children: [
              (0, d.jsx)(`div`, { className: s.lbl, children: `原图：` }),
              (0, d.jsx)(`div`, {
                className: s.val,
                children: (0, d.jsx)(c, {
                  thumUrl: h,
                  src: m,
                  style: { width: 100, height: `auto` },
                }),
              }),
            ],
          }),
          (0, d.jsxs)(`div`, {
            className: s.row,
            children: [
              (0, d.jsx)(`div`, {
                className: s.lbl,
                children: `描述裂变动作：`,
              }),
              (0, d.jsx)(`div`, { className: s.val, children: p }),
            ],
          }),
        ],
      });
    },
  );
export { f as default };
