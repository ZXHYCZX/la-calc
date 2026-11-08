// build-apk.js — 手工 APK 构建链（Windows/Linux/macOS 通用）
// 依赖环境：JAVA_HOME（JDK 17+）、ANDROID_SDK（或 ANDROID_SDK_ROOT/ANDROID_HOME，含 platforms;android-30 与 build-tools;34.0.0）
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const isWin = process.platform === "win32";
const SDK = process.env.ANDROID_SDK || process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT
  || (isWin ? "C:/Users/25402/rea-tools/android-sdk" : "");
const JDK = process.env.JAVA_HOME || (isWin ? "C:/Users/25402/rea-tools/jdk-21.0.13+9" : "");
if (!SDK) { console.error("缺少 ANDROID_SDK 环境变量"); process.exit(1); }
if (!JDK) { console.error("缺少 JAVA_HOME 环境变量"); process.exit(1); }

const BT = SDK + "/build-tools/34.0.0";
const AJAR = SDK + "/platforms/android-30/android.jar";
const JDKBIN = JDK + "/bin";
const ROOT = __dirname;
const OUT = path.join(ROOT, "out");
const KS = path.join(OUT, "release.keystore");
const KSPASS = process.env.KS_PASS || "lacalc2026";

function run(cmd, args) {
  console.log("+ " + cmd + " " + args.join(" ").slice(0, 140));
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: isWin && cmd.endsWith(".bat") });
  if (r.status !== 0) { console.error("FAILED:", cmd); process.exit(1); }
}
const tool = (dir, name) => path.join(dir, name + (isWin ? ".exe" : ""));
function runBat(dir, name, args) {
  const bin = path.join(dir, name + (isWin ? ".bat" : ""));
  const r = spawnSync(bin, args, { stdio: "inherit", shell: isWin });
  if (r.status !== 0) { console.error("FAILED:", name); process.exit(1); }
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.join(ROOT, "assets", "katex"), { recursive: true });

// 1) 引擎 bundle（最新）
run(process.execPath, [path.join(__dirname, "..", "src", "build.js")]);
fs.copyFileSync(path.join(__dirname, "..", "build", "engine-bundle.js"), path.join(ROOT, "assets", "engine-bundle.js"));

// 2) KaTeX 静态资源（仓库已含；缺失时从 node_modules 兜底复制）
const KD = path.join(__dirname, "..", "node_modules", "katex", "dist");
if (!fs.existsSync(path.join(ROOT, "assets", "katex", "katex.min.js"))) {
  fs.copyFileSync(KD + "/katex.min.js", ROOT + "/assets/katex/katex.min.js");
  fs.copyFileSync(KD + "/katex.min.css", ROOT + "/assets/katex/katex.min.css");
  fs.cpSync(KD + "/fonts", ROOT + "/assets/katex/fonts", { recursive: true });
}

// 3) aapt2 link（manifest；assets 由 adm-zip 注入，规避 Windows 反斜杠 bug）
const baseApk = path.join(OUT, "base.apk");
run(tool(BT, "aapt2"), ["link", "-o", baseApk,
  "-I", AJAR,
  "--manifest", path.join(ROOT, "AndroidManifest.xml"),
  "--min-sdk-version", "21", "--target-sdk-version", "34",
  "--auto-add-overlay"]);

// 4) javac（全部源文件）
const classesDir = path.join(OUT, "classes");
fs.mkdirSync(classesDir, { recursive: true });
const srcFiles = [];
(function walkSrc(d) {
  for (const f of fs.readdirSync(d)) {
    const p = d + "/" + f;
    if (fs.statSync(p).isDirectory()) walkSrc(p);
    else if (f.endsWith(".java")) srcFiles.push(p);
  }
})(path.join(ROOT, "java"));
run(tool(JDKBIN, "javac"), [
  "-source", "8", "-target", "8",
  "-bootclasspath", AJAR, "-classpath", AJAR,
  "-d", classesDir, ...srcFiles,
]);

// 5) classes.jar → d8 → classes.dex
const dexDir = path.join(OUT, "dex");
fs.mkdirSync(dexDir, { recursive: true });
const jarFile = path.join(OUT, "classes.jar");
run(tool(JDKBIN, "jar"), ["cf", jarFile, "-C", classesDir, "."]);
runBat(BT, "d8", ["--release", "--min-api", "21", "--lib", AJAR, "--output", dexDir, jarFile]);

// 6) classes.dex + assets 注入 APK（统一正斜杠路径）
const AdmZip = require("adm-zip");
const zip = new AdmZip(baseApk);
zip.addFile("classes.dex", fs.readFileSync(path.join(dexDir, "classes.dex")));
(function addAssets(d, prefix) {
  for (const f of fs.readdirSync(d)) {
    const p = d + "/" + f;
    if (fs.statSync(p).isDirectory()) addAssets(p, prefix + f + "/");
    else zip.addFile("assets/" + prefix + f, fs.readFileSync(p));
  }
})(path.join(ROOT, "assets"), "");
const unsigned = path.join(OUT, "unsigned.apk");
zip.writeZip(unsigned);

// 7) zipalign
const aligned = path.join(OUT, "aligned.apk");
run(tool(BT, "zipalign"), ["-f", "-p", "4", unsigned, aligned]);

// 8) keystore（缺则生成；CI 每次使用临时签名）
if (!fs.existsSync(KS)) {
  run(tool(JDKBIN, "keytool"), ["-genkeypair", "-keystore", KS, "-storepass", KSPASS,
    "-alias", "lacalc", "-keyalg", "RSA", "-keysize", "2048", "-validity", "10000",
    "-dname", "CN=LA Calc Offline"]);
}

// 9) apksigner
const finalApk = path.join(OUT, "la-calc.apk");
runBat(BT, "apksigner", ["sign", "--ks", KS, "--ks-pass", "pass:" + KSPASS,
  "--out", finalApk, aligned]);
runBat(BT, "apksigner", ["verify", finalApk]);

console.log("\nDONE:", finalApk, fs.statSync(finalApk).size, "bytes");
