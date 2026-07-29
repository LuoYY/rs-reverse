/**
 * 反向验证：管线生成的 412 cookie，用真实浏览器（Patchright）重放，看是否变 200。
 * - 若变 200 → Node/got-scraping 的请求特征（TLS/header）问题，cookie 本身好
 * - 若仍 412 → cookie 本身坏（管线加密错）
 *
 * 流程：管线生成 cookie（已知会 412）→ 记录 → Patchright 设置该 cookie → 访问 → 看是否 200
 *
 * 用法：NODE_OPTIONS=--dns-result-order=ipv4first NODE_PATH=/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules node test_pipe_cookie_in_browser.js
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

(async () => {
  // 1. 管线生成 cookie（拉挑战页 + cp3 + 管线），先确认它 412
  const ch = await httpGet(TARGET);
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { console.error('no ts'); process.exit(1); }
  const nsd = +m[1], cd = m[2];
  const setCookies = [].concat(ch.headers['set-cookie'] || []);
  const oCookie = setCookies.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || setCookies.map(c => c.split(';')[0])[0];
  const { runOuterVM } = require('./extract_dyncode_20080.js');
  const r = runOuterVM({ nsd, cd }, outerJs);
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require('./utils/paths').package));
  const gv = require('@src/handler/globalVarible');
  const { getCode } = require('@utils/');
  const ts = { nsd, cd, from: TARGET, hasDebug: false, keynameNum: 909, cp3Override: r.cp3 };
  fs.writeFileSync('/tmp/t.json', JSON.stringify(ts));
  const argv = { file: '/tmp/t.json', jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(__dirname, 'output'), level: 'warn', _: ['makecookie'] };
  const codeRet = await getCode(argv.jsurls);
  argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
  gv._setAttr('argv', argv);
  require('@src/config/')(gv);
  gv._setAttr('_ts', ts);
  const Coder = require('@src/handler/Coder');
  const Cookie = require('@src/handler/Cookie');
  const coder = new Coder({ hasCodemap: true, hasDebug: false, ...ts }, gv.config.immucfg);
  const runRet = coder.run();
  runRet.$_ts.cp[3] = r.cp3;
  gv.config.codemap = runRet.codemap;
  const pipeCookie = new Cookie(coder).run();
  const pipeName = gv.utils.ascii2string(gv.keys[7]).split(';')[5] + (gv.config.adapt?.lastWord || 'T');
  const oName = oCookie.split('=')[0], oValue = oCookie.split('=')[1];

  // 2. Node 重放确认 412
  const nodeReplay = await httpGet(TARGET, `${oCookie}; ${pipeName}=${pipeCookie}`);
  console.log(`[Node] 管线 cookie 重放 → ${nodeReplay.status}`);

  // 3. Patchright 设置该 cookie 访问，看是否 200
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA });
  const url = new URL(TARGET);
  await context.addCookies([
    { name: oName, value: oValue, domain: url.hostname, path: '/' },
    { name: pipeName, value: pipeCookie, domain: url.hostname, path: '/' },
  ]);
  const page = await context.newPage();
  let status = null;
  page.on('response', (resp) => { try { if (resp.url().startsWith(TARGET.replace(/\/$/, '')) && status === null) status = resp.status(); } catch (e) {} });
  await page.goto(TARGET, { waitUntil: 'load', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await browser.close();
  console.log(`[浏览器] 管线 cookie 重放 → ${status}`);

  console.log('\n===== 结论 =====');
  if (nodeReplay.status === 412 && status === 200) console.log('✗ cookie 好但 Node 请求特征问题 → 用真实浏览器重放可救，但纯 Node 不行');
  else if (nodeReplay.status === 412 && status === 412) console.log('✓ cookie 本身坏（管线加密错）→ 需修管线加密');
  else console.log(`Node=${nodeReplay.status} 浏览器=${status}`);
  process.exit(0);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
