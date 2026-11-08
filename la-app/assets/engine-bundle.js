/* __LA_LOCAL_BUNDLE_V1 */(function(){
"use strict";
var S = (typeof S !== "undefined") ? S : {};
// frac.js — 精确有理数（BigInt），共享壳 S 由 build.js 提供
(function (S) {
  "use strict";

  function bgcd(a, b) {
    a = a < 0n ? -a : a; b = b < 0n ? -b : b;
    while (b) { const t = a % b; a = b; b = t; }
    return a;
  }

  class Frac {
    constructor(n, d) {
      if (d === undefined || d === 0n) { if (d === 0n) throw new Error("分母为0"); d = 1n; }
      if (d < 0n) { n = -n; d = -d; }
      const g = bgcd(n, d) || 1n;
      this.n = n / g; this.d = d / g;
    }
    static from(v) {
      if (v instanceof Frac) return v;
      if (typeof v === "bigint") return new Frac(v, 1n);
      if (typeof v === "number") {
        if (!Number.isInteger(v)) {
          // 有限小数精确化
          const s = String(v); const i = s.indexOf(".");
          const digits = s.length - i - 1;
          const den = 10n ** BigInt(digits);
          const num = BigInt(s.replace(".", "").replace("-", "")) * (v < 0 ? -1n : 1n);
          return new Frac(num, den);
        }
        return new Frac(BigInt(v), 1n);
      }
      throw new Error("Frac.from 不支持: " + v);
    }
    static fromString(str) {
      const s = String(str).trim();
      if (/^-?\d+$/.test(s)) return new Frac(BigInt(s), 1n);
      const m = s.match(/^(-?\d+)\/(-?\d+)$/);
      if (m) return new Frac(BigInt(m[1]), BigInt(m[2]));
      if (/^-?\d*\.\d+$/.test(s)) {
        const neg = s.startsWith("-");
        const t = s.replace("-", "");
        const [ip, fp] = t.split(".");
        const num = BigInt((ip || "0") + fp) * (neg ? -1n : 1n);
        return new Frac(num, 10n ** BigInt(fp.length));
      }
      throw new Error("无法解析数字: " + s);
    }
    add(b) { b = Frac.from(b); return new Frac(this.n * b.d + b.n * this.d, this.d * b.d); }
    sub(b) { b = Frac.from(b); return new Frac(this.n * b.d - b.n * this.d, this.d * b.d); }
    mul(b) { b = Frac.from(b); return new Frac(this.n * b.n, this.d * b.d); }
    div(b) { b = Frac.from(b); if (b.n === 0n) throw new Error("除以零"); return new Frac(this.n * b.d, this.d * b.n); }
    neg() { return new Frac(-this.n, this.d); }
    inv() { if (this.n === 0n) throw new Error("除以零"); return new Frac(this.d, this.n); }
    pow(e) { // e 整数
      e = Number(e);
      if (e === 0) return new Frac(1n, 1n);
      if (e > 0) { let r = this; for (let i = 1; i < e; i++) r = r.mul(this); return r; }
      return this.inv().pow(-e);
    }
    cmp(b) { b = Frac.from(b); const l = this.n * b.d, r = b.n * this.d; return l < r ? -1 : l > r ? 1 : 0; }
    isZero() { return this.n === 0n; }
    isNeg() { return this.n < 0n; }
    isInt() { return this.d === 1n; }
    isOne() { return this.n === 1n && this.d === 1n; }
    isNegOne() { return this.n === -1n && this.d === 1n; }
    abs() { return this.n < 0n ? this.neg() : this; }
    sign() { return this.n < 0n ? -1 : this.n > 0n ? 1 : 0; }
    toNumber() { return Number(this.n) / Number(this.d); }
    toString() { return this.d === 1n ? this.n.toString() : this.n + "/" + this.d; }
    // sympy 风格 LaTeX
    latex() {
      if (this.d === 1n) return this.n.toString();
      const sign = this.n < 0n ? "- " : "";
      const num = (this.n < 0n ? -this.n : this.n).toString();
      return sign + "\\frac{" + num + "}{" + this.d.toString() + "}";
    }
    // 作为乘积因子时的 latex（-1 系数等）
    static zero() { return new Frac(0n, 1n); }
    static one() { return new Frac(1n, 1n); }
  }
  S.Frac = Frac;
  S.bgcd = bgcd;
})(typeof S !== "undefined" ? S : (globalThis.S = globalThis.S || {}));

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

// expr.js — 矩阵元素表达式解析器（语法对齐官方帮助表）
(function (S) {
  "use strict";
  const Frac = S.Frac;

  const RESERVED = new Set(["pi", "I", "sqrt", "sin", "cos", "tan", "cot", "sec", "csc", "ln", "log", "abs", "exp", "lambda"]);

  function tokenize(src) {
    const toks = [];
    let i = 0;
    const s = String(src);
    while (i < s.length) {
      const ch = s[i];
      if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") { i++; continue; }
      if (ch >= "0" && ch <= "9" || (ch === "." && s[i + 1] >= "0" && s[i + 1] <= "9")) {
        let j = i;
        while (j < s.length && ((s[j] >= "0" && s[j] <= "9") || s[j] === ".")) j++;
        toks.push({ t: "num", v: s.slice(i, j) }); i = j; continue;
      }
      if (/[A-Za-z]/.test(ch)) {
        let j = i;
        while (j < s.length && /[A-Za-z]/.test(s[j])) j++;
        toks.push({ t: "id", v: s.slice(i, j) }); i = j; continue;
      }
      if (ch === "√") { toks.push({ t: "sqrt" }); i++; continue; }
      if (ch === "*" && s[i + 1] === "*") { toks.push({ t: "pow" }); i += 2; continue; }
      if (ch === "^") { toks.push({ t: "pow" }); i++; continue; }
      if ("+-*/()".includes(ch)) { toks.push({ t: ch }); i++; continue; }
      // λ 及其它单字符符号
      if (/[\u0370-\u03ff\u1d00-\u1d7f]/.test(ch)) { toks.push({ t: "id", v: ch }); i++; continue; }
      throw new UnsupportedError("无法识别的字符: " + ch);
    }
    return toks;
  }
  class UnsupportedError extends Error { constructor(m) { super(m); this.unsupported = true; } }
  S.UnsupportedError = UnsupportedError;

  // AST: {k:'num',v:Frac} {k:'sym',v:name} {k:'bin',op,a,b} {k:'neg',a} {k:'call',name,a} {k:'sqrt',a}
  function parse(src) {
    const toks = tokenize(src);
    let p = 0;
    const peek = () => toks[p];
    const eat = (t) => { const tk = toks[p]; if (!tk || tk.t !== t) throw new Error("语法错误：期望 " + t); p++; return tk; };
    function expr() {
      let a = term();
      while (peek() && (peek().t === "+" || peek().t === "-")) { const op = eat(peek().t).t; a = { k: "bin", op, a, b: term() }; }
      return a;
    }
    function startsFactor(tk) {
      return tk && (tk.t === "num" || tk.t === "id" || tk.t === "(" || tk.t === "sqrt");
    }
    function term() {
      let a = factor();
      for (;;) {
        const tk = peek();
        if (tk && tk.t === "*") { eat("*"); a = { k: "bin", op: "*", a, b: factor() }; }
        else if (tk && tk.t === "/") { eat("/"); a = { k: "bin", op: "/", a, b: factor() }; }
        else if (tk && tk.t !== "num" && startsFactor(tk)) { a = { k: "bin", op: "*", a, b: factor() }; }
        else break;
      }
      return a;
    }
    function factor() {
      const tk = peek();
      if (tk && tk.t === "-") { eat("-"); return { k: "neg", a: factor() }; }
      if (tk && tk.t === "+") { eat("+"); return factor(); }
      return power();
    }
    function power() {
      const a = atom();
      const tk = peek();
      if (tk && tk.t === "pow") { eat("pow"); const e = factor(); return { k: "bin", op: "^", a, b: e }; }
      return a;
    }
    function atom() {
      const tk = peek();
      if (!tk) throw new Error("语法错误：意外结束");
      if (tk.t === "num") { eat("num"); return { k: "num", v: Frac.fromString(tk.v) }; }
      if (tk.t === "id") {
        eat("id");
        const name = tk.v;
        if (name === "sqrt" || name === "√") { const arg = atom(); return { k: "sqrt", a: arg }; }
        if (RESERVED.has(name) && name.length > 1) {
          // 函数/常数：sin(x) 等
          if (peek() && peek().t === "(") { eat("("); const a = expr(); eat(")"); return { k: "call", name, a }; }
          if (name === "pi") return { k: "sym", v: "pi" };
          if (name === "I") return { k: "sym", v: "I" };
          return { k: "call", name, a: { k: "num", v: f1() } };
        }
        // 多字母 → 单字母乘积
        if (name.length > 1) {
          let a = { k: "sym", v: name[0] };
          for (let i = 1; i < name.length; i++) a = { k: "bin", op: "*", a, b: { k: "sym", v: name[i] } };
          return a;
        }
        return { k: "sym", v: name };
      }
      if (tk.t === "sqrt") { eat("sqrt"); const arg = atom(); return { k: "sqrt", a: arg }; }
      if (tk.t === "(") { eat("("); const a = expr(); eat(")"); return a; }
      throw new Error("语法错误：意外 token " + tk.t);
    }
    const f1 = () => Frac.one();
    const out = expr();
    if (p < toks.length) throw new Error("语法错误：多余 token");
    return out;
  }

  // 环操作表
  function polyRing() {
    const P = S.Poly;
    return {
      num: fr => P.c(fr), sym: n => { if (n === "pi") throw new UnsupportedError("pi 符号未支持本地计算"); if (n === "I") throw new UnsupportedError("I 应走复数环"); return P.varOf(n); },
      add: (a, b) => a.add(b), sub: (a, b) => a.sub(b), mul: (a, b) => a.mul(b),
      div: (a, b) => { if (b.isConst()) { if (b.toConst().isZero()) throw new Error("除以零"); return a.scale(b.toConst().inv()); } throw new UnsupportedError("符号除法未支持"); },
      neg: a => a.neg(), pow: (a, e) => a.pow(e), sqrt: () => { throw new UnsupportedError("符号表达式含根式"); },
      isZero: a => a.isZero(), zero: () => P.c(0),
    };
  }
  function fracRing() {
    const fr = v => Frac.from(v);
    return {
      num: fr2 => fr2, sym: n => { throw new UnsupportedError("数字环遇到符号 " + n); },
      add: (a, b) => a.add(b), sub: (a, b) => a.sub(b), mul: (a, b) => a.mul(b),
      div: (a, b) => { if (b.isZero()) throw new Error("除以零"); return a.div(b); },
      neg: a => a.neg(), pow: (a, e) => a.pow(e),
      sqrt: a => {
        const sf = S.sqfreeFactor(a.n).sf === 1n && S.sqfreeFactor(a.d).sf === 1n;
        if (sf) { // 完全平方 → 有理
          return S.QD.sqrtOf(a).a;
        }
        throw new UnsupportedError("非平方数根式");
      },
      isZero: a => a.isZero(), zero: () => Frac.zero(),
    };
  }
  function qdRing() {
    const Q = S.QD;
    return {
      num: fr => Q.fromFrac(fr), sym: n => { throw new UnsupportedError("根式环遇到符号 " + n); },
      add: (a, b) => a.add(b), sub: (a, b) => a.sub(b), mul: (a, b) => a.mul(b),
      div: (a, b) => a.div(b), neg: a => a.neg(), pow: (a, e) => a.pow(e),
      sqrt: a => {
        if (a instanceof Frac) return Q.sqrtOf(a);
        if (a instanceof Q) { if (!a.isRat()) throw new UnsupportedError("√(a+b√D) 未支持"); return Q.sqrtOf(a.a); }
        throw new UnsupportedError("sqrt 参数类型");
      },
      isZero: a => a.isZero(), zero: () => Q.fromFrac(Frac.zero()),
    };
  }
  function cplxRing() {
    const C = S.CCplx;
    return {
      num: fr => C.to(fr), sym: n => { if (n === "I") return new C(Frac.zero(), Frac.one()); throw new UnsupportedError("复数环遇到符号 " + n); },
      add: (a, b) => a.add(b), sub: (a, b) => a.sub(b), mul: (a, b) => a.mul(b),
      div: (a, b) => a.div(b), neg: a => a.neg(), pow: (a, e) => a.pow(e),
      sqrt: () => { throw new UnsupportedError("复数环含根式"); },
      isZero: a => a.isZero(), zero: () => new C(Frac.zero(), Frac.zero()),
    };
  }
  S.rings = { frac: fracRing, poly: polyRing, qd: qdRing, cplx: cplxRing };

  // 指数求值：AST 无符号变量时用纯数字环求值，否则不支持
  function tryEvalConst(node) {
    let hasSym = false;
    (function scan(n) {
      if (n.k === "sym") hasSym = true;
      else if (n.k === "neg" || n.k === "sqrt" || n.k === "call") { if (n.a) scan(n.a); }
      else if (n.k === "bin") { scan(n.a); scan(n.b); }
    })(node);
    if (hasSym) throw new UnsupportedError("指数须为常数");
    const v = evalAst(node, fracRing());
    if (!Number.isInteger(v.toNumber())) throw new UnsupportedError("指数须为整数");
    return v.toNumber();
  }

  function evalAst(node, R) {
    switch (node.k) {
      case "num": return R.num(node.v);
      case "sym": return R.sym(node.v);
      case "neg": return R.neg(evalAst(node.a, R));
      case "sqrt": {
        const a = evalAst(node.a, R);
        return R.sqrt(a);
      }
      case "call": {
        const a = evalAst(node.a, R);
        if (node.name === "abs") { // 仅常数
          const v = a.abs ? a.abs() : null; if (v) return v;
        }
        throw new UnsupportedError("函数 " + node.name + " 未支持本地计算");
      }
      case "bin": {
        const a = evalAst(node.a, R), b = evalAst(node.b, R);
        switch (node.op) {
          case "+": return R.add(a, b);
          case "-": return R.sub(a, b);
          case "*": return R.mul(a, b);
          case "/": return R.div(a, b);
          case "^": {
            const e = tryEvalConst(node.b);
            if (e < 0) return R.div(R.num(Frac.one()), R.pow(a, -e));
            return R.pow(a, e);
          }
        }
      }
    }
    throw new Error("AST 节点未知: " + node.k);
  }

  // 解析单元格 → {ring, value}
  S.parseEntry = function (text) {
    const src = String(text).trim();
    if (src === "" ) return { ring: "frac", value: Frac.zero(), isBlank: true };
    const ast = parse(src);
    // 环选择：扫 AST
    let hasI = false, hasSqrt = false, hasSym = false, hasPi = false;
    (function scan(n) {
      if (n.k === "sym") { if (n.v === "I") hasI = true; else if (n.v === "pi") hasPi = true; else hasSym = true; }
      else if (n.k === "sqrt") { hasSqrt = true; if (n.a) scan(n.a); }
      else if (n.k === "neg" || n.k === "call") { if (n.a) scan(n.a); }
      else if (n.k === "bin") { scan(n.a); scan(n.b); }
    })(ast);
    if (hasI) {
      if (hasSym || hasSqrt || hasPi) throw new UnsupportedError("复数与符号混用");
      return { ring: "cplx", value: evalAst(ast, cplxRing()) };
    }
    if (hasSqrt) {
      if (hasSym || hasPi) throw new UnsupportedError("根式与符号混用");
      return { ring: "qd", value: evalAst(ast, qdRing()) };
    }
    if (hasSym || hasPi) {
      return { ring: "poly", value: evalAst(ast, polyRing()) };
    }
    return { ring: "frac", value: evalAst(ast, fracRing()) };
  };
  S.exprParse = parse;
})(typeof S !== "undefined" ? S : (globalThis.S = globalThis.S || {}));

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

// endpoints.js — 端点路由：can(path) / go(path, body, resolve)
(function (S) {
  "use strict";

  const REG = {};
  function register(map) { for (const k in map) REG[k] = map[k]; }
  if (S.EP1) register(S.EP1);
  if (S.EP2) register(S.EP2);

  // path 归一化：去掉 query
  S.splitPath = function (e) {
    const s = String(e || "");
    const qi = s.indexOf("?");
    const path = qi < 0 ? s : s.slice(0, qi);
    const query = {};
    if (qi >= 0) {
      for (const kv of s.slice(qi + 1).split("&")) {
        const i = kv.indexOf("=");
        if (i > 0) query[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1));
      }
    }
    return { path, query };
  };

  S.can = function (e, r) {
    const { path } = S.splitPath(e);
    return !!REG[path];
  };

  // 返回 true 表示已处理（resolve 已调用）；false 表示本地不支持 → 调用方继续走网络
  S.go = function (e, r, resolve) {
    const { path, query } = S.splitPath(e);
    const handler = REG[path];
    if (!handler) return false;
    const body = Object.assign({}, (r && r.data) || {}, { __query: query });
    try {
      const out = handler(body);
      resolve(out);
      return true;
    } catch (err) {
      if (err && err.unsupported) return false; // 联网回退
      // 其它错误：本地失败，给出提示（不 reject，页面会显示红字）
      resolve({
        result: ["\\text{本地计算失败：}" + (err && err.message ? err.message.replace(/[\\{}]/g, "") : "未知错误") + "\\text{，请联网重试}"],
        content: "", errMsg: "本地计算失败，请联网重试",
        VIPMessage: "", test_records: [], _last: false, _next: false,
      });
      return true;
    }
  };
})(typeof S !== "undefined" ? S : (globalThis.S = globalThis.S || {}));

var G = (typeof globalThis !== "undefined") ? globalThis : (typeof self !== "undefined") ? self : Function("return this")();
if (typeof __LA_EXPORT__ !== "undefined") { __LA_EXPORT__(S); }
else { G.__LA = { can: S.can, go: S.go }; }
})();