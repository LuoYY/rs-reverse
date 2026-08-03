/**
 * 343_p_refresh_test.js
 * 浏览器页面加载后：连续请求 getGatewayConfig，记录每次 P cookie 是否刷新 + 状态
 * 决定性：P 刷新 vs 服务器窗口
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const { chromium } = require('patchright');

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = { server: 'http://39.91.164.125:2018', username: '74940609', password: 'aFmWc5Fs' };

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
    const page = await context.newPage();
    try { await page.goto(TARGET, { timeout: 90000 }); } catch (e) {}
    await page.waitForTimeout(8000);
    try { await page.reload({ timeout: 90000 }); } catch (e) {}
    await page.waitForTimeout(20000);
    console.log('标题:', await page.evaluate(() => document.title).catch(() => ''));

    // 连续 4 次 getGatewayConfig，每次记录 P cookie 值
    for (let i = 1; i <= 4; i++) {
      const res = await page.evaluate(async () => {
        const r = await fetch('/px-gateway/GatewayConfig/getGatewayConfig', { method: 'POST', headers: { 'Content-Type': 'application/json;charset=UTF-8' }, body: '{}' });
        const t = await r.text();
        return { s: r.status, b: t.substring(0, 40) };
      });
      const cks = await context.cookies();
      const o = cks.find(c => c.name.endsWith('O'));
      const p = cks.find(c => c.name.endsWith('P'));
      console.log(`#${i}: ${res.s} | P前12:${p ? p.value.substring(0, 12) : '无'} P尾12:${p ? p.value.substring(p.value.length - 12) : ''} | O前8:${o ? o.value.substring(0, 8) : ''}`);
      await page.waitForTimeout(1500);
    }
    await context.close();
  } finally { await browser.close(); }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
