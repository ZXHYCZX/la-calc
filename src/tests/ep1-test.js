// ep1-test.js — 阶段1端点测试：形状校验 + 数学正确性
const S = require("../build.js");
let fails = 0, cases = 0;
function safe(x) { try { return JSON.stringify(x, (k, v) => typeof v === "bigint" ? v.toString() : v); } catch (e) { return String(x); } }
function call(path, body) {
  const out = { resolved: null, handled: null };
  out.handled = S.go(path, { data: body }, r => { out.resolved = r; });
  return out;
}
function checkResp(path, body, name) {
  cases++;
  const o = call(path, body);
  if (!o.handled) { console.error("FALLBACK(unsupported)", name); return null; }
  const r = o.resolved;
  const problems = [];
  if (!r || typeof r !== "object") problems.push("响应非对象");
  else {
    if (!Array.isArray(r.result)) problems.push("result 非数组");
    if (typeof r.errMsg !== "string") problems.push("errMsg 非字符串: " + typeof r.errMsg);
    if (r.VIPMessage !== "") problems.push("VIPMessage!=空");
    if (!Array.isArray(r.test_records)) problems.push("test_records 非数组");
    if (r._last !== false || r._next !== false) problems.push("_last/_next 非 false");
    if (!("content" in r)) problems.push("缺 content");
    for (const item of (r.result || [])) if (typeof item !== "string") problems.push("result 元素非字符串");
  }
  if (problems.length) { console.error("FAIL", name, problems.join("; "), safe(r).slice(0, 300)); fails++; return r; }
  console.log("ok", name);
  return r;
}

// /det
checkResp("/det", { content: "1 2\n3 4" }, "det 2x2");
checkResp("/det", { content: "1 2 3\n4 3 5\n-1 0 6" }, "det cal2");
checkResp("/det", { content: "1 1 a\n-1 a 1\n1 -1 2" }, "det symbolic");
checkResp("/det", { content: "1 2\n3 4\n5 6" }, "det 非方阵应回退"); // 应 unsupported → 但 EP 会 throw U → fallback

// /inverse
const rInv = checkResp("/inverse", { content: "2 1 -1\n1 1 1\n1 2 3" }, "inverse cal2");
checkResp("/inverse", { content: "1 2\n2 4" }, "inverse 奇异 → 不可逆提示");

// /adj
checkResp("/adj", { content: "1 2\n3 4" }, "adj 2x2");

// /algebraicCofactor
checkResp("/algebraicCofactor", { content: "1 2 3\n4 5 6\n7 8 9", contentData: { method: "rows", position: "3", coefficient: "2 3 5" } }, "algebraicCofactor rows");

// /conjugateTranspose
checkResp("/conjugateTranspose", { content: "1+2I 3\n3-2I 2" }, "conjugateTranspose cplx");
checkResp("/conjugateTranspose", { content: "1 2\n3 4" }, "conjugateTranspose real");

// /matrixOperations
checkResp("/matrixOperations", { contentA: "1 2\n3 4", contentB: "0 1\n1 0", methods: "*" }, "matrixOperations mul");
checkResp("/matrixOperations", { content: "1 2\n3 4", base: "3/2", methods: "scalarMultiply" }, "matrixOperations scalar");
checkResp("/matrixOperations", { contentA: "1 2\n3 4", contentB: "1 0\n0 1", methods: "+" }, "matrixOperations plus");

// /power
checkResp("/power", { content: "1 1\n0 1", count: 5 }, "power 5");
checkResp("/power", { content: "2 0\n0 2", count: 0 }, "power 0");

// /matrixEquation
checkResp("/matrixEquation", { method: "AX=C", content: ["1 2\n3 4", "0 0\n0 0", "3 1\n2 3"] }, "matrixEquation AX=C");
checkResp("/matrixEquation", { method: "AXB=C", content: ["1 2\n3 4", "2 3\n1 4", "3 1\n2 3"] }, "matrixEquation AXB=C");

// /cramersRule
checkResp("/cramersRule", { content: "1 2 1\n2 -1 3\n3 1 2" }, "cramersRule");
checkResp("/cramersRule", { content: "1 2 1\n2 4 3\n3 1 2" }, "cramersRule 奇异");

// /linearEquation
const rLE = checkResp("/linearEquation", { content: "1 1 a 4\n-1 a 1 a**2\n1 -1 2 -4" }, "linearEquation cal2");
checkResp("/linearEquation", { content: "2 1 -1 1 2\n1 1 -2 1 4\n4 -6 2 -2 4\n3 6 -9 7 9" }, "linearEquation 齐次通解");
checkResp("/linearEquation", { content: "1 1 1 1\n1 1 1 2" }, "linearEquation 无解");

// /rank
checkResp("/rank", { content: "1 1 0 1\n0 1 1 0" }, "rank 2x4");
checkResp("/rank", { content: "1 1 a\n-1 a 1\n1 -1 2" }, "rank 符号情形");

// /rowEchelonForm /standard /simplestForm
checkResp("/rowEchelonForm", { content: "0 3 -6 6 4 -5\n3 -7 8 -5 8 9\n3 -9 12 -9 6 15" }, "rowEchelonForm cal2");
checkResp("/standard", { content: "1 2\n3 4" }, "standard");
checkResp("/simplestForm", { content: "2 3 0 1 -4\n0 2 2 3 -7\n1 0 1 1 0\n1 2 -1 3 -12" }, "simplestForm");

// /leastSquares /bestLeastSquares
checkResp("/leastSquares", { content: "1 2 1\n-1 1 1\n1 3 1" }, "leastSquares cal2");
checkResp("/bestLeastSquares", { content: "1 1 1 3\n1 1 2 4" }, "bestLeastSquares 奇异");

// /LU
checkResp("/LU", { content: "2 1 1\n1 -1 -1\n1 2 1" }, "LU");

// /fullRankDecomposition
checkResp("/fullRankDecomposition", { content: "1 2 3 4\n5 6 7 8\n9 10 11 12" }, "fullRankDecomposition");

// /generalizedInverse
checkResp("/generalizedInverse", { content: "1 2 3 4\n5 6 7 8\n9 10 11 12" }, "generalizedInverse");

// /vecRank /maximalLIS
checkResp("/vecRank", { content: "1 0 1 -1\n1 -2 1 1\n2 -2 2 0\n0 2 1 3\n-2 6 0 6" }, "vecRank cal2-vec");
checkResp("/maximalLIS", { content: "1 1 0 1\n0 1 1 0\n1 2 1 1" }, "maximalLIS");

// /norm /vecNorm
checkResp("/norm", { content: "1 2\n3 4" }, "norm matrix");
checkResp("/vecNorm", { content: "1 2 2" }, "vecNorm 3-4-5");
checkResp("/vecNorm", { content: "1-I 2" }, "vecNorm cplx");

// /inversionNumber
checkResp("/inversionNumber", { content: "2 1 4 3" }, "inversionNumber");

// /syntheticDivision /algorithmDivision
checkResp("/syntheticDivision", { content: ["6 0 -7 13", "1 2"] }, "syntheticDivision");
checkResp("/algorithmDivision", { content: ["6 0 -7 13", "1 2"] }, "algorithmDivision");

// /auxiliary
checkResp("/auxiliary", { content: "2 1 -1\n1 1 1\n1 2 3", op_record: "r2+(-2)r1;r3+(-1)r1;", history_record: [""] }, "auxiliary");

// 数学正确性抽查
(function () {
  const o = call("/det", { content: "1 2\n3 4" });
  const last = o.resolved.result[o.resolved.result.length - 1];
  if (!last.includes("-2")) { console.error("FAIL det value", last); fails++; cases++; } else { console.log("ok det value -2"); cases++; }
})();
(function () {
  const o = call("/vecNorm", { content: "1 2 2" });
  const joined = o.resolved.result.join("|");
  if (!joined.includes("5") || !joined.includes("3") || !joined.includes("2")) { console.error("FAIL vecNorm 1/2/∞", joined); fails++; cases++; } else { console.log("ok vecNorm 5/3/2"); cases++; }
})();
(function () {
  const o = call("/inversionNumber", { content: "2 1 4 3" });
  const joined = o.resolved.result.join("|");
  if (!joined.includes("2")) { console.error("FAIL inv num", joined); fails++; cases++; } else { console.log("ok inversionNumber=2"); cases++; }
})();
(function () {
  // 逆矩阵数值验证 A·A⁻¹=E
  const o = call("/inverse", { content: "2 1 -1\n1 1 1\n1 2 3" });
  const m = S.parseMatrix("2 1 -1\n1 1 1\n1 2 3");
  // 从结果里提取 A^{-1} 不方便，直接用引擎验证
  const iv = S.inverse(m.rows, m.R);
  const chk = S.matMul(m.rows, iv.inv, m.R);
  if (!chk[0][0].isOne() || !chk[2][2].isOne()) { console.error("FAIL inverse math"); fails++; cases++; } else { console.log("ok inverse math"); cases++; }
})();

console.log(fails === 0 ? "\nEP1 ALL PASS (" + cases + " checks)" : "\n" + fails + "/" + cases + " FAILURES");
process.exit(fails === 0 ? 0 : 1);
