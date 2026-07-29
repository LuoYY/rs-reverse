/**
 * 验证 [0] 是否校验请求指纹：真实浏览器完整 cookie（O+P，100% 有效），
 * 分别用 (A) 同浏览器 context、(B) got-scraping Node 重放，统计通过率。
 * - 若 A 100% 且 B <100% → [0] 校验请求指纹，Node 无法达成 100%（结论：纯协议上限=抽样通过率）
 * - 若 A、B 都 100% → [0] 不校验请求指纹，管线 [0] 硬编码可行，根因仍在别处
 *
 * 用法：NODE_OPTIONS=--dns-result-order=ipv4first NODE_PATH=/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules node test_real_cookie_replay.js
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const { chromium } = require('patchright');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

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

(async () => {
  // 抓真实 O+P
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA });
  const page = await context.newPage();
  await page.goto(TARGET, { waitUntil: 'load', timeout: 45000 }).catch(() => {});
  let realP = null, realO = null;
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(1000);
    const cs = await context.cookies();
    realP = cs.find(c => c.name.endsWith('P'));
    realO = cs.find(c => c.name.endsWith('O'));
    if (realP && realO) break;
  }
  if (!realP || !realO) { console.error('抓取失败'); await browser.close(); process.exit(1); }
  const cookieHeader = `${realO.name}=${realO.value}; ${realP.name}=${realP.value}`;
  console.log('抓到真实 O+P');

  // A: 同浏览器 context 重放 5 次（用 page.goto 新 tab，带同 cookie）
  console.log('\n=== A: 同浏览器 context 重放 ===');
  let okA = 0;
  for (let i = 0; i < 5; i++) {
    const p2 = await context.newPage();
    let status = null;
    p2.on('response', (resp) => { try { if (resp.url().startsWith(TARGET.replace(/\/$/, '')) && status === null) status = resp.status(); } catch (e) {} });
    await p2.goto(TARGET, { waitUntil: 'load', timeout: 30000 }).catch(() => {});
    await p2.waitForTimeout(1500);
    await p2.close();
    console.log(`  #${i + 1}: ${status}`);
    if (status === 200) okA++;
  }
  console.log(`  → ${okA}/5 200`);
  await browser.close();

  // B: got-scraping Node 重放 10 次（带真实 cookie header）
  console.log('\n=== B: got-scraping Node 重放（真实 cookie）===');
  let okB = 0;
  for (let i = 0; i < 10; i++) {
    const g = await gotScraping();
    const res = await g.get(TARGET, { headers: { 'User-Agent': UA, 'Cookie': cookieHeader } });
    if (res.statusCode === 200) okB++;
    console.log(`  #${i + 1}: ${res.statusCode}`);
  }
  console.log(`  → ${okB}/10 200`);

  console.log('\n===== 结论 =====');
  console.log(`同浏览器 ${okA}/5, Node ${okB}/10`);
  if (okB >= 9) console.log('→ [0] 不校验请求指纹，真实 cookie 可被 Node 重放，根因在管线 [0]/明文');
  else console.log('→ [0] 校验请求指纹，Node 重放真实 cookie 也失败 → 纯协议 100% 不可达');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
