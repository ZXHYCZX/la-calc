// matrix-smoke.js — matrix 核心冒烟
const S = require("../build.js");
let fails = 0;
function ok(cond, name, extra) { if (!cond) { console.error("FAIL", name, extra === undefined ? "" : safe(extra)); fails++; } else console.log("ok", name); }
function safe(x) { try { return JSON.stringify(x, (k, v) => typeof v === "bigint" ? v.toString() : v); } catch (e) { return String(x); } }

const F = S.Frac;

// 解析 + 基础
const A = S.parseMatrix("1 2\n3 4");
ok(A.kind === "frac", "parse frac");
ok(S.matLatex(A.rows, { R: A.R }) === "\\left[\\begin{matrix}1 & 2\\\\3 & 4\\end{matrix}\\right]", "matLatex bracket", S.matLatex(A.rows, { R: A.R }));

// det
const d = S.detGauss(A.rows, A.R);
ok(d.det.toString() === "-2", "det 2x2", d.det.toString());

// 逆
const inv = S.inverse(A.rows, A.R);
ok(inv.inv[1][1].toString() === "-1/2", "inv entry", inv.inv[1][1].toString());
const chk = S.matMul(A.rows, inv.inv, A.R);
ok(chk[0][0].isOne() && chk[1][1].isOne() && chk[0][1].isZero(), "A·A^-1=E");

// 伴随
const adj = S.adjugate(A.rows, A.R);
ok(adj[0][1].toString() === "-2", "adj entry", adj[0][1].toString());

// 秩
const rk = S.rankOf(S.parseMatrix("1 1 0 1\n0 1 1 0").rows, S.makeRing("frac"));
ok(rk.rank === 2, "rank 2", rk.rank);

// REF 步骤结构
const gf = S.gaussForward(S.parseMatrix("0 1\n1 0").rows, S.makeRing("frac"));
ok(gf.steps.length >= 2 && gf.steps[0].op === null && typeof gf.steps[1].op === "string", "gauss steps");
ok(gf.steps[1].op.includes("leftrightarrow"), "swap op text", gf.steps[1].op);

// 增广 LaTeX
const aug = S.matLatex(S.parseMatrix("1 1 a 4\n-1 a 1 a**2\n1 -1 2 -4").rows, { R: S.makeRing("poly"), after: 3, paren: "(" });
ok(aug.startsWith("\\left(\\begin{array}{ccc:c}"), "augmented array latex", aug.slice(0, 40));

// poly 矩阵 rank 情形分析
const rp = S.rankOf(S.parseMatrix("1 1 a\n-1 a 1\n1 -1 2").rows, S.makeRing("poly"));
ok(rp.rank === 3, "poly rank generic 3", safe(rp));
ok(rp.specialCases && rp.specialCases.some(cs => cs.value.toString() === "-1" && cs.rank === 2), "special case a=-1 rank 2", safe(rp.specialCases));
ok(rp.specialCases && rp.specialCases.some(cs => cs.value.toString() === "4" && cs.rank === 2), "special case a=4 rank 2", safe(rp.specialCases));

// QD 环
const qm = S.parseMatrix("4-sqrt(15) -1\n-1 4+sqrt(15)");
ok(qm.kind === "qd", "qd parse");
const dq = S.detGauss(qm.rows, qm.R);
ok(dq.det.latex() === "0", "qd det", dq.det.latex());

// 复数环
const cm = S.parseMatrix("1+2I 3\n3-2I 2");
ok(cm.kind === "cplx", "cplx parse");
const dc = S.detGauss(cm.rows, cm.R);
ok(dc.det.latex() === "-7 + 10i", "cplx det", dc.det.latex());

// cplx LaTeX 冒烟（不抛错即可）
console.log("cplx latex:", S.matLatex(cm.rows, { R: cm.R }));

console.log(fails === 0 ? "\nMATRIX SMOKE PASS" : "\n" + fails + " FAILURES");
process.exit(fails === 0 ? 0 : 1);
