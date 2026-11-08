// endpoints1.js — 阶段1端点：核心精确计算（有理数/符号/根式/复数）
(function (S) {
  "use strict";
  const F = S.Frac;
  const Ltx = S.Ltx;
  const U = S.UnsupportedError;

  function resp(steps, contentLatex, extra) {
    return Object.assign({
      result: steps || [],
      content: contentLatex || "",
      errMsg: "",
      VIPMessage: "",
      test_records: [],
      _last: false,
      _next: false,
    }, extra || {});
  }
  function stepLines(steps) { return steps.map(st => Ltx.step(st.latex, st.op ? [st.op] : null)); }
  function needSquare(m) { if (m.rows.length !== m.rows[0].length) throw new U("需要方阵"); }
  function getInt(v, name) {
    const n = Number(v);
    if (!Number.isInteger(n)) throw new U(name + " 须为整数");
    return n;
  }
  function parseContentArray(v) {
    if (Array.isArray(v)) return v.map(x => String(x));
    return [String(v)];
  }

  const EP = {};

  /* ---------- /toLatex ---------- */
  EP["/toLatex"] = function (b) {
    const m = S.parseMatrix(String(b.content));
    const latex = S.matLatex(m.rows, { R: m.R });
    return { imgUrl: latex, result: [latex], content: "", errMsg: "", VIPMessage: "" };
  };

  /* ---------- /det ---------- */
  EP["/det"] = function (b) {
    const m = S.parseMatrix(String(b.content));
    needSquare(m);
    const d = S.detGauss(m.rows, m.R);
    const lines = stepLines(d.steps);
    lines.push("\\left|A\\right| = " + m.R.latex(d.det));
    const contentLatex = S.matLatex(m.rows, { R: m.R, paren: "|" });
    return resp(lines, contentLatex);
  };

  /* ---------- /inverse ---------- */
  EP["/inverse"] = function (b) {
    const m = S.parseMatrix(String(b.content));
    needSquare(m);
    if (m.kind === "poly") throw new U("符号矩阵求逆未支持");
    const n = m.rows.length;
    const aug = m.rows.map((row, i) => row.concat(S.matIdentity(n, m.R)[i]));
    const rr = S.rref(aug, m.R);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if (!m.R.eq(rr.rows[i][j], i === j ? m.R.one() : m.R.zero())) {
        return resp(["\\text{矩阵不可逆}"], S.matLatex(m.rows, { R: m.R, paren: "(" }), {});
      }
    }
    const steps = [];
    steps.push(Ltx.step("(A|E)=" + S.matLatex(aug, { R: m.R, paren: "[", after: n - 1 }), null));
    for (const st of rr.steps.slice(1)) steps.push(Ltx.step(st.latex, st.op ? [st.op] : null));
    const inv = rr.rows.map(row => row.slice(n));
    steps.push("A^{-1}=" + S.matLatex(inv, { R: m.R }));
    return resp(steps, S.matLatex(m.rows, { R: m.R, paren: "(" }));
  };

  /* ---------- /adj ---------- */
  EP["/adj"] = function (b) {
    const m = S.parseMatrix(String(b.content));
    needSquare(m);
    const adj = S.adjugate(m.rows, m.R);
    const lines = ["\\text{各元素的代数余子式转置排列得到伴随矩阵：}", "A^{*}=" + S.matLatex(adj, { R: m.R })];
    return resp(lines, S.matLatex(m.rows, { R: m.R, paren: "(" }));
  };

  /* ---------- /algebraicCofactor ---------- */
  EP["/algebraicCofactor"] = function (b) {
    const m = S.parseMatrix(String(b.content));
    const cd = b.contentData || {};
    const method = cd.method || "all";
    const pos = parseInt(cd.position, 10);
    const coeffs = String(cd.coefficient || "").trim().split(/\s+/).filter(x => x !== "").map(x => parseInt(x, 10));
    const n = m.rows.length;
    const lines = [];
    const emitOne = (i, j) => { // 0-based
      const M = S.detGauss(m.rows.filter((_, ri) => ri !== i).map(row => row.filter((_, ci) => ci !== j)), m.R).det;
      const A = (i + j) % 2 === 0 ? M : m.R.neg(M);
      lines.push("M_{" + (i + 1) + " " + (j + 1) + "}=" + m.R.latex(M) + "\\quad A_{" + (i + 1) + " " + (j + 1) + "}=" + m.R.latex(A));
    };
    if (method === "rows" || method === "cols") {
      const fixed = pos - 1;
      const idxs = coeffs.length ? coeffs.map(x => x - 1) : [...Array(n).keys()];
      for (const k of idxs) { if (method === "rows") emitOne(fixed, k); else emitOne(k, fixed); }
    } else {
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) emitOne(i, j);
    }
    return resp(lines, S.matLatex(m.rows, { R: m.R, paren: "|" }));
  };

  /* ---------- /conjugateTranspose ---------- */
  EP["/conjugateTranspose"] = function (b) {
    const m = S.parseMatrix(String(b.content));
    const hasConj = m.R.conj !== undefined;
    const t = S.matTranspose(m.rows).map(row => row.map(v => hasConj ? m.R.conj(v) : v));
    const lines = [hasConj ? "A^{H}=" + S.matLatex(t, { R: m.R }) : "A^{T}=" + S.matLatex(t, { R: m.R })];
    return resp(lines, S.matLatex(m.rows, { R: m.R, paren: "(" }));
  };

  /* ---------- /matrixOperations ---------- */
  EP["/matrixOperations"] = function (b) {
    const methods = String(b.methods || "");
    let A, Bop, label;
    if (methods === "scalarMultiply" || methods === "数乘") {
      A = S.parseMatrix(String(b.content));
      const sc = S.parseEntry(String(b.base));
      if (sc.ring !== "frac") throw new U("数乘系数须为数字");
      const out = S.matScale(A.rows, sc.value, A.R);
      const latex = S.matLatex(out, { R: A.R });
      return {
        result: [latex], text: S.matText(out, A.R), textImgUrl: latex,
        content: "", errMsg: "", VIPMessage: "", test_records: [], _last: false, _next: false,
      };
    }
    A = S.parseMatrix(String(b.contentA));
    Bop = S.parseMatrix(String(b.contentB));
    let out;
    if (methods === "+") { if (A.rows.length !== Bop.rows.length || A.rows[0].length !== Bop.rows[0].length) throw new U("加法维度不一致"); out = S.matAdd(A.rows, Bop.rows, A.R); label = "A+B="; }
    else if (methods === "-") { if (A.rows.length !== Bop.rows.length || A.rows[0].length !== Bop.rows[0].length) throw new U("减法维度不一致"); out = S.matSub(A.rows, Bop.rows, A.R); label = "A-B="; }
    else if (methods === "*") { if (A.rows[0].length !== Bop.rows.length) throw new U("乘法维度不一致"); out = S.matMul(A.rows, Bop.rows, A.R); label = "AB="; }
    else throw new U("未知运算 " + methods);
    const latex = S.matLatex(out, { R: A.R });
    return {
      result: [label + latex], text: S.matText(out, A.R), textImgUrl: latex,
      content: "", errMsg: "", VIPMessage: "", test_records: [], _last: false, _next: false,
    };
  };

  /* ---------- /power ---------- */
  EP["/power"] = function (b) {
    const m = S.parseMatrix(String(b.content));
    needSquare(m);
    const cnt = getInt(b.count, "幂次数");
    const lines = [];
    let cur = m.rows;
    if (cnt < 0) cur = S.inverse(m.rows, m.R).inv;
    const target = Math.abs(cnt);
    if (target === 0) cur = S.matIdentity(m.rows.length, m.R);
    else {
      let acc = cur;
      for (let k = 1; k < target; k++) acc = S.matMul(acc, cur, m.R);
      cur = acc;
    }
    lines.push("A^{" + cnt + "}=" + S.matLatex(cur, { R: m.R }));
    return resp(lines, S.matLatex(m.rows, { R: m.R, paren: "(" }));
  };

  /* ---------- /matrixEquation ---------- */
  EP["/matrixEquation"] = function (b) {
    const method = String(b.method || "AX=C");
    const parts = parseContentArray(b.content).map(t => S.parseMatrix(t));
    const R = parts[0].R;
    const mat = i => parts[i].rows;
    const steps = [];
    let X;
    if (method === "AX=C") {
      if (parts.length < 2) throw new U("需要 A、C 两个矩阵");
      const C = parts[parts.length - 1];
      steps.push("{\\begin{aligned}A^{-1}AX&=A^{-1}C\\\\X&=A^{-1}C\\end{aligned}}");
      const iv = S.inverse(mat(0), R);
      steps.push("A^{-1}=" + S.matLatex(iv.inv, { R }));
      X = S.matMul(iv.inv, C.rows, R);
      steps.push("X=" + S.matLatex(X, { R }));
    } else if (method === "XA=C") {
      if (parts.length < 2) throw new U("需要 A、C 两个矩阵");
      const C = parts[parts.length - 1];
      steps.push("{\\begin{aligned}XAA^{-1}&=CA^{-1}\\\\X&=CA^{-1}\\end{aligned}}");
      const iv = S.inverse(mat(0), R);
      steps.push("A^{-1}=" + S.matLatex(iv.inv, { R }));
      X = S.matMul(C.rows, iv.inv, R);
      steps.push("X=" + S.matLatex(X, { R }));
    } else if (method === "AXB=C") {
      if (parts.length < 3) throw new U("需要 A、B、C 三个矩阵");
      steps.push("X=A^{-1}CB^{-1}");
      const ia = S.inverse(mat(0), R), ib = S.inverse(mat(1), R);
      steps.push("A^{-1}=" + S.matLatex(ia.inv, { R }));
      steps.push("B^{-1}=" + S.matLatex(ib.inv, { R }));
      X = S.matMul(S.matMul(ia.inv, mat(2), R), ib.inv, R);
      steps.push("X=" + S.matLatex(X, { R }));
    } else throw new U("未知方程类型 " + method);
    return resp(steps, "");
  };

  /* ---------- /cramersRule ---------- */
  EP["/cramersRule"] = function (b) {
    const m = S.parseMatrix(String(b.content));
    const n = m.rows.length;
    if (m.rows[0].length !== n + 1) throw new U("Cramer 法则需要 n×(n+1) 增广矩阵");
    const A = m.rows.map(r => r.slice(0, n)), bb = m.rows.map(r => r[n]);
    const cr = S.cramer(A, bb, m.R);
    const lines = [];
    if (cr.singular) return resp(["\\text{系数行列式 }D=0\\text{，Cramer 法则不适用}"], S.matLatex(m.rows, { R: m.R, paren: "(" }), {});
    lines.push("D=" + m.R.latex(cr.D));
    for (let j = 0; j < n; j++) lines.push("D_{" + (j + 1) + "}=" + m.R.latex(cr.ds[j]));
    for (let j = 0; j < n; j++) lines.push("x_{" + (j + 1) + "}=" + m.R.latex(cr.xs[j]));
    return resp(lines, S.matLatex(m.rows, { R: m.R, paren: "(" }));
  };

  /* ---------- /linearEquation ---------- */
  EP["/linearEquation"] = function (b) {
    const m = S.parseMatrix(String(b.content));
    const n = m.rows[0].length - 1;
    if (n < 1) throw new U("需要增广矩阵");
    const coef = m.rows.map(r => r.slice(0, n)), bb = m.rows.map(r => r[n]);
    const sol = S.solveSystem(m.rows, m.R);
    const steps = stepLines(sol.steps);
    let tail;
    if (sol.type === "none") {
      steps.push("\\text{无解}");
      tail = ["\\text{无解}"];
    } else if (sol.type === "unique") {
      tail = ["\\text{唯一解：}", Ltx.vector(sol.x.map(v => m.R.latex(v)))];
    } else {
      const lines = S.renderSolutionLines(sol, m.R);
      tail = ["\\text{通解：}", Ltx.cases(lines)];
    }
    const contentLatex = S.renderEquations(coef, bb, m.R);
    return resp(steps.concat(tail), contentLatex);
  };

  /* ---------- /rank ---------- */
  EP["/rank"] = function (b) {
    const m = S.parseMatrix(String(b.content));
    const rk = S.rankOf(m.rows, m.R);
    const steps = stepLines(rk.steps || []);
    if (rk.specialCases) {
      for (const cs of rk.specialCases) {
        steps.push("\\text{当}" + rk.varName + "=" + cs.value.latex() + "\\text{时}");
        steps.push(...stepLines(cs.steps));
        steps.push("\\text{矩阵的秩为}" + cs.rank);
      }
      steps.push("\\text{其它情形矩阵的秩为}" + rk.rank);
    } else {
      steps.push("\\text{矩阵的秩为}" + rk.rank);
    }
    return resp(steps, S.matLatex(m.rows, { R: m.R, paren: "[" }));
  };

  /* ---------- /rowEchelonForm /standard /simplestForm ---------- */
  function rrefEndpoint(b, full) {
    const m = S.parseMatrix(String(b.content));
    if (m.kind === "poly") throw new U("含参数矩阵的行最简形未支持，已回退服务器");
    const rr = full ? S.rref(m.rows, m.R) : S.gaussForward(m.rows, m.R);
    const steps = stepLines(rr.steps);
    steps.push(full ? "\\text{行最简形：}" + S.matLatex(rr.rows, { R: m.R }) : "\\text{行阶梯形：}" + S.matLatex(rr.rows, { R: m.R }));
    return resp(steps, S.matLatex(m.rows, { R: m.R, paren: "[" }));
  }
  EP["/rowEchelonForm"] = b => rrefEndpoint(b, false);
  EP["/standard"] = b => rrefEndpoint(b, true);
  EP["/simplestForm"] = b => rrefEndpoint(b, true);

  /* ---------- /leastSquares /bestLeastSquares ---------- */
  function leastSquaresCore(b, allowPseudo) {
    const m = S.parseMatrix(String(b.content));
    if (m.kind !== "frac") throw new U("最小二乘仅支持数字矩阵");
    const n = m.rows[0].length - 1;
    const A = m.rows.map(r => r.slice(0, n)), bb = m.rows.map(r => r[n]);
    const At = S.matTranspose(A);
    const AtA = S.matMul(At, A, m.R), Atb = S.matMul(At, bb, m.R);
    const lines = [];
    lines.push("A^{T}=" + S.matLatex(At, { R: m.R }));
    lines.push("A^{T}A=" + S.matLatex(AtA, { R: m.R }));
    lines.push("A^{T}b=" + S.matLatex(Atb, { R: m.R }));
    let x;
    try {
      const aug = AtA.map((row, i) => row.concat([Atb[i]]));
      const sol = S.solveSystem(aug, m.R);
      if (sol.type === "none") throw new U("正规方程无解");
      if (sol.type === "infinite") throw new U("A^TA 奇异");
      x = sol.x;
    } catch (e) {
      if (!allowPseudo || !(e instanceof U)) throw e;
      const pi = S.pseudoinverse(A, m.R);
      x = S.matMul(pi.Ap, bb, m.R).map(r => r[0]);
      lines.push("A^{+}=" + S.matLatex(pi.Ap, { R: m.R }));
    }
    lines.push("x=" + Ltx.vector(x.map(v => m.R.latex(v))));
    return resp(lines, S.matLatex(m.rows, { R: m.R, paren: "(" }));
  }
  EP["/leastSquares"] = b => leastSquaresCore(b, false);
  EP["/bestLeastSquares"] = b => leastSquaresCore(b, true);

  /* ---------- /LU ---------- */
  EP["/LU"] = function (b) {
    const m = S.parseMatrix(String(b.content));
    needSquare(m);
    if (m.kind === "poly") throw new U("符号矩阵 LU 未支持");
    const lu = S.luDecomp(m.rows, m.R);
    const lines = ["L=" + S.matLatex(lu.L, { R: m.R }), "U=" + S.matLatex(lu.U, { R: m.R }), "A=LU"];
    return resp(lines, S.matLatex(m.rows, { R: m.R, paren: "(" }));
  };

  /* ---------- /fullRankDecomposition ---------- */
  EP["/fullRankDecomposition"] = function (b) {
    const m = S.parseMatrix(String(b.content));
    if (m.kind === "poly") throw new U("符号矩阵未支持");
    const fr = S.fullRankDecomp(m.rows, m.R);
    const Bm = fr.B, Cm = fr.C;
    const lines = stepLines(fr.steps);
    lines.push("\\text{行最简形的主元列构成 }B\\text{，非零行构成 }C：");
    lines.push("B=" + S.matLatex(Bm, { R: m.R }));
    lines.push("C=" + S.matLatex(Cm, { R: m.R }));
    lines.push("A=BC");
    return resp(lines, S.matLatex(m.rows, { R: m.R, paren: "[" }));
  };

  /* ---------- /generalizedInverse ---------- */
  EP["/generalizedInverse"] = function (b) {
    const m = S.parseMatrix(String(b.content));
    if (m.kind !== "frac") throw new U("广义逆仅支持数字矩阵");
    const pi = S.pseudoinverse(m.rows, m.R);
    const lines = ["A^{+}=" + S.matLatex(pi.Ap, { R: m.R })];
    return resp(lines, S.matLatex(m.rows, { R: m.R, paren: "[" }));
  };

  /* ---------- /vecRank /maximalLIS ---------- */
  function vecGroupCore(b) {
    const m = S.parseMatrix(String(b.content));
    if (m.kind !== "frac") throw new U("向量组仅支持数字矩阵");
    const vg = S.vectorGroup(m.rows, m.R);
    const lines = stepLines(vg.steps);
    const names = vg.lis.map(i => "\\alpha_{" + (i + 1) + "}").join(",");
    lines.push("\\text{向量组的秩为}" + vg.rank + "\\text{，一个极大无关组为：}" + names);
    for (const rp of vg.repr) {
      let s = "";
      rp.coeffs.forEach((k, i) => {
        if (k.isZero()) return;
        const a = k.abs();
        const kt = a.isOne() ? "" : a.latex();
        s += (s === "" ? (k.isNeg() ? "-" : "") : (k.isNeg() ? " - " : " + ")) + kt + "\\alpha_{" + (vg.lis[i] + 1) + "}";
      });
      if (s === "") s = "0";
      lines.push("\\alpha_{" + (rp.idx + 1) + "}=" + s);
    }
    return resp(lines, S.matLatex(m.rows, { R: m.R, paren: "[" }));
  }
  EP["/vecRank"] = vecGroupCore;
  EP["/maximalLIS"] = vecGroupCore;

  /* ---------- /norm ---------- */
  EP["/norm"] = function (b) {
    const m = S.parseMatrix(String(b.content));
    if (m.kind !== "frac") throw new U("范数仅支持数字矩阵");
    const r = m.rows.length, c = m.rows[0].length;
    let cmax = null;
    for (let j = 0; j < c; j++) { let s2 = F.zero(); for (let i = 0; i < r; i++) s2 = s2.add(m.rows[i][j].abs()); if (cmax === null || s2.cmp(cmax) > 0) cmax = s2; }
    let rmax = null;
    for (let i = 0; i < r; i++) { let s2 = F.zero(); for (let j = 0; j < c; j++) s2 = s2.add(m.rows[i][j].abs()); if (rmax === null || s2.cmp(rmax) > 0) rmax = s2; }
    let f2 = F.zero();
    for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) f2 = f2.add(m.rows[i][j].mul(m.rows[i][j]));
    const fL = S.QD.sqrtOf(f2).latex();
    const lines = ["\\left\\|A\\right\\|_{1}=" + cmax.latex(), "\\left\\|A\\right\\|_{\\infty}=" + rmax.latex(), "\\left\\|A\\right\\|_{F}=" + fL];
    return resp(lines, S.matLatex(m.rows, { R: m.R, paren: "[" }));
  };

  /* ---------- /vecNorm ---------- */
  EP["/vecNorm"] = function (b) {
    const m = S.parseMatrix(String(b.content));
    if (m.rows.length !== 1 && m.rows[0].length !== 1) throw new U("需要向量");
    const vec = m.rows.length === 1 ? m.rows[0] : S.matTranspose(m.rows)[0];
    const R = m.R;
    const absOf = v => {
      if (R.kind === "frac") return v.abs();
      if (R.kind === "cplx") return S.QD.sqrtOf(v.re.mul(v.re).add(v.im.mul(v.im)));
      if (R.kind === "qd") return S.QD.sqrtOf(v.mul(v.conj()).a);
      throw new U("不支持的范数类型");
    };
    let n1 = F.zero(), n2sq = F.zero(), ninf = null;
    for (const v of vec) {
      const a = absOf(v);
      n1 = n1.add(a);
      n2sq = n2sq.add(a.mul(a));
      if (ninf === null || a.cmp(ninf) > 0) ninf = a;
    }
    const lines = [
      "\\left\\|x\\right\\|_{1}=" + n1.latex(),
      "\\left\\|x\\right\\|_{2}=" + S.QD.sqrtOf(n2sq).latex(),
      "\\left\\|x\\right\\|_{\\infty}=" + ninf.latex(),
    ];
    return resp(lines, "");
  };

  /* ---------- /inversionNumber ---------- */
  EP["/inversionNumber"] = function (b) {
    const seq = String(b.content).trim().split(/\s+/).map(x => parseInt(x, 10));
    if (seq.some(x => !Number.isInteger(x))) throw new U("逆序数需要数字序列");
    const pairs = [];
    let cnt = 0;
    for (let i = 0; i < seq.length; i++) for (let j = i + 1; j < seq.length; j++) if (seq[i] > seq[j]) { cnt++; pairs.push("(" + seq[i] + "," + seq[j] + ")"); }
    const lines = [seq.join(" ") + "\\text{ 的逆序对：}" + (pairs.join(" ") || "\\text{无}"), "\\text{逆序数为}" + cnt];
    return resp(lines, seq.join("\\;\\;"));
  };

  /* ---------- /syntheticDivision /algorithmDivision ---------- */
  // content: [f系数(降幂), g系数(降幂)]
  function parsePolyCoeffs(arr) {
    const cs = arr.map(x => F.fromString(String(x).trim()));
    return S.UPoly.fromCoeffs(cs); // cs[i] = x^i，输入为降幂 → 反转
  }
  function upolyFromDesc(descArr) {
    const cs = descArr.map(x => F.fromString(String(x).trim())).reverse();
    return S.UPoly.fromCoeffs(cs);
  }
  function upolyTextLatex(p) { // 降幂系数串
    return p.latex("x");
  }
  EP["/syntheticDivision"] = function (b) {
    const arr = b.content;
    if (!Array.isArray(arr) || arr.length < 2) throw new U("综合除法需要两个多项式");
    const f = upolyFromDesc(arr[0]), g = upolyFromDesc(arr[1]);
    if (g.deg() < 0) throw new U("除式为零多项式");
    const dm = f.divmod(g);
    const lines = [
      "f(x)=" + upolyTextLatex(f),
      "g(x)=" + upolyTextLatex(g),
      "q(x)=" + upolyTextLatex(dm.q) + "\\quad r(x)=" + upolyTextLatex(dm.r),
      "f(x)=g(x)\\cdot q(x)+r(x)",
    ];
    return resp(lines, "");
  };
  EP["/algorithmDivision"] = function (b) {
    const arr = b.content;
    if (!Array.isArray(arr) || arr.length < 2) throw new U("辗转相除需要两个多项式");
    let f = upolyFromDesc(arr[0]), g = upolyFromDesc(arr[1]);
    const lines = ["f(x)=" + upolyTextLatex(f), "g(x)=" + upolyTextLatex(g)];
    let guard = 0;
    while (!g.isZero() && g.deg() >= 0) {
      const dm = f.divmod(g);
      lines.push(upolyTextLatex(f) + "=\\left(" + upolyTextLatex(g) + "\\right)\\cdot\\left(" + upolyTextLatex(dm.q) + "\\right)+" + upolyTextLatex(dm.r));
      f = g; g = dm.r;
      if (++guard > 50) throw new U("辗转相除不收敛");
    }
    if (f.deg() >= 0) f = f.monic();
    lines.push("\\text{最大公因式：}" + upolyTextLatex(f));
    return resp(lines, "");
  };

  /* ---------- /auxiliary ---------- */
  EP["/auxiliary"] = function (b) {
    const m = S.parseMatrix(String(b.content));
    if (m.kind !== "frac") throw new U("行变换助手仅支持数字矩阵");
    const ops = String(b.op_record || "").split(";").map(s => s.trim()).filter(s => s !== "");
    let rows = S.matClone(m.rows);
    const R = m.R;
    for (const op of ops) applyRowOp(op);
    const imgUrl = S.matLatex(rows, { R, paren: "[" });
    function applyRowOp(op) {
      let mm;
      // ri<->rj
      if ((mm = op.match(/^r(\d+)\s*<->\s*r(\d+)$/i))) {
        const i = +mm[1] - 1, j = +mm[2] - 1;
        const t = rows[i]; rows[i] = rows[j]; rows[j] = t; return;
      }
      // rB+(k)rA  或 rB-krA
      if ((mm = op.match(/^r(\d+)\s*([+-])\s*(?:(-?\([^()]*\))|(-?[\w./√*()+-]*?))\*?r(\d+)$/i))) {
        const j = +mm[1] - 1, sign = mm[2] === "-" ? -1 : 1;
        let ktext = (mm[3] || mm[4] || "1").trim();
        ktext = ktext.replace(/^\(|\)$/g, "");
        const i = +mm[5] - 1;
        let k;
        try { k = S.parseEntry(ktext).value; } catch (e) { throw new U("无法解析行变换 " + op); }
        if (k instanceof S.Poly) { if (!k.isConst()) throw new U("行变换系数须为数字"); k = k.toConst(); }
        if (!sign || sign === -1) k = k.neg();
        for (let c = 0; c < rows[0].length; c++) rows[j][c] = R.add(rows[j][c], R.mul(k, rows[i][c]));
        return;
      }
      // kr 或 kr=
      if ((mm = op.match(/^([^r]*?)\s*r(\d+)$/i))) {
        let ktext = mm[1].trim();
        if (ktext === "" ) ktext = "1";
        else if (ktext === "-") ktext = "-1";
        const i = +mm[2] - 1;
        let k;
        try { k = S.parseEntry(ktext).value; } catch (e) { throw new U("无法解析行变换 " + op); }
        if (k instanceof S.Poly) { if (!k.isConst()) throw new U("行变换系数须为数字"); k = k.toConst(); }
        for (let c = 0; c < rows[0].length; c++) rows[i][c] = R.mul(k, rows[i][c]);
        return;
      }
      throw new U("无法解析行变换 " + op);
    }
    return { imgUrl, result: [imgUrl], content: "", errMsg: "", VIPMessage: "", test_records: [], _last: false, _next: false };
  };

  S.EP1 = EP;
})(typeof S !== "undefined" ? S : (globalThis.S = globalThis.S || {}));
