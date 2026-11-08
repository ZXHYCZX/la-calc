// linear.js — 线性方程组 / Cramer / LU / 最小二乘 / 满秩分解 / 广义逆 / 向量组
(function (S) {
  "use strict";
  const F = S.Frac;
  const Ltx = S.Ltx;

  /* ---------- 方程组求解 ---------- */
  // augRows: m×(n+1) 增广矩阵（数值环）
  S.solveSystem = function (augRows, R) {
    const rr = S.rref(augRows, R);
    const rows = rr.rows, m = rows.length, n = augRows[0].length - 1;
    // 不一致判定：主元出现在最后一列
    const pivotSet = new Set(rr.pivots);
    for (let i = 0; i < rr.pivots.length; i++) {
      if (rr.pivots[i] === n) return { type: "none", steps: rr.steps, rref: rows };
    }
    const freeCols = [];
    for (let j = 0; j < n; j++) if (!pivotSet.has(j)) freeCols.push(j);
    if (freeCols.length === 0) {
      const x = new Array(n);
      for (let i = 0; i < rr.pivots.length; i++) x[rr.pivots[i]] = rows[i][n];
      return { type: "unique", x, steps: rr.steps, rref: rows };
    }
    // 通解：主元变量 = 常数 - Σ 系数·自由变量
    const sol = { type: "infinite", freeCols, steps: rr.steps, rref: rows, n };
    sol.parts = []; // 每行: {piv, const, coeffs: {freeIdx: value}}
    for (let i = 0; i < rr.pivots.length; i++) {
      const col = rr.pivots[i];
      const coeffs = {};
      for (let fi = 0; fi < freeCols.length; fi++) {
        const v = rows[i][freeCols[fi]];
        if (!R.isZero(v)) coeffs[fi] = R.neg(v);
      }
      sol.parts.push({ piv: col, cst: rows[i][n], coeffs });
    }
    return sol;
  };

  // 通解/唯一解 → LaTeX 行（cases 内的行）
  S.renderSolutionLines = function (sol, R) {
    const lines = [];
    if (sol.type === "unique") {
      for (let j = 0; j < sol.x.length; j++) lines.push("x_{" + (j + 1) + "}=" + R.latex(sol.x[j]));
      return lines;
    }
    let ci = 0;
    const freeAssign = {};
    for (const fc of sol.freeCols) freeAssign[fc] = "c_{" + (++ci) + "}";
    const n = sol.n;
    for (let j = 0; j < n; j++) {
      if (freeAssign[j] !== undefined) { lines.push("x_{" + (j + 1) + "}=" + freeAssign[j]); continue; }
      const part = sol.parts.find(p => p.piv === j);
      if (!part) { lines.push("x_{" + (j + 1) + "}=" + R.latex(R.zero())); continue; }
      let s = part.cst.isZero() ? "" : R.latex(part.cst);
      for (const fi in part.coeffs) {
        const fc = sol.freeCols[Number(fi)];
        const k = part.coeffs[fi];
        const kt = k.isOne() ? "" : k.isNegOne() ? "-" : R.latex(k).replace(/^-/, "-");
        const sign = k.isNeg() ? (s === "" ? "-" : " - ") : (s === "" ? "" : " + ");
        s += sign + kt + freeAssign[fc];
      }
      if (s === "") s = "0";
      lines.push("x_{" + (j + 1) + "}=" + s);
    }
    return lines;
  };

  // 系数矩阵 → 方程组 LaTeX（\begin{cases}）
  S.renderEquations = function (coefRows, bCol, R) {
    const lines = [];
    for (let i = 0; i < coefRows.length; i++) {
      let s = "";
      for (let j = 0; j < coefRows[i].length; j++) {
        const v = coefRows[i][j];
        if (R.isZero(v)) continue;
        const a = v;
        const vt = R.latex(a);
        const coeffStr = (R.kind === "frac" && a.isOne()) ? "" : (R.kind === "frac" && a.isNegOne()) ? "-" : vt;
        const term = coeffStr + "x_{" + (j + 1) + "}";
        if (s === "") s += (R.kind === "frac" && a.isNeg() ? "-" + term.slice(1) : term);
        else s += (R.kind === "frac" && a.isNeg() ? " - " + (coeffStr.startsWith("-") ? term.replace(/^-/, "") : term) : " + " + term);
      }
      if (s === "") s = "0";
      s += "=" + R.latex(bCol ? bCol[i] : R.zero());
      lines.push(s);
    }
    return "{\\begin{cases}" + lines.join(" \\\\ ") + "\\end{cases}}";
  };

  /* ---------- Cramer ---------- */
  S.cramer = function (rowsIn, b, R) {
    const n = rowsIn.length;
    const D = S.detGauss(rowsIn, R).det;
    const out = { D, ds: [], xs: [] };
    if (R.kind === "frac" && D.isZero()) { out.singular = true; return out; }
    for (let j = 0; j < n; j++) {
      const Aj = rowsIn.map((row, i) => row.map((v, jj) => jj === j ? b[i] : v));
      const Dj = S.detGauss(Aj, R).det;
      out.ds.push(Dj);
      out.xs.push(R.div(Dj, D));
    }
    return out;
  };

  /* ---------- LU（Doolittle，L 单位下三角） ---------- */
  S.luDecomp = function (rowsIn, R) {
    const n = rowsIn.length;
    const L = S.matIdentity(n, R), U = S.matClone(rowsIn);
    for (let k = 0; k < n; k++) {
      if (R.isZero(U[k][k])) throw new S.UnsupportedError("存在零主元，LU 分解需行交换");
      for (let i = k + 1; i < n; i++) {
        const f = R.div(U[i][k], U[k][k]);
        L[i][k] = f;
        for (let j = k; j < n; j++) U[i][j] = R.sub(U[i][j], R.mul(f, U[k][j]));
      }
    }
    return { L, U };
  };

  /* ---------- 满秩分解 / 广义逆 ---------- */
  // A = B·C，B 列满秩（取 A 的主元列），C 行最简（RREF 前 r 行）
  S.fullRankDecomp = function (rowsIn, R) {
    const rr = S.rref(rowsIn, R);
    const r = rr.pivots.length;
    const B = rr.pivots.map(pc => rowsIn.map(row => row[pc])); // m×r
    const C = rr.rows.slice(0, r); // r×n
    return { B, C, r, steps: rr.steps, pivots: rr.pivots, rref: rr.rows };
  };

  // Moore-Penrose 广义逆（精确，Frac 环）
  S.pseudoinverse = function (rowsIn, R) {
    const m = rowsIn.length, n = rowsIn[0].length;
    const fr = S.fullRankDecomp(rowsIn, R);
    const B = fr.B, C = fr.C; // A = B·C
    const Bt = S.matTranspose(B), Ct = S.matTranspose(C);
    const BtB = S.matMul(Bt, B, R);
    const CCt = S.matMul(C, Ct, R);
    const BtBinv = S.inverse(BtB, R).inv;
    const CCtinv = S.inverse(CCt, R).inv;
    // A⁺ = Cᵀ(CCᵀ)⁻¹(BᵀB)⁻¹Bᵀ
    const t1 = S.matMul(Ct, CCtinv, R);
    const t2 = S.matMul(t1, BtBinv, R);
    const Ap = S.matMul(t2, Bt, R);
    return { Ap, fr };
  };

  /* ---------- 向量组（行向量组） ---------- */
  // content 每行是一个向量。行向量组 → 转置后按列向量组做 RREF：
  // 列之间的线性关系在行变换下不变，主元列下标 = 极大无关组（原行号）。
  S.vectorGroup = function (rowsIn, R) {
    const Mt = S.matTranspose(rowsIn); // dim × 向量个数，每列一个原行向量
    const rr = S.rref(Mt, R);
    const rank = rr.pivots.length;
    const lis = rr.pivots.slice();
    const repr = [];
    for (let j = 0; j < Mt[0].length; j++) {
      if (rr.pivots.includes(j)) continue;
      // 系数 = RREF 第 i 行第 j 列（i 遍历主元行），α_j = Σ 系数·α_{主元}
      repr.push({ idx: j, coeffs: rr.pivots.map((_, i) => rr.rows[i][j]) });
    }
    return { rank, lis, repr, steps: rr.steps, rref: rr.rows };
  };
})(typeof S !== "undefined" ? S : (globalThis.S = globalThis.S || {}));
