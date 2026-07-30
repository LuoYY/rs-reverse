const fs = require("fs");
const path = require("path");
const https = require("https");
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const ROOT = path.resolve(__dirname, "..");
const OUTER_JS = path.join(ROOT, "example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js");
const outerJsCode = fs.readFileSync(OUTER_JS, "utf8");
function httpGet(url) { return new Promise(r => { https.get(url, { rejectAuthorized: false, headers: { "User-Agent": "Mozilla/5.0" } }, res => { let b = ""; res.on("data", c => b += c); res.on("end", () => r({ status: res.statusCode, body: b, headers: res.headers })); }).on("error", e => r({ status: "ERR", body: "" })); });
}

(async function() {
  var ch = await httpGet("https://pmos.xj.sgcc.com.cn:20080/");
  var nsdMatch = ch.body.match(/\$_ts\.nsd=(\d+)/);
  var cdMatch = ch.body.match(/\$_ts\.cd="([^"]+)"/);
  var nsd = +nsdMatch[1], cd = cdMatch[1];
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
  gv._setAttr("argv", argv);
  require("@src/config/")(gv);
  gv._setAttr("_ts", tsFull);
  var Coder = require("@src/handler/Coder");
  var coder = new Coder({ hasCodemap: true, hasDebug: false, cp3Override: r.cp3, nsd: nsd, cd: cd, from: "https://pmos.xj.sgcc.com.cn:20080/" }, gv.config.immucfg);

  // Hook gren to dump _$$k, _$cS, _$bf
  var origGren = coder.gren.bind(coder);
  coder.gren = function(current, codeArr) {
    // We need to dump data AFTER gren sets it, so call origGren first
    // then read the opdata
    origGren(current, codeArr);
    // But after gren, the opdata has been set for this current
    var bf = this.opmate.getMateOri('_$bf');
    var cCount = this.opmate.getMateOri('_$$c');
    var e4Count = this.opmate.getMateOri('_$e4');
    var kData = this.opdata.getData('_$$k');
    var cSData = this.opdata.getData('_$cS');
    var wData = this.opdata.getData('_$$w');
    var joined = codeArr.join("");
    var cSTotal = 0;
    if (cSData) cSData.forEach(function(item) { cSTotal += item.length; });
    console.error("  [gren(" + current + ")] codeArrLen=" + joined.length +
      " _$bf=" + bf + " _$$c=" + cCount + " _$e4=" + e4Count +
      " _$$k=" + (kData ? kData.length : 0) +
      " _$cS=" + (cSData ? cSData.length : 0) + "/" + cSTotal +
      " _$$w=" + (wData ? wData.length : 0));
  };

  coder.run();
  console.error("coder.code length: " + coder.code.length);
  console.error("functionsNameSort: " + coder.functionsNameSort.length);
  process.exit(0);
})().catch(function(e) { console.error("ERR: " + e.message + "\n" + e.stack); process.exit(1); });
