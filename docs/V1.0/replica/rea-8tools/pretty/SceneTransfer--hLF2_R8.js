import { o as e } from "./rolldown-runtime-Da7WdEYL.js";
import { m as t, r as n, x as r } from "./react-qdxTBA-_.js";
import { Ot as i, c as a, n as o, wt as s } from "./utils-s6-B6XWS.js";
import {
  $ as c,
  E as l,
  Ft as u,
  O as d,
  T as f,
  ft as p,
  r as ee,
  u as m,
  wt as h,
} from "./lib-antd-BlrvMpdd.js";
import {
  A as g,
  Kn as _,
  Or as v,
  Qn as y,
  Yr as b,
  a as x,
  mr as S,
  oi as C,
  or as w,
  ri as T,
  ui as E,
} from "./tools-CxaYXPQE.js";
import { t as D } from "./UploadOutlined-BXdgGNqE.js";
import { ft as O } from "./icons-DlVi4k-I.js";
import { v as k } from "./icons-BKryTor6.js";
import "./imageUtils-CzRI01Xn.js";
import { r as A } from "./useImageUploadProps-D4EASCZa.js";
import { t as j } from "./store-DQN9yT0P.js";
import { r as M } from "./configData-Cb8F6cLo.js";
import { t as N } from "./trackStore-C-Zs1sZz.js";
import { t as P } from "./GenerateBtn-CXZAlBcP.js";
import { t as F } from "./DrawResultList-CF8ppqGu.js";
import { t as I } from "./HistoryLink-BDd3WV8J.js";
import { t as L } from "./NewMattingModal-bw4fjC96.js";
var R = e(r()),
  z = {
    sceneTransfer: `_sceneTransfer_q39hj_2`,
    content: `_content_q39hj_26`,
    left: `_left_q39hj_32`,
    configContent: `_configContent_q39hj_54`,
    configItem: `_configItem_q39hj_78`,
    title: `_title_q39hj_82`,
    configRow: `_configRow_q39hj_89`,
    createBtn: `_createBtn_q39hj_94`,
    imageCount: `_imageCount_q39hj_107`,
    rightWrapper: `_rightWrapper_q39hj_157`,
    right: `_right_q39hj_157`,
    emptyData: `_emptyData_q39hj_234`,
    card: `_card_q39hj_241`,
    sampleWrap: `_sampleWrap_q39hj_269`,
  },
  B = {
    imageWrapper: `_imageWrapper_1wx6l_1`,
    uploadBox: `_uploadBox_1wx6l_6`,
    imageBox: `_imageBox_1wx6l_50`,
    mask: `_mask_1wx6l_69`,
    cutoutError: `_cutoutError_1wx6l_83`,
    btnBox: `_btnBox_1wx6l_115`,
    editBox: `_editBox_1wx6l_127`,
  },
  V = n(),
  H = 180 * 1e3,
  U = ({
    imageUrl: e,
    imageSegUrl: t,
    btnText: n,
    setImageUrl: r,
    setImageSegUrl: i,
    trackHandle: a,
    isAutoMatting: s,
  }) => {
    let [c, f] = (0, R.useState)(!1),
      [p, g] = (0, R.useState)(!1),
      [v, C] = (0, R.useState)(``),
      [T, E] = (0, R.useState)(``),
      [j, P] = (0, R.useState)(!0),
      [F, I] = (0, R.useState)(!1),
      [z, U] = (0, R.useState)(void 0),
      [W, G] = (0, R.useState)(!1),
      [K, q] = (0, R.useState)(``),
      [J, Y] = (0, R.useState)(H),
      X = 3e3,
      Z = (0, R.useRef)(),
      Q = (0, R.useRef)();
    (0, R.useEffect)(() => {
      e && j ? (C(e), E(t)) : j || P(!0);
    }, [e]),
      (0, R.useEffect)(() => {
        s &&
          (v && !T && !c
            ? re(v)
            : v && T && v !== T && (G(!1), Q.current.clearComplateRecord()));
      }, [v, T, z, s]),
      (0, R.useEffect)(() => {
        v === e && (E(t), Q.current.clearComplateRecord());
      }, [t]);
    let te = A({
      className: B.uploadBox,
      openFileDialogOnClick: !1,
      maxSize: 10,
      minWidthHeight: 32,
      maxWidthHeight: 8192,
      onChange(e) {
        e.file.status && f(!0),
          e.file.status,
          e.file.status === `done`
            ? (r(e.file.response?.data.viewUrl), i(``), f(!1))
            : e.file.status === `error` &&
              (l.error(`${e.file.name} file upload failed.`), f(!1));
      },
      onError: () => {
        f(!1);
      },
    });
    (0, R.useEffect)(() => {
      let t;
      return (
        K && J > 0
          ? (t = setTimeout(() => {
              ne();
            }, X))
          : K && (G(!0), E(e), i(e)),
        () => {
          t && clearTimeout(t);
        }
      );
    }, [K, J, e]);
    let $ = () => {
        G(!0), E(e), i(e), q(``), f(!1);
      },
      ne = async () => {
        try {
          if (!K) {
            f(!1);
            return;
          }
          let t = await b(K);
          if (t.code !== 200) throw Error(`接口异常`);
          if (t.data.status === 1) {
            f(!1);
            let n = t.data.resultUrl,
              a = await x(n);
            a.transparent || a.opaque
              ? $()
              : (r(e), E(n), i(n), e !== n && G(!1), q(``));
          } else t.data.status === 2 ? $() : Y((e) => e - X);
        } catch {
          f(!1), $();
        }
      },
      re = async (e, t) => {
        try {
          f(!0), G(!1), Y(H);
          let n = await S({ imageUrl: e, type: _.goods });
          n && n.code === 200 ? (q(n.data), U(t)) : (l.error(n.msg), $());
        } catch (e) {
          e.code === 62429 && (r(``), E(``), i(``), q(``), U(void 0)), $();
        }
      };
    return (0, V.jsxs)(`div`, {
      className: B.imageWrapper,
      children: [
        (0, V.jsx)(ee.Dragger, {
          ...te,
          ref: Z,
          style: e ? { display: `none` } : {},
          children: (0, V.jsxs)(`div`, {
            className: B.uploadBox,
            children: [
              (0, V.jsxs)(u, {
                type: `primary`,
                icon: (0, V.jsx)(D, {}),
                loading: c,
                onClick: () => {
                  g(!0), a?.(`点击上传${n}`);
                },
                children: [`上传`, n],
              }),
              (0, V.jsx)(`p`, {
                children: `图片格式：支持jpg、jpeg、png、webp格式，10M以内，最小：32*32，最大：8192*8192`,
              }),
            ],
          }),
        }),
        (0, V.jsx)(d, {
          spinning: c,
          tip: `自动抠图中...`,
          children:
            !!e &&
            (0, V.jsxs)(`div`, {
              className: B.imageBox,
              children: [
                (0, V.jsx)(`img`, { src: e }),
                T && W
                  ? (0, V.jsxs)(`div`, {
                      className: B.cutoutError,
                      children: [
                        (0, V.jsx)(`p`, { children: `自动抠图出错，请点击` }),
                        (0, V.jsx)(u, {
                          type: `primary`,
                          size: `small`,
                          icon: (0, V.jsx)(O, { component: k.FINE_MATTING }),
                          onClick: () => {
                            I(!0), a?.(`手持商品-点击重新抠图`);
                          },
                          children: `重新抠图`,
                        }),
                        (0, V.jsx)(`p`, { children: `重新手动抠图` }),
                      ],
                    })
                  : (0, V.jsx)(`img`, { className: B.mask, src: T }),
                (0, V.jsx)(`div`, {
                  className: B.btnBox,
                  children: (0, V.jsx)(h, {
                    placement: `top`,
                    title: `删除`,
                    children: (0, V.jsx)(u, {
                      type: `primary`,
                      size: `small`,
                      shape: `circle`,
                      icon: (0, V.jsx)(m, {}),
                      danger: !0,
                      onClick: () => {
                        r(``), i(``), C(``), E(``);
                      },
                    }),
                  }),
                }),
                !W &&
                  (0, V.jsx)(V.Fragment, {
                    children: (0, V.jsx)(`div`, {
                      className: B.editBox,
                      children:
                        s &&
                        (0, V.jsx)(u, {
                          size: `small`,
                          icon: (0, V.jsx)(O, { component: k.FINE_MATTING }),
                          onClick: () => {
                            I(!0), a?.(`手持商品-点击继续抠图`);
                          },
                          children: `继续抠图`,
                        }),
                    }),
                  }),
              ],
            }),
        }),
        p &&
          (0, V.jsx)(N, {
            pageName: o.PAGE_NAME.HANDHELD_GOODS,
            entryName: `上传${n}`,
            children: (0, V.jsx)(M, {
              type: y.SCENE_TRANSFER,
              mattingType: w.SCENE_TRANSFER,
              onClose: () => {
                g(!1);
              },
              onDone: (e) => {
                e.originUrl && e.resultUrl
                  ? (r(e.originUrl), i(e.resultUrl))
                  : e.originUrl &&
                    (r(e.originUrl),
                    i(``),
                    s && re(e.originUrl, e.fileData),
                    e.fileData);
              },
            }),
          }),
        (0, V.jsx)(L, {
          onRef: Q,
          type: y.SCENE_TRANSFER,
          mattingType: w.SCENE_TRANSFER,
          noAuto: !0,
          open: F,
          onClose: () => {
            s && !T && r(``), I(!1);
          },
          originImgUrl: v,
          resultImgUrl: T,
          onMatting: (e, t) => {
            v !== t && (C(t), r(t), P(!1), G(!1)), E(e), i(e);
          },
        }),
      ],
    });
  },
  W = () => {
    let e = i(),
      n = t(),
      [r, u] = (0, R.useState)(!1),
      [ee, m] = (0, R.useState)(`1`),
      [h, _] = (0, R.useState)(),
      [b, x] = (0, R.useState)(!1),
      [S, w] = (0, R.useState)(``),
      [D, O] = (0, R.useState)(``),
      [k, A] = (0, R.useState)(``),
      [M, N] = (0, R.useState)(``),
      [L, B] = (0, R.useState)(0.65),
      H = (0, R.useRef)();
    (0, R.useEffect)(() => {
      e?.userStore?.isBsqTeam || n(`/home`);
    }, [e?.userStore?.isBsqTeam]),
      (0, R.useEffect)(() => {
        W();
      }, []),
      (0, R.useEffect)(() => {
        h && q(h);
      }, [h]);
    let W = async () => {
        let { imageUrl: e, rebuildId: t, id: n } = s.parse(location.search);
        e
          ? (w((await C(e)).data),
            window.history.replaceState({}, ``, location.pathname))
          : t
            ? K(t)
            : n && G(n),
          window.history.replaceState({}, ``, location.pathname);
      },
      G = async (e) => {
        try {
          let t = await T(e);
          t && t.code === 200 && _(t.data);
        } catch {}
      },
      K = async (e) => {
        try {
          let t = await E(e);
          t && t.code === 200 && _(t.data);
        } catch {}
      },
      q = (e) => {
        S
          ? f.confirm({
              title: `替换已填写的内容？`,
              content: `您已经填写了内容，确定用新的内容替换已填写的内容？`,
              onOk: () => {
                J(e);
              },
              onCancel: () => {
                _(void 0);
              },
            })
          : J(e);
      },
      J = async (e) => {
        b ||
          (x(!0),
          w(e.imageUrl ?? ``),
          O(e.extendFields?.segImageUrl ?? ``),
          A(e.extendFields?.imageStyleUrl ?? ``),
          B(e.extendFields?.similarity ?? 0.65),
          _(void 0),
          x(!1));
      },
      Y = (e, t) => {
        let n = o.PAGE_NAME.SCENE_TRANSFER;
        a.onPageClickByDraw(n, e, t);
      },
      X = async () => {
        u(!0);
        try {
          let e = {
            type: y.SCENE_TRANSFER,
            imageUrl: S,
            extendFields: { segImageUrl: D, imageStyleUrl: k, similarity: L },
          };
          m(`1`);
          let t = await v(e);
          t.code === 200
            ? (H.current?.onRefresh(), j.getStatusInfo(), Y(`开始生成`))
            : l.error(t.msg);
        } catch {
        } finally {
          u(!1);
        }
      },
      Z = (0, R.useMemo)(() => !S || !k, [S, k]);
    return (0, V.jsxs)(`div`, {
      className: z.sceneTransfer,
      children: [
        b &&
          (0, V.jsx)(d, {
            spinning: !0,
            indicator: (0, V.jsx)(g, {
              loading: !0,
              title: `正在处理手持数据...`,
              desc: ``,
            }),
          }),
        (0, V.jsxs)(`div`, {
          className: z.content,
          children: [
            (0, V.jsxs)(`div`, {
              className: z.left,
              children: [
                (0, V.jsxs)(`div`, {
                  className: z.configContent,
                  children: [
                    (0, V.jsx)(`div`, {
                      className: z.configItem,
                      children: (0, V.jsx)(U, {
                        btnText: `商品图`,
                        imageUrl: S,
                        imageSegUrl: D,
                        setImageUrl: w,
                        setImageSegUrl: O,
                        isAutoMatting: !0,
                        trackHandle: Y,
                      }),
                    }),
                    (0, V.jsx)(`div`, {
                      className: z.configItem,
                      children: (0, V.jsx)(U, {
                        btnText: `风格图`,
                        imageUrl: k,
                        imageSegUrl: M,
                        setImageUrl: A,
                        setImageSegUrl: N,
                        isAutoMatting: !1,
                        trackHandle: Y,
                      }),
                    }),
                    (0, V.jsxs)(`div`, {
                      className: z.configItem,
                      children: [
                        (0, V.jsx)(`p`, {
                          className: z.title,
                          children: `风格相似度：`,
                        }),
                        (0, V.jsx)(c, {
                          min: 0,
                          max: 1,
                          step: 0.05,
                          value: typeof L == `number` ? L : 0.65,
                          onChange: B,
                        }),
                      ],
                    }),
                  ],
                }),
                (0, V.jsx)(`div`, {
                  className: z.createBtn,
                  children: (0, V.jsx)(P, {
                    block: !0,
                    onClick: X,
                    codeKey: `HAND_HELD_DRAW`,
                    loading: r,
                    disabled: Z,
                    costPoint: 0,
                    children: `立即生成`,
                  }),
                }),
              ],
            }),
            (0, V.jsx)(`div`, {
              id: `rightWrapper`,
              className: z.rightWrapper,
              children: (0, V.jsx)(p, {
                activeKey: ee,
                onChange: (e) => {
                  m(e), Y(`点击生成结果`);
                },
                items: [
                  {
                    key: `1`,
                    label: `生成结果`,
                    children: (0, V.jsx)(F, {
                      onRef: H,
                      type: y.SCENE_TRANSFER,
                      onTrack: (0, R.useCallback)((e) => {
                        Y(e);
                      }, []),
                      onRebuild: (0, R.useCallback)((e) => {
                        _(e), Y(`点击再次编辑`);
                      }, []),
                      onDone: () => {
                        j.getStatusInfo();
                      },
                    }),
                  },
                ],
                tabBarGutter: 14,
                tabBarExtraContent: (0, V.jsx)(I, {
                  type: y.SCENE_TRANSFER,
                  onClick: () => Y(`点击历史记录`),
                }),
              }),
            }),
          ],
        }),
      ],
    });
  };
export { W as default };
