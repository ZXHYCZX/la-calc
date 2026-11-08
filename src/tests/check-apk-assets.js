const AdmZip = require("H:/math/build/node_modules/adm-zip");
const names = new AdmZip("H:/math/la-app/out/la-calc.apk").getEntries().map(e => e.entryName);
const bs = String.fromCharCode(92);
console.log("katex.min.js:", names.includes("assets/katex/katex.min.js"));
console.log("fonts:", names.filter(n => n.startsWith("assets/katex/fonts/")).length);
console.log("backslash entries:", names.filter(n => n.includes(bs)).length);
console.log("total entries:", names.length);
