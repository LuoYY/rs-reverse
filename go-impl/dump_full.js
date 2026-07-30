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

  // Hook getBasearr to capture basearr
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
  const cookie = ck.run();
  
  const basearr = capturedBasearr;
  
  // Get all intermediate values
  const common = require("@src/handler/parser/common/index.js");
  const numToNumarr4 = require("@src/handler/parser/common/numToNumarr4");
  const tools = require("@src/handler/parser/common/tools");
  const ascii2string = require("@src/handler/parser/common/ascii2string");
  
  const r2mkaTime = +ascii2string(gv.keys[21]);
  const startTime = ck.config.startTime || 0;
  const runTime = ck.config.runTime || 0;
  const random = ck.config.random;
  const codeUid = ck.config.codeUid;
  
  // Re-run to capture intermediates
  const numenc = common.numarrEncrypt(basearr);
  const xorResult = tools.xor(numenc, gv.keys[2], 16);
  const keys17time = common.numarrAddTime(gv.keys[17], runTime, random);
  const keys16time = common.numarrAddTime(gv.keys[16], runTime, random);
  const basearrEncrypt = common.encryptMode1(xorResult, keys17time[0], 0);
  
  const timeBytes = [...numToNumarr4([r2mkaTime, startTime])];
  const inner = common.numarrJoin(2, timeBytes, gv.keys[2]);
  const highByte = basearrEncrypt.length >> 8 & 255 | 128;
  const nextarr = common.numarrJoin(inner, highByte, basearrEncrypt);
  const uuidVal = common.uuid(nextarr);
  
  const output = {
    nsd, cd, cp3: r.cp3,
    keys: gv.keys,
    keys2: gv.keys[2],
    keys16: gv.keys[16],
    keys17: gv.keys[17],
    basearr: basearr,
    numenc: numenc,
    xorResult: xorResult,
    keys17time: keys17time[0],
    keys16time: keys16time[0],
    basearrEncrypt: basearrEncrypt,
    nextarr: nextarr,
    uuid: uuidVal,
    cookie: cookie,
    cookieLen: cookie.length,
    r2mkaTime: r2mkaTime,
    startTime: startTime,
    runTime: runTime,
    random: random,
    codeUid: codeUid,
    ele17: keys17time[0][keys17time[0].length - 1],
    ele16: keys16time[0][keys16time[0].length - 1],
    basestr: gv.config.adapt ? gv.config.adapt.basestr : null,
    cookiePrefix: gv.config.adapt ? gv.config.adapt.cookiePrefix : null,
    cookieName: "aoU85Lxl9xxNP",
  };
  
  console.log(JSON.stringify(output));
  process.exit(0);
})().catch(e => { console.error("ERR:", e.message, e.stack); process.exit(1); });
