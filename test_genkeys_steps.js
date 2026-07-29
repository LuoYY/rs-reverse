/**
 * genKeys bug 决定性验证：同 cd 下 step=2 vs step=1 切分 keys16/17，
 * 用【反解真实 P】黄金校验哪种切分得到正确 keys。
 * 用法：NODE_OPTIONS=--dns-result-order=ipv4first NODE_PATH=/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules node test_genkeys_steps.js
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
  console.log(`nsd=${ts.nsd} 真实P len=${realP.value.length}`);

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
  const getLens = require('@src/handler/parser/common/getLens');
  const cdArr = decrypt(gv.ts.cd);
  const end = (cdArr[0] << 8 | cdArr[1]) + 2;
  const offset = gv._getAttr('dynamicTaskOffset');
  const ans = cdArr.slice(end).map((item, idx) => item ^ offset[idx % 8]);
  console.log(`ans[0]=${ans[0]} ans.len=${ans.length} gv.keys16=${gv.keys[16].join(',')}`);

  function genKeysWithStep(ans, step) {
    const keys = [];
    for (let i = 0, op = 1, gap; i < ans[0]; i++) {
      if (step === 2) { gap = ans[op] << 8 | ans[op + 1]; op += 2; }
      else { [gap, op] = getLens(ans, op); }
      keys.push(ans.slice(op, op + gap)); op += gap;
    }
    return keys;
  }
  const k2 = genKeysWithStep(ans, 2);
  const k1 = genKeysWithStep(ans, 1);
  console.log(`step2: k16=[${(k2[16] || []).join(',')}] k17=[${(k2[17] || []).join(',')}] k29-32len=${[29,30,31,32].map(i => (k2[i] || []).length)}`);
  console.log(`step1: k16=[${(k1[16] || []).join(',')}] k17=[${(k1[17] || []).join(',')}] k29-32len=${[29,30,31,32].map(i => (k1[i] || []).length)}`);

  // 黄金校验：反解真实 P
  const { encryptMode2, xor } = parser;
  function tryDecode(keys, label) {
    try {
      const payload = realP.value.startsWith('0') ? realP.value.slice(1) : realP.value;
      // 外层 encryptMode2(keys16) — 用 raw 检查 nextarr 结构头 [2,8]
      const idxmap = {}; gv.basestr.split('').forEach((k, i) => { if (!(k in idxmap)) idxmap[k] = i; });
      const bytes = [];
      for (let g = 0; g * 4 < payload.length - 3; g++) {
        const c0 = idxmap[payload[g*4]], c1 = idxmap[payload[g*4+1]], c2 = idxmap[payload[g*4+2]], c3 = idxmap[payload[g*4+3]];
        bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
      }
      const dec1 = encryptMode2(bytes, keys[16], 1);
      const nextarr = dec1.slice(4);
      const headOk = nextarr[0] === 2 && nextarr[1] === 8;
      console.log(`  ${label}: 外层解密后 nextarr[0:4]=${nextarr.slice(0,4).join(',')} headOk=${headOk} dec1.len=${dec1.length}`);
      return headOk;
    } catch (e) { console.log(`  ${label}: ERR ${e.message}`); return false; }
  }
  console.log('黄金校验（反解真实P外层，看 nextarr 头=2,8）:');
  tryDecode(k2, 'step2-keys(管线默认)');
  tryDecode(k1, 'step1-keys');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
