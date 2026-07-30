const fs = require("fs");
const path = require("path");
const https = require("https");
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const ROOT = path.resolve(__dirname, "..");
const OUTER_JS = path.join(ROOT, "example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js");
const outerJsCode = fs.readFileSync(OUTER_JS, "utf8");
function httpGet(url) { return new Promise(r => { https.get(url, { rejectAuthorized: false, headers: { "User-Agent": "Mozilla/5.0" } }, res => { let b = ""; res.on("data", c => b += c); res.on("end", () => r({ status: res.statusCode, body: b, headers: res.headers })); }).on("error", e => r({ status: "ERR", body: "" })); }); }

(async () => {
  const sessions = [];
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
    const parser = require("@src/handler/parser/");
    parser.init(coder);
    
    const ascii2string = require("@src/handler/parser/common/ascii2string");
    const uuid = require("@src/handler/parser/common/uuid");
    const mainFunctionCode = coder.code.slice(...coder.mainFunctionIdx);
    const funcIdx = +ascii2string(gv.keys[33]);
    const validIdx = (!isNaN(funcIdx) && funcIdx < coder.functionsNameSort.length) ? funcIdx : 20;
    const funcEntry = coder.functionsNameSort[validIdx];
    const funcCode = funcEntry && funcEntry.code ? funcEntry.code : mainFunctionCode.substring(0, 100);
    const len = parseInt(mainFunctionCode.length / 100);
    const keys34val = +ascii2string(gv.keys[34]) || 0;
    const start = len * keys34val;
    const sliceCode = mainFunctionCode.substr(start, len);
    const codeUid = (uuid(funcCode) ^ uuid(sliceCode)) & 65535;
    
    sessions.push({
      round, nsd, cp3: r.cp3,
      cp1: gv.ts.cp[1],
      mainFunctionIdx: coder.mainFunctionIdx,
      coderCodeLen: coder.code.length,
      mainFnLen: mainFunctionCode.length,
      validIdx, keys34val, len, start,
      funcCode, sliceCode, codeUid,
      keys33: +ascii2string(gv.keys[33]),
      keys34: +ascii2string(gv.keys[34]),
    });
  }
  
  // Check keyname lengths
  for (const s of sessions) {
    const lengths = s.cp1.map(n => n.length);
    const uniqueLengths = [...new Set(lengths)];
    console.log(`session${s.round}: cp1 len=${s.cp1.length} keyname lengths=[${uniqueLengths.join(",")}]`);
    console.log(`  coderCodeLen=${s.coderCodeLen} mainFnLen=${s.mainFnLen}`);
    console.log(`  codeUid=${s.codeUid} validIdx=${s.validIdx} keys34=${s.keys34val}`);
    console.log(`  funcCode="${s.funcCode}"`);
  }
  
  // Now try token-based rename
  console.log("\n=== TOKEN-BASED RENAME ===");
  const ref = sessions[0];
  
  // Build a regex that matches any keyname as a whole word
  // JS identifiers: _$ followed by [A-Za-z0-9$_]
  // Keynames all start with _$
  const refCp1 = ref.cp1;
  
  for (let si = 1; si < sessions.length; si++) {
    const sess = sessions[si];
    const newCp1 = sess.cp1;
    
    // Check if all keynames in ref appear in ref coderCode
    // and if renaming produces the correct funcCode and sliceCode
    
    // For funcCode: it's a short string, we can do direct replacement
    let renamedFuncCode = ref.funcCode;
    // Get all keynames used in funcCode
    const usedNames = new Set();
    for (const name of refCp1) {
      if (renamedFuncCode.includes(name)) usedNames.add(name);
    }
    // Sort by length descending to avoid partial matches
    const sortedNames = [...usedNames].sort((a, b) => b.length - a.length);
    // Replace with unique placeholders
    for (const name of sortedNames) {
      const idx = refCp1.indexOf(name);
      renamedFuncCode = renamedFuncCode.split(name).join('\x01' + idx + '\x02');
    }
    // Replace placeholders with new names
    for (const name of sortedNames) {
      const idx = refCp1.indexOf(name);
      renamedFuncCode = renamedFuncCode.split('\x01' + idx + '\x02').join(newCp1[idx]);
    }
    
    console.log(`\nsession${si}: funcCode match=${renamedFuncCode === sess.funcCode}`);
    console.log(`  renamed: "${renamedFuncCode}"`);
    console.log(`  actual:  "${sess.funcCode}"`);
    
    // For sliceCode: same approach
    // But sliceCode is 723 bytes - need to do it on the full mainFnCode
    // Actually, we need the FULL coder.code for this to work
    // Let me just check if the approach works for funcCode first
  }
  
  process.exit(0);
})().catch(e => { console.error("ERR:", e.message, e.stack); process.exit(1); });
