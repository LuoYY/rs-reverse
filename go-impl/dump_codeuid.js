const fs = require("fs");
const path = require("path");
const https = require("https");
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const ROOT = path.resolve(__dirname, "..");
const OUTER_JS = path.join(ROOT, "example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js");
const outerJsCode = fs.readFileSync(OUTER_JS, "utf8");
function httpGet(url) { return new Promise(r => { https.get(url, { rejectAuthorized: false, headers: { "User-Agent": "Mozilla/5.0" } }, res => { let b = ""; res.on("data", c => b += c); res.on("end", () => r({ status: res.statusCode, body: b, headers: res.headers })); }).on("error", e => r({ status: "ERR", body: "" })); }); }

(async () => {
  const results = [];
  for (let round = 0; round < 10; round++) {
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
    const runRet = coder.run(); runRet["$_ts"].cp[3] = r.cp3; gv.config.codemap = runRet.codemap;

    const parser = require("@src/handler/parser/");
    parser.init(coder);
    
    const ascii2string = require("@src/handler/parser/common/ascii2string");
    const uuid = require("@src/handler/parser/common/uuid");
    
    // codeUid computation from Cookie.js getCodeUid()
    const mainFunctionCode = coder.code.slice(...coder.mainFunctionIdx);
    const funcIdx = +ascii2string(gv.keys[33]);
    const validIdx = (!isNaN(funcIdx) && funcIdx < coder.functionsNameSort.length) ? funcIdx : 20;
    const funcEntry = coder.functionsNameSort[validIdx];
    const one = funcEntry && funcEntry.code ? uuid(funcEntry.code) : uuid(mainFunctionCode.substring(0, 100));
    const len = parseInt(mainFunctionCode.length / 100);
    const start = len * (+ascii2string(gv.keys[34]) || 0);
    const two = uuid(mainFunctionCode.substr(start, len));
    const codeUid = (one ^ two) & 65535;
    
    // fixedValue20
    const fixedValue20 = require("@src/handler/parser/common/fixedValue20");
    const fv20 = fixedValue20();
    
    // keys info
    const keys22 = gv.keys[22];
    const keys33 = +ascii2string(gv.keys[33]);
    const keys34 = +ascii2string(gv.keys[34]);
    
    // r2mka taskori for U250200532
    const tasks250 = gv.r2mka("U250200532");
    const taskori = tasks250 && tasks250[0] ? tasks250[0].taskori : null;
    
    results.push({
      round, nsd, codeUid, fv20,
      keys33, keys34,
      funcIdx, validIdx,
      mainFunctionCodeLen: mainFunctionCode.length,
      funcEntryExists: !!funcEntry,
      funcEntryCodeLen: funcEntry && funcEntry.code ? funcEntry.code.length : 0,
      taskoriLen: taskori ? taskori.length : 0,
      keys29: ascii2string(gv.keys[29]),
      keys30: ascii2string(gv.keys[30]),
      keys31: ascii2string(gv.keys[31]),
      keys32: ascii2string(gv.keys[32]),
    });
  }
  
  for (const r of results) {
    console.log(`round${r.round}: codeUid=${r.codeUid} fv20=[${r.fv20}] keys33=${r.keys33} keys34=${r.keys34} validIdx=${r.validIdx} mainFnLen=${r.mainFunctionCodeLen} funcEntry=${r.funcEntryExists}(${r.funcEntryCodeLen}) taskoriLen=${r.taskoriLen}`);
    console.log(`  keys29-32: ${r.keys29} ${r.keys30} ${r.keys31} ${r.keys32}`);
  }
  
  process.exit(0);
})().catch(e => { console.error("ERR:", e.message, e.stack); process.exit(1); });
