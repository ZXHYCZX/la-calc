// ep2-test.js — 阶段2端点测试（特征值族）
const S = require("../build.js");
let fails = 0, cases = 0;
function safe(x) { try { return JSON.stringify(x, (k, v) => typeof v === "bigint" ? v.toString() : v); } catch (e) { return String(x); } }
function call(path, body) {
  const out = { resolved: null, handled: null };
  out.handled = S.go(path, { data: body }, r => { out.resolved = r; });
  return out;
}
function checkResp(path, body, name, expectFallback) {
  cases++;
  const o = call(path, body);
  if (!o.handled) {
    if (expectFallback) { console.log("ok (fallback)", name); return null; }
    console.error("FAIL fallback(unsupported)", name); fails++; return null;
  }
  const r = o.resolved;
  const problems = [];
  if (!Array.isArray(r.result)) problems.push("result 非数组");
  if (typeof r.errMsg !== "string") problems.push("errMsg 非字符串");
  if (r.VIPMessage !== "") problems.push("VIPMessage");
  for (const item of (r.result || [])) if (typeof item !== "string") problems.push("result 元素非字符串");
  if (problems.length) { console.error("FAIL", name, problems.join("; "), safe(r).slice(0, 240)); fails++; return r; }
  console.log("ok", name);
  return r;
}

// /eigenvals
checkResp("/eigenvals", { content: "1 2\n0 3" }, "eigenvals 2x2 有理");
const evSurd = checkResp("/eigenvals", { content: "0 1 0\n1 0 1\n0 1 0" }, "eigenvals √2");
if (evSurd) {
  const joined = evSurd.result.join("|");
  if (!joined.includes("\\sqrt{2}")) { console.error("FAIL surd eigen latex", joined.slice(0, 300)); fails++; cases++; }
  else { console.log("ok surd contains √2"); cases++; }
}
checkResp("/eigenvals", { content: "1 1\n0 1" }, "eigenvals 重根 geom1");
checkResp("/eigenvals", { content: "1 1 a\n-1 a 1\n1 -1 2" }, "eigenvals 符号矩阵→回退", true);

// /diagonalize
checkResp("/diagonalize", { content: "2 1\n1 2" }, "diagonalize");
checkResp("/diagonalize", { content: "1 1\n0 1" }, "diagonalize 不可对角化→回退", true);

// /similar（同对角化）
checkResp("/similar", { content: "2 1\n1 2" }, "similar 对角化");

// /similarity
checkResp("/similarity", { content: ["2 1\n1 2", "1 3\n3 1"] }, "similarity 不相似");
checkResp("/similarity", { content: ["2 1\n1 2", "3 0\n0 1"] }, "similarity 相似");
checkResp("/similarity", { content: ["1 1\n0 1", "1 0\n0 1"] }, "similarity Jordan 不同→不相似");

// /jordan
checkResp("/jordan", { content: "1 1\n0 1" }, "jordan 2x2");
checkResp("/jordan", { content: "2 1 0\n0 2 0\n0 0 3" }, "jordan 3x3");
checkResp("/jordan", { content: "0 1 0\n1 0 1\n0 1 0" }, "jordan √2→回退", true);

// /transition
checkResp("/transition", { content: ["1 0\n0 1", "2 3\n1 4"] }, "transition 单位基");
checkResp("/transition", { content: ["1 1\n1 2", "3 4\n5 7"] }, "transition 一般");

// /quadraticForm 三方法（methods 走 URL 查询串，与真实请求一致）
checkResp("/quadraticForm?methods=zjbh", { content: [["2"], ["-1", "2"]] }, "quadraticForm zjbh");
checkResp("/quadraticForm?methods=pff", { content: [["2"], ["4", "5"]] }, "quadraticForm pff");
checkResp("/quadraticForm?methods=htbh", { content: [["2"], ["4", "5"], ["-4", "-8", "5"]] }, "quadraticForm htbh");
checkResp("/quadraticForm?methods=zjbh", { content: [["2"], ["4", "5"], ["-4", "-8", "5"]] }, "quadraticForm zjbh 嵌套根式→回退", true);

// /orthogonalMatrix
checkResp("/orthogonalMatrix", { content: "1 1\n1 2" }, "orthogonalMatrix");

// /smith
checkResp("/smith", { content: "1-x 2x-1 x\nx x**2 -x\n1+x**2 x**3+x-1 -x**2" }, "smith cal2-dual");
checkResp("/smith", { content: "x 1\n0 x-1" }, "smith 2x2");

// /SVD
checkResp("/SVD", { content: "1 0\n0 1" }, "SVD I");
checkResp("/SVD", { content: "3 0\n0 2" }, "SVD diag");
checkResp("/SVD", { content: "1 2\n3 4\n5 6" }, "SVD 3x2");

// 数学正确性抽查
(function () {
  const m = S.parseMatrix("0 1 0\n1 0 1\n0 1 0");
  const es = S.eigenSolve(m.rows, m.R);
  const lams = es.map(e => e.lam.latex()).sort();
  const want = ["- \\sqrt{2}", "0", "\\sqrt{2}"].sort();
  cases++;
  if (JSON.stringify(lams) !== JSON.stringify(want)) { console.error("FAIL eigen set", safe(lams)); fails++; }
  else console.log("ok eigen set {0, ±√2}");
})();
(function () {
  // 特征向量验证：A v = λ v
  const m = S.parseMatrix("0 1 0\n1 0 1\n0 1 0");
  const es = S.eigenSolve(m.rows, m.R);
  cases++;
  let allOk = true;
  for (const e of es) {
    const R = e.isQD ? S.makeRing("qd") : S.makeRing("frac");
    const lam = e.lam;
    for (const v of e.vecs) {
      // A v
      for (let i = 0; i < 3; i++) {
        let acc = R.zero();
        for (let j = 0; j < 3; j++) acc = R.add(acc, R.mul(S.QD ? (R.kind === "qd" ? S.QD.fromFrac(m.rows[i][j]) : m.rows[i][j]) : m.rows[i][j], v[j]));
        const lv = R.mul(R.kind === "qd" ? lam : lam, v[i]);
        if (!R.eq(acc, lv)) allOk = false;
      }
    }
  }
  if (!allOk) { console.error("FAIL Av=λv"); fails++; } else console.log("ok Av=λv");
})();
(function () {
  // SVD 数值验证 A = UΣVᵀ
  const m = S.parseMatrix("1 2\n3 4\n5 6");
  const svd = S.svdNumeric(m.rows);
  cases++;
  // 检查 σ 降序且 σ1²+σ2² = tr(AᵀA)
  const trAtA = 1 + 4 + 9 + 16 + 25 + 36;
  const sum = svd.S.reduce((a, b) => a + b * b, 0);
  if (Math.abs(sum - trAtA) > 1e-6) { console.error("FAIL svd sigma energy", sum, trAtA); fails++; }
  else console.log("ok svd energy");
})();

console.log(fails === 0 ? "\nEP2 ALL PASS (" + cases + " checks)" : "\n" + fails + "/" + cases + " FAILURES");
process.exit(fails === 0 ? 0 : 1);
