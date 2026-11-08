// build-web.js — 构建纯静态 Web 版（任何浏览器可用）并打包 zip
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const VER = require(path.join(ROOT, "package.json")).version;
const DIST = path.join(ROOT, "dist");

// 1) 生成最新引擎 bundle
const r = spawnSync(process.execPath, [path.join(ROOT, "src", "build.js")], { stdio: "inherit" });
if (r.status !== 0) process.exit(1);

// 2) 组装 dist/web
const web = path.join(DIST, "web");
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(web, { recursive: true });
fs.cpSync(path.join(ROOT, "la-app", "assets"), web, { recursive: true });

// 3) zip
const AdmZip = require("adm-zip");
const z = new AdmZip();
z.addLocalFolder(web, "la-calc-web");
const out = path.join(DIST, `la-calc-web-v${VER}.zip`);
z.writeZip(out);
console.log("DONE:", out, fs.statSync(out).size, "bytes");
