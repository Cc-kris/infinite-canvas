import { o as e } from "./rolldown-runtime-Da7WdEYL.js";
import { r as t, x as n } from "./react-qdxTBA-_.js";
import { r } from "./mobx-Dz9VxtfR.js";
import { c as i, n as a, wt as o } from "./utils-s6-B6XWS.js";
import {
  $ as s,
  At as c,
  Dt as l,
  F as u,
  Ft as d,
  H as f,
  K as p,
  N as m,
  O as h,
  Ot as g,
  T as _,
  U as v,
  V as y,
  ft as b,
  jt as x,
  ot as S,
  q as C,
  wt as w,
} from "./lib-antd-BlrvMpdd.js";
import { n as T } from "./message-a-n2EKcA.js";
import { t as E } from "./SyncOutlined-Dg2p0bkd.js";
import {
  Ei as D,
  Gn as O,
  Qn as k,
  Ti as ee,
  da as A,
  pr as j,
  ri as te,
} from "./tools-CxaYXPQE.js";
import { ft as M } from "./icons-DlVi4k-I.js";
import { u as N, v as ne } from "./icons-BKryTor6.js";
import { d as P, f as re } from "./lib-lodash-BQjRLexk.js";
import { n as F } from "./adoptionUtils-CGP3GLty.js";
import { t as ie } from "./SideMenu-BslnK6Tk.js";
import { t as I } from "./points-CPrSlBen.js";
import { t as L } from "./store-DQN9yT0P.js";
import { t as ae } from "./react-intersection-observer-BBN24VLp.js";
import { t as R } from "./GenerateBtn-CXZAlBcP.js";
import { t as oe } from "./DrawResultList-CF8ppqGu.js";
import { t as se } from "./HistoryLink-BDd3WV8J.js";
import { t as ce } from "./lib-CjRtOF4O.js";
import { t as le } from "./CheckStyle-BtYi9Tph.js";
var z = e(n()),
  B = {
    aiText: `_aiText_dslpd_1`,
    main: `_main_dslpd_4`,
    configWrapper: `_configWrapper_dslpd_13`,
    configContent: `_configContent_dslpd_18`,
    tabs: `_tabs_dslpd_22`,
    createBtn: `_createBtn_dslpd_61`,
    imageCount: `_imageCount_dslpd_73`,
  },
  V = {
    easyMode: `_easyMode_nb6cu_1`,
    inputWrap: `_inputWrap_nb6cu_11`,
    inputBtn: `_inputBtn_nb6cu_16`,
    inputTitle: `_inputTitle_nb6cu_34`,
    styleTemplate: `_styleTemplate_nb6cu_40`,
    title: `_title_nb6cu_41`,
    typeList: `_typeList_nb6cu_45`,
    typeItem: `_typeItem_nb6cu_50`,
    active: `_active_nb6cu_67`,
    listBox: `_listBox_nb6cu_73`,
    styleList: `_styleList_nb6cu_77`,
    styleItem: `_styleItem_nb6cu_83`,
    icon: `_icon_nb6cu_96`,
    name: `_name_nb6cu_128`,
    styleScale: `_styleScale_nb6cu_146`,
    scaleList: `_scaleList_nb6cu_158`,
    scaleItem: `_scaleItem_nb6cu_164`,
    wh: `_wh_nb6cu_179`,
  },
  H = e(x()),
  U = t(),
  W = [
    ...[
      { x: 1, y: 1, w: 12, h: 12 },
      { x: 9, y: 16, w: 7, h: 12 },
      { x: 16, y: 9, w: 12, h: 7 },
      { x: 10, y: 16, w: 8, h: 12 },
      { x: 16, y: 10, w: 12, h: 8 },
      { x: 2, y: 3, w: 11, h: 12 },
      { x: 3, y: 2, w: 12, h: 11 },
      { x: 3, y: 4, w: 9, h: 12 },
      { x: 4, y: 3, w: 12, h: 9 },
    ].map((e) => ({
      title: `${e.x}:${e.y}`,
      value: `${e.x}:${e.y}`,
      w: e.w,
      h: e.h,
    })),
  ],
  G = [
    { title: `关闭`, value: ``, icon: `` },
    {
      title: `网格平铺`,
      value: `GRID`,
      icon: (0, U.jsx)(M, { component: N.gridLayout }),
    },
    {
      title: `垂直交错平铺`,
      value: `VERTICAL_BRICK`,
      icon: (0, U.jsx)(M, { component: N.verticalLayout }),
    },
    {
      title: `水平交错平铺`,
      value: `HORIZONTAL_BRICK`,
      icon: (0, U.jsx)(M, { component: N.horizontalLayout }),
    },
    {
      title: `纵向平铺`,
      value: `COLUMN`,
      icon: (0, U.jsx)(M, { component: N.rowLayout }),
    },
    {
      title: `水平平铺`,
      value: `ROW`,
      icon: (0, U.jsx)(M, { component: N.columnLayout }),
    },
  ],
  K = [
    { title: `自动`, value: `AUTO` },
    { title: `开启`, value: `ON` },
    { title: `关闭`, value: `OFF` },
  ],
  q = r(({ onSubmit: e }) => {
    let [t] = (0, z.useState)(L),
      { example: n, itemFields: r } = o.parse(location.search),
      s = t.styleList.get(j.AITEXT_TEMPLATE),
      [c, l] = (0, z.useState)({ id: -1, style: `` }),
      [u, d] = (0, z.useState)(W[0].value),
      [f, p] = (0, z.useState)(G[0].value),
      [h, g] = (0, z.useState)(K[0].value);
    (0, z.useEffect)(() => {
      s && _();
    }, [s]),
      (0, z.useEffect)(() => {
        u !== L.aiTextSimpleExtendFields?.ratio &&
          d(L.aiTextSimpleExtendFields?.ratio ?? W[0].value),
          f !== L.aiTextSimpleExtendFields?.tilingPreset &&
            p(L.aiTextSimpleExtendFields?.tilingPreset ?? G[0].value),
          h !== L.aiTextSimpleExtendFields?.useAutopromptOption &&
            g(L.aiTextSimpleExtendFields?.useAutopromptOption ?? K[0].value),
          c.id !== L.aiTextSimpleExtendFields?.modelId &&
            c.style !== L.aiTextSimpleExtendFields?.modelName &&
            l({
              id: L.aiTextSimpleExtendFields?.modelId ?? -1,
              style: L.aiTextSimpleExtendFields?.modelName ?? ``,
            });
      }, [L.aiTextSimpleExtendFields]);
    let _ = () => {
        s?.length &&
          (t.setAiTextSimpleExtendFields({
            mode: O.SIMPLE,
            modelId: s[0].id,
            modelName: s[0].style,
            ratio: u,
            useAutopromptOption: h,
            tilingPreset: f,
          }),
          n && !r && (x(), e()));
      },
      y = (e) => {
        t.setSimpleAiTextPrompt(e),
          t.setAiTextSimpleExtendFields({
            mode: O.SIMPLE,
            modelId: c.id,
            modelName: c.style,
            ratio: u,
            useAutopromptOption: h,
            tilingPreset: f,
          });
      },
      b = (e) => {
        i.onPageClick(a.PAGE_NAME.AI_TEXT, e);
      },
      x = () => {
        if ((b(`简易模式-点击尝试示例`), !s?.length)) return;
        let e = s.length,
          n = s[Math.floor(Math.random() * e)],
          r = Math.floor(Math.random() * n.examples.length);
        l({ id: n.id, style: n.style }),
          t.setSimpleAiTextPrompt(n.examples?.[r]?.example || ``),
          t.setAiTextSimpleExtendFields({
            mode: O.SIMPLE,
            modelId: n.id,
            modelName: n.style,
            ratio: u,
            useAutopromptOption: h,
            tilingPreset: f,
          });
      };
    return (0, U.jsxs)(`div`, {
      className: V.easyMode,
      children: [
        (0, U.jsx)(`div`, {
          className: V.inputTitle,
          children: `文字内容和创意方向`,
        }),
        (0, U.jsxs)(`div`, {
          className: V.inputWrap,
          children: [
            (0, U.jsx)(m.TextArea, {
              bordered: !1,
              placeholder: `输入要生成的文字内容，使用英文更准确。例如“I love you”或谚语语句等`,
              autoSize: { minRows: 4, maxRows: 4 },
              value: t.aiSimpleTextPrompt,
              onChange: (e) => y(e.target.value),
              showCount: !0,
              maxLength: 200,
            }),
            (0, U.jsx)(`div`, {
              className: V.inputBtn,
              children: (0, U.jsxs)(`span`, {
                onClick: () => {
                  x();
                },
                children: [(0, U.jsx)(E, {}), ` 尝试示例`],
              }),
            }),
          ],
        }),
        (0, U.jsxs)(`div`, {
          className: V.styleScale,
          children: [
            (0, U.jsxs)(`div`, {
              className: V.title,
              children: [
                `提示词优化 `,
                (0, U.jsx)(w, {
                  title: `可增强您的初始提示词，提高图像的多样性和丰富性。`,
                  children: (0, U.jsx)(v, {}),
                }),
              ],
            }),
            (0, U.jsx)(`div`, {
              className: V.scaleList,
              style: { flexWrap: `wrap` },
              children: K.map((e) =>
                (0, U.jsx)(
                  `div`,
                  {
                    className: (0, H.default)(V.scaleItem, {
                      [V.active]: e.value === h,
                    }),
                    onClick: () => {
                      g(e.value),
                        t.setAiTextSimpleExtendFields({
                          mode: O.SIMPLE,
                          modelId: c.id,
                          modelName: c.style,
                          ratio: u,
                          useAutopromptOption: e.value,
                          tilingPreset: f,
                        }),
                        b(`简易模式-点击图片比例-${e.title}`);
                    },
                    children: e.title,
                  },
                  e.value,
                ),
              ),
            }),
          ],
        }),
        (0, U.jsxs)(`div`, {
          className: V.styleTemplate,
          children: [
            (0, U.jsx)(`div`, { className: V.title, children: `创意风格模板` }),
            (0, U.jsx)(le, {
              type: j.AITEXT_TEMPLATE,
              value: t.aiTextSimpleExtendFields?.modelName,
              onTrack: () => b(`简易模式-点击风格模板`),
              onChange: (e, n) => {
                b(`简易模式-点击风格模板-${n.style}`),
                  l({ id: n.id, style: n.style }),
                  t.setAiTextSimpleExtendFields({
                    mode: O.SIMPLE,
                    modelId: n.id,
                    modelName: n.style,
                    ratio: u,
                    useAutopromptOption: h,
                    tilingPreset: f,
                  });
              },
            }),
          ],
        }),
        (0, U.jsxs)(`div`, {
          className: V.styleScale,
          children: [
            (0, U.jsx)(`div`, { className: V.title, children: `图片比例` }),
            (0, U.jsx)(`div`, {
              className: V.scaleList,
              style: { flexWrap: `wrap` },
              children: W.map((e) =>
                (0, U.jsxs)(
                  `div`,
                  {
                    className: (0, H.default)(V.scaleItem, {
                      [V.active]: e.value === u,
                    }),
                    onClick: () => {
                      d(e.value),
                        t.setAiTextSimpleExtendFields({
                          mode: O.SIMPLE,
                          modelId: c.id,
                          modelName: c.style,
                          ratio: e.value,
                          useAutopromptOption: h,
                          tilingPreset: f,
                        }),
                        b(`简易模式-点击图片比例-${e.title}`);
                    },
                    children: [
                      (0, U.jsx)(`span`, {
                        className: V.wh,
                        style: { width: e.w, height: e.h },
                      }),
                      e.title,
                    ],
                  },
                  e.value,
                ),
              ),
            }),
          ],
        }),
      ],
    });
  }),
  J = {
    advancedMode: `_advancedMode_jnzr2_1`,
    inputWrap: `_inputWrap_jnzr2_11`,
    inputBtn: `_inputBtn_jnzr2_15`,
    inputTitle: `_inputTitle_jnzr2_33`,
    styleTemplate: `_styleTemplate_jnzr2_37`,
    title: `_title_jnzr2_38`,
    typeList: `_typeList_jnzr2_42`,
    typeItem: `_typeItem_jnzr2_47`,
    active: `_active_jnzr2_64`,
    styleScale: `_styleScale_jnzr2_71`,
    scaleList: `_scaleList_jnzr2_83`,
    scaleItem: `_scaleItem_jnzr2_89`,
    wh: `_wh_jnzr2_104`,
  },
  ue = [
    ...[
      { x: 1, y: 1, w: 12, h: 12 },
      { x: 9, y: 16, w: 7, h: 12 },
      { x: 16, y: 9, w: 12, h: 7 },
      { x: 10, y: 16, w: 8, h: 12 },
      { x: 16, y: 10, w: 12, h: 8 },
      { x: 2, y: 3, w: 11, h: 12 },
      { x: 3, y: 2, w: 12, h: 11 },
      { x: 3, y: 4, w: 9, h: 12 },
      { x: 4, y: 3, w: 12, h: 9 },
    ].map((e) => ({
      title: `${e.x}:${e.y}`,
      value: `${e.x}:${e.y}`,
      w: e.w,
      h: e.h,
    })),
  ],
  Y = [
    { title: `关闭`, value: ``, icon: `` },
    {
      title: `网格平铺`,
      value: `GRID`,
      icon: (0, U.jsx)(M, { component: N.gridLayout }),
    },
    {
      title: `垂直交错平铺`,
      value: `VERTICAL_BRICK`,
      icon: (0, U.jsx)(M, { component: N.verticalLayout }),
    },
    {
      title: `水平交错平铺`,
      value: `HORIZONTAL_BRICK`,
      icon: (0, U.jsx)(M, { component: N.horizontalLayout }),
    },
    {
      title: `纵向平铺`,
      value: `COLUMN`,
      icon: (0, U.jsx)(M, { component: N.rowLayout }),
    },
    {
      title: `水平平铺`,
      value: `ROW`,
      icon: (0, U.jsx)(M, { component: N.columnLayout }),
    },
  ],
  X = [
    { title: `自动`, value: `AUTO` },
    { title: `开启`, value: `ON` },
    { title: `关闭`, value: `OFF` },
  ],
  de = r(({ onSubmit: e }) => {
    let [t] = (0, z.useState)(L),
      n = t.styleList.get(j.AITEXT_STYLE),
      [r, s] = (0, z.useState)(),
      c = o.parse(location.search),
      [l, u] = (0, z.useState)([]),
      [d, f] = (0, z.useState)([]),
      [p, h] = (0, z.useState)(ue[0].value),
      [g, _] = (0, z.useState)(Y[0].value),
      [y, b] = (0, z.useState)(X[0].value);
    (0, z.useEffect)(() => {
      if (n?.length) {
        if ((t.setChangeTextDemo(!!t.aiTextPrompt), t.aiTextStyles?.length)) {
          u(t.aiTextStyles);
          let e = [],
            r = [];
          t.aiTextStyles.forEach((t) => {
            let i = n?.find((e) => e.styleEn === t)?.style;
            i && e.push(i), t && r.push(t);
          }),
            f(e),
            t.setAiTextExtendFields({
              mode: O.ADVANCED,
              ratio: t.imgRatio,
              styles: r,
              stylesCn: e,
            });
        } else
          t.setAiTextExtendFields({
            mode: O.ADVANCED,
            ratio: t.imgRatio,
            styles: [],
            stylesCn: [],
            useAutopromptOption: X[0].value,
            tilingPreset: Y[0].value,
          }),
            u([]),
            f([]);
        t.imgRatio && h(t.imgRatio);
      }
    }, [n, t.aiTextPrompt, t.aiTextStyles, t.imgRatio]),
      (0, z.useEffect)(() => {
        g !== t.aiTextExtendFields?.tilingPreset &&
          _(t.aiTextExtendFields?.tilingPreset ?? Y[0].value),
          y !== t.aiTextExtendFields?.useAutopromptOption &&
            b(t.aiTextExtendFields?.useAutopromptOption ?? X[0].value);
      }, [t.aiTextExtendFields]),
      (0, z.useEffect)(() => {
        n && x();
      }, [n]);
    let x = async () => {
        n?.length &&
          (s(n),
          c.example && c.itemFields && (await D(JSON.parse(c.itemFields))));
      },
      S = (e) => {
        t.setAiTextPrompt(e),
          t.setAiTextExtendFields({
            mode: O.ADVANCED,
            ratio: p,
            styles: l,
            stylesCn: d,
            useAutopromptOption: y,
            tilingPreset: g,
          });
      },
      T = (e) => {
        i.onPageClick(a.PAGE_NAME.REPLACE_BG, e);
      },
      D = async (e) => {
        if ((T(`高阶模式-点击尝试示例`), !t.aiTextTryData.length)) return;
        let r = t.aiTextTryData.length,
          i = Math.floor(Math.random() * r),
          a = e || t.aiTextTryData[i];
        await A(a.id);
        let o = a.styles.split(`,`);
        u(o);
        let s = [];
        o.forEach((e) => {
          let t = n?.find((t) => t.styleEn === e)?.style;
          t && s.push(t);
        }),
          f(s),
          a.ratio && t.setImgRatio(a.ratio),
          t.setAiTextPrompt(a.prompt || ``),
          t.setAiTextStyles(o);
      },
      k = (e) => {
        let t = l.findIndex((t) => t === e.styleEn);
        t > -1
          ? (l.splice(t, 1), d.splice(t, 1))
          : (e.styleEn && l.push(e.styleEn), e.style && d.push(e.style)),
          u([...l]),
          f([...d]);
      };
    return (0, U.jsxs)(`div`, {
      className: J.advancedMode,
      children: [
        (0, U.jsx)(`div`, {
          className: J.inputTitle,
          children: `文字内容和创意方向`,
        }),
        (0, U.jsxs)(`div`, {
          className: J.inputWrap,
          children: [
            (0, U.jsx)(m.TextArea, {
              bordered: !1,
              placeholder: `输入要生成的文字内容和创意方向，使用英文更准确。例如填写“"I love you" in shape of heart”就可以生成心形的"I love you"文字`,
              autoSize: { minRows: 4, maxRows: 4 },
              value: t.aiTextPrompt,
              onChange: (e) => S(e.target.value),
              showCount: !0,
              maxLength: 600,
            }),
            (0, U.jsx)(`div`, {
              className: J.inputBtn,
              children: (0, U.jsxs)(`span`, {
                onClick: () => {
                  D();
                },
                children: [(0, U.jsx)(E, {}), ` 尝试示例`],
              }),
            }),
          ],
        }),
        (0, U.jsxs)(`div`, {
          className: J.styleScale,
          children: [
            (0, U.jsxs)(`div`, {
              className: J.title,
              children: [
                `提示词优化 `,
                (0, U.jsx)(w, {
                  title: `可增强您的初始提示词，提高图像的多样性和丰富性。`,
                  children: (0, U.jsx)(v, {}),
                }),
              ],
            }),
            (0, U.jsx)(`div`, {
              className: J.scaleList,
              style: { flexWrap: `wrap` },
              children: X.map((e) =>
                (0, U.jsx)(
                  `div`,
                  {
                    className: (0, H.default)(J.scaleItem, {
                      [J.active]: e.value === y,
                    }),
                    onClick: () => {
                      b(e.value),
                        t.setAiTextExtendFields({
                          mode: O.ADVANCED,
                          ratio: p,
                          styles: l,
                          stylesCn: d,
                          useAutopromptOption: e.value,
                          tilingPreset: g,
                        }),
                        T(`简易模式-点击图片比例-${e.title}`);
                    },
                    children: e.title,
                  },
                  e.value,
                ),
              ),
            }),
          ],
        }),
        (0, U.jsxs)(`div`, {
          className: J.styleTemplate,
          children: [
            (0, U.jsx)(`div`, {
              className: J.title,
              children: `创意风格（可多选）`,
            }),
            (0, U.jsx)(C, {
              className: J.typeList,
              size: [5, 5],
              wrap: !0,
              children: r?.map((e) =>
                (0, U.jsx)(
                  `span`,
                  {
                    className: (0, H.default)(J.typeItem, {
                      [J.active]: l.findIndex((t) => t === e.styleEn) > -1,
                    }),
                    onClick: () => {
                      k(e),
                        T(`高阶模式-点击风格模板-${d.join(`,`)}`),
                        t.setAiTextExtendFields({
                          mode: O.ADVANCED,
                          ratio: p,
                          styles: l,
                          stylesCn: d,
                          useAutopromptOption: y,
                          tilingPreset: g,
                        });
                    },
                    children: e.style,
                  },
                  e.id,
                ),
              ),
            }),
          ],
        }),
        (0, U.jsxs)(`div`, {
          className: J.styleScale,
          children: [
            (0, U.jsx)(`div`, { className: J.title, children: `图片比例` }),
            (0, U.jsx)(`div`, {
              className: J.scaleList,
              style: { flexWrap: `wrap` },
              children: ue.map((e) =>
                (0, U.jsxs)(
                  `div`,
                  {
                    className: (0, H.default)(J.scaleItem, {
                      [J.active]: e.value === p,
                    }),
                    onClick: () => {
                      h(e.value),
                        t.setAiTextExtendFields({
                          mode: O.ADVANCED,
                          ratio: e.value,
                          styles: l,
                          stylesCn: d,
                          useAutopromptOption: y,
                          tilingPreset: g,
                        }),
                        T(`高阶模式-点击图片比例-${e.title}`);
                    },
                    children: [
                      (0, U.jsx)(`span`, {
                        className: J.wh,
                        style: { width: e.w, height: e.h },
                      }),
                      e.title,
                    ],
                  },
                  e.value,
                ),
              ),
            }),
          ],
        }),
      ],
    });
  }),
  Z = {
    contentWrapper: `_contentWrapper_19dav_1`,
    headers: `_headers_19dav_7`,
    historyBtn: `_historyBtn_19dav_20`,
    aiTextContent: `_aiTextContent_19dav_59`,
    resultWrapper: `_resultWrapper_19dav_67`,
    emptyWrap: `_emptyWrap_19dav_71`,
    emptyTip: `_emptyTip_19dav_73`,
    excellentCaseTip: `_excellentCaseTip_19dav_75`,
    excellentCaseList: `_excellentCaseList_19dav_80`,
    topFilter: `_topFilter_19dav_81`,
    topLeft: `_topLeft_19dav_90`,
    topRight: `_topRight_19dav_91`,
    filterLabel: `_filterLabel_19dav_93`,
    affixed: `_affixed_19dav_103`,
    listBox: `_listBox_19dav_108`,
    waterfallsFlow: `_waterfallsFlow_19dav_110`,
    item: `_item_19dav_111`,
    image: `_image_19dav_118`,
    imageMask: `_imageMask_19dav_128`,
    top: `_top_19dav_81`,
    bottom: `_bottom_19dav_153`,
    prompt: `_prompt_19dav_169`,
    endLine: `_endLine_19dav_185`,
    emptyBox: `_emptyBox_19dav_189`,
    loading: `_loading_19dav_203`,
    previewModal: `_previewModal_19dav_210`,
    previewContent: `_previewContent_19dav_211`,
    affix: `_affix_19dav_103`,
    actions: `_actions_19dav_226`,
    modal: `_modal_19dav_254`,
    typeList: `_typeList_19dav_255`,
    typeItem: `_typeItem_19dav_260`,
    active: `_active_19dav_283`,
    labelStyle: `_labelStyle_19dav_289`,
    sliderStyle: `_sliderStyle_19dav_292`,
    imageBox: `_imageBox_19dav_307`,
    subTitle: `_subTitle_19dav_311`,
    footer: `_footer_19dav_318`,
    createBtn: `_createBtn_19dav_325`,
    imageCount: `_imageCount_19dav_337`,
  },
  fe = e(re()),
  pe = ({ open: e, item: t, onTry: n, onClose: r, onDrawSim: i }) => {
    let { imageUrl: a, prompt: o, styles: s } = t ?? {};
    return (0, U.jsx)(_, {
      open: e,
      onCancel: () => r(),
      title: null,
      footer: null,
      wrapClassName: Z.previewModal,
      centered: !0,
      width: 600,
      children: (0, U.jsxs)(`div`, {
        className: Z.previewContent,
        children: [
          (0, U.jsx)(`img`, { src: a }),
          (0, U.jsxs)(`div`, {
            className: Z.affix,
            children: [
              (0, U.jsx)(`div`, {
                className: Z.actions,
                children: (0, U.jsxs)(`div`, {
                  children: [
                    (0, U.jsx)(d, {
                      type: `link`,
                      onClick: () => n(t),
                      children: `做同款`,
                    }),
                    (0, U.jsx)(d, {
                      type: `link`,
                      onClick: () => i(t),
                      children: `相似裂变`,
                    }),
                  ],
                }),
              }),
              (0, U.jsx)(`div`, {
                className: Z.prompt,
                children: `${o}${s ? `,` + s : ``}`,
              }),
            ],
          }),
        ],
      }),
    });
  },
  me = {
    0: `最不相似`,
    25: `少许相似`,
    50: `一半相似`,
    75: `非常相似`,
    100: `极度相似`,
  },
  he = r(({ itemData: e, onSubmit: t, onClose: n }) => {
    let [r] = (0, z.useState)(L),
      i = r.styleList.get(j.AITEXT_STYLE),
      [a, o] = (0, z.useState)(!0),
      [c, l] = (0, z.useState)(),
      [d, p] = (0, z.useState)(!1),
      [h, g] = (0, z.useState)({
        prompt: e.prompt,
        imageCount: 4,
        variationStrength: 50,
        styles: [],
        stylesCn: [],
        tilingPreset: ``,
        useAutopromptOption: `AUTO`,
      });
    (0, z.useEffect)(() => {
      y();
    }, [i]);
    let y = () => {
        if (!i?.length) r.getStyleList(j.AITEXT_STYLE);
        else {
          l(i);
          let t = e.styles;
          if (e?.extendFields?.styles)
            g({
              ...h,
              stylesCn: e?.extendFields?.stylesCn,
              styles: e?.extendFields?.styles,
              tilingPreset: e?.extendFields?.tilingPreset,
              useAutopromptOption: e?.extendFields?.useAutopromptOption,
            });
          else if (t) {
            let t = [],
              n = e.styles.split(`,`);
            n.forEach((e) => {
              let n = i?.find((t) => t.styleEn === e)?.style;
              n && t.push(n);
            }),
              g({
                ...h,
                stylesCn: t,
                styles: n,
                tilingPreset: e?.extendFields?.tilingPreset,
                useAutopromptOption: e?.extendFields?.useAutopromptOption,
              });
          }
        }
      },
      b = (e) => `${me[e]}`,
      x = () => {
        let n = e?.requestId,
          r = e?.responseId;
        if (e?.resultList?.length > 0) {
          let t = e?.resultList.find((t) => t.url === e.imageUrl);
          t && ((n = t.extendField.requestId), (r = t.extendField.responseId));
        }
        t({
          type: k.AI_TEXT,
          prompt: h.prompt,
          outputNum: h.imageCount,
          imageUrl: e.imageUrl,
          extendFields: {
            mode: O.SIMILAR,
            ratio: e.extendFields?.ratio ? e.extendFields?.ratio : e?.ratio,
            styles: h.styles,
            stylesCn: h.stylesCn,
            tilingPreset: h.tilingPreset,
            useAutopromptOption: h.useAutopromptOption,
            requestId: n,
            responseId: r,
            variationStrength: h.variationStrength.toString(),
            isCase: e.isCase,
          },
        });
      },
      S = (e) => {
        let t = h.styles.findIndex((t) => t === e.styleEn);
        t > -1
          ? (h.styles.splice(t, 1), h.stylesCn.splice(t, 1))
          : (e.styleEn && h.styles.push(e.styleEn), h.stylesCn.push(e.style)),
          g({ ...h, stylesCn: [...h.stylesCn], styles: [...h.styles] });
      },
      T = { 0: `最不相似`, 100: `极度相似` },
      E = (0, z.useMemo)(
        () => I.CHANGEBG.generatePoints * h.imageCount,
        [h.imageCount],
      );
    return (0, U.jsxs)(_, {
      title: `生成创意文字的相似裂变图`,
      wrapClassName: Z.modal,
      width: 670,
      centered: !0,
      open: a,
      footer: null,
      maskClosable: !1,
      onCancel: () => o(!1),
      afterClose: n,
      children: [
        (0, U.jsx)(`div`, {
          className: Z.subTitle,
          children: `根据选择的参考图，生成相似裂变图`,
        }),
        (0, U.jsxs)(f, {
          layout: `vertical`,
          children: [
            (0, U.jsx)(f.Item, {
              children: (0, U.jsxs)(C, {
                children: [
                  (0, U.jsx)(`label`, {
                    className: Z.labelStyle,
                    children: `选择的参考图`,
                  }),
                  (0, U.jsx)(`div`, {
                    className: Z.imageBox,
                    children: (0, U.jsx)(u, { width: 70, src: e.imageUrl }),
                  }),
                ],
              }),
            }),
            (0, U.jsx)(f.Item, {
              label: `生成图与原图相似度`,
              children: (0, U.jsx)(`div`, {
                className: Z.sliderStyle,
                children: (0, U.jsx)(s, {
                  min: 0,
                  max: 100,
                  step: 25,
                  tooltip: { formatter: b },
                  marks: T,
                  value: h.variationStrength,
                  onChange: (e) => g({ ...h, variationStrength: e }),
                }),
              }),
            }),
            (0, U.jsx)(f.Item, {
              label: `生成文字和创意方向`,
              children: (0, U.jsx)(m.TextArea, {
                allowClear: !0,
                placeholder: `输入要生成的文字内容和创意方向，使用英文更准确。例如填写“"I love you" in shape of heart”就可以生成心形的"I love you"文字`,
                autoSize: { minRows: 2, maxRows: 8 },
                value: h.prompt,
                onChange: (e) => g({ ...h, prompt: e.target.value }),
                showCount: !0,
                maxLength: 600,
              }),
            }),
            (0, U.jsx)(f.Item, {
              label: (0, U.jsxs)(U.Fragment, {
                children: [
                  `提示词优化 `,
                  (0, U.jsx)(w, {
                    title: `可增强您的初始提示词，提高图像的多样性和丰富性。`,
                    children: (0, U.jsx)(v, {}),
                  }),
                ],
              }),
              children: (0, U.jsx)(C, {
                className: Z.typeList,
                size: [5, 5],
                wrap: !0,
                children: K?.map((e) =>
                  (0, U.jsx)(
                    `span`,
                    {
                      className: (0, H.default)(Z.typeItem, {
                        [Z.active]: e.value === h.useAutopromptOption,
                      }),
                      onClick: () => {
                        g({ ...h, useAutopromptOption: e.value });
                      },
                      children: e.title,
                    },
                    e.value,
                  ),
                ),
              }),
            }),
            (0, U.jsx)(f.Item, {
              label: `创意风格（可多选）`,
              children: (0, U.jsx)(C, {
                className: Z.typeList,
                size: [5, 5],
                wrap: !0,
                children: c?.map((e) =>
                  (0, U.jsx)(
                    `span`,
                    {
                      className: (0, H.default)(Z.typeItem, {
                        [Z.active]:
                          h.styles.findIndex((t) => t === e.styleEn) > -1,
                      }),
                      onClick: () => {
                        S(e);
                      },
                      children: e.style,
                    },
                    e.id,
                  ),
                ),
              }),
            }),
          ],
        }),
        (0, U.jsx)(`div`, {
          className: Z.footer,
          children: (0, U.jsxs)(`div`, {
            className: Z.createBtn,
            children: [
              (0, U.jsx)(R, {
                codeKey: `IDEOGRAM_DRAW`,
                block: !0,
                onClick: x,
                disabled: !1,
                costPoint: E,
                children: `立即生成`,
              }),
              (0, U.jsxs)(`a`, {
                className: Z.imageCount,
                onClick: () => {
                  p(!0);
                },
                children: [`生成张数: `, h.imageCount],
              }),
            ],
          }),
        }),
      ],
    });
  }),
  ge = P(),
  _e = e(ce()),
  { confirm: ve } = _,
  ye = [
    { key: `1`, label: `官方推荐` },
    { key: `2`, label: `最流行` },
  ],
  Q = r(
    ({
      onRef: e,
      selectTabKey: t,
      setSelectTabKey: n,
      changeTabType: r,
      onSubmit: s,
      visible: u,
      setVisible: d,
    }) => {
      let [f] = (0, z.useState)(L),
        [v, x] = (0, z.useState)(1),
        [w, T] = (0, z.useState)(``),
        [j, N] = (0, z.useState)(`1`),
        [P, re] = (0, z.useState)([]),
        [F, I] = (0, z.useState)(),
        [R, ce] = (0, z.useState)(!1),
        [le, B] = (0, z.useState)(!1),
        [V, W] = (0, z.useState)([]),
        [G, K] = (0, z.useState)(!1),
        q = o.parse(location.search),
        [J, ue] = (0, z.useState)(!0),
        [Y, X] = (0, z.useState)(``),
        [de, me] = (0, z.useState)(289),
        Q = (0, z.useRef)(),
        { ref: be, inView: xe } = ae({ threshold: 0.5 }),
        Se = (e) => {
          let { scrollTop: t } = e.target;
          K(t > 10);
        };
      (0, z.useEffect)(() => {
        if ((Ce(), Ee(), Oe(), Q?.current))
          return (
            Q?.current.addEventListener(`scroll`, Se),
            () => {
              Q?.current?.removeEventListener(`scroll`, Se);
            }
          );
      }, []);
      let Ce = () => {
          let { id: e } = o.parse(location.search);
          e && (we(e), window.history.replaceState({}, ``, location.pathname));
        },
        we = async (e) => {
          try {
            let t = await te(e);
            t && t.code === 200 && Ne(t.data);
          } catch {}
        };
      (0, z.useEffect)(() => {
        Ae();
      }, [v, j, w, Y]),
        (0, z.useEffect)(() => {
          xe && De();
        }, [xe]),
        (0, z.useEffect)(
          () => (
            Te(),
            window.addEventListener(`resize`, Te),
            () => {
              window.removeEventListener(`resize`, Te);
            }
          ),
          [],
        );
      let Te = () => {
          let e = document.body.clientWidth;
          if (e) {
            let t = e - 180 - 296 - 180 - 48,
              n = 4;
            t > 638 && t <= 927
              ? (n = 3)
              : t > 349 && t <= 638
                ? (n = 2)
                : t <= 349 && (n = 1),
              me((t - 60) / n);
          }
        },
        Ee = () => {
          if (q.imageUrl && q.itemFields) {
            let e = JSON.parse(q.itemFields);
            I({ ...F, ...e, imageUrl: q.imageUrl }),
              d(!0),
              window.history.replaceState({}, ``, `/draw?type=${ie.AI_TEXT}`);
          }
        },
        De = () => {
          x(v + 1);
        },
        Oe = async () => {
          let e = await D(),
            t = [{ key: ``, label: `全部` }];
          e?.data.list.forEach((e) => {
            t.push({ key: e.id.toString(), label: e.name });
          }),
            re(t);
        },
        ke = (e) => {
          $(`点击预览`),
            $(`点击查看优秀案例-${e.id}`),
            I({ ...e, isCase: !0 }),
            B(!0);
        },
        Ae = async () => {
          if (!R) {
            ce(!0);
            try {
              let {
                data: { list: e, hasMore: t },
              } = await ee({
                pageNum: v === 0 ? 1 : v,
                pageSize: 16,
                tagIds: w,
                sortType: j,
                keyword: Y,
              });
              W([...(0, ge.uniqBy)(V.concat(e), `id`)]),
                ue(t),
                f.setAiTextTryData([
                  ...(0, ge.uniqBy)(f.aiTextTryData.concat(e), `id`),
                ]);
            } finally {
              ce(!1);
            }
          }
        };
      (0, z.useMemo)(
        () =>
          (0, fe.default)(
            V.map((e, t) => ({ ...e, index: t })),
            (e) => e.index % 4,
          ),
        [V],
      );
      let $ = (e) => {
          i.onPageClick(a.PAGE_NAME.AI_TEXT, e);
        },
        je = () => {
          B(!1), I(void 0);
        },
        Me = async (e) => {
          r(`2`),
            await A(e.id),
            f.changeTextDemo && f.aiTextPrompt !== e.prompt
              ? ve({
                  title: `替换已填写内容？`,
                  content: `您已经填写了内容，确定用新的内容替换已填写的内容？`,
                  onOk() {
                    B(!1),
                      f.setAiTextStyles(e.styles ? e.styles.split(`,`) : []),
                      f.setAiTextPrompt(e.prompt),
                      e.ratio && f.setImgRatio(e.ratio);
                  },
                })
              : (B(!1),
                f.setAiTextStyles(e.styles ? e.styles.split(`,`) : []),
                f.setAiTextPrompt(e.prompt),
                e.ratio && f.setImgRatio(e.ratio));
        },
        Ne = (e, t, n) => {
          if (t) {
            I({ ...F, ...e, imageUrl: n ?? e.imageUrl ?? `` }), d(!0);
            return;
          }
          f.aiTextPrompt || f.aiSimpleTextPrompt
            ? _.confirm({
                title: `替换已填写的内容？`,
                content: `您已经填写了内容，确定用新的内容替换已填写的内容？`,
                onOk: () => {
                  Pe(e);
                },
              })
            : Pe(e);
        },
        Pe = (e) => {
          if (
            (r(`${e.extendFields?.mode == `1` ? `1` : `2`}`),
            e.extendFields?.mode == `1`)
          )
            f.setSimpleAiTextPrompt(e.extendFields?.prompt),
              f.setAiTextSimpleExtendFields({
                mode: O.SIMPLE,
                modelId: Number(e.extendFields?.modelId),
                modelName: e.extendFields?.modelName,
                ratio: e.extendFields?.ratio,
                useAutopromptOption: e.extendFields?.useAutopromptOption,
              });
          else {
            let t = [];
            e.extendFields?.styles?.forEach((e) => {
              e && t.push(e);
            }),
              f.setAiTextStyles(t),
              f.setAiTextPrompt(e.extendFields?.prompt),
              e.ratio && f.setImgRatio(e.extendFields?.ratio ?? `1:1`),
              f.setAiTextExtendFields({
                useAutopromptOption:
                  e.extendFields?.useAutopromptOption ?? `AUTO`,
              });
          }
        },
        Fe = () => {
          W([]), x(0);
        },
        Ie = (0, ge.debounce)(async (e) => {
          Y !== e.target.value && (Fe(), X(e.target.value));
        }, 700);
      return (0, U.jsxs)(`div`, {
        className: Z.contentWrapper,
        children: [
          (0, U.jsxs)(`div`, {
            className: Z.headers,
            children: [
              (0, U.jsx)(b, {
                activeKey: t,
                onChange: (e) => {
                  n(e), $(e === `1` ? `点击生成结果` : `点击优秀案例`);
                },
                items: [
                  { key: `1`, label: `生成结果` },
                  { key: `2`, label: `优秀案例` },
                ],
              }),
              (0, U.jsx)(se, {
                type: k.AI_TEXT,
                onClick: () => $(`点击历史记录`),
              }),
            ],
          }),
          (0, U.jsxs)(`div`, {
            className: Z.aiTextContent,
            ref: Q,
            children: [
              (0, U.jsx)(`div`, {
                className: Z.resultWrapper,
                style: t === `1` ? {} : { display: `none` },
                children: (0, U.jsx)(oe, {
                  type: k.AI_TEXT,
                  onRef: e,
                  onRebuild: (0, z.useCallback)((e, t, n) => {
                    Ne(e, t, n), $(`点击再次编辑`);
                  }, []),
                  onTrack: (0, z.useCallback)((e) => {
                    $(e);
                  }, []),
                  onOpenDetail: (0, z.useCallback)(() => {}, []),
                }),
              }),
              (0, U.jsxs)(`div`, {
                className: Z.excellentCaseList,
                style: t === `2` ? {} : { display: `none` },
                children: [
                  (0, U.jsxs)(`div`, {
                    className: (0, H.default)(Z.topFilter, { [Z.affixed]: G }),
                    children: [
                      (0, U.jsx)(`div`, {
                        className: Z.topLeft,
                        children: (0, U.jsx)(p, {
                          trigger: [`click`],
                          menu: {
                            items: P,
                            selectable: !0,
                            selectedKeys: [w],
                            onClick: ({ key: e }) => {
                              $(
                                `点击筛选-${P.find((t) => t.key === e)?.label}`,
                              ),
                                Fe(),
                                T(e);
                            },
                          },
                          children: (0, U.jsxs)(C, {
                            children: [
                              (0, U.jsx)(`span`, { children: `筛选：` }),
                              (0, U.jsx)(`span`, {
                                className: Z.filterLabel,
                                children: P.find((e) => e.key === w)?.label,
                              }),
                              (0, U.jsx)(g, {}),
                            ],
                          }),
                        }),
                      }),
                      (0, U.jsx)(`div`, {
                        className: Z.topCenter,
                        children: (0, U.jsx)(C, {
                          children: (0, U.jsx)(m, {
                            allowClear: !0,
                            prefix: (0, U.jsx)(l, {}),
                            placeholder: `请输入关键词`,
                            style: { width: 400 },
                            onChange: (e) => Ie(e),
                          }),
                        }),
                      }),
                      (0, U.jsx)(`div`, {
                        className: Z.topRight,
                        children: (0, U.jsx)(p, {
                          trigger: [`click`],
                          menu: {
                            items: ye,
                            selectable: !0,
                            selectedKeys: [j],
                            onClick: ({ key: e }) => {
                              $(
                                `点击排序-${ye.find((t) => t.key === e)?.label}`,
                              ),
                                Fe(),
                                N(e);
                            },
                          },
                          children: (0, U.jsxs)(C, {
                            children: [
                              (0, U.jsx)(`span`, { children: `排序：` }),
                              (0, U.jsx)(`span`, {
                                className: Z.filterLabel,
                                children: ye.find((e) => e.key === j)?.label,
                              }),
                              (0, U.jsx)(g, {}),
                            ],
                          }),
                        }),
                      }),
                    ],
                  }),
                  (0, U.jsxs)(`div`, {
                    className: Z.listBox,
                    children: [
                      V.length > 0
                        ? (0, U.jsx)(_e.default, {
                            className: Z.waterfallsFlow,
                            options: { gutter: 20 },
                            children: V?.map((e) =>
                              (0, U.jsxs)(
                                `div`,
                                {
                                  id: e.id.toString(),
                                  className: Z.item,
                                  style: { width: de },
                                  children: [
                                    (0, U.jsxs)(`div`, {
                                      className: Z.image,
                                      onClick: () => ke(e),
                                      children: [
                                        (0, U.jsx)(`img`, { src: e.imageUrl }),
                                        (0, U.jsxs)(`div`, {
                                          className: Z.imageMask,
                                          children: [
                                            (0, U.jsx)(`div`, {
                                              className: Z.top,
                                              onClick: (e) =>
                                                e.stopPropagation(),
                                            }),
                                            (0, U.jsxs)(`div`, {
                                              className: Z.center,
                                              children: [
                                                (0, U.jsx)(y, {}),
                                                ` 预览`,
                                              ],
                                            }),
                                            (0, U.jsx)(`div`, {
                                              className: Z.bottom,
                                              onClick: (e) =>
                                                e.stopPropagation(),
                                              children: (0, U.jsxs)(C, {
                                                size: 20,
                                                children: [
                                                  (0, U.jsxs)(`span`, {
                                                    onClick: () => {
                                                      $(
                                                        `点击查看优秀案例-${e.id}-尝试示例`,
                                                      ),
                                                        Me(e);
                                                    },
                                                    children: [
                                                      (0, U.jsx)(E, {}),
                                                      `做同款`,
                                                    ],
                                                  }),
                                                  (0, U.jsxs)(`span`, {
                                                    onClick: async () => {
                                                      $(`点击示例-相似裂变`),
                                                        I({ ...e, isCase: !0 }),
                                                        await A(e.id),
                                                        d(!0);
                                                    },
                                                    children: [
                                                      (0, U.jsx)(M, {
                                                        component:
                                                          ne.DRAW_BY_IMAGE,
                                                      }),
                                                      ` 相似裂变`,
                                                    ],
                                                  }),
                                                ],
                                              }),
                                            }),
                                          ],
                                        }),
                                      ],
                                    }),
                                    (0, U.jsx)(`div`, {
                                      className: Z.prompt,
                                      children: `${e.prompt}${e.styles ? `,` + e.styles : ``}`,
                                    }),
                                  ],
                                },
                                e.id,
                              ),
                            ),
                          })
                        : (0, U.jsx)(`div`, {
                            className: Z.emptyBox,
                            children: (0, U.jsx)(c, {
                              className: Z.empty,
                              image: c.PRESENTED_IMAGE_SIMPLE,
                              description: (0, U.jsx)(U.Fragment, {
                                children: (0, U.jsx)(`p`, {
                                  children: `暂无搜索结果`,
                                }),
                              }),
                            }),
                          }),
                      (0, U.jsx)(pe, {
                        open: le,
                        onDrawSim: async (e) => {
                          $(`点击示例弹窗-相似裂变`), await A(e.id), d(!0);
                        },
                        onTry: (e) => {
                          $(`点击示例弹窗-尝试示例`), Me(e);
                        },
                        item: F,
                        onClose: je,
                      }),
                      J &&
                        (0, U.jsx)(`div`, {
                          ref: be,
                          className: Z.loading,
                          children: (0, U.jsx)(h, { spinning: R }),
                        }),
                      !J &&
                        V.length > 0 &&
                        (0, U.jsx)(S, {
                          plain: !0,
                          children: `没有更多数据了`,
                        }),
                    ],
                  }),
                ],
              }),
              u && F
                ? (0, U.jsx)(he, {
                    onSubmit: s,
                    itemData: F,
                    onClose: () => d(!1),
                  })
                : null,
            ],
          }),
        ],
      });
    },
  ),
  be = r(() => {
    let [e] = (0, z.useState)(L),
      [t, n] = (0, z.useState)(!1),
      { example: r, itemFields: s } = o.parse(location.search),
      [c, l] = (0, z.useState)(`1`),
      [u, d] = (0, z.useState)(4),
      [f, p] = (0, z.useState)(!1),
      [m, h] = (0, z.useState)({}),
      [g, _] = (0, z.useState)(`1`),
      [v, y] = (0, z.useState)(``),
      x = (0, z.useRef)();
    (0, z.useEffect)(() => {
      e.getStyleList(j[c === `1` ? `AITEXT_TEMPLATE` : `AITEXT_STYLE`]);
    }, [c]),
      (0, z.useEffect)(() => {
        C();
      }, []),
      (0, z.useEffect)(() => {
        r && s && l(`2`), S();
      }, [location]);
    let S = async () => {
        let { adoptID: e } = o.parse(location.search);
        e && y(e), window.history.replaceState({}, ``, location.pathname);
      },
      C = () => {
        e.setAiTextExtendFields({}),
          e.setAiTextPrompt(``),
          e.setAiTextSimpleExtendFields({}),
          e.setAiTextStyles([]),
          e.setSimpleAiTextPrompt(``),
          e.setChangeTextDemo(!1),
          e.setImgRatio(`1:1`);
      },
      w = async (t, i) => {
        if (
          i &&
          ((c === `1` && !e.aiSimpleTextPrompt) ||
            (c === `2` && !e.aiTextPrompt))
        ) {
          T.warning(`请输入文字内容和创意方向`);
          return;
        }
        D(`开始生成`);
        try {
          n(!0);
          let i = c === `1` ? e.aiTextSimpleExtendFields : e.aiTextExtendFields,
            a = {
              type: k.AI_TEXT,
              prompt: c === `1` ? e.aiSimpleTextPrompt : e.aiTextPrompt,
              outputNum: u,
              extendFields: {
                ...i,
                prompt: c === `1` ? e.aiSimpleTextPrompt : e.aiTextPrompt,
              },
            };
          t && (a = t),
            h({ ...m, loading: !0 }),
            (await F(a, v)).code === 200 &&
              (x.current?.onRefresh(),
              p(!1),
              _(`1`),
              L.getStatusInfo(),
              D(`${c === `1` ? `简易模式` : `高阶模式`}-开始生成`),
              r &&
                s &&
                window.history.replaceState(
                  {},
                  ``,
                  `/draw?type=${ie.AI_TEXT}`,
                ));
        } catch (e) {
          if ((h((e) => ({ ...e, loading: !1 })), e.msgKey))
            throw Error(e.msgKey);
        } finally {
          n(!1);
        }
      },
      E = [
        {
          key: `1`,
          label: `简易模式`,
          children: (0, U.jsx)(q, { onSubmit: w }),
        },
        {
          key: `2`,
          label: `高阶模式`,
          children: (0, U.jsx)(de, { onSubmit: w }),
        },
      ],
      D = (e) => {
        i.onPageClick(a.PAGE_NAME.AI_TEXT, e);
      },
      O = (e) => {
        l(e);
      },
      ee = (0, z.useMemo)(() => I.CHANGEBG.generatePoints * u, [u]);
    return (0, U.jsx)(`div`, {
      className: B.aiText,
      children: (0, U.jsxs)(`div`, {
        className: B.main,
        children: [
          (0, U.jsxs)(`div`, {
            className: B.configWrapper,
            children: [
              (0, U.jsx)(`div`, {
                className: B.configContent,
                children: (0, U.jsx)(b, {
                  className: B.tabs,
                  activeKey: c,
                  onChange: O,
                  items: E,
                  tabBarGutter: 22,
                  centered: !0,
                }),
              }),
              (0, U.jsx)(`div`, {
                className: B.createBtn,
                children: (0, U.jsx)(R, {
                  block: !0,
                  codeKey: `IDEOGRAM_DRAW`,
                  onClick: () => w(void 0, !0),
                  loading: t,
                  disabled:
                    (c === `1` && !e.aiSimpleTextPrompt) ||
                    (c === `2` && !e.aiTextPrompt),
                  costPoint: ee,
                  children: `立即生成`,
                }),
              }),
            ],
          }),
          (0, U.jsx)(Q, {
            onRef: x,
            onSubmit: w,
            visible: f,
            setVisible: p,
            drawData: m,
            setDrawData: h,
            changeTabType: O,
            selectTabKey: g,
            setSelectTabKey: _,
          }),
        ],
      }),
    });
  });
export { be as default };
