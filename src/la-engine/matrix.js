// matrix.js — 矩阵核心：解析 / Gauss 消元步骤 / det / 逆 / 伴随 / 秩（含参数情形分析）
(function (S) {
  "use strict";
  const F = S.Frac;

  /* ---------- 解析 ---------- */
  // text: "1 2\n3 4" → {rows:[[Frac]], kind}
  // 支持单行分号风格 "1 2;3 4"？官方输入用换行，这里仅按换行/多空格解析
  S.parseMatrix = function (text) {
    const lines = String(text).replace(/\r/g, "").split("\n").filter(l => l.trim() !== "");
    if (lines.length === 0) throw new Error("空矩阵");
    const cells = lines.map(l => l.trim().split(/\s+/));
    const c = cells[0].length;
    for (const row of cells) if (row.length !== c) throw new Error("列数不一致");
    // 环统一：cplx > qd > poly > frac
    const parsed = cells.map(row => row.map(cell => S.parseEntry(cell)));
    let kind = "frac";
    for (const row of parsed) for (const p of row) {
      if (p.ring === "cplx") kind = "cplx";
      else if (p.ring === "qd" && kind !== "cplx") kind = "qd";
      else if (p.ring === "poly" && kind !== "cplx" && kind !== "qd") kind = "poly";
    }
    if (kind === "cplx" || kind === "qd") {
      // 混环提升：frac/poly 常数提升
      for (const row of parsed) for (const p of row) {
        if (p.ring === "poly" && !p.value.isConst()) throw new S.UnsupportedError("符号与根式/复数混用");
      }
    }
    const R = S.makeRing(kind);
    const rows = parsed.map(row => row.map(p => {
      if (p.ring === kind) return p.value;
      // 提升
      if (p.ring === "frac") return R.fromFrac(p.value);
      if (p.ring === "poly") return R.fromFrac(p.value.toConst());
      throw new S.UnsupportedError("环提升失败");
    }));
    return { rows, kind, R };
  };

  /* ---------- 基本构造 ---------- */
  S.matZeros = function (r, c, R) { const rows = []; for (let i = 0; i < r; i++) { const row = []; for (let j = 0; j < c; j++) row.push(R.zero()); rows.push(row); } return rows; };
  S.matIdentity = function (n, R) { const rows = S.matZeros(n, n, R); for (let i = 0; i < n; i++) rows[i][i] = R.one(); return rows; };
  S.matClone = rows => rows.map(r => r.slice());
  S.matTranspose = function (rows) { const r = rows.length, c = rows[0].length; const out = []; for (let j = 0; j < c; j++) { const row = []; for (let i = 0; i < r; i++) row.push(rows[i][j]); out.push(row); } return out; };
  S.matAdd = function (A, B, R) { return A.map((row, i) => row.map((v, j) => R.add(v, B[i][j]))); };
  S.matSub = function (A, B, R) { return A.map((row, i) => row.map((v, j) => R.sub(v, B[i][j]))); };
  S.matMul = function (A, B, R) {
    const n = A.length, k = B.length, m = B[0].length;
    if (A[0].length !== k) throw new Error("矩阵乘法维度不匹配");
    const out = S.matZeros(n, m, R);
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
      let acc = R.zero();
      for (let t = 0; t < k; t++) acc = R.add(acc, R.mul(A[i][t], B[t][j]));
      out[i][j] = acc;
    }
    return out;
  };
  S.matScale = function (A, f, R) { return A.map(row => row.map(v => R.scale(v, f))); };
  S.matLatex = function (rows, opts) { return S.Ltx.matrix(rows.map(r => r.map(v => (opts && opts.R ? opts.R : S.makeRing("frac")).latex(v))), opts); };
  S.matText = function (rows, R) { return rows.map(r => r.map(v => S.entryToText(v, R)).join(" ")).join("\n"); };

  // 环值 → 输入语法文本（matrixOperations 的 text 字段用）
  S.entryToText = function (v, R) {
    if (R.kind === "frac") return v.toString();
    if (R.kind === "qd") {
      if (v.b.isZero()) return v.a.toString();
      const b = v.b, D = v.D;
      const core = b.isOne() ? "sqrt(" + D + ")" : "(" + b.toString() + ")*sqrt(" + D + ")";
      if (v.a.isZero()) return b.isNeg() ? "-" + core.replace(/^\(/, "(") : core;
      return v.a.toString() + (b.isNeg() ? "-" : "+") + core;
    }
    if (R.kind === "cplx") {
      if (v.im.isZero()) return v.re.toString();
      const im = v.im.isOne() ? "I" : "(" + v.im.toString() + ")*I";
      if (v.re.isZero()) return v.im.isNeg() ? "-" + im : im;
      return v.re.toString() + (v.im.isNeg() ? "-" : "+") + im;
    }
    throw new Error("该环不支持文本导出");
  };

  /* ---------- 行变换 ---------- */
  function opSwapText(i, j) { return "r_{" + (i + 1) + "}\\leftrightarrow r_{" + (j + 1) + "}"; }
  function opScaleText(f, i, R) { const fl = R.latex(f); return fl + "r_{" + (i + 1) + "}"; }
  function opAddText(k, i, j, R) { // r_j += k·r_i
    const kl = R.latex(k);
    // 数字负系数 → r_j - |k|r_i；符号 → \left(k\right)
    if (R.kind === "frac") {
      if (k.isNeg()) return "r_{" + (j + 1) + "}-" + R.latex(k.neg()) + "r_{" + (i + 1) + "}";
      return "r_{" + (j + 1) + "}+" + (k.isOne() ? "" : kl) + "r_{" + (i + 1) + "}";
    }
    return "r_{" + (j + 1) + "}+\\left(" + kl + "\\right)r_{" + (i + 1) + "}";
  }

  // Gauss 消元（前向），返回 {rows(上三角), pivots, steps:[{latex, op}], swaps}
  S.gaussForward = function (rowsIn, R, opts) {
    opts = opts || {};
    const rows = S.matClone(rowsIn);
    const r = rows.length, c = rows[0].length;
    const steps = [{ latex: S.matLatex(rows, { R }), op: null }];
    let pivots = [], swaps = 0;
    let row = 0;
    for (let col = 0; col < c && row < r; col++) {
      // 选主元
      let piv = -1;
      for (let i = row; i < r; i++) if (!R.isZero(rows[i][col])) { piv = i; break; }
      if (piv < 0) continue;
      if (!opts.noPivotPick) {
        if (R.kind === "poly") {
          // 优先常数主元（保证消元可整除），其次最低次数
          let best = piv;
          for (let i = row; i < r; i++) {
            const v = rows[i][col];
            if (R.isZero(v)) continue;
            const cC = v.isConst(), bC = rows[best][col].isConst();
            if ((cC && !bC) || (cC === bC && v.totalDegree() < rows[best][col].totalDegree())) best = i;
          }
          piv = best;
        } else if (R.field) {
          // 优先选 1 作主元（减少分数膨胀）
          for (let i = row; i < r; i++) if (R.isOne(rows[i][col])) { piv = i; break; }
        }
      }
      if (piv !== row) { const t = rows[piv]; rows[piv] = rows[row]; rows[row] = t; swaps++; steps.push({ latex: S.matLatex(rows, { R }), op: opSwapText(piv, row) }); }
      const pivot = rows[row][col];
      for (let i = row + 1; i < r; i++) {
        if (R.isZero(rows[i][col])) continue;
        const k = R.div(rows[i][col], pivot);
        for (let j = col; j < c; j++) rows[i][j] = R.sub(rows[i][j], R.mul(k, rows[row][j]));
        rows[i][col] = R.zero();
        steps.push({ latex: S.matLatex(rows, { R }), op: opAddText(k, row, i, R) });
      }
      pivots.push(col);
      row++;
    }
    return { rows, pivots, steps, swaps };
  };

  // 完整 RREF
  S.rref = function (rowsIn, R, opts) {
    const gf = S.gaussForward(rowsIn, R, opts);
    const rows = gf.rows, r = rows.length, c = rows[0].length;
    const steps = gf.steps.slice();
    const pivots = gf.pivots.slice();
    // 反向归一
    for (let p = pivots.length - 1; p >= 0; p--) {
      const col = pivots[p], rowIdx = p; // 第 p 个主元在第 p 行（前向消元性质）
      const pivot = rows[rowIdx][col];
      if (!R.isOne(pivot)) {
        for (let j = col; j < c; j++) rows[rowIdx][j] = R.div(rows[rowIdx][j], pivot);
        steps.push({ latex: S.matLatex(rows, { R }), op: opScaleText(pivot, rowIdx, R) });
      }
      for (let i = 0; i < rowIdx; i++) {
        if (R.isZero(rows[i][col])) continue;
        const k = R.div(rows[i][col], rows[rowIdx][col]);
        for (let j = col; j < c; j++) rows[i][j] = R.sub(rows[i][j], R.mul(k, rows[rowIdx][j]));
        rows[i][col] = R.zero();
        steps.push({ latex: S.matLatex(rows, { R }), op: opAddText(k, rowIdx, i, R) });
      }
    }
    return { rows, pivots, steps, swaps: gf.swaps };
  };

  /* ---------- 行列式 ---------- */
  // 分数 Gauss 化三角形；返回 {det, steps, swaps}
  S.detGauss = function (rowsIn, R) {
    const gf = S.gaussForward(rowsIn, R, { noPivotPick: false });
    let det = (gf.swaps % 2 === 0 ? R.one() : R.neg(R.one()));
    for (let i = 0; i < gf.rows.length; i++) det = R.mul(det, gf.rows[i][i]);
    return { det, steps: gf.steps, swaps: gf.swaps, tri: gf.rows };
  };

  // 代数余子式 A_ij
  S.cofactor = function (rows, i, j, R) {
    const sub = rows.filter((_, ri) => ri !== i).map(row => row.filter((_, ci) => ci !== j));
    const d = S.detGauss(sub, R).det;
    return (i + j) % 2 === 0 ? d : R.neg(d);
  };

  // 伴随矩阵 adj(A)（Frac/poly 精确）
  S.adjugate = function (rowsIn, R) {
    const n = rowsIn.length;
    if (n !== rowsIn[0].length) throw new Error("伴随矩阵要求方阵");
    const out = S.matZeros(n, n, R);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out[j][i] = S.cofactor(rowsIn, i, j, R);
    return out;
  };

  // 逆矩阵：[A|E] Gauss-Jordan
  S.inverse = function (rowsIn, R) {
    const n = rowsIn.length;
    if (n !== rowsIn[0].length) throw new Error("逆矩阵要求方阵");
    const aug = rowsIn.map((row, i) => row.concat(S.matIdentity(n, R)[i]));
    const rr = S.rref(aug, R);
    // 检查左半是否为单位阵
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const want = i === j ? R.one() : R.zero();
      if (!R.eq(rr.rows[i][j], want)) throw new Error("矩阵不可逆（行列式为0）");
    }
    const inv = rr.rows.map(row => row.slice(n));
    return { inv, steps: rr.steps };
  };

  /* ---------- 秩（含参数情形） ---------- */
  // 数值环直接 RREF；Poly 环做情形分析
  S.rankOf = function (rowsIn, R) {
    if (R.kind !== "poly") {
      const rr = S.rref(rowsIn, R);
      return { rank: rr.pivots.length, steps: rr.steps, pivots: rr.pivots, rref: rr.rows };
    }
    // Poly：仅支持方阵情形分析
    const n = rowsIn.length;
    if (n !== rowsIn[0].length) {
      // 非方阵：随机点数值秩（通用秩）
      return { rank: genericRank(rowsIn, R), steps: null, generic: true };
    }
    let det;
    try { det = S.detGauss(rowsIn, R).det; } catch (e) { return { rank: genericRank(rowsIn, R), steps: null, generic: true }; }
    if (det.isConst() && !det.toConst().isZero()) {
      const rr = S.rref(rowsIn, R);
      return { rank: n, steps: rr.steps, pivots: rr.pivots, rref: rr.rows };
    }
    // det ≡ 0 或含参数：找 det 的单变量有理根（若有且仅一个变量时）
    const vars = det.vars();
    if (det.isZero()) {
      // 恒奇异：给通用秩
      return { rank: genericRank(rowsIn, R), steps: null, generic: true, always: true };
    }
    if (vars.length === 1 && det.totalDegree() <= 4) {
      // 视为该变量一元多项式
      let up;
      try { up = det.toUPolyIn(vars[0]); } catch (e) { return { rank: genericRank(rowsIn, R), steps: null, generic: true }; }
      const roots = up.rationalRoots();
      const cases = [];
      // 通用情形 rank n
      const rrGen = S.rref(rowsIn, R);
      const steps = [];
      // det 计算步骤（Gauss 步骤基于 Poly 消元可能除不动——直接给 det 表达式）
      steps.push({ latex: S.matLatex(rowsIn, { R }), op: null });
      steps.push({ latex: "\\left|A\\right| = " + det.latex(), op: null });
      for (const root of roots) {
        const sub = rowsIn.map(row => row.map(v => {
          const fv = v.substVar(vars[0], root);
          return fv.isConst() ? fv.toConst() : null;
        }));
        if (sub.some(row => row.some(v => v === null))) continue;
        const rr = S.rref(sub, S.makeRing("frac"));
        cases.push({ value: root, rank: rr.pivots.length, steps: rr.steps });
      }
      return { rank: n, generic: true, detLatex: det.latex(), specialCases: cases, steps, varName: vars[0] };
    }
    return { rank: genericRank(rowsIn, R), steps: null, generic: true };
  };

  function genericRank(rowsIn, R) {
    // 随机有理点代入求数值秩
    const vars = new Set();
    for (const row of rowsIn) for (const v of row) for (const name of v.vars()) vars.add(name);
    if (vars.size === 0) {
      const rr = S.rref(rowsIn, R);
      return rr.pivots.length;
    }
    const map = {};
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % 17 - 8; };
    for (const name of vars) map[name] = F.fromString(String(rnd() || 2));
    const num = rowsIn.map(row => row.map(v => {
      const fv = v.evalWith(map);
      return fv;
    }));
    const rr = S.rref(num, S.makeRing("frac"));
    return rr.pivots.length;
  }
})(typeof S !== "undefined" ? S : (globalThis.S = globalThis.S || {}));
