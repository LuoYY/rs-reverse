/**
 * 决定性验证 keys17：枚举 ans 滑动窗口作【内层 keys17】，
 * 先解真实 P 外层（需先确定外层密钥），再解内层，看哪个 keys17 候选能解出合法 basearr。
 *
 * 但外层密钥未定。策略：外层用管线恒定 keys16（站点常量，可能=真实），
 * 枚举内层 keys17 候选（ans 窗口 + keys 项），看能否解出合法 basearr。
 * 若外层 keys16 错，内层枚举也会失败 → 需先确定外层。
 *
 * 更彻底：外层密钥和内层密钥都枚举（外层 ans 窗口 × 内层 ans 窗口），
 * 找能解出合法 basearr（head=3,73,1）的组合。计算量大但可行（1600×1600≈256万，但 AES 快）。
 *
 * 用法：NODE_OPTIONS=--dns-result-order=ipv4first NODE_PATH=/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules node test_enum_keys17.js
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
const _ec = getEncryptConfig(getTree());
const _cm = {};
for (let b = 0; b < 256; b++) { const c = _ec[0][b]; if (!c) continue; if (!_cm[c.val]) _cm[c.val] = {}; _cm[c.val][c.key] = b; }
function numarrDecrypt(numarr) {
  const ans = []; let curLen = 0, curKey = 0;
  for (let i = 0; i < numarr.length; i++) { const byte = numarr[i];
    for (let bit = 7; bit >= 0; bit--) { const b = (byte >> bit) & 1; curKey = (curKey << 1) | b; curLen++;
      const mm = _cm[curLen]; if (mm && mm[curKey] !== undefined) { ans.push(mm[curKey]); curKey = 0; curLen = 0; } } }
  return ans;
}

(async () => {
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
  if (!realP || !ts) { console.error('抓取失败'); process.exit(1); }
  console.log(`nsd=${ts.nsd}`);

  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require('./utils/paths').package));
  const gv = require('@src/handler/globalVarible');
  const { getCode } = require('@utils/');
  const parser = require('@src/handler/parser/');
  const { runOuterVM } = require('./extract_dyncode_20080.js');
  const r = runOuterVM({ nsd: ts.nsd, cd: ts.cd }, outerJs);
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
  new Cookie(coder).run();

  const decrypt = require('@src/handler/parser/common/decrypt');
  const cdArr = decrypt(gv.ts.cd);
  const end = (cdArr[0] << 8 | cdArr[1]) + 2;
  const offset = gv._getAttr('dynamicTaskOffset');
  const ans = cdArr.slice(end).map((item, idx) => item ^ offset[idx % 8]);

  const { encryptMode2, xor, numToNumarr4, uuid } = parser;
  const payload = realP.value.startsWith('0') ? realP.value.slice(1) : realP.value;
  const idxmap = {}; gv.basestr.split('').forEach((k, i) => { if (!(k in idxmap)) idxmap[k] = i; });
  const bytes = [];
  for (let g = 0; g * 4 < payload.length - 3; g++) {
    const c0 = idxmap[payload[g*4]], c1 = idxmap[payload[g*4+1]], c2 = idxmap[payload[g*4+2]], c3 = idxmap[payload[g*4+3]];
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }

  // 外层密钥候选：ans 16 字节窗口。内层密钥候选：ans 16 字节窗口。
  // 先找外层（能解出 nextarr head=2,8 的），再对内层枚举。
  console.log('第一步：找外层密钥（ans 窗口，解出 nextarr head=2,8）...');
  const outerCandidates = [];
  for (let off = 0; off + 16 <= ans.length; off++) {
    const win = ans.slice(off, off + 16);
    try {
      const dec = encryptMode2([...bytes], win, 1);
      const nextarr = dec.slice(4);
      if (nextarr[0] === 2 && nextarr[1] === 8) {
        outerCandidates.push({ off, key: win, nextarr });
        console.log(`  外层候选 ans[${off}]: nextarr head=2,8 ✓`);
      }
    } catch (e) {}
  }
  if (!outerCandidates.length) { console.log('  外层无候选（ans 窗口）→ 外层密钥不在 cd 区'); }

  // 对每个外层候选，枚举内层 keys17
  console.log('\n第二步：对外层候选枚举内层 keys17（ans 窗口），找合法 basearr...');
  let found = null;
  for (const oc of outerCandidates) {
    const nextarr = oc.nextarr;
    let idx = 2; idx += 8;
    const keys2len = nextarr[idx]; idx++; idx += keys2len;
    let rest = nextarr.slice(idx);
    let basearrEncrypt;
    if ((rest[0] & 0x80) === 0x80) { const encLen = rest[1] | ((rest[0] & 0x7f) << 8); basearrEncrypt = rest.slice(2, 2 + encLen); }
    else { const encLen = rest[0]; basearrEncrypt = rest.slice(1, 1 + encLen); }
    const keys2 = nextarr.slice(3 + 8, 3 + 8 + keys2len); // nextarr[0]=2,[1]=8,[2:10]=time8,[10]=keys2len
    for (let off2 = 0; off2 + 16 <= ans.length; off2++) {
      const win2 = ans.slice(off2, off2 + 16);
      try {
        const dec2 = encryptMode2([...basearrEncrypt], win2, 0);
        const numenc = xor([...dec2], gv.keys[2], 16);
        const basearr = numarrDecrypt(numenc);
        if (basearr[0] === 3 && basearr[1] === 73 && basearr.length >= 200) {
          console.log(`  ✓✓ 外层 ans[${oc.off}] + 内层 ans[${off2}]: basearr len=${basearr.length} head=${basearr.slice(0, 3).join(',')}`);
          found = { outerOff: oc.off, innerOff: off2, basearr };
          break;
        }
      } catch (e) {}
    }
    if (found) break;
  }
  console.log(`\n===== 结果 =====`);
  if (found) {
    console.log(`✓ 找到真实密钥: 外层 ans[${found.outerOff}], 内层 keys17=ans[${found.innerOff}]`);
    console.log(`  管线用 keys[16](外层) 和 keys[17](内层)。对比正确位置 → 可修复`);
    console.log(`  basearr[0:20]: ${found.basearr.slice(0, 20).join(',')}`);
    fs.writeFileSync('/tmp/real_keys.json', JSON.stringify({ outerOff: found.outerOff, innerOff: found.innerOff, outerKey: ans.slice(found.outerOff, found.outerOff + 16), innerKey: ans.slice(found.innerOff, found.innerOff + 16), basearr: found.basearr }));
  } else {
    console.log('✗ 未找到 → 外层或内层密钥不在 cd 静态区，确认由动态代码运行生成');
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
