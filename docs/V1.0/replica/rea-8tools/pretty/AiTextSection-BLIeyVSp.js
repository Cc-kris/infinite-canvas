import "./rolldown-runtime-Da7WdEYL.js";
import { r as e, x as t } from "./react-qdxTBA-_.js";
import { r as n } from "./mobx-Dz9VxtfR.js";
import { q as r } from "./lib-antd-BlrvMpdd.js";
import { I as i, R as a, z as o } from "./icons-DTPNhvqv2.js";
import { s } from "./icons-wiuw_Nle2.js";
import { r as c } from "./icons-BbecUsk82.js";
import { t as l } from "./style.module-CTnsKp5f.js";
import { t as u } from "./ImageBox-B_O_xIhx.js";
import { r as d } from "./const-wC5F4NZN.js";
t();
var f = e(),
  p = [
    { title: `关闭`, value: ``, icon: `` },
    { title: `网格平铺`, value: `GRID`, icon: (0, f.jsx)(a, {}) },
    { title: `垂直交错平铺`, value: `VERTICAL_BRICK`, icon: (0, f.jsx)(c, {}) },
    {
      title: `水平交错平铺`,
      value: `HORIZONTAL_BRICK`,
      icon: (0, f.jsx)(s, {}),
    },
    { title: `纵向平铺`, value: `COLUMN`, icon: (0, f.jsx)(o, {}) },
    { title: `水平平铺`, value: `ROW`, icon: (0, f.jsx)(i, {}) },
  ],
  m = n(({ data: e, curImageData: t }) =>
    (0, f.jsxs)(f.Fragment, {
      children: [
        (0, f.jsxs)(`div`, {
          className: l.row,
          children: [
            (0, f.jsx)(`div`, { className: l.lbl, children: `生成模式：` }),
            (0, f.jsx)(`div`, {
              className: l.val,
              children:
                e.extendFields?.mode == `1`
                  ? `简易模式`
                  : e.extendFields?.mode == `2`
                    ? `高阶模式`
                    : `相似裂变`,
            }),
          ],
        }),
        e.extendFields?.prompt || e.prompt
          ? (0, f.jsxs)(`div`, {
              className: l.row,
              children: [
                (0, f.jsx)(`div`, {
                  className: l.lbl,
                  children:
                    e.extendFields?.mode == `1`
                      ? `文字内容：`
                      : `文字内容和创意方向：`,
                }),
                (0, f.jsx)(`div`, {
                  className: l.val,
                  children: e.extendFields?.prompt || e.prompt,
                }),
              ],
            })
          : null,
        e.extendFields?.useAutopromptOption &&
          (0, f.jsxs)(`div`, {
            className: l.row,
            children: [
              (0, f.jsx)(`div`, { className: l.lbl, children: `提示词优化：` }),
              (0, f.jsx)(`div`, {
                className: l.val,
                children:
                  e.extendFields?.useAutopromptOption === `AUTO`
                    ? `自动`
                    : e.extendFields?.useAutopromptOption === `OFF`
                      ? `关闭`
                      : `开启`,
              }),
              e.extendFields?.useAutopromptOption !== `OFF` &&
                (0, f.jsx)(`div`, {
                  className: l.val,
                  children: t?.extendField?.magicPrompt,
                }),
            ],
          }),
        (0, f.jsxs)(`div`, {
          className: l.row,
          children: [
            (0, f.jsx)(`div`, {
              className: l.lbl,
              children:
                e.extendFields?.mode == `1` ? `创意模板：` : `创意风格：`,
            }),
            (0, f.jsx)(`div`, {
              className: l.val,
              children: e.extendFields?.modelName
                ? e.extendFields?.modelName
                : e.extendFields?.stylesCn &&
                    e.extendFields?.stylesCn?.length > 0
                  ? e.extendFields?.stylesCn?.map((e, t) =>
                      (0, f.jsx)(
                        r,
                        {
                          children: (0, f.jsx)(`span`, {
                            style: { marginRight: 10 },
                            children: e,
                          }),
                        },
                        t,
                      ),
                    )
                  : `无`,
            }),
          ],
        }),
        !!e.extendFields?.tilingPreset &&
          (0, f.jsxs)(`div`, {
            className: l.row,
            children: [
              (0, f.jsx)(`div`, {
                className: l.lbl,
                children: `印花平铺样式：`,
              }),
              (0, f.jsx)(`div`, {
                className: l.val,
                children: e.extendFields?.tilingPreset
                  ? (0, f.jsxs)(r, {
                      children: [
                        p.find((t) => t.value === e.extendFields?.tilingPreset)
                          ?.icon,
                        p.find((t) => t.value === e.extendFields?.tilingPreset)
                          ?.title,
                      ],
                    })
                  : `关闭`,
              }),
            ],
          }),
        e.imageUrl &&
          (0, f.jsxs)(`div`, {
            className: l.row,
            children: [
              (0, f.jsx)(`div`, { className: l.lbl, children: `参考图：` }),
              (0, f.jsx)(`div`, {
                className: l.val,
                children: (0, f.jsx)(u, {
                  thumUrl: e.imageThumb,
                  src: e.imageUrl,
                }),
              }),
            ],
          }),
        e.extendFields?.variationStrength &&
          (0, f.jsxs)(`div`, {
            className: l.row,
            children: [
              (0, f.jsx)(`div`, { className: l.lbl, children: `相似度：` }),
              (0, f.jsx)(`div`, {
                className: l.val,
                children: d[e.extendFields?.variationStrength],
              }),
            ],
          }),
        (0, f.jsxs)(`div`, {
          className: l.row,
          children: [
            (0, f.jsx)(`div`, { className: l.lbl, children: `比例：` }),
            (0, f.jsx)(`div`, {
              className: l.val,
              children: e.extendFields?.ratio,
            }),
          ],
        }),
      ],
    }),
  );
export { m as default };
