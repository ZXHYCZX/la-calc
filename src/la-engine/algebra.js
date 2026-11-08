// algebra.js — Poly(多变量多项式) / UPoly(一元多项式) / QD(a+b√D 二次根式域) / CCplx(精确复数)
(function (S) {
  "use strict";
  const Frac = S.Frac;
  const f0 = () => Frac.zero(), f1 = () => Frac.one();

  /* ============ Poly：多变量多项式，系数为 Frac ============
     内部：Map key -> Frac；key = "name:exp|name:exp"（name 升序） */
  class Poly {
    constructor(map) { this.m = map || new Map(); }
    static keyOf(terms) { // terms: [[name,exp],...] 已排序
      return terms.map(t => t[0] + ":" + t[1]).join("|");
    }
    static c(v) {
      v = Frac.from(v);
      const m = new Map();
      if (!v.isZero()) m.set("", v);
      return new Poly(m);
    }
    static varOf(name) { const m = new Map(); m.set(name + ":1", f1()); return new Poly(m); }
    static fromFrac(v) { return Poly.c(v); }
    clone() { const m = new Map(); for (const [k, v] of this.m) m.set(k, v); return new Poly(m); }
    static parseKey(k) {
      if (k === "") return [];
      return k.split("|").map(s => { const i = s.lastIndexOf(":"); return [s.slice(0, i), Number(s.slice(i + 1))]; });
    }
    add(b) {
      b = Poly.to(b); const m = new Map();
      for (const [k, v] of this.m) m.set(k, v);
      for (const [k, v] of b.m) {
        const nv = (m.get(k) || f0()).add(v);
        if (nv.isZero()) m.delete(k); else m.set(k, nv);
      }
      return new Poly(m);
    }
    sub(b) { return this.add(Poly.to(b).neg()); }
    neg() { const m = new Map(); for (const [k, v] of this.m) m.set(k, v.neg()); return new Poly(m); }
    mul(b) {
      b = Poly.to(b); const m = new Map();
      for (const [k1, v1] of this.m) for (const [k2, v2] of b.m) {
        const t1 = Poly.parseKey(k1), t2 = Poly.parseKey(k2);
        const merged = mergeTerms(t1, t2);
        const key = Poly.keyOf(merged);
        const nv = (m.get(key) || f0()).add(v1.mul(v2));
        if (nv.isZero()) m.delete(key); else m.set(key, nv);
      }
      return new Poly(m);
    }
    scale(fr) { fr = Frac.from(fr); if (fr.isOne()) return this.clone(); const m = new Map(); for (const [k, v] of this.m) m.set(k, v.mul(fr)); return new Poly(m); }
    pow(e) {
      e = Number(e);
      if (!Number.isInteger(e) || e < 0) throw new Error("Poly.pow 需非负整数指数");
      let r = Poly.c(1), base = this;
      while (e > 0) { if (e & 1) r = r.mul(base); base = base.mul(base); e >>= 1; }
      return r;
    }
    isZero() { return this.m.size === 0; }
    isConst() { return this.m.size === 0 || (this.m.size === 1 && this.m.has("")); }
    toConst() { if (!this.isConst()) throw new Error("非常数多项式"); return this.m.get("") || f0(); }
    vars() {
      const s = new Set();
      for (const k of this.m.keys()) for (const [n] of Poly.parseKey(k)) s.add(n);
      return [...s];
    }
    totalDegree() { let d = 0; for (const k of this.m.keys()) { const td = Poly.parseKey(k).reduce((a, t) => a + t[1], 0); if (td > d) d = td; } return d; }
    evalWith(map) { // map: name->Frac
      let acc = f0();
      for (const [k, v] of this.m) {
        let term = v;
        for (const [n, e] of Poly.parseKey(k)) {
          const val = map[n]; if (val === undefined) throw new Error("缺变量 " + n);
          term = term.mul(val.pow(e));
        }
        acc = acc.add(term);
      }
      return acc;
    }
    substVar(name, val) { // val: Frac 或 Poly
      let acc = Poly.c(0);
      for (const [k, v] of this.m) {
        let term = Poly.c(v);
        for (const [n, e] of Poly.parseKey(k)) {
          if (n === name) term = term.mul(val instanceof Poly ? val : Poly.c(val)).pow(e);
          else term = term.mul(Poly.varOf(n)).pow(e);
        }
        acc = acc.add(term);
      }
      return acc;
    }
    divExact(b) { // 精确整除，否则抛错
      b = Poly.to(b);
      if (b.isZero()) throw new Error("除以零");
      if (b.isConst()) return this.scale(b.toConst().inv());
      // 多变量除法（按总降序贪心），要求余式为 0
      let rem = this.clone(); let quo = new Map();
      const bLead = leadTermOf(b), bVars = b.vars();
      let guard = 0;
      while (!rem.isZero()) {
        const rLead = leadTermOf(rem);
        // 尝试用 rLead / bLead
        const div = termDiv(rLead, bLead);
        if (!div) throw new Error("不能整除（非精确除法）");
        const qp = polyFromTerm(div);
        const prod = b.mul(qp);
        rem = rem.sub(prod);
        const qk = Poly.keyOf(div.terms), qv = quo.get(qk) || f0();
        const nv = qv.add(div.c);
        if (nv.isZero()) quo.delete(qk); else quo.set(qk, nv);
        if (++guard > 1000) throw new Error("除法不收敛");
      }
      return new Poly(quo);
    }
    // 视为关于 name 的一元多项式（系数为其余变量多项式）——用于 λ-矩阵
    toUPolyIn(name) { // 返回 UPoly 系数数组（若含其它变量则抛错）
      const degs = [];
      for (const [k, v] of this.m) for (const [n, e] of Poly.parseKey(k)) if (n !== name) throw new Error("含其它变量");
      let deg = -1;
      for (const [k, v] of this.m) { const e = expOf(k, name); if (e > deg) deg = e; }
      const cs = new Array(deg + 1).fill(null).map(() => f0());
      for (const [k, v] of this.m) cs[expOf(k, name)] = v;
      return S.UPoly.fromCoeffs(cs);
    }
    toString() { return this.latex(); }
    latex() {
      if (this.isZero()) return "0";
      const terms = [...this.m.entries()].map(([k, v]) => ({ terms: Poly.parseKey(k), c: v }));
      // 纯降幂（同度字典序升），符号交错 —— 与 cal2-* 语料一致
      terms.sort((t1, t2) => {
        const d1 = t1.terms.reduce((s, x) => s + x[1], 0), d2 = t2.terms.reduce((s, x) => s + x[1], 0);
        if (d1 !== d2) return d2 - d1;
        return cmpTerms(t1, t2);
      });
      let out = "";
      terms.forEach((t, i) => {
        const a = t.c.abs();
        const body = termLatexBody(t.terms, a);
        if (i === 0) out += (t.c.isNeg() ? "-" : "") + body;
        else out += (t.c.isNeg() ? " - " : " + ") + body;
      });
      return out;
    }
  }
  function mergeTerms(t1, t2) {
    const m = new Map();
    for (const [n, e] of t1) m.set(n, (m.get(n) || 0) + e);
    for (const [n, e] of t2) m.set(n, (m.get(n) || 0) + e);
    const arr = [...m.entries()].filter(t => t[1] > 0);
    arr.sort((a, b) => a[0] < b[0] ? -1 : 1);
    return arr;
  }
  function expOf(key, name) { for (const [n, e] of Poly.parseKey(key)) if (n === name) return e; return 0; }
  function leadTermOf(p) {
    let best = null;
    for (const [k, v] of p.m) {
      const t = { terms: Poly.parseKey(k), c: v };
      if (best === null || cmpTerms(t, best) > 0) best = t;
    }
    return best;
  }
  function cmpTerms(t1, t2) { // 总度降序，再字典序
    const d1 = t1.terms.reduce((a, x) => a + x[1], 0), d2 = t2.terms.reduce((a, x) => a + x[1], 0);
    if (d1 !== d2) return d1 - d2;
    const k1 = t1.terms.map(x => x[0] + x[1]).join(","), k2 = t2.terms.map(x => x[0] + x[1]).join(",");
    return k1 < k2 ? -1 : k1 > k2 ? 1 : 0;
  }
  function sortTerms(terms) { terms.sort((a, b) => cmpTerms(a, b)); }
  function termDiv(a, b) { // a/b 项除法
    const m = new Map(b.terms.map(x => [x[0], x[1]]));
    const out = [];
    for (const [n, e] of a.terms) {
      const be = m.get(n) || 0;
      if (e < be) return null;
      const re = e - be; if (re > 0) out.push([n, re]);
    }
    for (const [n] of m) if (!a.terms.some(x => x[0] === n)) return null;
    return { terms: out.sort((x, y) => x[0] < y[0] ? -1 : 1), c: a.c.div(b.c) };
  }
  function polyFromTerm(t) { const m = new Map(); m.set(Poly.keyOf(t.terms), t.c); return new Poly(m); }
  function termLatexBody(terms, coeff) {
    const factors = terms.map(([n, e]) => e === 1 ? n : n + "^{" + e + "}").join("");
    if (coeff.isOne() && factors) return factors;
    if (!coeff.isInt() && factors) {
      // 分数系数折进分子：\frac{p·factors}{q}
      const num = (coeff.n === 1n ? "" : coeff.n + " ") + factors;
      return "\\frac{" + num + "}{" + coeff.d + "}";
    }
    return coeff.latex() + (factors ? " " + factors : "");
  }
  Poly.to = function (v) {
    if (v instanceof Poly) return v;
    if (v instanceof Frac) return Poly.c(v);
    if (typeof v === "number" || typeof v === "bigint") return Poly.c(Frac.from(v));
    throw new Error("Poly.to 不支持");
  };
  S.Poly = Poly;

  /* ============ UPoly：一元多项式（Frac 系数），cs[i]=x^i 系数 ============ */
  class UPoly {
    constructor(cs) { // 去除高位零
      let d = cs.length - 1;
      while (d >= 0 && cs[d].isZero()) d--;
      this.cs = cs.slice(0, d + 1);
    }
    static fromCoeffs(cs) { return new UPoly(cs); }
    static c(v) { return new UPoly([Frac.from(v)]); }
    static x(scale) { // scale·x
      const cs = [f0(), Frac.from(scale || 1)];
      return new UPoly(cs);
    }
    deg() { return this.cs.length - 1; }
    coeff(i) { return this.cs[i] || f0(); }
    isZero() { return this.cs.length === 0; }
    isConst() { return this.cs.length <= 1; }
    lc() { return this.cs[this.cs.length - 1]; }
    add(b) { b = UPoly.to(b); const n = Math.max(this.cs.length, b.cs.length); const cs = []; for (let i = 0; i < n; i++) cs.push(this.coeff(i).add(b.coeff(i))); return new UPoly(cs); }
    sub(b) { b = UPoly.to(b); const n = Math.max(this.cs.length, b.cs.length); const cs = []; for (let i = 0; i < n; i++) cs.push(this.coeff(i).sub(b.coeff(i))); return new UPoly(cs); }
    neg() { return new UPoly(this.cs.map(c => c.neg())); }
    mul(b) {
      b = UPoly.to(b);
      if (this.isZero() || b.isZero()) return new UPoly([]);
      const cs = new Array(this.cs.length + b.cs.length - 1).fill(null).map(() => f0());
      for (let i = 0; i < this.cs.length; i++) for (let j = 0; j < b.cs.length; j++) cs[i + j] = cs[i + j].add(this.cs[i].mul(b.cs[j]));
      return new UPoly(cs);
    }
    scale(fr) { return new UPoly(this.cs.map(c => c.mul(Frac.from(fr)))); }
    pow(e) { e = Number(e); let r = UPoly.c(1), b = this; while (e > 0) { if (e & 1) r = r.mul(b); b = b.mul(b); e >>= 1; } return r; }
    divmod(b) { // 欧几里得除法（系数域 ℚ）
      b = UPoly.to(b);
      if (b.isZero()) throw new Error("除以零");
      let r = new UPoly(this.cs.map(c => c));
      const q = []; const blc = b.lc();
      while (!r.isZero() && r.deg() >= b.deg()) {
        const f = r.lc().div(blc);
        q[r.deg() - b.deg()] = f;
        const shift = new Array(r.deg() - b.deg()).fill(null).map(() => f0()).concat(b.cs.map(c => c.mul(f)));
        r = r.sub(new UPoly(shift));
      }
      const qcs = []; for (let i = 0; i < q.length; i++) qcs.push(q[i] || f0());
      return { q: new UPoly(qcs), r };
    }
    div(b) { return this.divmod(b).q; }
    mod(b) { return this.divmod(b).r; }
    gcd(b) {
      b = UPoly.to(b);
      let a = this.clone2(), bb = b.clone2();
      while (!bb.isZero()) { const r = a.mod(bb); a = bb; bb = r; }
      if (a.isZero()) return a;
      return a.scale(a.lc().inv()); // 首一化
    }
    clone2() { return new UPoly(this.cs.map(c => c)); }
    evalAt(fr) { fr = Frac.from(fr); let acc = f0(); for (let i = this.cs.length - 1; i >= 0; i--) acc = acc.mul(fr).add(this.cs[i]); return acc; }
    deriv() { const cs = []; for (let i = 1; i < this.cs.length; i++) cs.push(this.cs[i].mul(Frac.from(BigInt(i)))); return new UPoly(cs); }
    monic() { if (this.isZero()) return this; return this.scale(this.lc().inv()); }
    // 有理根（p/q，p|a0，q|an）。返回排重升序数组
    rationalRoots() {
      if (this.isZero() || this.deg() === 0) return [];
      const a0 = this.coeff(0), an = this.lc();
      if (a0.isZero()) return [f0()].concat(new UPoly(this.cs.slice(1)).rationalRoots()).sort((x, y) => x.cmp(y));
      const ps = divisorsOf(a0.n), qs = divisorsOf(an.d);
      const roots = [];
      const seen = new Set();
      for (const p of ps) for (const q of qs) {
        for (const sg of [1n, -1n]) {
          const cand = new Frac(sg * p, q);
          if (this.evalAt(cand).isZero()) {
            const k = cand.toString();
            if (!seen.has(k)) { seen.add(k); roots.push(cand); }
          }
        }
      }
      return roots.sort((x, y) => x.cmp(y));
    }
    latex(vn) {
      vn = vn || "\\lambda";
      if (this.isZero()) return "0";
      const items = [];
      for (let i = this.cs.length - 1; i >= 0; i--) {
        const c = this.cs[i];
        if (c.isZero()) continue;
        const a = c.abs();
        let body;
        if (i === 0) body = a.latex();
        else {
          const xf = i === 1 ? vn : vn + "^{" + i + "}";
          if (a.isOne()) body = xf;
          else if (!a.isInt()) body = "\\frac{" + (a.n === 1n ? "" : a.n + " ") + xf + "}{" + a.d + "}";
          else body = a.latex() + " " + xf;
        }
        items.push({ neg: c.isNeg(), body });
      }
      let out = "";
      items.forEach((t, i) => {
        if (i === 0) out += (t.neg ? "-" : "") + t.body;
        else out += (t.neg ? " - " : " + ") + t.body;
      });
      return out;
    }
  }
  function divisorsOf(n) { // BigInt 非负整数因子（试除，教学规模足够）
    n = n < 0n ? -n : n;
    if (n === 0n) return [1n];
    const out = [];
    for (let i = 1n; i * i <= n; i++) {
      if (n % i === 0n) { out.push(i); if (i !== n / i) out.push(n / i); }
      if (i > 2000000n) break; // 安全阀
    }
    return out.sort((a, b) => (a < b ? -1 : 1));
  }
  UPoly.to = function (v) { if (v instanceof UPoly) return v; if (v instanceof Frac) return UPoly.c(v); throw new Error("UPoly.to 不支持"); };
  S.UPoly = UPoly;
  S.divisorsOf = divisorsOf;

  /* ============ QD：a + b√D（D>1 无平方因子整数）============ */
  class QD {
    constructor(a, b, D) { this.a = Frac.from(a); this.b = Frac.from(b); this.D = D; } // D: BigInt
    static fromFrac(fr) { return new QD(fr, f0(), 2n); }
    static sqrtOf(fr) { // √(Frac)：化为 k√D（k∈ℚ，D 无平方因子）
      fr = Frac.from(fr);
      if (fr.isNeg()) throw new Error("负数开方");
      const so = sqfreeFactor(fr.n), si = sqfreeFactor(fr.d);
      // √(n/d) = (sqN·√sfN)/(sqD·√sfD) = (sqN/(sqD·sfD))·√(sfN·sfD)
      const D0 = so.sf * si.sf;
      const fact = sqfreeFactor(D0); // 再提平方因子
      const kN = so.sq * fact.sq, kD = si.sq * si.sf;
      const k = new Frac(kN, kD);
      if (fact.sf === 1n) return new QD(k, f0(), 2n); // 纯有理
      return new QD(f0(), k, fact.sf);
    }
    static to(v) { if (v instanceof QD) return v; if (v instanceof Frac) return QD.fromFrac(v); throw new Error("QD.to 不支持"); }
    static unify(x, y) { // 有理元可并入另一方的域
      if (x.D === y.D) return [x, y];
      if (x.b.isZero()) return [new QD(x.a, x.b, y.D), y];
      if (y.b.isZero()) return [x, new QD(y.a, y.b, x.D)];
      throw new Error("根式域不同: √" + x.D + " vs √" + y.D);
    }
    add(b) { const [x, y] = QD.unify(this, QD.to(b)); return new QD(x.a.add(y.a), x.b.add(y.b), x.D); }
    sub(b) { const [x, y] = QD.unify(this, QD.to(b)); return new QD(x.a.sub(y.a), x.b.sub(y.b), x.D); }
    neg() { return new QD(this.a.neg(), this.b.neg(), this.D); }
    mul(b) {
      let [x, y] = QD.unify(this, QD.to(b));
      // (a+b√D)(c+d√D) = ac+bdD + (ad+bc)√D
      const a = x.a.mul(y.a).add(x.b.mul(y.b).mul(Frac.from(x.D)));
      const bb = x.a.mul(y.b).add(x.b.mul(y.a));
      return new QD(a, bb, x.D);
    }
    inv() {
      // 1/(a+b√D) = (a-b√D)/(a²-b²D)
      const den = this.a.mul(this.a).sub(this.b.mul(this.b).mul(Frac.from(this.D)));
      if (den.isZero()) throw new Error("根式元素不可逆");
      const invd = den.inv();
      return new QD(this.a.mul(invd), this.b.mul(invd).neg(), this.D);
    }
    div(b) { return this.mul(QD.to(b).inv()); }
    scale(fr) { return new QD(this.a.mul(Frac.from(fr)), this.b.mul(Frac.from(fr)), this.D); }
    isZero() { return this.a.isZero() && this.b.isZero(); }
    isRat() { return this.b.isZero(); }
    toFracIfRat() { return this.isRat() ? this.a : this; }
    conj() { return new QD(this.a, this.b.neg(), this.D); }
    latex() {
      if (this.b.isZero()) return this.a.latex();
      // b√D 部分：整数系数 → k√D；分数 → \frac{p√D}{q}
      const bAbs = this.b.abs();
      let rad;
      if (bAbs.isOne()) rad = "\\sqrt{" + this.D + "}";
      else if (bAbs.isInt()) rad = bAbs.latex() + "\\sqrt{" + this.D + "}";
      else rad = "\\frac{" + (bAbs.n === 1n ? "" : bAbs.n + " ") + "\\sqrt{" + this.D + "}}{" + bAbs.d + "}";
      const neg = this.b.isNeg();
      const term = neg ? "- " + rad : rad;
      if (this.a.isZero()) return term;
      return this.a.latex() + (neg ? " - " : " + ") + rad;
    }
  }
  function sqfreeFactor(n) { // n>=1 → {sq: 最大平方因子, sf: 无平方因子部分}
    n = n < 0n ? -n : n;
    let sq = 1n, m = n;
    for (let p = 2n; p * p <= m; p++) {
      while (m % (p * p) === 0n) { m /= p * p; sq *= p; }
    }
    return { sq, sf: m };
  }
  S.QD = QD;
  S.sqfreeFactor = sqfreeFactor;

  /* ============ CCplx：a+bi（精确）============ */
  class CCplx {
    constructor(re, im) { this.re = Frac.from(re); this.im = im === undefined ? f0() : Frac.from(im); }
    static to(v) { if (v instanceof CCplx) return v; if (v instanceof Frac) return new CCplx(v, f0()); throw new Error("CCplx.to 不支持"); }
    add(b) { b = CCplx.to(b); return new CCplx(this.re.add(b.re), this.im.add(b.im)); }
    sub(b) { b = CCplx.to(b); return new CCplx(this.re.sub(b.re), this.im.sub(b.im)); }
    neg() { return new CCplx(this.re.neg(), this.im.neg()); }
    mul(b) { b = CCplx.to(b); return new CCplx(this.re.mul(b.re).sub(this.im.mul(b.im)), this.re.mul(b.im).add(this.im.mul(b.re))); }
    inv() { const d = this.re.mul(this.re).add(this.im.mul(this.im)); if (d.isZero()) throw new Error("零不可逆"); const id = d.inv(); return new CCplx(this.re.mul(id), this.im.mul(id).neg()); }
    div(b) { return this.mul(CCplx.to(b).inv()); }
    scale(fr) { return new CCplx(this.re.mul(Frac.from(fr)), this.im.mul(Frac.from(fr))); }
    isZero() { return this.re.isZero() && this.im.isZero(); }
    latex() {
      const ipart = x => x.isOne() ? "i" : x.abs().latex() + "i";
      if (this.im.isZero()) return this.re.latex();
      if (this.re.isZero()) return this.im.isNeg() ? "- " + ipart(this.im) : ipart(this.im);
      return this.re.latex() + (this.im.isNeg() ? " - " : " + ") + ipart(this.im);
    }
  }
  S.CCplx = CCplx;
})(typeof S !== "undefined" ? S : (globalThis.S = globalThis.S || {}));
