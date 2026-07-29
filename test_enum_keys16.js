/**
 * 决定性实验：枚举 ans 的所有 keys 项作为外层密钥候选，反解真实 P 外层，
 * 找能解出合法 nextarr（head=2,8，uuid 匹配）的正确密钥索引。
 * 若找到 → 证明 Cookie.js 硬编码 keys[16] 错误，真实外层密钥在别的索引 → 修复达 100%。
 *
 * 用法：NODE_OPTIONS=--dns-result-order=ipv4first NODE_PATH=/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules node test_enum_keys16.js
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

  // 重现 ans（cd 解密的原始密钥区）
  const decrypt = require('@src/handler/parser/common/decrypt');
  const cdArr = decrypt(gv.ts.cd);
  const end = (cdArr[0] << 8 | cdArr[1]) + 2;
  const offset = gv._getAttr('dynamicTaskOffset');
  const ans = cdArr.slice(end).map((item, idx) => item ^ offset[idx % 8]);

  const { encryptMode2, numToNumarr4, uuid, numarrAddTime } = parser;
  const payload = realP.value.startsWith('0') ? realP.value.slice(1) : realP.value;
  const idxmap = {}; gv.basestr.split('').forEach((k, i) => { if (!(k in idxmap)) idxmap[k] = i; });
  const bytes = [];
  for (let g = 0; g * 4 < payload.length - 3; g++) {
    const c0 = idxmap[payload[g*4]], c1 = idxmap[payload[g*4+1]], c2 = idxmap[payload[g*4+2]], c3 = idxmap[payload[g*4+3]];
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }

  function tryKey(key, label) {
    try {
      const dec = encryptMode2([...bytes], key, 1);
      const uuidCheck = dec.slice(0, 4);
      const nextarr = dec.slice(4);
      const headOk = nextarr[0] === 2 && nextarr[1] === 8;
      const uuidOk = JSON.stringify(uuidCheck) === JSON.stringify(numToNumarr4(uuid(nextarr)));
      if (headOk || uuidOk) { console.log(`  ✓ ${label}: headOk=${headOk} uuidOk=${uuidOk} nextarr[0:6]=${nextarr.slice(0,6).join(',')}`); return headOk && uuidOk; }
    } catch (e) {}
    return false;
  }

  console.log('枚举 A：ans 的 16 字节滑动窗口（raw + derived）:');
  let found = [];
  for (let off = 0; off + 16 <= ans.length; off++) {
    const win = ans.slice(off, off + 16);
    if (tryKey(win, `ans[${off}:${off + 16}] raw`)) found.push({ off, mode: 'raw' });
    if (tryKey(numarrAddTime(win)[0], `ans[${off}:${off + 16}] derived`)) found.push({ off, mode: 'derived' });
  }
  console.log(`\n===== 结果 =====`);
  if (found.length) console.log(`✓ 找到外层密钥位置: ${JSON.stringify(found)}`);
  else console.log('✗ ans 滑动窗口均失败 → 外层密钥不在 cd 解密区（可能由 cp/动态代码派生）');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
