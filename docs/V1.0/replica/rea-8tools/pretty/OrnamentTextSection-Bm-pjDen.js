import "./rolldown-runtime-Da7WdEYL.js";
import { r as e, x as t } from "./react-qdxTBA-_.js";
import { r as n } from "./mobx-Dz9VxtfR.js";
import { t as r } from "./style.module-CTnsKp5f.js";
t();
var i = e(),
  a = n(({ data: e, curImageData: t }) =>
    (0, i.jsxs)(i.Fragment, {
      children: [
        e.prompt
          ? (0, i.jsxs)(`div`, {
              className: r.row,
              children: [
                (0, i.jsx)(`div`, { className: r.lbl, children: `文字内容：` }),
                (0, i.jsx)(`div`, { className: r.val, children: e.prompt }),
              ],
            })
          : null,
        (0, i.jsxs)(`div`, {
          className: r.row,
          children: [
            (0, i.jsx)(`div`, { className: r.lbl, children: `字体：` }),
            (0, i.jsx)(`div`, {
              className: r.val,
              children: e.extendFields?.fontname,
            }),
          ],
        }),
        (0, i.jsxs)(`div`, {
          className: r.row,
          children: [
            (0, i.jsx)(`div`, { className: r.lbl, children: `挂环位置：` }),
            (0, i.jsxs)(`div`, {
              className: r.val,
              children: [
                e.extendFields?.left &&
                  e.extendFields?.right &&
                  (0, i.jsx)(`p`, {
                    style: { flex: `none` },
                    children: `两边加环`,
                  }),
                e.extendFields?.left &&
                  !e.extendFields?.right &&
                  (0, i.jsx)(`p`, {
                    style: { flex: `none` },
                    children: `左边加环`,
                  }),
                !e.extendFields?.left &&
                  e.extendFields?.right &&
                  (0, i.jsx)(`p`, {
                    style: { flex: `none` },
                    children: `右边加环`,
                  }),
                !e.extendFields?.left &&
                  !e.extendFields?.right &&
                  (0, i.jsx)(`p`, {
                    style: { flex: `none` },
                    children: `不加环`,
                  }),
              ],
            }),
          ],
        }),
        (0, i.jsxs)(`div`, {
          className: r.row,
          children: [
            (0, i.jsx)(`div`, { className: r.lbl, children: `字体大小：` }),
            (0, i.jsxs)(`div`, {
              className: r.val,
              children: [e.extendFields?.fontSize, `pt`],
            }),
          ],
        }),
      ],
    }),
  );
export { a as default };
