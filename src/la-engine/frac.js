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
