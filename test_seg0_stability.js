/**
 * 验证 [0] 段是否随浏览器启动变化：连续抓 K 次 Patchright 真实 cookie，
 * 反解各自的 [0] 段（@112:213），对比是否一致。
 * - 若恒定 → [0] 是站点常量，可用当前真实值硬编码 → 100% 通过
 * - 若变化 → [0] 与浏览器实例/指纹绑定，需算法生成
 *
 * 用法：NODE_OPTIONS=--dns-result-order=ipv4first NODE_PATH=/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules node test_seg0_stability.js [K]
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

async function grabOnce() {
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
  let realP = null;
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(1000);
    const cs = await context.cookies();
    realP = cs.find(c => c.name.endsWith('P'));
    if (realP) break;
  }
  await browser.close();
  if (!realP || !ts) return null;
  return { realP: realP.value, ts };
}

function decryptBasearr(realPValue, ts, gv, parser) {
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
  const payload = realPValue.startsWith('0') ? realPValue.slice(1) : realPValue;
  const bytes = numarr2stringDecode(payload);
  const decrypted = encryptMode2(bytes, gv.keys[16], 1);
  const nextarr = decrypted.slice(4);
  let idx = 2; idx += 8;
  const keys2len = nextarr[idx]; idx++; idx += keys2len;
  let rest = nextarr.slice(idx);
  let basearrEncrypt;
  if ((rest[0] & 0x80) === 0x80) { const encLen = rest[1] | ((rest[0] & 0x7f) << 8); basearrEncrypt = rest.slice(2, 2 + encLen); }
  else { const encLen = rest[0]; basearrEncrypt = rest.slice(1, 1 + encLen); }
  const basearrXor = encryptMode2([...basearrEncrypt], gv.keys[17], 0);
  const numenc = xor([...basearrXor], gv.keys[2], 16);
  return numarrDecrypt(numenc);
}

(async () => {
  const K = parseInt(process.argv[2] || '3', 10);
  const seg0s = [];
  for (let i = 0; i < K; i++) {
    const grab = await grabOnce();
    if (!grab) { console.log(`#${i + 1}: 抓取失败`); continue; }
    // 初始化 gv/parser 用于反解
    for (const k of Object.keys(require.cache)) delete require.cache[k];
    require('module-alias')(path.dirname(require('./utils/paths').package));
    const gv = require('@src/handler/globalVarible');
    const { getCode } = require('@utils/');
    const parser = require('@src/handler/parser/');
    const { runOuterVM } = require('./extract_dyncode_20080.js');
    const r = runOuterVM({ nsd: grab.ts.nsd, cd: grab.ts.cd }, outerJs);
    const tsFull = { nsd: grab.ts.nsd, cd: grab.ts.cd, from: TARGET, hasDebug: false, keynameNum: 909, cp3Override: r.cp3 };
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
    new Cookie(coder).run(); // init parser/keys

    const basearr = decryptBasearr(grab.realP, grab.ts, gv, parser);
    // [0] 段定位：找 tag0（其前是 len 标记）。从 basearr 找 [...,X,0,101,47,...] 结构
    let seg0Start = -1;
    for (let j = 100; j < basearr.length - 102; j++) {
      if (basearr[j] === 0 && basearr[j + 1] === 101) { seg0Start = j + 2; break; }
    }
    const seg0 = seg0Start >= 0 ? basearr.slice(seg0Start, seg0Start + 101) : null;
    seg0s.push(seg0);
    console.log(`#${i + 1}: basearr len=${basearr.length} seg0Start=${seg0Start} seg0[0:8]=${seg0 ? seg0.slice(0, 8).join(',') : 'N/A'}`);
  }
  console.log('\n===== [0] 段跨启动对比 =====');
  const valid = seg0s.filter(Boolean);
  if (valid.length >= 2) {
    const first = JSON.stringify(valid[0]);
    const allSame = valid.every(s => JSON.stringify(s) === first);
    console.log(`${valid.length} 个样本 [0] 段${allSame ? '全部一致 ✓ → 站点常量，可硬编码 → 100% 可达' : '不一致 ✗ → 与浏览器实例绑定，需算法生成'}`);
    if (!allSame) {
      for (let i = 0; i < valid.length; i++) console.log(`  样本${i} [0:12]: ${valid[i].slice(0, 12).join(',')}`);
    } else {
      console.log('  恒定 [0] 段:', JSON.stringify(valid[0]));
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
