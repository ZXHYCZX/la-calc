// katex-smoke.js — 所有端点产物 LaTeX 用 KaTeX 渲染，确保 app 内置 KaTeX 能渲染
const S = require("../build.js");
const katex = require("../../build/node_modules/katex");

let fails = 0, rendered = 0;
function renderOne(latex, tag) {
  try {
    // 模拟 imgLatex 的调用方式
    let e = latex;
    if (e.indexOf("frac") !== -1) e = "\\def\\arraystretch{1.3}" + e;
    katex.renderToString(e, { displayMode: false, strict: "ignore", throwOnError: false });
    // throwOnError:false 时 parse 错误会输出 error 节点而不是抛异常——检测
    const html = katex.renderToString(e, { displayMode: false, strict: "ignore", throwOnError: true });
    rendered++;
  } catch (err) {
    console.error("KATEX-FAIL", tag, ":", (err.message || String(err)).slice(0, 140));
    console.error("  latex:", String(latex).slice(0, 160));
    fails++;
  }
}

const CASES = [
  ["/det", { content: "1 2\n3 4" }],
  ["/det", { content: "1 2 3\n4 3 5\n-1 0 6" }],
  ["/inverse", { content: "2 1 -1\n1 1 1\n1 2 3" }],
  ["/adj", { content: "1 2\n3 4" }],
  ["/algebraicCofactor", { content: "1 2 3\n4 5 6\n7 8 9", contentData: { method: "rows", position: "3", coefficient: "2 3 5" } }],
  ["/conjugateTranspose", { content: "1+2I 3\n3-2I 2" }],
  ["/matrixOperations", { contentA: "1 2\n3 4", contentB: "0 1\n1 0", methods: "*" }],
  ["/power", { content: "1 1\n0 1", count: 5 }],
  ["/matrixEquation", { method: "AX=C", content: ["1 2\n3 4", "0 0\n0 0", "3 1\n2 3"] }],
  ["/cramersRule", { content: "1 2 1 4\n2 -1 3 9\n3 1 2 7" }],
  ["/linearEquation", { content: "1 1 a 4\n-1 a 1 a**2\n1 -1 2 -4" }],
  ["/linearEquation", { content: "2 1 -1 1 2\n1 1 -2 1 4\n4 -6 2 -2 4\n3 6 -9 7 9" }],
  ["/rank", { content: "1 1 a\n-1 a 1\n1 -1 2" }],
  ["/rowEchelonForm", { content: "0 3 -6 6 4 -5\n3 -7 8 -5 8 9\n3 -9 12 -9 6 15" }],
  ["/standard", { content: "1 2\n3 4" }],
  ["/leastSquares", { content: "1 2 1\n-1 1 1\n1 3 1" }],
  ["/bestLeastSquares", { content: "1 1 1 3\n1 1 2 4" }],
  ["/LU", { content: "2 1 1\n1 -1 -1\n1 2 1" }],
  ["/fullRankDecomposition", { content: "1 2 3 4\n5 6 7 8\n9 10 11 12" }],
  ["/generalizedInverse", { content: "1 2 3 4\n5 6 7 8\n9 10 11 12" }],
  ["/vecRank", { content: "1 0 1 -1\n1 -2 1 1\n2 -2 2 0\n0 2 1 3\n-2 6 0 6" }],
  ["/norm", { content: "1 2\n3 4" }],
  ["/vecNorm", { content: "1-I 2" }],
  ["/inversionNumber", { content: "2 1 4 3" }],
  ["/syntheticDivision", { content: ["6 0 -7 13", "1 2"] }],
  ["/algorithmDivision", { content: ["6 0 -7 13", "1 2"] }],
  ["/auxiliary", { content: "2 1 -1\n1 1 1\n1 2 3", op_record: "r2+(-2)r1;r3+(-1)r1;" }],
  ["/eigenvals", { content: "0 1 0\n1 0 1\n0 1 0" }],
  ["/eigenvals", { content: "1 1\n0 1" }],
  ["/diagonalize", { content: "2 1\n1 2" }],
  ["/similarity", { content: ["2 1\n1 2", "3 0\n0 1"] }],
  ["/jordan", { content: "2 1 0\n0 2 0\n0 0 3" }],
  ["/transition", { content: ["1 1\n1 2", "3 4\n5 7"] }],
  ["/quadraticForm?methods=zjbh", { content: [["2"], ["-1", "2"]] }],
  ["/quadraticForm?methods=htbh", { content: [["2"], ["4", "5"], ["-4", "-8", "5"]] }],
  ["/orthogonalMatrix", { content: "1 1\n1 2" }],
  ["/smith", { content: "1-x 2x-1 x\nx x**2 -x\n1+x**2 x**3+x-1 -x**2" }],
  ["/SVD", { content: "1 2\n3 4\n5 6" }],
];

let caseCount = 0;
for (const [path, body] of CASES) {
  caseCount++;
  const out = { r: null };
  const handled = S.go(path, { data: body }, x => { out.r = x; });
  if (!handled) { console.log("skip(fallback)", path); continue; }
  const r = out.r;
  // content 字段渲染（若有）
  if (r.content) renderOne(r.content, path + " #content");
  // result 数组渲染
  for (let i = 0; i < (r.result || []).length; i++) renderOne(r.result[i], path + " #result[" + i + "]");
  if (r.textImgUrl) renderOne(r.textImgUrl, path + " #textImgUrl");
  if (r.imgUrl) renderOne(r.imgUrl, path + " #imgUrl");
}

console.log(fails === 0 ? "\nKATEX SMOKE PASS (" + rendered + " latex rendered, " + caseCount + " cases)" : "\n" + fails + " KATEX FAILURES");
process.exit(fails === 0 ? 0 : 1);
