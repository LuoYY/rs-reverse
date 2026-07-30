const fs = require("fs");
const path = require("path");
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const ROOT = path.resolve(__dirname, "..");
const OUTER_JS = path.join(ROOT, "example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js");
const outerJsCode = fs.readFileSync(OUTER_JS, "utf8");
const session = JSON.parse(fs.readFileSync("/tmp/fixed_session.json", "utf8"));
const nsd = session.nsd, cd = session.cd;

(async function() {
  var runRes = require(path.join(ROOT, "extract_dyncode_20080.js"));
  var r = runRes.runOuterVM({ nsd: nsd, cd: cd }, outerJsCode);
  for (var k in require.cache) delete require.cache[k];
  require("module-alias")(ROOT);
  var gv = require("@src/handler/globalVarible");
  var utilsMod = require("@utils/");
  var tsFull = { nsd: nsd, cd: cd, from: "https://pmos.xj.sgcc.com.cn:20080/", hasDebug: false, keynameNum: 909, cp3Override: r.cp3 };
  fs.writeFileSync("/tmp/t.json", JSON.stringify(tsFull));
  var argv = { file: "/tmp/t.json", jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(ROOT, "output"), level: "warn", _: ["makecookie"] };
  var codeRet = await utilsMod.getCode(argv.jsurls);
  argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
  gv._setAttr("argv", argv); require("@src/config/")(gv); gv._setAttr("_ts", tsFull);
  var Coder = require("@src/handler/Coder");
  var coder = new Coder({ hasCodemap: true, hasDebug: false, cp3Override: r.cp3, nsd: nsd, cd: cd, from: "https://pmos.xj.sgcc.com.cn:20080/" }, gv.config.immucfg);
  coder.run(); coder["$_ts"].cp[3] = r.cp3; gv.config.codemap = coder.codemap;
  var parser = require("@src/handler/parser/"); parser.init(coder);
  var ascii2string = require("@src/handler/parser/common/ascii2string");
  var uuidMod = require("@src/handler/parser/common/uuid");
  var mainFnCode = coder.code.slice.apply(coder.code, coder.mainFunctionIdx);
  var funcIdx = +ascii2string(gv.keys[33]);
  var validIdx = (!isNaN(funcIdx) && funcIdx < coder.functionsNameSort.length) ? funcIdx : 20;
  var sliceLen = parseInt(mainFnCode.length / 100);
  var keys34val = +ascii2string(gv.keys[34]) || 0;
  var sliceStart = sliceLen * keys34val;
  var funcEntry = coder.functionsNameSort[validIdx];
  var funcCode = funcEntry && funcEntry.code ? funcEntry.code : mainFnCode.substring(0, 100);
  var sliceCode = mainFnCode.substr(sliceStart, sliceLen);
  var codeUid = (uuidMod(funcCode) ^ uuidMod(sliceCode)) & 65535;
  fs.writeFileSync("/tmp/js_coder_code.txt", coder.code);
  var output = {
    cp3: r.cp3, codeLen: coder.code.length,
    mainFnStart: coder.mainFunctionIdx[0], mainFnEnd: coder.mainFunctionIdx[1],
    mainFnLen: mainFnCode.length, fnsCount: coder.functionsNameSort.length,
    funcIdx: funcIdx, validIdx: validIdx, keys34val: keys34val,
    sliceLen: sliceLen, sliceStart: sliceStart, codeUid: codeUid,
    funcCodeLen: funcCode.length, sliceCodeLen: sliceCode.length,
    keynames: gv.ts.cp[1],
    keys33: +ascii2string(gv.keys[33]), keys34: +ascii2string(gv.keys[34]),
  };
  fs.writeFileSync("/tmp/js_coder_metrics.json", JSON.stringify(output));
  console.log("JS: codeLen=" + output.codeLen + " codeUid=" + output.codeUid + " mainFnLen=" + output.mainFnLen + " fns=" + output.fnsCount);
  process.exit(0);
})().catch(function(e) { console.error("ERR: " + e.message + "\n" + e.stack); process.exit(1); });
