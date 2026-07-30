const fs = require("fs");
const path = require("path");
const https = require("https");
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const ROOT = path.resolve(__dirname, "..");
const OUTER_JS = path.join(ROOT, "example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js");
const outerJsCode = fs.readFileSync(OUTER_JS, "utf8");
function httpGet(url) { return new Promise(r => { https.get(url, { rejectAuthorized: false, headers: { "User-Agent": "Mozilla/5.0" } }, res => { let b = ""; res.on("data", c => b += c); res.on("end", () => r({ status: res.statusCode, body: b, headers: res.headers })); }).on("error", e => r({ status: "ERR", body: "" })); }); }

(async () => {
  const ch = await httpGet("https://pmos.xj.sgcc.com.cn:20080/");
  const nsdMatch = ch.body.match(/\$_ts\.nsd=(\d+)/);
  const cdMatch = ch.body.match(/\$_ts\.cd="([^"]+)"/);
  const nsd = +nsdMatch[1], cd = cdMatch[1];
  const { runOuterVM } = require(path.join(ROOT, "extract_dyncode_20080.js"));
  const r = runOuterVM({ nsd, cd }, outerJsCode);
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require("module-alias")(ROOT);
  const gv = require("@src/handler/globalVarible");
  const utilsMod = require("@utils/");
  const tsFull = { nsd, cd, from: "https://pmos.xj.sgcc.com.cn:20080/", hasDebug: false, keynameNum: 909, cp3Override: r.cp3 };
  fs.writeFileSync("/tmp/t.json", JSON.stringify(tsFull));
  const argv = { file: "/tmp/t.json", jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(ROOT, "output"), level: "warn", _: ["makecookie"] };
  const codeRet = await utilsMod.getCode(argv.jsurls);
  argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
  gv._setAttr("argv", argv); require("@src/config/")(gv); gv._setAttr("_ts", tsFull);
  const Coder = require("@src/handler/Coder");
  const coder = new Coder({ hasCodemap: true, hasDebug: false, ...tsFull }, gv.config.immucfg);
  const runRet = coder.run(); runRet["$_ts"].cp[3] = r.cp3; gv.config.codemap = runRet.codemap;

  const parser = require("@src/handler/parser/");
  parser.init(coder);
  
  const ascii2string = require("@src/handler/parser/common/ascii2string");
  const uuid = require("@src/handler/parser/common/uuid");
  
  // 1. Dump cp[1] (keynames)
  console.log("=== cp[1] keynames ===");
  console.log("cp[1] length:", gv.ts.cp[1].length);
  console.log("cp[1]:", JSON.stringify(gv.ts.cp[1]));
  
  // 2. Dump functionsNameSort
  console.log("\n=== functionsNameSort ===");
  console.log("count:", coder.functionsNameSort.length);
  for (let i = 0; i < coder.functionsNameSort.length; i++) {
    const f = coder.functionsNameSort[i];
    const numMatch = f.code.match(/\[(\d+)\]/);
    const num = numMatch ? +numMatch[1] : -1;
    console.log(`  [${i}] name=${f.name} num=${num} code="${f.code.substring(0, 80)}..."`);
  }
  
  // 3. Dump mainFunctionIdx and main function code structure
  console.log("\n=== mainFunction ===");
  console.log("mainFunctionIdx:", coder.mainFunctionIdx);
  const mainFnCode = coder.code.slice(...coder.mainFunctionIdx);
  console.log("mainFnCode length:", mainFnCode.length);
  console.log("mainFnCode first 200:", mainFnCode.substring(0, 200));
  
  // 4. Check how coder.code is built - is it from the outer JS?
  console.log("\n=== coder.code structure ===");
  console.log("coder.code length:", coder.code.length);
  console.log("coder.code first 100:", JSON.stringify(coder.code.substring(0, 100)));
  
  // 5. Check if functionsNameSort names come from cp[1]
  console.log("\n=== name mapping ===");
  for (let i = 0; i < Math.min(10, coder.functionsNameSort.length); i++) {
    const f = coder.functionsNameSort[i];
    // Check if name appears in cp[1]
    const cp1Idx = gv.ts.cp[1].indexOf(f.name);
    console.log(`  [${i}] name="${f.name}" cp1Idx=${cp1Idx}`);
  }
  
  // 6. Dump the function definition pattern from coder.code
  // The functions are defined as: function NAME(args){var VAR=[NUM];Array.prototype.push.apply(VAR,arguments);return INNER.apply(this,VAR);}
  console.log("\n=== function definitions in coder.code ===");
  const funcDefPattern = /function (\$\w+)\(\)\{var (\$\w+)=(\d+);Array\.prototype\.push\.apply\((\$\w+),arguments\);return (\$\w+)\.apply\(this,(\$\w+)\);\}/g;
  let match;
  let funcDefs = [];
  while ((match = funcDefPattern.exec(coder.code)) !== null) {
    funcDefs.push({
      name: match[1],
      varName: match[2],
      num: +match[3],
      inner: match[5],
      pos: match.index,
    });
  }
  console.log("Found function definitions:", funcDefs.length);
  for (const f of funcDefs) {
    console.log(`  name=${f.name} num=${f.num} inner=${f.inner} pos=${f.pos}`);
  }
  
  process.exit(0);
})().catch(e => { console.error("ERR:", e.message, e.stack); process.exit(1); });
