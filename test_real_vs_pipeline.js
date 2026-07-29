/**
 * 真实浏览器 cookie vs 管线 cookie 完整 basearr 逐字节对比（同 nsd/cd）
 *
 * 流程：
 * 1. Patchright 抓真实 P cookie + 同会话 nsd/cd（且该 cookie 必有效，浏览器 100%）
 * 2. 同 nsd/cd 沙箱提取 cp3，管线生成 cookie，hook 捕获管线原始 basearr
 * 3. 反解真实 P cookie 回真实 basearr
 * 4. 逐字节对比，找管线与真实的所有差异（尤其结构性差异，非随机字段）
 *
 * 用法：NODE_OPTIONS=--dns-result-order=ipv4first NODE_PATH=/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules node test_real_vs_pipeline.js
 */
const fs = require('fs');
const path = require('path');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const { chromium } = require('patchright');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(__dirname, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const outerJs = fs.readFileSync(OUTER_JS, 'utf8');

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

(async () => {
  // 1. Patchright 抓真实 P + 同 nsd/cd
  console.log('[1] Patchright 抓真实浏览器 cookie...');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA });
  const page = await context.newPage();
  let ts = null;
  page.on('response', async (resp) => {
    try {
      if (resp.status() === 412 && !ts) {
        const text = await resp.text().catch(() => '');
        const m = text.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
        if (m) ts = { nsd: +m[1], cd: m[2] };
      }
    } catch (e) {}
  });
  await page.goto(TARGET, { waitUntil: 'load', timeout: 45000 }).catch(() => {});
  let realP = null, realO = null;
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(1000);
    const cs = await context.cookies();
    realP = cs.find(c => c.name.endsWith('P'));
    realO = cs.find(c => c.name.endsWith('O'));
    if (realP && realO) break;
  }
  await browser.close();
  if (!realP || !ts) { console.error('未抓到 P 或 ts', { hasP: !!realP, hasTs: !!ts }); process.exit(1); }
  if (realO) global.__browserO = `${realO.name}=${realO.value}`;
  console.log(`    nsd=${ts.nsd} cd_len=${ts.cd.length} 真实P name=${realP.name} len=${realP.value.length} O=${realO ? realO.name : 'N/A'}`);

  // 2. 管线生成 cookie（hook 捕获 basearr）
  console.log('\n[2] 同 nsd/cd 管线生成 cookie...');
  const { runOuterVM } = require('./extract_dyncode_20080.js');
  const r = runOuterVM({ nsd: ts.nsd, cd: ts.cd }, outerJs);
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require('./utils/paths').package));
  let pipeBasearr = null;
  const ciPath = require.resolve('@src/handler/parser/common/index.js');
  const oc = require(ciPath);
  const one = oc.numarrEncrypt;
  require.cache[ciPath].exports = new Proxy(oc, {
    get(t, p) { if (p === 'numarrEncrypt') return (n) => { pipeBasearr = [...n]; return one(n); }; return t[p]; }
  });
  const gv = require('@src/handler/globalVarible');
  const { getCode } = require('@utils/');
  const parser = require('@src/handler/parser/');
  const tsFull = { nsd: ts.nsd, cd: ts.cd, from: TARGET, hasDebug: false, keynameNum: 909, cp3Override: r.cp3 };
  fs.writeFileSync('/tmp/t.json', JSON.stringify(tsFull));
  const argv = { file: '/tmp/t.json', jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(__dirname, 'output'), level: 'warn', _: ['makecookie'] };
  const codeRet = await getCode(argv.jsurls);
  argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
  gv._setAttr('argv', argv);
  require('@src/config/')(gv);
  gv._setAttr('_ts', tsFull);
  const Coder = require('@src/handler/Coder');
  const Cookie = require('@src/handler/Cookie');
  const coder = new Coder({ hasCodemap: true, hasDebug: false, ...tsFull }, gv.config.immucfg);
  const runRet = coder.run();
  runRet.$_ts.cp[3] = r.cp3;
  gv.config.codemap = runRet.codemap;
  const pipeCookie = new Cookie(coder).run();
  console.log(`    管线 basearr len=${pipeBasearr.length} cp3=${r.cp3}`);

  // 2.5 重放验证（确认真实P 200、管线P 412）—— 用 Patchright 抓取的 O（global.__browserO）
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
  // 管线 P 重放（需 O，从浏览器抓取阶段保存）
  const pipeName = gv.utils.ascii2string(gv.keys[7]).split(';')[5] + (gv.config.adapt?.lastWord || 'T');
  if (global.__browserO) {
    const g = await gotScraping();
    const replayPipe = await g.get(TARGET, { headers: { 'User-Agent': UA, 'Cookie': `${global.__browserO}; ${pipeName}=${pipeCookie}` } });
    console.log(`    管线P + 浏览器O 重放 → ${replayPipe.statusCode}`);
    global.__pipeReplayStatus = replayPipe.statusCode;
  }

  // 3. 反解真实 P cookie 回真实 basearr
  console.log('\n[3] 反解真实 P cookie...');
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
  function numarr2stringDecode(str) {
    const keys = gv.basestr.split(''); const idxmap = {};
    keys.forEach((k, i) => { if (!(k in idxmap)) idxmap[k] = i; });
    const numarr = []; let i = 0;
    const full = Math.floor(str.length / 4);
    for (let g = 0; g < full; g++) { const c0 = idxmap[str[i]], c1 = idxmap[str[i+1]], c2 = idxmap[str[i+2]], c3 = idxmap[str[i+3]]; i += 4;
      numarr.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3); }
    const rem = str.length - i;
    if (rem === 2) { const c0 = idxmap[str[i]], c1 = idxmap[str[i+1]]; numarr.push((c0 << 2) | (c1 >> 4)); }
    else if (rem === 3) { const c0 = idxmap[str[i]], c1 = idxmap[str[i+1]], c2 = idxmap[str[i+2]]; numarr.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2)); }
    return numarr;
  }
  const { encryptMode2, xor } = parser;
  const payload = realP.value.startsWith('0') ? realP.value.slice(1) : realP.value;
  const bytes = numarr2stringDecode(payload);
  const decrypted = encryptMode2(bytes, gv.keys[16], 1);
  const nextarr = decrypted.slice(4);
  let idx = 2;
  idx += 8; // skip time8
  const keys2len = nextarr[idx]; idx++;
  idx += keys2len;
  let rest = nextarr.slice(idx);
  let basearrEncrypt;
  if ((rest[0] & 0x80) === 0x80) { const encLen = rest[1] | ((rest[0] & 0x7f) << 8); basearrEncrypt = rest.slice(2, 2 + encLen); }
  else { const encLen = rest[0]; basearrEncrypt = rest.slice(1, 1 + encLen); }
  const basearrXor = encryptMode2([...basearrEncrypt], gv.keys[17], 0);
  const numenc = xor([...basearrXor], gv.keys[2], 16);
  const realBasearr = numarrDecrypt(numenc);
  console.log(`    真实 basearr len=${realBasearr.length} head=${realBasearr.slice(0,6).join(',')}`);

  // 4. 逐字节对比
  console.log('\n[4] 逐字节对比（真实 vs 管线）:');
  console.log(`    真实 len=${realBasearr.length} 管线 len=${pipeBasearr.length}`);
  const maxLen = Math.max(realBasearr.length, pipeBasearr.length);
  const diffs = [];
  for (let i = 0; i < maxLen; i++) {
    if (realBasearr[i] !== pipeBasearr[i]) diffs.push({ i, real: realBasearr[i], pipe: pipeBasearr[i] });
  }
  console.log(`    差异 ${diffs.length} 字节:`);
  for (const d of diffs) console.log(`      @${d.i}: 真实=${d.real} 管线=${d.pipe}`);
  fs.writeFileSync('/tmp/real_vs_pipe.json', JSON.stringify({ realBasearr, pipeBasearr, nsd: ts.nsd }, null, 2));
  console.log('\n已存 /tmp/real_vs_pipe.json');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
