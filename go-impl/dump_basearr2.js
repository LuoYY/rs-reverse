const fs = require("fs");
const path = require("path");
const https = require("https");
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const ROOT = path.resolve(__dirname, "..");
const OUTER_JS = path.join(ROOT, "example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js");
const outerJsCode = fs.readFileSync(OUTER_JS, "utf8");
function httpGet(url) { return new Promise(r => { https.get(url, { rejectAuthorized: false, headers: { "User-Agent": "Mozilla/5.0" } }, res => { let b = ""; res.on("data", c => b += c); res.on("end", () => r({ status: res.statusCode, body: b, headers: res.headers })); }).on("error", e => r({ status: "ERR", body: "" })); }); }

(async () => {
  for (let round = 0; round < 3; round++) {
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

    // Hook numarrEncrypt in the parser INDEX module
    const parserIndexPath = require.resolve("@src/handler/parser/");
    const parserIndex = require(parserIndexPath);
    let basearr = null;
    const hookedParser = new Proxy(parserIndex, {
      get(target, prop) {
        if (prop === "numarrEncrypt") {
          return function(n) {
            basearr = [...n];
            return target.numarrEncrypt(n);
          };
        }
        return target[prop];
      }
    });
    // Replace in cache
    require.cache[parserIndexPath].exports = hookedParser;
    // Also update Cookie's reference
    const Cookie = require("@src/handler/Cookie");
    // Cookie requires parser at module level, so it already has the old reference
    // We need to delete cache and re-require Cookie
    delete require.cache[require.resolve("@src/handler/Cookie")];
    const Cookie2 = require("@src/handler/Cookie");
    new Cookie2(coder).run();
    
    if (!basearr) {
      console.log("round" + round + ": basearr is null!");
      continue;
    }
    
    console.log("round" + round + " basearr length: " + basearr.length);
    console.log("[" + basearr.join(",") + "]");
  }
  process.exit(0);
})().catch(e => { console.error("ERR:", e.message, e.stack); process.exit(1); });
