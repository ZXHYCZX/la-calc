// eigen.js — 特征值族：特征多项式精确因式分解、特征向量(QD 根式域)、对角化、Jordan、
// 相似/过渡矩阵、二次型三变换、施密特正交化、Smith 标准形、SVD(数值)
(function (S) {
  "use strict";
  const F = S.Frac, Q = S.QD, U = S.UnsupportedError, UP = S.UPoly, Ltx = S.Ltx;
  const RQ = () => S.makeRing("qd");
  const RF = () => S.makeRing("frac");

  function resp(steps, contentLatex, extra) {
    return Object.assign({
      result: steps || [], content: contentLatex || "", errMsg: "", VIPMessage: "",
      test_records: [], _last: false, _next: false,
    }, extra || {});
  }
  function needSquare(m) { if (m.rows.length !== m.rows[0].length) throw new U("需要方阵"); }

  /* ================= 特征多项式（牛顿恒等式，精确） ================= */
  // UPoly: cs[i] = λ^i 系数，monic；p(λ)=λⁿ+a₁λ^{n-1}+…+aₙ
  S.charPoly = function (rowsIn, R) {
    if (R.kind !== "frac") throw new U("特征多项式仅支持数字矩阵");
    const n = rowsIn.length;
    // 幂和 s_k = tr(A^k)
    const s = [null];
    let P = S.matIdentity(n, R);
    for (let k = 1; k <= n; k++) {
      P = S.matMul(rowsIn, P, R);
      let tr = F.zero();
      for (let i = 0; i < n; i++) tr = tr.add(P[i][i]);
      s.push(tr);
    }
    // 牛顿：a_k = -(s_k + a₁s_{k-1} + … + a_{k-1}s₁)/k；a[0]=首项1
    const a = [F.one()];
    for (let k = 1; k <= n; k++) {
      let acc = s[k];
      for (let i = 1; i < k; i++) acc = acc.add(a[i].mul(s[k - i]));
      a.push(acc.neg().div(F.from(k)));
    }
    return UP.fromCoeffs(a.slice().reverse()); // cs[i]=λ^i，cs[n]=1
  };

  /* ================= 因式分解：有理根 + 二次不可约剩余 ================= */
  S.factorCharPoly = function (p) {
    const rational = [];
    let cur = p;
    if (cur.isZero()) throw new U("零多项式");
    const pushRoot = (r, m) => {
      const last = rational[rational.length - 1];
      if (last && last.root.cmp(r) === 0) last.mult += (m || 1);
      else rational.push({ root: r, mult: m || 1 });
    };
    while (cur.deg() > 0 && cur.coeff(0).isZero()) { cur = new UP(cur.cs.slice(1)); pushRoot(F.zero(), 1); }
    for (;;) {
      if (cur.deg() <= 1) break;
      const roots = cur.rationalRoots();
      if (roots.length === 0) break;
      const r = roots[0];
      let mult = 0;
      for (;;) {
        if (cur.deg() <= 0 || !cur.evalAt(r).isZero()) break;
        const dm = cur.divmod(UP.x(1).sub(UP.c(r)));
        if (!dm.r.isZero()) break;
        cur = dm.q; mult++;
      }
      pushRoot(r, mult);
    }
    const irreducible = [];
    if (cur.deg() === 1) {
      // 一次因子也应已被试除（防御）
      pushRoot(cur.coeff(0).neg().div(cur.lc()), 1);
    } else if (cur.deg() >= 2) irreducible.push(cur.monic());
    return { rational, irreducible, remaining: cur };
  };

  // 二次因子 x²+px+q 的根（QD），D 相同
  function quadRoots(p, q) {
    const disc = p.mul(p).sub(q.mul(F.from(4)));
    if (disc.isNeg()) throw new U("复特征值未支持本地精确计算");
    const sq = Q.sqrtOf(disc);
    const base = p.neg().div(F.from(2));
    if (sq.isRat()) {
      const k = sq.a.div(F.from(2));
      return { rational: [base.add(k), base.sub(k)] };
    }
    const half = sq.b.div(F.from(2));
    return { surd: [{ lam: new Q(base, half, sq.D), D: sq.D }, { lam: new Q(base, half.neg(), sq.D), D: sq.D }] };
  }

  /* ================= 特征值 + 特征向量（精确） ================= */
  // 返回 [{lam: Frac|QD, isQD, D, mult, geom, vecs:[列向量(所在环)]}]
  S.eigenSolve = function (rowsIn, R) {
    if (R.kind !== "frac") throw new U("特征值仅支持数字矩阵");
    const n = rowsIn.length;
    const cp = S.charPoly(rowsIn, R);
    const fac = S.factorCharPoly(cp);
    const out = [];
    const solveWithLam = (lam, isQD, D, mult) => {
      let N, RR;
      if (isQD) {
        RR = RQ();
        N = rowsIn.map((row, i) => row.map((v, j) => i === j ? Q.fromFrac(v).sub(lam) : Q.fromFrac(v)));
      } else {
        RR = RF();
        N = rowsIn.map((row, i) => row.map((v, j) => i === j ? v.sub(lam) : v));
      }
      const ns = S.nullSpace(N, RR);
      return { lam, isQD, D: D || null, mult, geom: ns.dim, vecs: ns.vecs };
    };
    for (const rr of fac.rational) out.push(solveWithLam(rr.root, false, null, rr.mult));
    for (const irp of fac.irreducible) {
      if (irp.deg() !== 2) throw new U("特征多项式存在不可约 " + irp.deg() + " 次因子，超出本地精确能力");
      const p = irp.coeff(1), q = irp.coeff(0);
      const roots = quadRoots(p, q);
      if (roots.rational) for (const r of roots.rational) out.push(solveWithLam(r, false, null, 1));
      else for (const sd of roots.surd) out.push(solveWithLam(sd.lam, true, sd.D, 1));
    }
    return out;
  };

  /* ================= 零空间（域上） ================= */
  S.nullSpace = function (rowsIn, R) {
    const n = rowsIn[0].length;
    const rr = S.rref(rowsIn, R);
    const pivots = rr.pivots;
    const freeCols = [];
    for (let j = 0; j < n; j++) if (!pivots.includes(j)) freeCols.push(j);
    const vecs = [];
    for (const fc of freeCols) {
      const v = new Array(n).fill(null).map(() => R.zero());
      v[fc] = R.one();
      for (let i = 0; i < pivots.length; i++) {
        const val = rr.rows[i][fc];
        if (!R.isZero(val)) v[pivots[i]] = R.neg(val);
      }
      vecs.push(v);
    }
    return { vecs, dim: freeCols.length, pivots, rref: rr.rows };
  };

  /* ================= LaTeX 辅助 ================= */
  function lamLatex(lam) { return lam.latex(); }
  function factorLine(fac, vn) {
    vn = vn || "\\lambda";
    const parts = [];
    for (const rr of fac.rational) {
      let term;
      if (rr.root.isZero()) term = vn;
      else term = "\\left(" + vn + (rr.root.isNeg() ? " + " + rr.root.abs().latex() : " - " + rr.root.latex()) + "\\right)";
      parts.push(rr.mult === 1 ? term : term + "^{" + rr.mult + "}");
    }
    for (const irp of fac.irreducible) parts.push("\\left(" + irp.latex(vn) + "\\right)");
    return parts.join(" ");
  }
  function lamBlock(es) {
    return "{\\begin{array}{l}" + es.map((e, i) => "\\lambda_{" + (i + 1) + "}=" + lamLatex(e.lam)).join(" \\\\ ") + "\\end{array}}";
  }
  function vecLatex(v) { return Ltx.vector(v.map(x => x.latex())); }

  /* ================= /eigenvals ================= */
  const EP2 = {};
  EP2["/eigenvals"] = function (b) {
    const m = S.parseMatrix(String(b.content));
    needSquare(m);
    if (m.kind !== "frac") throw new U("特征值仅支持数字矩阵");
    const es = S.eigenSolve(m.rows, m.R);
    const cp = S.charPoly(m.rows, m.R);
    const fac = S.factorCharPoly(cp);
    const steps = [];
    const lamMat = m.rows.map((row, i) => row.map((v, j) => {
      const e = S.Poly.c(v).neg();
      return i === j ? e.add(S.Poly.varOf("\\lambda")) : e;
    }));
    steps.push("\\left|\\lambda E-A\\right|=" + S.matLatex(lamMat, { R: S.makeRing("poly"), paren: "|" }));
    steps.push("\\left|\\lambda E-A\\right|=\\left(" + factorLine(fac) + "\\right)=0");
    steps.push(lamBlock(es));
    es.forEach((e, i) => {
      if (e.geom === 0) throw new U("特征向量计算失败");
      for (const v of e.vecs) {
        steps.push("{\\text{当}\\textcolor{red}{\\lambda_{" + (i + 1) + "}=" + lamLatex(e.lam) + "}\\text{时}:}\\ {\\text{特征向量为：}}" + vecLatex(v));
      }
    });
    return resp(steps, S.matLatex(m.rows, { R: m.R, paren: "[" }), { detail: {} });
  };

  /* ================= /diagonalize /similar ================= */
  function diagonalizeCore(b) {
    const m = S.parseMatrix(String(b.content));
    needSquare(m);
    if (m.kind !== "frac") throw new U("仅支持数字矩阵");
    const n = m.rows.length;
    const es = S.eigenSolve(m.rows, m.R);
    const defective = es.find(e => e.geom !== e.mult);
    if (defective) {
      // 不可对角化是明确的数学结论，直接给出而非回退
      return resp([
        lamBlock(es),
        "{\\text{存在特征值 }\\lambda=" + lamLatex(defective.lam) + "\\text{ 几何重数（}" + defective.geom + "\\text{）< 代数重数（}" + defective.mult + "\\text{）}}",
        "\\text{所以矩阵不可对角化}",
        "\\text{提示：可尝试 Jordan 标准形}",
      ], S.matLatex(m.rows, { R: m.R, paren: "[" }));
    }
    const cols = [], lamList = [], lamIdx = [];
    es.forEach((e, ei) => { for (const v of e.vecs) { cols.push(v); lamList.push(e.lam); lamIdx.push(ei + 1); } });
    const P = cols[0].map((_, i) => cols.map(v => v[i]));
    const lamRows = [];
    for (let i = 0; i < n; i++) { const row = []; for (let j = 0; j < n; j++) row.push(i === j ? lamLatex(lamList[i]) : "0"); lamRows.push(row); }
    const steps = [];
    steps.push("\\text{特征值：}" + lamBlock(es));
    cols.forEach((v, i) => steps.push("\\text{当}\\lambda_{" + lamIdx[i] + "}=" + lamLatex(lamList[i]) + "\\text{时，特征向量为：}" + vecLatex(v)));
    steps.push("P=" + Ltx.matrix(P.map(col => col.map(x => x.latex())), { paren: "[" }));
    steps.push("\\Lambda=" + Ltx.matrix(lamRows, { paren: "[" }));
    steps.push("P^{-1}AP=\\Lambda");
    return resp(steps, S.matLatex(m.rows, { R: m.R, paren: "[" }));
  }
  EP2["/diagonalize"] = diagonalizeCore;
  EP2["/similar"] = diagonalizeCore;

  /* ================= Jordan 块（有理特征值） ================= */
  S.jordanBlocks = function (rowsIn, R) {
    const cp = S.charPoly(rowsIn, R);
    const fac = S.factorCharPoly(cp);
    if (fac.irreducible.length) throw new U("含非有理特征值，Jordan 标准形未支持本地精确");
    const nul = M => M.length - S.rref(M, R).pivots.length;
    const blocks = [];
    for (const rr of fac.rational) {
      const lam = rr.root;
      let cur = rowsIn.map((row, i) => row.map((v, j) => i === j ? v.sub(lam) : v));
      const p = [0, nul(cur)];
      for (let k = 2; k <= rr.mult; k++) { cur = S.matMul(cur, rowsIn.map((row, i) => row.map((v, j) => i === j ? v.sub(lam) : v)), R); p.push(nul(cur)); }
      for (let k = rr.mult; k >= 1; k--) {
        const cnt = (p[k] || 0) - (p[k - 1] || 0);
        for (let t = 0; t < cnt; t++) blocks.push({ lam, size: k });
      }
    }
    return { blocks };
  };
  EP2["/jordan"] = function (b) {
    const m = S.parseMatrix(String(b.content));
    needSquare(m);
    if (m.kind !== "frac") throw new U("仅支持数字矩阵");
    const n = m.rows.length;
    const jb = S.jordanBlocks(m.rows, m.R);
    const Jm = [];
    for (let i = 0; i < n; i++) { const row = []; for (let j = 0; j < n; j++) row.push(null); Jm.push(row); }
    let pos = 0;
    for (const bl of jb.blocks) {
      for (let k = 0; k < bl.size; k++) {
        Jm[pos + k][pos + k] = bl.lam;
        if (k + 1 < bl.size) Jm[pos + k][pos + k + 1] = F.one();
      }
      pos += bl.size;
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (Jm[i][j] === null) Jm[i][j] = F.zero();
    return resp(["J=" + S.matLatex(Jm, { R: RF() })], S.matLatex(m.rows, { R: m.R, paren: "[" }));
  };

  /* ================= /similarity：判断两矩阵相似 ================= */
  function isSymmetric(rows, R) {
    const n = rows.length;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (!R.eq(rows[i][j], rows[j][i])) return false;
    return true;
  }
  EP2["/similarity"] = function (b) {
    const arr = Array.isArray(b.content) ? b.content : [b.contentA, b.contentB];
    if (!arr || arr.length < 2) throw new U("需要两个矩阵");
    const A = S.parseMatrix(String(arr[0])), B = S.parseMatrix(String(arr[1]));
    if (A.kind !== "frac" || B.kind !== "frac") throw new U("仅支持数字矩阵");
    needSquare(A); needSquare(B);
    if (A.rows.length !== B.rows.length) return resp(["\\text{阶数不同，必不相似}"], "");
    const cpA = S.charPoly(A.rows, A.R), cpB = S.charPoly(B.rows, B.R);
    const steps = ["\\left|\\lambda E-A\\right|=" + cpA.latex(), "\\left|\\lambda E-B\\right|=" + cpB.latex()];
    if (!cpA.sub(cpB).isZero()) {
      steps.push("\\text{特征多项式不同，}A\\text{ 与 }B\\text{ 不相似}");
      return resp(steps, "");
    }
    steps.push("\\text{特征多项式相同}");
    const fac = S.factorCharPoly(cpA);
    if (fac.irreducible.length) {
      if (isSymmetric(A.rows, A.R) && isSymmetric(B.rows, B.R)) {
        steps.push("A\\text{、}B\\text{ 均为实对称矩阵且特征多项式相同，故相似}");
        return resp(steps, "");
      }
      throw new U("无理特征值的一般相似性判断未支持本地");
    }
    const jA = S.jordanBlocks(A.rows, A.R), jB = S.jordanBlocks(B.rows, B.R);
    const key = bs => bs.map(x => x.lam.toString() + ":" + x.size).sort().join("|");
    const same = key(jA.blocks) === key(jB.blocks);
    steps.push(same ? "\\text{Jordan 标准形相同，}A\\text{ 与 }B\\text{ 相似}" : "\\text{Jordan 标准形不同，}A\\text{ 与 }B\\text{ 不相似}");
    return resp(steps, "");
  };

  /* ================= /transition：过渡矩阵 ================= */
  EP2["/transition"] = function (b) {
    const arr = Array.isArray(b.content) ? b.content : [b.contentA, b.contentB];
    if (!arr || arr.length < 2) throw new U("需要两组基");
    const A = S.parseMatrix(String(arr[0])), B = S.parseMatrix(String(arr[1]));
    if (A.kind !== "frac" || B.kind !== "frac") throw new U("仅支持数字矩阵");
    const n = A.rows.length;
    if (A.rows[0].length !== n || B.rows[0].length !== n) throw new U("需要两组等长的基向量（方阵形式）");
    const aug = A.rows.map((row, i) => row.concat(B.rows[i]));
    const rr = S.rref(aug, A.R);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (!A.R.eq(rr.rows[i][j], i === j ? A.R.one() : A.R.zero())) {
      return resp(["\\text{第一组基线性相关，过渡矩阵不存在}"], "");
    }
    const X = rr.rows.map(row => row.slice(n));
    const steps = ["(A|B)=" + S.matLatex(aug, { R: A.R, paren: "[", after: n - 1 })];
    for (const st of rr.steps.slice(1)) steps.push(Ltx.step(st.latex, st.op ? [st.op] : null));
    steps.push("X=" + S.matLatex(X, { R: A.R }));
    steps.push("B=AX");
    return resp(steps, "");
  };

  /* ================= /quadraticForm?methods=zjbh|pff|htbh ================= */
  function quadraticMatrix(content) {
    if (!Array.isArray(content)) throw new U("二次型输入格式错误");
    const n = content.length;
    const A = S.matZeros(n, n, RF());
    for (let i = 0; i < n; i++) {
      if (!Array.isArray(content[i])) throw new U("二次型输入格式错误");
      for (let j = 0; j <= i; j++) {
        const p = S.parseEntry(String(content[i][j]));
        if (p.ring !== "frac") throw new U("二次型须为数字");
        A[i][j] = p.value; A[j][i] = p.value;
      }
    }
    return A;
  }
  function quadFormExpr(A) {
    const terms = [];
    for (let i = 0; i < A.length; i++) {
      if (!A[i][i].isZero()) terms.push((A[i][i].isOne() ? "" : A[i][i].isNegOne() ? "-" : A[i][i].latex()) + "x_{" + (i + 1) + "}^{2}");
      for (let j = i + 1; j < A.length; j++) {
        if (!A[i][j].isZero()) {
          const c = A[i][j].mul(F.from(2));
          terms.push((c.isOne() ? "" : c.isNegOne() ? "-" : c.latex()) + "x_{" + (i + 1) + "}x_{" + (j + 1) + "}");
        }
      }
    }
    return terms.length ? terms.join(" + ").replace(/\+ -/g, "- ") : "0";
  }
  function signJoin(terms) { return terms.join(" + ").replace(/\+ -/g, "- "); }

  // 配方/合同：对称消元（行同列变换），C 累计列变换（x=Cy）
  function congruenceElim(Ain) {
    const n = Ain.length;
    const A = S.matClone(Ain);
    const C = S.matIdentity(n, RF());
    const steps = [];
    steps.push(S.matLatex(A, { R: RF() }));
    for (let k = 0; k < n; k++) {
      if (A[k][k].isZero()) {
        let p = -1;
        for (let i = k + 1; i < n; i++) if (!A[i][k].isZero()) { p = i; break; }
        if (p < 0) continue;
        for (let j = 0; j < n; j++) A[k][j] = A[k][j].add(A[p][j]);
        for (let i = 0; i < n; i++) A[i][k] = A[i][k].add(A[i][p]);
        for (let i = 0; i < n; i++) C[i][k] = C[i][k].add(C[i][p]);
        steps.push(S.matLatex(A, { R: RF() }));
      }
      const piv = A[k][k];
      if (piv.isZero()) continue;
      for (let i = k + 1; i < n; i++) {
        if (A[i][k].isZero()) continue;
        const f = A[i][k].div(piv);
        for (let j = 0; j < n; j++) A[i][j] = A[i][j].sub(f.mul(A[k][j]));
        for (let j = 0; j < n; j++) A[j][i] = A[j][i].sub(f.mul(A[j][k]));
        for (let t = 0; t < n; t++) C[t][i] = C[t][i].sub(f.mul(C[t][k]));
      }
      steps.push(S.matLatex(A, { R: RF() }));
    }
    return { D: A, C, steps };
  }

  // 单位化：返回带 .latex() 的条目数组
  function normalizeVec(v, R) {
    if (R.kind === "frac") {
      let n2 = F.zero();
      for (const x of v) n2 = n2.add(x.mul(x));
      const rt = Q.sqrtOf(n2);
      if (rt.isRat()) return v.map(x => x.div(rt.a));
      const D = rt.D, k = rt.b;
      return v.map(x => new Q(F.zero(), x.div(k.mul(F.from(D))), D)); // x/(k√D) = (x/(kD))·√D
    }
    if (R.kind === "qd") {
      let n2 = R.zero();
      for (let i = 0; i < v.length; i++) for (let j = 0; j < v.length; j++) n2 = n2.add(v[i].mul(v[j]));
      if (!n2.b.isZero()) throw new U("特征向量范数含嵌套根式");
      const rt = Q.sqrtOf(n2.a);
      if (rt.isRat()) return v.map(x => x.div(rt.a));
      throw new U("范数含根式，未支持");
    }
    throw new U("范数环错误");
  }

  function dotP(a, b, R) {
    let acc = R.zero();
    for (let i = 0; i < a.length; i++) acc = R.add(acc, R.mul(a[i], b[i]));
    return acc;
  }
  function gramSchmidt(vs, R) {
    const out = [];
    for (const v of vs) {
      let w = v.slice();
      for (const u of out) {
        const f = R.div(dotP(w, u, R), dotP(u, u, R));
        w = w.map((x, i) => R.sub(x, R.mul(f, u[i])));
      }
      out.push(w);
    }
    return out;
  }

  EP2["/quadraticForm"] = function (b) {
    const method = b.__query && b.__query.methods ? b.__query.methods : "zjbh";
    const A = quadraticMatrix(b.content);
    const n = A.length;
    const contentLatex = S.matLatex(A, { R: RF(), paren: "[" });
    if (method === "pff" || method === "htbh") {
      const ce = congruenceElim(A);
      const steps = [];
      steps.push("f\\left(x_{1},\\ldots,x_{" + n + "}\\right)=" + quadFormExpr(A));
      if (method === "htbh") for (const st of ce.steps) steps.push(st);
      steps.push("D=" + S.matLatex(ce.D, { R: RF() }));
      steps.push("C=" + S.matLatex(ce.C, { R: RF() }));
      steps.push("x=Cy");
      const terms = [];
      for (let i = 0; i < n; i++) if (!ce.D[i][i].isZero()) terms.push((ce.D[i][i].isOne() ? "" : ce.D[i][i].isNegOne() ? "-" : ce.D[i][i].latex()) + "y_{" + (i + 1) + "}^{2}");
      steps.push("f=" + (signJoin(terms) || "0"));
      return resp(steps, contentLatex);
    }
    if (method === "zjbh") {
      const es = S.eigenSolve(A, RF());
      for (const e of es) if (e.geom !== e.mult) throw new U("对称阵几何重数异常");
      const cols = [], lamList = [];
      for (const e of es) {
        const R2 = e.isQD ? RQ() : RF();
        let basis = e.vecs;
        if (basis.length > 1) basis = gramSchmidt(basis, R2);
        for (const v of basis) {
          cols.push(normalizeVec(v, R2));
          lamList.push(e.lam);
        }
      }
      const Pm = cols[0].map((_, i) => cols.map(v => v[i]));
      const steps = [];
      steps.push("\\text{特征值：}" + lamBlock(es));
      steps.push("Q=" + Ltx.matrix(Pm.map(col => col.map(x => x.latex())), { paren: "[" }));
      steps.push("x=Qy");
      steps.push("f=" + signJoin(lamList.map((lam, i) => {
        const lt = lam.isRat ? lam.a.latex() : lam.latex();
        return lt + "y_{" + (i + 1) + "}^{2}";
      })));
      return resp(steps, contentLatex);
    }
    throw new U("未知二次型方法 " + method);
  };

  /* ================= /orthogonalMatrix（施密特正交化） ================= */
  EP2["/orthogonalMatrix"] = function (b) {
    const m = S.parseMatrix(String(b.content));
    if (m.kind !== "frac") throw new U("施密特正交化仅支持数字矩阵");
    const R = RF();
    const ortho = [];
    for (const v of m.rows) {
      let w = v.slice();
      for (const u of ortho) {
        const du = dotP(u, u, R);
        if (du.isZero()) continue;
        const f = R.div(dotP(w, u, R), du);
        w = w.map((x, i) => R.sub(x, R.mul(f, u[i])));
      }
      if (dotP(w, w, R).isZero()) throw new U("向量组线性相关");
      ortho.push(w);
    }
    const Qm = ortho.map(v => normalizeVec(v, R));
    const steps = ["\\text{施密特正交化并单位化：}", "Q=" + Ltx.matrix(Qm.map(v => v.map(x => x.latex())), { paren: "[" })];
    return resp(steps, S.matLatex(m.rows, { R: m.R, paren: "[" }));
  };

  /* ================= /smith（λ-矩阵 Smith 标准形，ℚ[λ]） ================= */
  EP2["/smith"] = function (b) {
    const m = S.parseMatrix(String(b.content));
    if (m.kind !== "poly") throw new U("Smith 标准形需要 λ-矩阵（含符号 λ）");
    const varsAll = new Set();
    for (const row of m.rows) for (const v of row) for (const name of v.vars()) varsAll.add(name);
    if (varsAll.size !== 1) throw new U("Smith 标准形需要单变量多项式矩阵");
    const vn = [...varsAll][0];
    const rows = m.rows.map(r => r.map(v => v.toUPolyIn(vn)));
    const mr = rows.length, mc = rows[0].length;
    const zero = UP.c(0);
    const deg = p => p.deg() < 0 ? Infinity : p.deg();
    let guard = 0;
    for (let k = 0; k < Math.min(mr, mc); k++) {
      for (;;) {
        let bi = -1, bj = -1, bd = Infinity;
        for (let i = k; i < mr; i++) for (let j = k; j < mc; j++) {
          if (!rows[i][j].isZero() && deg(rows[i][j]) < bd) { bd = deg(rows[i][j]); bi = i; bj = j; }
        }
        if (bi < 0) break;
        if (bi !== k) { const t = rows[bi]; rows[bi] = rows[k]; rows[k] = t; }
        if (bj !== k) for (let i = 0; i < mr; i++) { const t = rows[i][bj]; rows[i][bj] = rows[i][k]; rows[i][k] = t; }
        let changed = false;
        const piv = rows[k][k];
        for (let j = k + 1; j < mc; j++) {
          if (rows[k][j].isZero()) continue;
          const dm = rows[k][j].divmod(piv);
          if (!dm.r.isZero()) { rows[k][j] = dm.r; changed = true; }
          else rows[k][j] = zero;
        }
        for (let i = k + 1; i < mr; i++) {
          if (rows[i][k].isZero()) continue;
          const dm = rows[i][k].divmod(piv);
          if (!dm.r.isZero()) { rows[i][k] = dm.r; changed = true; }
          else rows[i][k] = zero;
        }
        if (!changed) break;
        if (++guard > 5000) throw new U("Smith 消元不收敛");
      }
      const piv = rows[k][k];
      if (piv.isZero()) continue;
      rows[k][k] = piv.monic();
      let okAll = true;
      for (let i = k + 1; i < mr && okAll; i++) for (let j = k + 1; j < mc && okAll; j++) {
        if (!rows[i][j].isZero() && !rows[i][j].divmod(rows[k][k]).r.isZero()) okAll = false;
      }
      if (!okAll && k + 1 < mr && !rows[k + 1][k].isZero()) {
        rows[k][k] = rows[k][k].add(rows[k + 1][k]);
        k--; continue;
      }
    }
    const steps = ["S=" + Ltx.matrix(rows.map(r => r.map(p => p.latex(vn))), { paren: "[" })];
    return resp(steps, S.matLatex(m.rows, { R: m.R, paren: "[" }));
  };

  /* ================= /SVD（数值） ================= */
  EP2["/SVD"] = function (b) {
    const m = S.parseMatrix(String(b.content));
    if (m.kind !== "frac") throw new U("SVD 仅支持数字矩阵");
    const svd = S.svdNumeric(m.rows);
    const fmt = x => (Math.abs(x) < 1e-12 ? 0 : Number(x.toPrecision(6))).toString();
    const steps = [
      "U=" + Ltx.matrix(svd.U.map(r => r.map(fmt)), { paren: "[" }),
      "\\Sigma=" + Ltx.matrix(svd.S.map((s, i) => svd.S.map((_, j) => i === j ? fmt(s) : "0")), { paren: "[" }),
      "V^{T}=" + Ltx.matrix(S.matTranspose(svd.V).map(r => r.map(fmt)), { paren: "[" }),
      "A=U\\Sigma V^{T}",
    ];
    return resp(steps, S.matLatex(m.rows, { R: m.R, paren: "[" }));
  };

  // Jacobi 特征分解（对称阵，数值）+ SVD
  S.svdNumeric = function (rowsIn) {
    const m = rowsIn.length, n = rowsIn[0].length;
    const num = rowsIn.map(r => r.map(v => v.toNumber()));
    const AtA = [];
    for (let i = 0; i < n; i++) {
      const row = [];
      for (let j = 0; j < n; j++) { let s = 0; for (let t = 0; t < m; t++) s += num[t][i] * num[t][j]; row.push(s); }
      AtA.push(row);
    }
    const eig = jacobiEigen(AtA);
    const idx = eig.values.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
    const Sg = idx.map(p => Math.sqrt(Math.max(p[0], 0)));
    // Vc: 列 i = 第 i 大特征值对应的特征向量
    const Vc = [];
    for (let i = 0; i < n; i++) {
      const col = new Array(n);
      for (let j = 0; j < n; j++) col[j] = eig.vectors[j][idx[i][1]];
      Vc.push(col);
    }
    const Vm = [];
    for (let j = 0; j < n; j++) { const row = []; for (let i = 0; i < n; i++) row.push(Vc[i][j]); Vm.push(row); }
    const U = [];
    for (let i = 0; i < m; i++) U.push(new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      if (Sg[i] < 1e-10) continue;
      for (let t = 0; t < m; t++) {
        let s = 0;
        for (let j = 0; j < n; j++) s += num[t][j] * Vc[i][j];
        U[t][i] = s / Sg[i];
      }
    }
    for (let i = 0; i < n; i++) {
      if (Sg[i] >= 1e-10) continue;
      for (let cand = 0; cand < m; cand++) {
        const e = new Array(m).fill(0); e[cand] = 1;
        for (const u of U) {
          if (u.every(x => x === 0)) continue;
          let d = 0; for (let t = 0; t < m; t++) d += e[t] * u[t];
          for (let t = 0; t < m; t++) e[t] -= d * u[t];
        }
        let nn = 0; for (let t = 0; t < m; t++) nn += e[t] * e[t];
        if (nn > 1e-8) { for (let t = 0; t < m; t++) U[t][i] = e[t] / Math.sqrt(nn); break; }
      }
    }
    return { U, S: Sg, V: Vm };
    function jacobiEigen(Min) {
      const N = Min.length;
      const a = Min.map(r => r.slice());
      const V = [];
      for (let i = 0; i < N; i++) { const row = new Array(N).fill(0); row[i] = 1; V.push(row); }
      for (let sweep = 0; sweep < 100; sweep++) {
        let off = 0;
        for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) off += a[i][j] * a[i][j];
        if (off < 1e-24) break;
        for (let p = 0; p < N; p++) for (let q = p + 1; q < N; q++) {
          if (Math.abs(a[p][q]) < 1e-15) continue;
          const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
          const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
          const c = 1 / Math.sqrt(t * t + 1), s = t * c;
          for (let k = 0; k < N; k++) {
            const akp = a[k][p], akq = a[k][q];
            a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq;
          }
          for (let k = 0; k < N; k++) {
            const apk = a[p][k], aqk = a[q][k];
            a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk;
          }
          for (let k = 0; k < N; k++) {
            const vkp = V[k][p], vkq = V[k][q];
            V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq;
          }
        }
      }
      return { values: a.map((r, i) => r[i]), vectors: V };
    }
  };

  S.EP2 = EP2;
})(typeof S !== "undefined" ? S : (globalThis.S = globalThis.S || {}));
