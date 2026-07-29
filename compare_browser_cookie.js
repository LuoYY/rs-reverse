/**
 * 对比验证 — Patchright 抓 :20080 真实浏览器 cookie + 同会话 nsd/cd，
 * 用同 nsd/cd/cp3 跑管线，对比管线 cookie vs 浏览器真实 cookie（同种子应结构一致）
 *
 * 用法：NODE_OPTIONS=--dns-result-order=ipv4first NODE_PATH=...kimi/node_modules node compare_browser_cookie.js
 */
const fs = require('fs');
const path = require('path');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
require('module-alias')(path.dirname(require('./utils/paths').package));
const { chromium } = require('patchright');
const gv = require('@src/handler/globalVarible');
const { getCode } = require('@utils/');
const { runOuterVM } = require('./extract_dyncode_20080.js');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUT_DIR = path.join(__dirname, 'output', 'capture-20080');
const OUTER_JS = path.join(__dirname, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  // ---- 1. Patchright 抓真实浏览器 cookie + 同会话 nsd/cd ----
  console.log('[1] Patchright 抓真实浏览器 cookie + nsd/cd...');
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
    if (realP) break;
  }
  await browser.close();
  if (!realP || !ts) { console.error('未抓到 P cookie 或 ts', { hasP: !!realP, hasTs: !!ts }); process.exit(1); }
  console.log('    nsd=', ts.nsd, 'cd_len=', ts.cd.length, '真实P len=', realP.value.length, 'name=', realP.name);

  // ---- 2. 同 nsd/cd 沙箱提取 cp3 + 管线生成 cookie ----
  console.log('\n[2] 同种子管线生成 cookie...');
  const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');
  const vmResult = runOuterVM({ nsd: ts.nsd, cd: ts.cd }, outerJsCode);
  console.log('    沙箱 cp3=', vmResult.cp3);
  const tsFull = { nsd: ts.nsd, cd: ts.cd, from: TARGET, hasDebug: false, keynameNum: 909, cp3Override: vmResult.cp3 };
  fs.writeFileSync(path.join(OUT_DIR, 'compare-ts.json'), JSON.stringify(tsFull));
  const argv = { file: path.join(OUT_DIR, 'compare-ts.json'), jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: OUT_DIR, level: 'warn', _: ['makecookie'] };
  const codeRet = await getCode(argv.jsurls);
  argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
  gv._setAttr('argv', argv);
  require('@src/config/')(gv);
  gv._setAttr('_ts', tsFull);
  const Coder = require('@src/handler/Coder');
  const Cookie = require('@src/handler/Cookie');
  const coder = new Coder({ hasCodemap: true, hasDebug: !!gv.config.adapt?.hasDebug, ...tsFull }, gv.config.immucfg);
  const { $_ts: fullTs, codemap } = coder.run();
  fullTs.cp[3] = vmResult.cp3;
  gv.config.codemap = codemap;
  let genCookie = null;
  try { genCookie = new Cookie(coder).run(); } catch (e) { console.error('    Cookie 生成失败:', e.message); process.exit(1); }

  // ---- 3. 对比 ----
  console.log('\n[3] 对比 管线 vs 浏览器真实（同种子）:');
  console.log('    浏览器 P len=', realP.value.length, '前缀=', realP.value.substring(0, 14));
  console.log('    管线   P len=', genCookie.length, '前缀=', genCookie.substring(0, 14));
  console.log('    长度一致?', realP.value.length === genCookie.length);
  fs.writeFileSync(path.join(OUT_DIR, 'compare-result.json'), JSON.stringify({
    nsd: ts.nsd, cp3: vmResult.cp3, realP: realP.value, genCookie,
    realLen: realP.value.length, genLen: genCookie.length,
  }, null, 2));
  console.log('\n输出 compare-result.json（含完整 realP + genCookie 供反解对比）');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
