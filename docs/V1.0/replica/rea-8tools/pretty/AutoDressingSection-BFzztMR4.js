import "./rolldown-runtime-Da7WdEYL.js";
import { r as e, x as t } from "./react-qdxTBA-_.js";
import { r as n } from "./mobx-Dz9VxtfR.js";
import { t as r } from "./style.module-CTnsKp5f.js";
import { t as i } from "./ImageBox-B_O_xIhx.js";
t();
var a = e(),
  o = n(({ data: e, curSubData: t, curImageData: n }) =>
    (0, a.jsxs)(a.Fragment, {
      children: [
        (0, a.jsxs)(`div`, {
          className: r.row,
          children: [
            (0, a.jsx)(`div`, { className: r.lbl, children: `智能模式：` }),
            (0, a.jsx)(`div`, {
              className: r.val,
              children: e.extendFields?.needIntelligent ? `开` : `关`,
            }),
          ],
        }),
        e.extendFields?.modelImageUrl &&
          (0, a.jsxs)(`div`, {
            className: r.row,
            children: [
              (0, a.jsx)(`div`, { className: r.lbl, children: `模特参考图：` }),
              (0, a.jsx)(`div`, {
                className: r.val,
                children: (0, a.jsx)(i, {
                  src: e.extendFields?.modelImageUrl,
                  thumUrl: e.extendFields?.modelImageUrl,
                }),
              }),
            ],
          }),
        n?.extendFields?.sceneImageUrl &&
          (0, a.jsxs)(`div`, {
            className: r.row,
            children: [
              (0, a.jsx)(`div`, { className: r.lbl, children: `场景参考图：` }),
              (0, a.jsx)(`div`, {
                className: r.val,
                children: (0, a.jsx)(i, {
                  src: n?.extendFields?.sceneImageUrl,
                  thumUrl:
                    n?.extendFields?.sceneThumb ||
                    n?.extendFields?.sceneImageUrl,
                }),
              }),
            ],
          }),
        e.extendFields?.prompt &&
          (0, a.jsxs)(`div`, {
            className: r.row,
            children: [
              (0, a.jsx)(`div`, { className: r.lbl, children: `用户描述：` }),
              (0, a.jsx)(`div`, {
                className: r.val,
                children: e.extendFields?.prompt,
              }),
            ],
          }),
      ],
    }),
  );
export { o as default };
