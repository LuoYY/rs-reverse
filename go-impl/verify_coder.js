// Verify Go Coder output matches JS Coder for the SAME nsd
// Usage: node verify_coder.js <nsd> <cd>
const nsd = parseInt(process.argv[2]);
const cd = process.argv[3];
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const OUTER_JS = path.join(ROOT, "example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js");
const outerJsCode = fs.readFileSync(OUTER_JS, "utf8");
const { runOuterVM } = require(path.join(ROOT, "extract_dyncode_20080.js"));
const r = runOuterVM({ nsd, cd }, outerJsCode);
for (const k of Object.keys(require.cache)) delete require.cache[k];
require("module-alias")(ROOT);
const gv = require("@src/handler/globalVarible");
const utilsMod = require("@utils/");
const tsFull = { nsd, cd, from: "https://pmos.xj.sgcc.com.cn:20080/", hasDebug: false, keynameNum: 909, cp3Override: r.cp3 };
fs.writeFileSync("/tmp/t.json", JSON.stringify(tsFull));
const argv = { file: "/tmp/t.json", jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(ROOT, "output"), level: "warn", _: ["makecookie"] };
const codeRet = utilsMod.getCodeSync(argv.jsurls);
argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
gv._setAttr("argv", argv); require("@src/config/")(gv); gv._setAttr("_ts", tsFull);
const Coder = require("@src/handler/Coder");
const coder = new Coder({ hasCodemap: true, hasDebug: false, ...tsFull }, gv.config.immucfg);
coder.run(); coder["$_ts"].cp[3] = r.cp3; gv.config.codemap = coder.codemap;
const parser = require("@src/handler/parser/"); parser.init(coder);
const ascii2string = require("@src/handler/parser/common/ascii2string");
const uuidMod = require("@src/handler/parser/common/uuid");
const mainFnCode = coder.code.slice(...coder.mainFunctionIdx);
const funcIdx = +ascii2string(gv.keys[33]);
const validIdx = (!isNaN(funcIdx) && funcIdx < coder.functionsNameSort.length) ? funcIdx : 20;
const len = parseInt(mainFnCode.length / 100);
const keys34val = +ascii2string(gv.keys[34]) || 0;
const start = len * keys34val;
const funcEntry = coder.functionsNameSort[validIdx];
const funcCode = funcEntry && funcEntry.code ? funcEntry.code : mainFnCode.substring(0, 100);
const sliceCode = mainFnCode.substr(start, len);
const codeUid = (uuidMod(funcCode) ^ uuidMod(sliceCode)) & 65535;
// Output key metrics for Go comparison
console.log(JSON.stringify({
  cp3: r.cp3,
  codeLen: coder.code.length,
  mainFnLen: mainFnCode.length,
  mainFunctionIdx: coder.mainFunctionIdx,
  fnsCount: coder.functionsNameSort.length,
  funcIdx, validIdx, keys34val, len, start,
  codeUid,
  funcCodeLen: funcCode.length,
  sliceCodeLen: sliceCode.length,
}));
