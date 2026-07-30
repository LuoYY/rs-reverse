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
    const cp1 = gv.ts.cp[1];
    const ascii2string = require("@src/handler/parser/common/ascii2string");
    const uuid = require("@src/handler/parser/common/uuid");
    const fnSort = coder.functionsNameSort.map((f, i) => {
      const numMatch = f.code.match(/\[(\d+)\]/);
      const num = numMatch ? +numMatch[1] : -1;
      const nameIdx = cp1.indexOf(f.name);
      const varMatch = f.code.match(/var ([_\$][_\w\$]+)\[/);
      const varName = varMatch ? varMatch[1] : "";
      const varIdx = cp1.indexOf(varName);
      const innerMatch = f.code.match(/return ([_\$][_\w\$]+)\.apply/);
      const innerName = innerMatch ? innerMatch[1] : "";
      const innerIdx = cp1.indexOf(innerName);
      return { idx: i, num, nameIdx, varIdx, innerIdx };
    });
    const mainFnCode = coder.code.slice(...coder.mainFunctionIdx);
    const funcIdx = +ascii2string(gv.keys[33]);
    const validIdx = (!isNaN(funcIdx) && funcIdx < coder.functionsNameSort.length) ? funcIdx : 20;
    const len = parseInt(mainFnCode.length / 100);
    const keys34val = +ascii2string(gv.keys[34]) || 0;
    const start = len * keys34val;
    const funcEntry = coder.functionsNameSort[validIdx];
    const funcCode = funcEntry && funcEntry.code ? funcEntry.code : mainFnCode.substring(0, 100);
    const sliceCode = mainFnCode.substr(start, len);
    const codeUid = (uuid(funcCode) ^ uuid(sliceCode)) & 65535;
    sessions.push({ round, cp1: [...cp1], fnSort, mainFnCode, validIdx, keys34val, len, start, funcCode, sliceCode, codeUid });
  }
  
  console.log("=== VAR/INNER INDEX STABILITY ===");
  const ref = sessions[0].fnSort;
  for (let s = 1; s < sessions.length; s++) {
    const sess = sessions[s].fnSort;
    let match = true;
    for (let i = 0; i < ref.length; i++) {
      if (ref[i].varIdx !== sess[i].varIdx || ref[i].innerIdx !== sess[i].innerIdx) match = false;
    }
    console.log(`session${s}: stable=${match}`);
  }
  console.log("varIdx:", JSON.stringify(ref.map(f => f.varIdx)));
  console.log("innerIdx:", JSON.stringify(ref.map(f => f.innerIdx)));
  
  console.log("\n=== FUNCCODE RECONSTRUCTION ===");
  for (let s = 0; s < sessions.length; s++) {
    const sess = sessions[s];
    const vi = sess.validIdx;
    const entry = sess.fnSort[vi];
    const name = sess.cp1[entry.nameIdx];
    const varN = sess.cp1[entry.varIdx];
    const inner = sess.cp1[entry.innerIdx];
    const num = entry.num;
    const recon = `function ${name}(){var ${varN}=[${num}];Array.prototype.push.apply(${varN},arguments);return ${inner}.apply(this,${varN});}`;
    console.log(`session${s}: match=${recon === sess.funcCode}`);
  }
  
  console.log("\n=== SLICECODE RECONSTRUCTION ===");
  for (let s = 1; s < sessions.length; s++) {
    const sess = sessions[s];
    let renamed = sessions[0].mainFnCode;
    for (let i = 0; i < sessions[0].cp1.length; i++) {
      if (sessions[0].cp1[i] !== sess.cp1[i]) renamed = renamed.split(sessions[0].cp1[i]).join('\x01');
    }
    for (let i = 0; i < sessions[0].cp1.length; i++) {
      if (sessions[0].cp1[i] !== sess.cp1[i]) renamed = renamed.split('\x01').join(sess.cp1[i]);
    }
    const renamedSlice = renamed.substr(sess.start, sess.len);
    const sliceMatch = renamedSlice === sess.sliceCode;
    const fullMatch = renamed === sess.mainFnCode;
    console.log(`session${s}: sliceMatch=${sliceMatch} fullMatch=${fullMatch} renamedLen=${renamed.length} actualLen=${sess.mainFnCode.length}`);
    if (!fullMatch) {
      for (let i = 0; i < Math.min(renamed.length, sess.mainFnCode.length); i++) {
        if (renamed[i] !== sess.mainFnCode[i]) {
          console.log(`  fullDiff at ${i}: renamed="${renamed.substr(i,40)}" actual="${sess.mainFnCode.substr(i,40)}"`);
          break;
        }
      }
    }
    // Compute codeUid from renamed
    const uuidMod = require("@src/handler/parser/common/uuid");
    const renamedFunc = sessions[0].funcCode;
    let renamedFunc2 = renamedFunc;
    for (let i = 0; i < sessions[0].cp1.length; i++) {
      if (sessions[0].cp1[i] !== sess.cp1[i]) renamedFunc2 = renamedFunc2.split(sessions[0].cp1[i]).join(sess.cp1[i]);
    }
    const uidRecon = (uuidMod(renamedFunc2) ^ uuidMod(renamedSlice)) & 65535;
    console.log(`  codeUid: actual=${sess.codeUid} recon=${uidRecon} match=${sess.codeUid === uidRecon}`);
  }
  
  // Save reference
  const saveData = {
    cp1: sessions[0].cp1,
    mainFnCode: sessions[0].mainFnCode,
    nums: ref.map(f => f.num),
    nameIdx: ref.map(f => f.nameIdx),
    varIdx: ref.map(f => f.varIdx),
    innerIdx: ref.map(f => f.innerIdx),
  };
  fs.writeFileSync(ROOT + "/go-impl/ref_session.json", JSON.stringify(saveData));
  console.log("\nRef saved. mainFnCode len:", sessions[0].mainFnCode.length);
  process.exit(0);
})().catch(e => { console.error("ERR:", e.message, e.stack); process.exit(1); });
