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
    const runRet = coder.run(); runRet["$_ts"].cp[3] = r.cp3; gv.config.codemap = runRet.codemap;

    // Hook getBasearr
    const basearrPath = require.resolve("@src/handler/basearr/index.js");
    const origGetBasearr = require(basearrPath);
    let capturedBasearr = null;
    require.cache[basearrPath].exports = function(config, gv) {
      const result = origGetBasearr(config, gv);
      capturedBasearr = [...result];
      return result;
    };

    const Cookie = require("@src/handler/Cookie");
    const ck = new Cookie(coder);
    ck.run();
    
    const ascii2string = require("@src/handler/parser/common/ascii2string");
    const keys19 = +ascii2string(gv.keys[19]);
    const keys24 = +ascii2string(gv.keys[24]);
    
    results.push({
      round,
      basearr: capturedBasearr,
      seg10: capturedBasearr.slice(77, 96),
      seg7: capturedBasearr.slice(98, 110),
      seg6: capturedBasearr.slice(215, 231),
      seg2: capturedBasearr.slice(233, 237),
      keys19,
      keys24,
      codeUid: ck.config.codeUid,
      r2mkaTime: ck.config.r2mkaTime,
      startTime: ck.config.startTime,
      runTime: ck.config.runTime,
    });
  }
  
  // Print comparison
  for (const r of results) {
    console.log(`round${r.round}: keys19=${r.keys19} keys24=${r.keys24} codeUid=${r.codeUid} startTime=${r.startTime} runTime=${r.runTime}`);
    console.log(`  seg10: [${r.seg10.join(",")}]`);
    console.log(`  seg7:  [${r.seg7.join(",")}]`);
    console.log(`  seg6:  [${r.seg6.join(",")}]`);
    console.log(`  seg2:  [${r.seg2.join(",")}]`);
  }
  
  process.exit(0);
})().catch(e => { console.error("ERR:", e.message, e.stack); process.exit(1); });
