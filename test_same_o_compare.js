/**
 * 决定性实验：同 nsd/cd 下，真实 P（浏览器）vs 管线 P，配【同一个 O cookie】重放。
 * - 真实 P + O 必 200（浏览器生成）
 * - 管线 P + 同 O 若 412 → P 差异是根因（排除 O）
 * - 再反解两者 basearr 对比，定位 P 的具体差异字段
 *
 * 用法：NODE_OPTIONS=--dns-result-order=ipv4first NODE_PATH=/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules node test_same_o_compare.js
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
  // 1. Patchright 抓真实 P + O + 同 nsd/cd
  console.log('[1] Patchright 抓真实 cookie...');
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
  if (!realP || !realO || !ts) { console.error('抓取失败', { hasP: !!realP, hasO: !!realO, hasTs: !!ts }); process.exit(1); }
  const oStr = `${realO.name}=${realO.value}`;
  const pStr = `${realP.name}=${realP.value}`;
  console.log(`    nsd=${ts.nsd} O=${realO.name} P=${realP.name}`);

  // 2. 管线生成 P（同 nsd/cd）
  console.log('\n[2] 管线生成 P...');
  const { runOuterVM } = require('./extract_dyncode_20080.js');
  const r = runOuterVM({ nsd: ts.nsd, cd: ts.cd }, outerJs);
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require('./utils/paths').package));
  const gv = require('@src/handler/globalVarible');
  const { getCode } = require('@utils/');
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
  const pipeP = new Cookie(coder).run();
  const pipeName = gv.utils.ascii2string(gv.keys[7]).split(';')[5] + (gv.config.adapt?.lastWord || 'T');
  const pipePStr = `${pipeName}=${pipeP}`;
  console.log(`    管线 P name=${pipeName} (真实 name=${realP.name})`);

  // 3. 同 O 配真实 P / 管线 P 重放
  console.log('\n[3] 重放对比（同 O）:');
  const rReal = await httpGet(TARGET, `${oStr}; ${pStr}`);
  console.log(`    真实P + O → ${rReal.status}`);
  // 管线 P 可能需多次（30%），重放 5 次看是否有 200
  let pipeResults = [];
  for (let i = 0; i < 5; i++) {
    const rp = await httpGet(TARGET, `${oStr}; ${pipePStr}`);
    pipeResults.push(rp.status);
  }
  console.log(`    管线P + 同O ×5 → ${pipeResults.join(',')}`);

  console.log('\n===== 结论 =====');
  if (rReal.status === 200 && pipeResults.every(s => s !== 200)) {
    console.log('真实P 200，管线P 全 412（同 O）→ P 的明文差异是根因（O 排除）');
  } else if (pipeResults.some(s => s === 200)) {
    console.log('管线P 也能 200（同 O）→ P 差异是概率性（某些随机字段）');
  }
  fs.writeFileSync('/tmp/same_o.json', JSON.stringify({ realP: realP.value, pipeP, oStr, realName: realP.name, pipeName }, null, 2));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
