const fs = require("fs");
const path = require("path");
const https = require("https");
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const ROOT = path.resolve(__dirname, "..");
const OUTER_JS = path.join(ROOT, "example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js");
const outerJsCode = fs.readFileSync(OUTER_JS, "utf8");
function httpGet(url) { return new Promise(r => { https.get(url, { rejectAuthorized: false, headers: { "User-Agent": "Mozilla/5.0" } }, res => { let b = ""; res.on("data", c => b += c); res.on("end", () => r({ status: res.statusCode, body: b, headers: res.headers })); }).on("error", e => r({ status: "ERR", body: "" })); }); }

(async () => {
  // Collect 3 sessions to verify the rename approach
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
    const one = uuid(funcCode);
    const len = parseInt(mainFunctionCode.length / 100);
    const keys34val = +ascii2string(gv.keys[34]) || 0;
    const start = len * keys34val;
    const two = uuid(mainFunctionCode.substr(start, len));
    const codeUid = (one ^ two) & 65535;
    
    sessions.push({
      round, nsd, cp3: r.cp3,
      cp1: [...gv.ts.cp[1]],
      coderCode: coder.code,
      mainFunctionIdx: coder.mainFunctionIdx,
      functionsNameSort: coder.functionsNameSort.map(f => ({ name: f.name, code: f.code })),
      funcIdx, validIdx, keys34val, len, start,
      funcCode, sliceCode: mainFunctionCode.substr(start, len),
      codeUid, one, two,
      keys33: ascii2string(gv.keys[33]),
      keys34: ascii2string(gv.keys[34]),
    });
  }
  
  // Verify rename approach
  console.log("=== VERIFY RENAME APPROACH ===");
  const ref = sessions[0];
  const refCp1 = ref.cp1;
  
  for (let s = 1; s < sessions.length; s++) {
    const sess = sessions[s];
    const newCp1 = sess.cp1;
    
    // Rename ref coderCode using cp1 mapping
    let renamedCode = ref.coderCode;
    // Replace longest names first to avoid partial matches
    const sortedIndices = [...Array(refCp1.length).keys()].sort((a, b) => refCp1[b].length - refCp1[a].length);
    for (const i of sortedIndices) {
      if (refCp1[i] !== newCp1[i]) {
        // Use split/join for global replace
        renamedCode = renamedCode.split(refCp1[i]).join('\x00');
      }
    }
    // Now replace placeholders with new names
    for (const i of sortedIndices) {
      if (refCp1[i] !== newCp1[i]) {
        renamedCode = renamedCode.split('\x00').join(newCp1[i]);
      }
    }
    
    // Compare renamed code with actual code
    const actualCode = sess.coderCode;
    const match = renamedCode === actualCode;
    console.log(`session ${s}: code match=${match} renamedLen=${renamedCode.length} actualLen=${actualCode.length}`);
    
    if (!match) {
      // Find first difference
      for (let i = 0; i < Math.min(renamedCode.length, actualCode.length); i++) {
        if (renamedCode[i] !== actualCode[i]) {
          console.log(`  First diff at pos ${i}: renamed="${renamedCode.substr(i, 30)}" actual="${actualCode.substr(i, 30)}"`);
          break;
        }
      }
    } else {
      // Verify codeUid computation matches
      const renamedMainFn = renamedCode.slice(...sess.mainFunctionIdx);
      const renamedFuncCode = sess.functionsNameSort[sess.validIdx].code;
      // Actually, we need to also rename the funcCode
      let renamedFuncCode2 = ref.functionsNameSort[sess.validIdx] ? ref.functionsNameSort[sess.validIdx].code : "";
      if (renamedFuncCode2) {
        for (const i of sortedIndices) {
          if (refCp1[i] !== newCp1[i]) {
            renamedFuncCode2 = renamedFuncCode2.split(refCp1[i]).join(newCp1[i]);
          }
        }
      }
      
      const oneRenamed = uuid(renamedFuncCode2);
      const sliceRenamed = renamedMainFn.substr(sess.start, sess.len);
      const twoRenamed = uuid(sliceRenamed);
      const codeUidRenamed = (oneRenamed ^ twoRenamed) & 65535;
      
      console.log(`  codeUid: actual=${sess.codeUid} renamed=${codeUidRenamed} match=${sess.codeUid === codeUidRenamed}`);
      console.log(`  funcCode match=${renamedFuncCode2 === sess.funcCode}`);
      console.log(`  sliceCode match=${sliceRenamed === sess.sliceCode}`);
    }
  }
  
  // Save reference session data for Go
  const refData = {
    cp1: ref.cp1,
    coderCode: ref.coderCode,
    mainFunctionIdx: ref.mainFunctionIdx,
    funcNames: ref.functionsNameSort.map(f => f.name),
    funcCodes: ref.functionsNameSort.map(f => f.code),
  };
  fs.writeFileSync(ROOT + "/go-impl/ref_session.json", JSON.stringify(refData));
  console.log("\nReference session saved to go-impl/ref_session.json");
  console.log("coder.code length:", ref.coderCode.length);
  
  process.exit(0);
})().catch(e => { console.error("ERR:", e.message, e.stack); process.exit(1); });
