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

  // Hook gren to dump intermediate state for current=1
  const origGren = coder.gren.bind(coder);
  coder.gren = function(current, codeArr) {
    origGren(current, codeArr);

    if (current === 1) {
      const w = this.opdata.getData('_$$w');
      const k = this.opdata.getData('_$$k');
      const aebi = this.$_ts.aebi[current];
      const fns = this.functionsNameSort;

      console.log("=== gren(1) debug ===");
      console.log("keycodes.length:", this.keycodes.length);
      console.log("_$$w length:", w.length, "first 5:", JSON.stringify(w.slice(0, 5)));
      console.log("_$$k length:", k.length);
      console.log("_$$k[0]:", JSON.stringify(k[0]));
      console.log("_$$k[1]:", JSON.stringify(k[1]));
      console.log("aebi length:", aebi.length, "first 10:", JSON.stringify(aebi.slice(0, 10)));
      console.log("_$bf:", this.opmate.getMateOri('_$bf'));
      console.log("functionsNameSort count after:", fns.length);

      // Check the keycodes that match (NNN); pattern
      const matchingKeycodes = this.keycodes.filter(it => it.match(/^\([0-9]+\);$/));
      console.log("matching keycodes (NNN);:", matchingKeycodes.length);
      console.log("matching keycodes:", JSON.stringify(matchingKeycodes.slice(0, 5)));

      // For each matching keycode, try getName
      for (const it of matchingKeycodes) {
        const s = parseInt(it.slice(1));
        if (s + w.length > aebi.length) {
          console.log(`  s=${s}: out of range (s+len=${s+w.length} > aebi.length=${aebi.length})`);
          continue;
        }
        try {
          aebi.slice(s, s + w.length).forEach((idx, i) => {
            const numarr = k[idx];
            if (!numarr || numarr.length !== 5) {
              throw new Error(`k[${idx}] invalid: ${JSON.stringify(numarr)}`);
            }
            const name = this.keynames[numarr[3]];
            if (!this.keynames.includes(name)) {
              throw new Error(`name "${name}" not in keynames`);
            }
          });
          console.log(`  s=${s}: OK`);
        } catch(err) {
          console.log(`  s=${s}: FAIL - ${err.message}`);
        }
      }
    }
  };

  coder.run();
  console.log("\nfunctionsNameSort count:", coder.functionsNameSort.length);
  if (coder.functionsNameSort.length > 0) {
    console.log("first entry:", JSON.stringify(coder.functionsNameSort[0]));
  }
  process.exit(0);
})().catch(e => { console.error("ERR:", e.message, e.stack); process.exit(1); });
