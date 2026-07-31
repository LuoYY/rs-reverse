const fs = require("fs");
const path = require("path");
const https = require("https");
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const ROOT = "/Users/luoyy/work/github/GitHub/rs-reverse_glm";
function httpReq(url, opts = {}) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = https.request({ hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, method: opts.method || 'GET', rejectUnauthorized: false, headers: opts.headers || {} }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    });
    req.on('error', e => resolve({ status: 'ERR', body: '', headers: {} }));
    req.end();
  });
}
(async () => {
  // 拉挑战
  const ch = await httpReq("https://pmos.xj.sgcc.com.cn:20080/");
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  const nsd = +m[1], cd = m[2];
  const { runOuterVM } = require(path.join(ROOT, "extract_dyncode_20080.js"));
  const outerJs = fs.readFileSync(path.join(ROOT, "example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js"), "utf8");
  const r = runOuterVM({ nsd, cd }, outerJs);
  // 管线
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require("module-alias")(ROOT);
  const gv = require("@src/handler/globalVarible");
  const { getCode } = require("@utils/");
  const ts = { nsd, cd, from: "https://pmos.xj.sgcc.com.cn:20080/", hasDebug: false, keynameNum: 909, cp3Override: r.cp3 };
  const tmpTs = "/tmp/dump-keys7.json";
  fs.writeFileSync(tmpTs, JSON.stringify(ts));
  const argv = { file: tmpTs, jsurls: [path.join(ROOT, "example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js")], hasDebug: false, mate: {}, output: path.join(ROOT, "output"), level: "warn", _: ["makecookie"] };
  const codeRet = await getCode(argv.jsurls);
  argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
  gv._setAttr("argv", argv);
  require("@src/config/")(gv);
  gv._setAttr("_ts", ts);
  const Coder = require("@src/handler/Coder");
  const coder = new Coder({ hasCodemap: true, hasDebug: false, ...ts }, gv.config.immucfg);
  coder.run(); coder["$_ts"].cp[3] = r.cp3; gv.config.codemap = coder.codemap;
  const parser = require("@src/handler/parser/"); parser.init(coder);
  const ascii2string = gv.utils.ascii2string;
  console.log("keys[7] bytes:", JSON.stringify(gv.keys[7]));
  console.log("keys[7] ascii:", JSON.stringify(ascii2string(gv.keys[7])));
  const parts = ascii2string(gv.keys[7]).split(";");
  console.log("split(';') parts:", parts.length);
  parts.forEach((p, i) => console.log("  [" + i + "] = " + JSON.stringify(p)));
  console.log("\nparamName = [1] =", JSON.stringify(parts[1]));
  console.log("cookieName = [5] + lastWord =", JSON.stringify(parts[5] + "P"));
  process.exit(0);
})().catch(e => { console.error("ERR:", e.message, e.stack); process.exit(1); });
