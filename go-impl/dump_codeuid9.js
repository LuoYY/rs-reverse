const fs = require("fs");
const path = require("path");
const https = require("https");
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const ROOT = path.resolve(__dirname, "..");
const OUTER_JS = path.join(ROOT, "example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js");
const outerJsCode = fs.readFileSync(OUTER_JS, "utf8");
function httpGet(url) { return new Promise(r => { https.get(url, { rejectAuthorized: false, headers: { "User-Agent": "Mozilla/5.0" } }, res => { let b = ""; res.on("data", c => b += c); res.on("end", () => r({ status: res.statusCode, body: b, headers: res.headers })); }).on("error", e => r({ status: "ERR", body: "" })); }); }

var uuidFn;
var ascii2stringFn;

(async () => {
  const sessions = [];
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
    const parser = require("@src/handler/parser/"); parser.init(coder);
    uuidFn = require("@src/handler/parser/common/uuid");
    ascii2stringFn = require("@src/handler/parser/common/ascii2string");
    const cp1 = gv.ts.cp[1];
    const mainFnCode = coder.code.slice(...coder.mainFunctionIdx);
    const funcIdx = +ascii2stringFn(gv.keys[33]);
    const validIdx = (!isNaN(funcIdx) && funcIdx < coder.functionsNameSort.length) ? funcIdx : 20;
    const len = parseInt(mainFnCode.length / 100);
    const keys34val = +ascii2stringFn(gv.keys[34]) || 0;
    const start = len * keys34val;
    const funcEntry = coder.functionsNameSort[validIdx];
    const funcCode = funcEntry && funcEntry.code ? funcEntry.code : mainFnCode.substring(0, 100);
    const sliceCode = mainFnCode.substr(start, len);
    const codeUid = (uuidFn(funcCode) ^ uuidFn(sliceCode)) & 65535;
    sessions.push({ round, cp1: [...cp1], mainFnCode, validIdx, keys34val, len, start, funcCode, sliceCode, codeUid });
  }

  // Rename test with unique placeholders
  console.log("=== RENAME TEST ===");
  const refCp1 = sessions[0].cp1;
  for (let s = 1; s < sessions.length; s++) {
    const sess = sessions[s];
    const newCp1 = sess.cp1;
    // Unique placeholder rename
    let renamed = sessions[0].mainFnCode;
    const indices = [...Array(refCp1.length).keys()].sort((a, b) => refCp1[b].length - refCp1[a].length);
    for (const i of indices) {
      if (refCp1[i] !== newCp1[i]) renamed = renamed.split(refCp1[i]).join('\x01' + i + '\x02');
    }
    for (const i of indices) {
      if (refCp1[i] !== newCp1[i]) renamed = renamed.split('\x01' + i + '\x02').join(newCp1[i]);
    }
    const fullMatch = renamed === sess.mainFnCode;
    const renamedSlice = renamed.substr(sess.start, sess.len);
    const sliceMatch = renamedSlice === sess.sliceCode;
    // Rename funcCode too
    let renamedFunc = sessions[0].funcCode;
    for (const i of indices) {
      if (refCp1[i] !== newCp1[i]) renamedFunc = renamedFunc.split(refCp1[i]).join('\x01' + i + '\x02');
    }
    for (const i of indices) {
      if (refCp1[i] !== newCp1[i]) renamedFunc = renamedFunc.split('\x01' + i + '\x02').join(newCp1[i]);
    }
    const funcMatch = renamedFunc === sess.funcCode;
    const uidRecon = (uuidFn(renamedFunc) ^ uuidFn(renamedSlice)) & 65535;
    console.log(`s${s}: full=${fullMatch} slice=${sliceMatch} func=${funcMatch} uid=${sess.codeUid} recon=${uidRecon} match=${sess.codeUid===uidRecon}`);
    if (!fullMatch) {
      console.log(`  len: renamed=${renamed.length} actual=${sess.mainFnCode.length}`);
      for (let i = 0; i < Math.min(renamed.length, sess.mainFnCode.length); i++) {
        if (renamed[i] !== sess.mainFnCode[i]) {
          console.log(`  diff@${i}: r="...${renamed.substr(Math.max(0,i-5),30)}..." a="...${sess.mainFnCode.substr(Math.max(0,i-5),30)}..."`);
          break;
        }
      }
    }
  }

  // Save reference
  fs.writeFileSync(ROOT + "/go-impl/ref_session.json", JSON.stringify({
    cp1: refCp1,
    mainFnCode: sessions[0].mainFnCode,
  }));
  console.log("Ref saved, mainFnCode len:", sessions[0].mainFnCode.length);
  process.exit(0);
})().catch(e => { console.error("ERR:", e.message, e.stack); process.exit(1); });
