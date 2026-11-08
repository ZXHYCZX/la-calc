// build.js — 引擎拼接器：Node 下可直接 require（逐文件共享 globalThis.S），
// 产出 build/engine-bundle.js（单 IIFE，注入 APK 用）
const fs = require("fs");
const path = require("path");

const FILES = [
  "frac.js",
  "algebra.js",
  "expr.js",
  "latex.js",
  "matrix.js",
  "linear.js",
  "endpoints1.js",
  "eigen.js",
  "endpoints.js",
];

function readSrc() {
  const dir = path.join(__dirname, "la-engine");
  return FILES
    .filter(f => { const ok = fs.existsSync(path.join(dir, f)); if (!ok) console.warn("[build] 跳过缺失文件", f); return ok; })
    .map(f => fs.readFileSync(path.join(dir, f), "utf8")).join("\n");
}

function makeBundle() {
  const body = readSrc();
  // 注意：顶层绝不能放 "use strict"（会令 app-service.js 整体严格化，破坏顶层 this["webpackJsonp"]）
  return `/* __LA_LOCAL_BUNDLE_V1 */(function(){
"use strict";
var S = (typeof S !== "undefined") ? S : {};
${body}
var G = (typeof globalThis !== "undefined") ? globalThis : (typeof self !== "undefined") ? self : Function("return this")();
if (typeof __LA_EXPORT__ !== "undefined") { __LA_EXPORT__(S); }
else { G.__LA = { can: S.can, go: S.go }; }
})();`;
}

// 供 APK 注入的 bundle
if (require.main === module) {
  const out = path.join(__dirname, "..", "build", "engine-bundle.js");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, makeBundle());
  console.log("wrote", out, fs.statSync(out).size, "bytes");
}

// Node 端：返回共享壳 S
module.exports = (function () {
  const src = readSrc();
  const wrapper = new Function(`
    var S = (typeof S !== "undefined") ? S : (globalThis.S = globalThis.S || {});
    ${src}
    return S;
  `);
  return wrapper();
})();
