const fs = require("fs");
const path = require("path");
const https = require("https");
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const ROOT = path.resolve(__dirname, "..");
const OUTER_JS = path.join(ROOT, "example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js");
const outerJsCode = fs.readFileSync(OUTER_JS, "utf8");
function httpGet(url) { return new Promise(r => { https.get(url, { rejectAuthorized: false, headers: { "User-Agent": "Mozilla/5.0" } }, res => { let b = ""; res.on("data", c => b += c); res.on("end", () => r({ status: res.statusCode, body: b, headers: res.headers })); }).on("error", e => r({ status: "ERR", body: "" })); }); }

(async () => {
  const allFnSorts = [];
  for (let round = 0; round < 5; round++) {
    const ch = await httpGet("https://pmos.xj.sgcc.com.cn:20080/");
    const nsdMatch = ch.body.match(/\$_ts\.nsd=(\d+)/);
    const cdMatch = ch.body.match(/\$_ts\.cd="([^"]+)"/);
    if (!nsdMatch) continue;
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
    const runRet = coder.run();
    runRet["$_ts"].cp[3] = r.cp3;
    gv.config.codemap = runRet.codemap;
    const parser = require("@src/handler/parser/");
    parser.init(coder);
    
    const cp1 = gv.ts.cp[1] || [];
    const fnSort = coder.functionsNameSort.map((f, i) => {
      const numMatch = f.code.match(/\[(\d+)\]/);
      const num = numMatch ? +numMatch[1] : -1;
      const nameIdx = cp1.indexOf(f.name);
      const varMatch = f.code.match(/var (\$\w+)\[/);
      const varName = varMatch ? varMatch[1] : "";
      const varIdx = cp1.indexOf(varName);
      const innerMatch = f.code.match(/return (\$\w+)\.apply/);
      const innerName = innerMatch ? innerMatch[1] : "";
      const innerIdx = cp1.indexOf(innerName);
      return { idx: i, num, nameIdx, varIdx, innerIdx };
    });
    allFnSorts.push({ round, fnSort, mainFunctionIdx: [...coder.mainFunctionIdx], mainFnLen: coder.code.slice(...coder.mainFunctionIdx).length });
  }
  
  // Compare NUMs and indices across sessions
  console.log("=== COMPARISON ACROSS SESSIONS ===");
  const ref = allFnSorts[0].fnSort;
  for (let s = 1; s < allFnSorts.length; s++) {
    const sess = allFnSorts[s].fnSort;
    let numsMatch = true;
    let indicesMatch = true;
    for (let i = 0; i < ref.length; i++) {
      if (ref[i].num !== sess[i].num) { console.log(`  [${i}] NUM: ref=${ref[i].num} sess=${sess[i].num}`); numsMatch = false; }
      if (ref[i].nameIdx !== sess[i].nameIdx || ref[i].varIdx !== sess[i].varIdx || ref[i].innerIdx !== sess[i].innerIdx) {
        console.log(`  [${i}] IDX: ref=(${ref[i].nameIdx},${ref[i].varIdx},${ref[i].innerIdx}) sess=(${sess[i].nameIdx},${sess[i].varIdx},${sess[i].innerIdx})`);
        indicesMatch = false;
      }
    }
    console.log(`session${s}: nums=${numsMatch} indices=${indicesMatch}`);
  }
  
  console.log("\n=== SITE CONSTANTS ===");
  console.log("NUMs:", JSON.stringify(ref.map(f => f.num)));
  console.log("nameIdx:", JSON.stringify(ref.map(f => f.nameIdx)));
  console.log("varIdx:", JSON.stringify(ref.map(f => f.varIdx)));
  console.log("innerIdx:", JSON.stringify(ref.map(f => f.innerIdx)));
  console.log("mainFunctionIdx:", JSON.stringify(allFnSorts.map(s => s.mainFunctionIdx)));
  console.log("mainFnLen:", JSON.stringify(allFnSorts.map(s => s.mainFnLen)));
  
  process.exit(0);
})().catch(e => { console.error("ERR:", e.message, e.stack); process.exit(1); });
