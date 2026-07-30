const fs = require("fs");
const path = require("path");
const https = require("https");
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const ROOT = "/Users/luoyy/work/github/GitHub/rs-reverse_glm";
const OUTER_JS = path.join(ROOT, "example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js");
const outerJsCode = fs.readFileSync(OUTER_JS, "utf8");
function httpGet(url) { return new Promise(r => { https.get(url, { rejectAuthorized: false, headers: { "User-Agent": "Mozilla/5.0" } }, res => { let b = ""; res.on("data", c => b += c); res.on("end", () => r({ body: b })); }).on("error", e => r({ body: "" })); }); }
(async function() {
  var ch = await httpGet("https://pmos.xj.sgcc.com.cn:20080/");
  var nsd = +ch.body.match(/\$_ts\.nsd=(\d+)/)[1];
  var cd = ch.body.match(/\$_ts\.cd="([^"]+)"/)[1];
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
  coder.run();
  var mainEnd = coder.mainFunctionIdx[1];
  var afterMain = coder.code.substring(mainEnd);
  // Save to file for Go comparison
  fs.writeFileSync("/tmp/js_aftermain.txt", afterMain);
  console.log("JS afterMain length: " + afterMain.length);
  // Also dump what parseGlobalText2 returns (before toString)
  // Re-run parseGlobalText2 manually
  var optext = coder.optext;
  var opdata = coder.opdata;
  var opmate = coder.opmate;
  var keynames = coder.keynames;
  optext.init(0, coder.immucfg.globalText2);
  opdata.init();
  opmate.init();
  opmate.setMate("G_$ht", true);
  var keycodes2 = optext.getLine(optext.getCode()).split(String.fromCharCode(257));
  var list2 = optext.getList().data;
  var specialResult = [];
  for (var i = 0; i < list2.length - 1; i += 2) {
    specialResult.push(keycodes2[list2[i]], keynames[list2[i + 1]]);
  }
  specialResult.push(keycodes2[list2[list2.length - 1]]);
  console.log("special() returns array of " + specialResult.length + " elements");
  console.log("special().join('') length: " + specialResult.join("").length);
  console.log("special().join(',') length: " + specialResult.join(",").length);
  console.log("special().toString() length: " + specialResult.toString().length);
  // Check: does join('') match afterMain minus the "})()..." part?
  var joinedEmpty = specialResult.join("");
  var iifePart = "})($_ts.scj,$_ts.aebi);";
  console.log("joinedEmpty + iifePart length: " + (joinedEmpty.length + iifePart.length));
  console.log("afterMain length: " + afterMain.length);
  console.log("Match join(''): " + (joinedEmpty + iifePart === afterMain));
  console.log("Match join(','): " + (specialResult.join(",") + iifePart === afterMain));
  process.exit(0);
})().catch(function(e) { console.error("ERR: " + e.message); process.exit(1); });
