const fs = require("fs");
const path = require("path");
const https = require("https");
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const ROOT = path.resolve(__dirname, "..");
const OUTER_JS = path.join(ROOT, "example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js");
const outerJsCode = fs.readFileSync(OUTER_JS, "utf8");
function httpGet(url) { return new Promise(r => { https.get(url, { rejectAuthorized: false, headers: { "User-Agent": "Mozilla/5.0" } }, res => { let b = ""; res.on("data", c => b += c); res.on("end", () => r({ status: res.statusCode, body: b, headers: res.headers })); }).on("error", e => r({ status: "ERR", body: "" })); }); }

(async () => {
  // Test: use correct basearr but override codeUid to 0
  // If server returns 200, codeUid is NOT validated
  const results = [];
  for (let round = 0; round < 10; round++) {
    const ch = await httpGet("https://pmos.xj.sgcc.com.cn:20080/");
    const nsdMatch = ch.body.match(/\$_ts\.nsd=(\d+)/);
    const cdMatch = ch.body.match(/\$_ts\.cd="([^"]+)"/);
    if (!nsdMatch) continue;
    const nsd = +nsdMatch[1], cd = cdMatch[1];
    
    // Get O cookie
    let oCookie = "";
    for (const c of ch.headers["set-cookie"] || []) {
      if (c.includes("=O")) { oCookie = c.split(";")[0]; break; }
    }
    if (!oCookie && ch.headers["set-cookie"]) oCookie = ch.headers["set-cookie"][0].split(";")[0];
    
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
    
    // Hook getBasearr to override codeUid
    const basearrPath = require.resolve("@src/handler/basearr/index.js");
    const origGetBasearr = require(basearrPath);
    let capturedBasearr = null;
    require.cache[basearrPath].exports = function(config, gv) {
      // Override codeUid to 0
      config.codeUid = 0;
      const result = origGetBasearr(config, gv);
      capturedBasearr = [...result];
      return result;
    };
    
    const Cookie = require("@src/handler/Cookie");
    const ck = new Cookie(coder);
    // Override codeUid in cookie config too
    ck.config.codeUid = 0;
    const cookie = ck.run();
    
    // Replay
    const resp = await new Promise(r => {
      const req = https.get("https://pmos.xj.sgcc.com.cn:20080/", {
        rejectAuthorized: false,
        headers: { "User-Agent": "Mozilla/5.0", "Cookie": `${oCookie}; ${cookie.substring(0, cookie.indexOf("="))}=${cookie.substring(cookie.indexOf("=")+1)}` }
      }, res => { let b=""; res.on("data",c=>b+=c); res.on("end",()=>r(res.statusCode)); });
      req.on("error", e => r("ERR"));
    });
    
    // Also get the cookie name
    const cookieName = cookie.substring(0, cookie.indexOf("="));
    const cookieVal = cookie.substring(cookie.indexOf("=")+1);
    
    results.push({ round, nsd, status: resp });
    console.log(`#${round+1} nsd=${nsd} codeUid=0 -> ${resp}`);
  }
  
  const ok = results.filter(r => r.status === 200).length;
  const bad = results.filter(r => r.status !== 200).length;
  console.log(`\n=== codeUid=0 Result: 200=${ok} other=${bad} (${ok}/${results.length}) ===`);
  
  process.exit(0);
})().catch(e => { console.error("ERR:", e.message, e.stack); process.exit(1); });
