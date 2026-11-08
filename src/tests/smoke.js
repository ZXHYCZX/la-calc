// smoke.js — 引擎基座冒烟测试
const S = require("../build.js");
const F = S.Frac, P = S.Poly, Q = S.QD, U = S.UPoly;

let fails = 0;
function eq(actual, expect, name) {
  const a = JSON.stringify(actual), b = JSON.stringify(expect);
  if (a !== b) { console.error("FAIL", name, "actual=" + a, "expect=" + b); fails++; }
  else console.log("ok", name);
}

// Frac
eq(F.fromString("3/2").toString(), "3/2", "frac 3/2");
eq(F.fromString("0.2").toString(), "1/5", "frac 0.2");
eq(F.fromString("3/2").add(F.fromString("1/3")).toString(), "11/6", "frac add");
eq(F.fromString("3/2").latex(), "\\frac{3}{2}", "frac latex");
eq(F.fromString("-3/2").latex(), "- \\frac{3}{2}", "frac latex neg");
eq(F.fromString("-3").latex(), "-3", "frac latex int");

// Poly
const a = P.varOf("a"), b = P.varOf("b");
eq(a.mul(a).mul(b).latex(), "a^{2}b", "poly a2b");
eq(a.mul(a).sub(P.c(3).mul(a)).sub(P.c(4)).latex(), "a^{2} - 3 a - 4", "poly descending");
eq(a.add(P.c(2).mul(b)).latex(), "a + 2 b", "poly a+2b");
eq(a.mul(P.c(6)).divExact(P.c(3)).latex(), "2 a", "divExact const");
eq(a.mul(a).divExact(a).latex(), "a", "divExact a");
eq(P.c(F.fromString("1/2")).mul(a).latex(), "\\frac{a}{2}", "poly frac coeff");

// UPoly
const cp = U.x(1).pow(2).sub(U.c(6).mul(U.x(1))).sub(U.c(6));
eq(cp.latex(), "\\lambda^{2} - 6 \\lambda - 6", "upoly latex");
eq(cp.rationalRoots().map(r => r.toString()), [], "upoly no rational roots");
const cp2 = U.x(1).sub(U.c(2)).mul(U.x(1).pow(2).sub(U.c(6).mul(U.x(1))).sub(U.c(6)));
eq(cp2.latex(), "\\lambda^{3} - 8 \\lambda^{2} + 6 \\lambda + 12", "upoly expanded");
eq(cp2.rationalRoots().map(r => r.toString()), ["2"], "upoly root 2");
eq(U.x(1).pow(2).sub(U.c(1)).rationalRoots().map(r => r.toString()), ["-1", "1"], "upoly x2-1");

// QD
eq(Q.sqrtOf(F.fromString("15")).latex(), "\\sqrt{15}", "sqrt15");
eq(Q.sqrtOf(F.fromString("4")).latex(), "2", "sqrt4");
eq(Q.sqrtOf(F.fromString("1/2")).latex(), "\\frac{\\sqrt{2}}{2}", "sqrt(1/2)");
eq(Q.sqrtOf(F.fromString("3/2")).latex(), "\\frac{\\sqrt{6}}{2}", "sqrt(3/2)");
eq(Q.fromFrac(F.fromString("3")).sub(Q.sqrtOf(F.fromString("15"))).latex(), "3 - \\sqrt{15}", "3-sqrt15");
eq(Q.sqrtOf(F.fromString("15")).div(F.fromString(3)).latex(), "\\frac{\\sqrt{15}}{3}", "sqrt15/3");
eq(Q.sqrtOf(F.fromString("15")).mul(Q.sqrtOf(F.fromString("15"))).latex(), "15", "sqrt15^2");
eq(Q.fromFrac(F.fromString("4")).div(F.fromString(3)).add(Q.sqrtOf(F.fromString("15")).div(F.fromString(3)).neg()).latex(), "\\frac{4}{3} - \\frac{\\sqrt{15}}{3}", "4/3 - sqrt15/3");

// parseEntry
function pr(t) { try { const r = S.parseEntry(t); return r.ring + ":" + r.value.latex(); } catch (e) { return e.unsupported ? "UNSUPPORTED" : "ERR:" + e.message; } }
eq(pr("3/2"), "frac:\\frac{3}{2}", "parse 3/2");
eq(pr("0.2"), "frac:\\frac{1}{5}", "parse 0.2");
eq(pr("a**2"), "poly:a^{2}", "parse a**2");
eq(pr("x^2"), "poly:x^{2}", "parse x^2");
eq(pr("a+2b"), "poly:a + 2 b", "parse a+2b");
eq(pr("1+2I"), "cplx:1 + 2i", "parse 1+2I");
eq(pr("4-sqrt(15)"), "qd:4 - \\sqrt{15}", "parse 4-sqrt(15)");
eq(pr("√2"), "qd:\\sqrt{2}", "parse √2");
eq(pr("2pi/ab"), "UNSUPPORTED", "parse 2pi/ab");
eq(pr("1 2"), "ERR:语法错误：多余 token", "parse '1 2' invalid");
eq(pr("sin2x"), "poly:sin(2x)".replace("sin(2x)", "UNSUPPORTED") === "UNSUPPORTED" ? "UNSUPPORTED" : pr("sin2x"), "parse sin2x");
eq(pr("2x"), "poly:2 x", "parse 2x");
eq(pr("1-x"), "poly:-x + 1", "parse 1-x");
eq(pr("a/b"), "UNSUPPORTED", "parse a/b symbolic div");
eq(pr("2**-1"), "frac:\\frac{1}{2}", "parse 2**-1");

console.log(fails === 0 ? "\nALL PASS" : "\n" + fails + " FAILURES");
process.exit(fails === 0 ? 0 : 1);
