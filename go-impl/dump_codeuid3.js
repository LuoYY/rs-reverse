const fs = require("fs");
const path = require("path");
const https = require("https");
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const ROOT = path.resolve(__dirname, "..");
const OUTER_JS = path.join(ROOT, "example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js");
const outerJsCode = fs.readFileSync(OUTER_JS, "utf8");
function httpGet(url) { return new Promise(r => { https.get(url, { rejectAuthorized: false, headers: { "User-Agent": "Mozilla/5.0" } }, res => { let b = ""; res.on("data", c => b += c); res.on("end", () => r({ status: res.statusCode, body: b, headers: res.headers })); }).on("error", e => r({ status: "ERR", body: "" })); }); }

(async () => {
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
    
    // codeUid computation
    const mainFunctionCode = coder.code.slice(...coder.mainFunctionIdx);
    const funcIdx = +ascii2string(gv.keys[33]);
    const validIdx = (!isNaN(funcIdx) && funcIdx < coder.functionsNameSort.length) ? funcIdx : 20;
    const funcEntry = coder.functionsNameSort[validIdx];
    const funcCode = funcEntry && funcEntry.code ? funcEntry.code : mainFunctionCode.substring(0, 100);
    const one = uuid(funcCode);
    const len = parseInt(mainFunctionCode.length / 100);
    const keys34val = +ascii2string(gv.keys[34]) || 0;
    const start = len * keys34val;
    const two = uuid(mainFunctionCode.substr(start, len));
    const codeUid = (one ^ two) & 65535;
    
    // Dump funcEntry structure
    const funcEntryName = funcEntry ? funcEntry.name : null;
    const funcEntryStart = funcEntry ? funcEntry.start : null;
    const funcEntryEnd = funcEntry ? funcEntry.end : null;
    
    // Dump mainFunctionIdx
    const mainFnStart = coder.mainFunctionIdx[0];
    const mainFnEnd = coder.mainFunctionIdx[1];
    
    // Dump functionsNameSort basic info
    const fnSortCount = coder.functionsNameSort.length;
    const fnSortNames = coder.functionsNameSort.map(f => f.name).join(",");
    
    // Dump the actual funcCode for validIdx
    // The funcCode pattern: "function _$XXX(){var _$YYY=[NNN];Array.prototype.push..."
    // Extract the number NNN
    const numMatch = funcCode.match(/\[(\d+)\]/);
    const funcNum = numMatch ? +numMatch[1] : -1;
    
    // Dump the mainFnCode slice
    const sliceCode = mainFunctionCode.substr(start, len);
    
    console.log(`round${round}: nsd=${nsd} cp3=${r.cp3}`);
    console.log(`  codeUid=${codeUid} one=${one} two=${two}`);
    console.log(`  funcIdx=${funcIdx} validIdx=${validIdx} funcNum=${funcNum} keys34=${keys34val}`);
    console.log(`  mainFnLen=${mainFunctionCode.length} len=${len} start=${start}`);
    console.log(`  mainFunctionIdx=[${mainFnStart},${mainFnEnd}]`);
    console.log(`  fnSortCount=${fnSortCount}`);
    console.log(`  funcCode="${funcCode}"`);
    console.log(`  sliceCode="${sliceCode}"`);
    console.log(`  uuid(funcCode)=${uuid(funcCode)} uuid(sliceCode)=${uuid(sliceCode)}`);
    
    // Check if coder.code is constant by looking at specific positions
    console.log(`  coder.code length=${coder.code.length}`);
    console.log(`  coder.code[0:50]="${coder.code.substring(0, 50)}"`);
    console.log(`  coder.code[${mainFnStart}:${mainFnStart+30}]="${coder.code.substr(mainFnStart, 30)}"`);
  }
  process.exit(0);
})().catch(e => { console.error("ERR:", e.message, e.stack); process.exit(1); });
