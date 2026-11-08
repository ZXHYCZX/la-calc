// latex.js — LaTeX 输出工具（对齐 cal2-* 服务端方言）
(function (S) {
  "use strict";

  const Ltx = {
    // rows: 二维 latex 字符串数组
    matrix(rows, opts) {
      opts = opts || {};
      const paren = opts.paren || "[";
      const after = opts.after; // 增广竖线位置：竖线画在该列之前，如 3 系数列+1 常数列 → after=3
      const r = rows.length, c = rows[0].length;
      const L = { "[": "[", "(": "(", "|": "|" }[paren];
      const Rr = { "[": "]", "(": ")", "|": "|" }[paren];
      if (after !== undefined && after >= 0) {
        const cols = [];
        for (let j = 0; j < c; j++) cols.push("c");
        const spec = cols.slice(0, after).join("") + ":" + cols.slice(after).join("");
        const body = rows.map(row => row.join(" & ")).join("\\\\");
        return "\\left" + L + "\\begin{array}{" + spec + "}" + body + "\\end{array}\\right" + Rr;
      }
      const body = rows.map(row => row.join(" & ")).join("\\\\");
      return "\\left" + L + "\\begin{matrix}" + body + "\\end{matrix}\\right" + Rr;
    },
    vector(col) { // 列向量
      const body = col.join(" \\\\ ");
      return "\\left[\\begin{matrix}" + body + "\\end{matrix}\\right]";
    },
    xarrow(ops) { // ops: 行变换描述字符串数组
      return "\\xrightarrow{\\begin{smallmatrix}" + ops.join(" \\\\ ") + "\\\\ \\end{smallmatrix}}";
    },
    step(matLatex, ops) { return matLatex + (ops && ops.length ? Ltx.xarrow(ops) : ""); },
    cases(lines) {
      return "{\\begin{array}{l}" + lines.join(" \\\\ ") + "\\end{array}}";
    },
    text(s) { return "\\text{" + s + "}"; },
  };
  S.Ltx = Ltx;

  // 环适配器
  S.makeRing = function (kind) {
    const F = S.Frac;
    if (kind === "frac") {
      return {
        kind, field: true,
        add: (a, b) => a.add(b), sub: (a, b) => a.sub(b), mul: (a, b) => a.mul(b),
        div: (a, b) => a.div(b), neg: a => a.neg(), scale: (a, f) => a.mul(f),
        isZero: a => a.isZero(), eq: (a, b) => a.cmp(b) === 0,
        absLarger: (a, b) => a.abs().cmp(b.abs()) > 0,
        isOne: a => a.isOne(),
        zero: () => F.zero(), one: () => F.one(), fromFrac: f => f,
        latex: v => v.latex(),
      };
    }
    if (kind === "poly") {
      const P = S.Poly;
      return {
        kind, field: false,
        add: (a, b) => a.add(b), sub: (a, b) => a.sub(b), mul: (a, b) => a.mul(b),
        div: (a, b) => a.divExact(b), neg: a => a.neg(), scale: (a, f) => a.scale(f),
        isZero: a => a.isZero(), eq: (a, b) => a.sub(b).isZero(),
        absLarger: () => false,
        isOne: a => a.isConst() && a.toConst().isOne(),
        zero: () => P.c(0), one: () => P.c(1), fromFrac: f => P.c(f),
        latex: v => v.latex(),
      };
    }
    if (kind === "qd") {
      const Q = S.QD;
      return {
        kind, field: true,
        add: (a, b) => a.add(b), sub: (a, b) => a.sub(b), mul: (a, b) => a.mul(b),
        div: (a, b) => a.div(b), neg: a => a.neg(), scale: (a, f) => a.scale(f),
        isZero: a => a.isZero(), eq: (a, b) => a.sub(b).isZero(),
        absLarger: (a, b) => { try { return a.mul(a.conj()).a.abs().cmp(b.mul(b.conj()).a.abs()) > 0; } catch (e) { return false; } },
        isOne: a => a.a.isOne() && a.b.isZero(),
        zero: () => Q.fromFrac(F.zero()), one: () => Q.fromFrac(F.one()), fromFrac: f => Q.fromFrac(f),
        conj: v => v.conj(),
        latex: v => v.latex(),
      };
    }
    if (kind === "cplx") {
      const C = S.CCplx;
      return {
        kind, field: true,
        add: (a, b) => a.add(b), sub: (a, b) => a.sub(b), mul: (a, b) => a.mul(b),
        div: (a, b) => a.div(b), neg: a => a.neg(), scale: (a, f) => a.scale(f),
        isZero: a => a.isZero(), eq: (a, b) => a.sub(b).isZero(),
        absLarger: (a, b) => { const na = a.re.mul(a.re).add(a.im.mul(a.im)), nb = b.re.mul(b.re).add(b.im.mul(b.im)); return na.cmp(nb) > 0; },
        isOne: a => a.re.isOne() && a.im.isZero(),
        zero: () => C.to(F.zero()), one: () => C.to(F.one()), fromFrac: f => C.to(f),
        conj: v => new S.CCplx(v.re, v.im.neg()),
        latex: v => v.latex(),
      };
    }
    throw new Error("未知环: " + kind);
  };
})(typeof S !== "undefined" ? S : (globalThis.S = globalThis.S || {}));
