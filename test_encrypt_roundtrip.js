/**
 * 隔离测试：numarrEncrypt → xor(keys2) → encryptMode1(keys17, flag=0) → [反解] → 还原 basearr
 * 固定 config，跑 30 次，统计还原成功率 —— 验证管线加密层是否确定性
 *
 * 用法：NODE_OPTIONS=--dns-result-order=ipv4first node test_encrypt_roundtrip.js
 */
const fs = require('fs');
const path = require('path');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(__dirname, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const https = require('https');
function httpGet(url, cookie) {
  return new Promise((resolve) => {
    const headers = { 'User-Agent': UA, 'Accept': '*/*' };
    if (cookie) headers['Cookie'] = cookie;
    https.get(url, { rejectUnauthorized: false, headers }, (res) => {
      let b = ''; res.on('data', (c) => b += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b }));
    }).on('error', (e) => resolve({ status: 'ERR', error: e.message, body: '', headers: {} }));
  });
}

// huffman decode
function getTree() {
  let arr = [];
  for (let i = 1; i < 255; i++) arr.push({ total: 1, idx: i });
  arr.push({ total: 6, idx: 255 }, { total: 45, idx: 0 });
  function parse(item) { for (let i = 0; i < arr.length; i++) { if (item.total <= arr[i].total) { arr.splice(i, 0, item); return; } } arr.push(item); }
  while (arr.length > 1) { const [o, t] = arr.slice(0, 2); arr = arr.slice(2); parse({ total: o.total + t.total, first: o, second: t }); }
  return arr[0];
}
function getKey(arr) { for (let idx in arr) { if (arr[idx].val >= 8) return arr[idx].key >> arr[idx].val - 8; } }
function getEncryptConfig(tree, config = { key: 0, val: 0 }, arr = []) {
  if (tree.idx === undefined) { getEncryptConfig(tree.first, { key: config.key << 1, val: config.val + 1 }, arr); getEncryptConfig(tree.second, { key: (config.key << 1) + 1, val: config.val + 1 }, arr); }
  else arr[tree.idx] = config;
  return [arr, getKey(arr)];
}

const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');

async function main() {
  const ch = await httpGet(TARGET);
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { console.error('no $_ts'); process.exit(1); }
  const nsd = +m[1], cd = m[2];
  const { runOuterVM } = require('./extract_dyncode_20080.js');
  const r = runOuterVM({ nsd, cd }, outerJsCode);
  console.log('固定种子 nsd=', nsd, 'cp3=', r.cp3);

  // 初始化一次 gv/coder/parser
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require('./utils/paths').package));
  const gv = require('@src/handler/globalVarible');
  const { getCode } = require('@utils/');
  const parser = require('@src/handler/parser/');
  const { encryptMode1, encryptMode2, numarrEncrypt, xor, numarrAddTime } = parser;
  const ts = { nsd, cd, from: TARGET, hasDebug: false, keynameNum: 909, cp3Override: r.cp3 };
  fs.writeFileSync('/tmp/pmos-xj-ts.json', JSON.stringify(ts));
  const argv = { file: '/tmp/pmos-xj-ts.json', jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(__dirname, 'output'), level: 'warn', _: ['makecookie'] };
  const codeRet = await getCode(argv.jsurls);
  argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
  gv._setAttr('argv', argv);
  require('@src/config/')(gv);
  gv._setAttr('_ts', ts);
  const Coder = require('@src/handler/Coder');
  const Cookie = require('@src/handler/Cookie');
  const coder = new Coder({ hasCodemap: true, hasDebug: false, ...ts }, gv.config.immucfg);
  const { $_ts: fullTs, codemap } = coder.run();
  fullTs.cp[3] = r.cp3;
  gv.config.codemap = codemap;

  // 固定 config（克隆一次）
  const config = { ...gv.makecookieRuntimeConfig };
  config.codeUid = new Cookie(coder).getCodeUid();
  config.r2mkaTime = +gv.utils.ascii2string(gv.keys[21]);

  // huffman decode 准备
  const ec = getEncryptConfig(getTree());
  const codeMap = {};
  for (let b = 0; b < 256; b++) { const c = ec[0][b]; if (!c) continue; if (!codeMap[c.val]) codeMap[c.val] = {}; codeMap[c.val][c.key] = b; }
  function numarrDecrypt(numarr) {
    const ans = []; let curLen = 0, curKey = 0;
    for (let i = 0; i < numarr.length; i++) { const byte = numarr[i];
      for (let bit = 7; bit >= 0; bit--) { const b = (byte >> bit) & 1; curKey = (curKey << 1) | b; curLen++;
        const mm = codeMap[curLen]; if (mm && mm[curKey] !== undefined) { ans.push(mm[curKey]); curKey = 0; curLen = 0; } } }
    return ans;
  }

  // 跑 N 次 encrypt→decrypt 往返（每次仅重新生成 basearr，不重复 new Cookie 避免 parser.init 冲突）
  const getBasearr = require('@src/handler/basearr/');
  const N = 30;
  let okCount = 0, genOkCount = 0;
  for (let t = 0; t < N; t++) {
    // 每次新生成 basearr（含随机字段 execN/time/random8）
    const cfg = { ...config, execNumberByTime: undefined }; // execN 由 len243 内部默认
    const basearr = getBasearr(config, gv);
    // 生成端 encrypt
    const genEnc = encryptMode1(xor(numarrEncrypt(basearr), gv.keys[2], 16), numarrAddTime(gv.keys[17], config.runTime, config.random)[0], 0);
    // 反解端 decrypt
    let restored = null, err = null;
    try {
      const xorDec = encryptMode2([...genEnc], gv.keys[17], 0);
      const numenc = xor([...xorDec], gv.keys[2], 16);
      restored = numarrDecrypt(numenc);
    } catch (e) { err = e.message; }
    const roundtripOk = restored && JSON.stringify(restored) === JSON.stringify(basearr);
    const looksValid = restored && restored[0] === 3 && restored[1] === 73;
    if (roundtripOk) okCount++;
    if (looksValid && restored.length === 244) genOkCount++;
    console.log(`#${t+1}: baseLen=${basearr.length} encLen=${genEnc.length} 还原=${roundtripOk ? '✓完全一致' : (err ? 'ERR:' + err : (looksValid ? '部分(' + restored.length + ')' : '乱码(' + (restored ? restored.length : 0) + ')'))}`);
  }
  console.log(`\n===== 加密层往返测试: 完全还原 ${okCount}/${N}, 有效还原(244) ${genOkCount}/${N} =====`);
}
main().catch(e => { console.error('FATAL:', e); process.exit(1); });
