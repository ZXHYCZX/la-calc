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
