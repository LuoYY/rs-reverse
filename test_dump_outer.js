/**
 * 决定性 dump：捕获 412-cookie 外层 encryptMode1 的【输入明文 nextarr】和【输出密文】，
 * 然后用同 keys16 手动 encryptMode2 反解输出，验证是否还原 nextarr。
 * 若不能还原 → encryptMode1/2 对该输入不可逆（定位 bug）。
 * 若能还原 → cookie 被替换/传输损坏（不可能）→ 重新理解。
 *
 * 用法：NODE_OPTIONS=--dns-result-order=ipv4first node test_dump_outer.js [N]
 */
const fs = require('fs');
const path = require('path');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(__dirname, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const outerJs = fs.readFileSync(OUTER_JS, 'utf8');

let _got = null;
async function gotScraping() {
  if (!_got) {
    const { gotScraping } = await import('got-scraping');
    _got = gotScraping.extend({
      headerGeneratorOptions: { browsers: [{ name: 'chrome', minVersion: 131, maxVersion: 131 }], devices: ['desktop'], operatingSystems: ['macos'] },
      https: { rejectUnauthorized: false }, timeout: { request: 15000 }, retry: { limit: 0 }, throwHttpErrors: false,
    });
  }
  return _got;
}
async function httpGet(url, cookie) {
  const g = await gotScraping();
  const headers = { 'User-Agent': UA };
  if (cookie) headers['Cookie'] = cookie;
  const res = await g.get(url, { headers });
  return { status: res.statusCode, headers: res.headers, body: res.body };
}

async function tryOnce() {
  const ch = await httpGet(TARGET);
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) throw new Error('no ts');
  const nsd = +m[1], cd = m[2];
  const setCookies = [].concat(ch.headers['set-cookie'] || []);
  const oCookie = setCookies.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || setCookies.map(c => c.split(';')[0])[0];
  const { runOuterVM } = require('./extract_dyncode_20080.js');
  const r = runOuterVM({ nsd, cd }, outerJs);
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require('./utils/paths').package));
  const gv = require('@src/handler/globalVarible');
  const { getCode } = require('@utils/');

  // hook parser/index.js 的 encryptMode1，捕获外层（flag=1）输入输出
  const piPath = require.resolve('@src/handler/parser/index.js');
  const captured = {};
  const ts = { nsd, cd, from: TARGET, hasDebug: false, keynameNum: 909, cp3Override: r.cp3 };
  fs.writeFileSync('/tmp/t.json', JSON.stringify(ts));
  const argv = { file: '/tmp/t.json', jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(__dirname, 'output'), level: 'warn', _: ['makecookie'] };
  const codeRet = await getCode(argv.jsurls);
  argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
  gv._setAttr('argv', argv);
  require('@src/config/')(gv);
  gv._setAttr('_ts', ts);
  const Coder = require('@src/handler/Coder');
  // 先 hook parser.encryptMode1，再 require Cookie（Cookie 顶层解构绑定）
  const parserMod = require(piPath);
  const pe1 = parserMod.encryptMode1;
  parserMod.encryptMode1 = function (valarr, keyarr, flag, random) {
    const out = pe1(valarr, keyarr, flag, random);
    if (flag === 1) { captured.input = [...valarr]; captured.output = [...out]; captured.key = [...keyarr]; }
    return out;
  };
  const Cookie = require('@src/handler/Cookie');
  const coder = new Coder({ hasCodemap: true, hasDebug: false, ...ts }, gv.config.immucfg);
  const runRet = coder.run();
  runRet.$_ts.cp[3] = r.cp3;
  gv.config.codemap = runRet.codemap;
  const cookie = new Cookie(coder).run();
  const name = gv.utils.ascii2string(gv.keys[7]).split(';')[5] + (gv.config.adapt?.lastWord || 'T');
  const replay = await httpGet(TARGET, `${oCookie}; ${name}=${cookie}`);

  // 手动反解 captured.output（外层密文），用原始 keys16
  const parser = require('@src/handler/parser/');
  let decOut = null, decErr = null, uuidOk = null, basearr = null, innerValid = null;
  try {
    const dec = parser.encryptMode2(captured.output, gv.keys[16], 1);
    decOut = dec;
    const uuidCheck = dec.slice(0, 4);
    const nextarr = dec.slice(4);
    uuidOk = JSON.stringify(uuidCheck) === JSON.stringify(parser.numToNumarr4(parser.uuid(nextarr)));
    var inputMatch = JSON.stringify(dec) === JSON.stringify(captured.input);
    // 内层：解析 nextarr → basearrEncrypt → 反解 basearr
    let idx = 2; idx += 8;
    const keys2len = nextarr[idx]; idx++; idx += keys2len;
    let rest = nextarr.slice(idx);
    let basearrEncrypt;
    if ((rest[0] & 0x80) === 0x80) { const encLen = rest[1] | ((rest[0] & 0x7f) << 8); basearrEncrypt = rest.slice(2, 2 + encLen); }
    else { const encLen = rest[0]; basearrEncrypt = rest.slice(1, 1 + encLen); }
    const dec2 = parser.encryptMode2([...basearrEncrypt], gv.keys[17], 0);
    const numenc = parser.xor([...dec2], gv.keys[2], 16);
    basearr = numarrDecryptLocal(numenc);
    innerValid = basearr[0] === 3 && basearr[1] === 73 && basearr.length >= 200;
  } catch (e) { decErr = e.message; }
  return {
    status: replay.status, nsd,
    inputMatch: typeof inputMatch !== 'undefined' ? inputMatch : null,
    uuidOk, decErr, basearr, innerValid,
  };
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
const _ec = getEncryptConfig(getTree());
const _cm = {};
for (let b = 0; b < 256; b++) { const c = _ec[0][b]; if (!c) continue; if (!_cm[c.val]) _cm[c.val] = {}; _cm[c.val][c.key] = b; }
function numarrDecryptLocal(numarr) {
  const ans = []; let curLen = 0, curKey = 0;
  for (let i = 0; i < numarr.length; i++) { const byte = numarr[i];
    for (let bit = 7; bit >= 0; bit--) { const b = (byte >> bit) & 1; curKey = (curKey << 1) | b; curLen++;
      const mm = _cm[curLen]; if (mm && mm[curKey] !== undefined) { ans.push(mm[curKey]); curKey = 0; curLen = 0; } } }
  return ans;
}

(async () => {
  const N = parseInt(process.argv[2] || '10', 10);
  const rows = [];
  for (let i = 0; i < N; i++) {
    try {
      const r = await tryOnce();
      rows.push(r);
      console.log(`#${i + 1}: ${r.status} uuidOk:${r.uuidOk} innerValid:${r.innerValid} baseLen=${r.basearr ? r.basearr.length : 'N/A'}${r.decErr ? ' ERR:' + r.decErr : ''}`);
    } catch (e) { console.log(`#${i + 1}: ERR ${String(e.message).substring(0, 50)}`); }
  }
  // 对比 200 vs 412 的 basearr 明文
  const passes = rows.filter(r => r.status === 200 && r.basearr);
  const rejects = rows.filter(r => r.status !== 200 && r.basearr);
  if (passes.length && rejects.length) {
    console.log(`\n===== basearr 明文对比 (${passes.length} 通过 vs ${rejects.length} 被拒) =====`);
    const p = passes[0].basearr, q = rejects[0].basearr;
    console.log(`通过 len=${p.length} 被拒 len=${q.length}`);
    const diffs = [];
    for (let i = 0; i < Math.max(p.length, q.length); i++) if (p[i] !== q[i]) diffs.push(i);
    console.log(`差异 ${diffs.length} 字节 @ [${diffs.join(',')}]`);
    for (const i of diffs.slice(0, 30)) console.log(`  @${i}: 通过=${p[i]} 被拒=${q[i]}`);
    fs.writeFileSync('/tmp/inner_basearr.json', JSON.stringify({ passes: passes.map(r => r.basearr), rejects: rejects.map(r => r.basearr) }, null, 2));
    console.log('已存 /tmp/inner_basearr.json');
  }
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
