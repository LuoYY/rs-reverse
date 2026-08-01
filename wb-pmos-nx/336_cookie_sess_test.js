/**
 * 336_cookie_sess_test.js
 * 浏览器内连续请求：记录每次响应的 Set-Cookie（O 是否刷新）+ 412 的 nsd
 * 判断会话机制：O cookie 刷新 / 反重放 / 请求数限制
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
    const setCookies = [];
    const respNsds = [];
    page.on('response', async (resp) => {
      const u = resp.url();
      if (u.includes('/px-') && !u.includes('.js')) {
        const sc = resp.headers()['set-cookie'];
        if (sc) setCookies.push({ url: u.replace('https://pmos.nx.sgcc.com.cn:10443', ''), sc: sc.substring(0, 80), status: resp.status() });
        if (resp.status() === 412) {
          try {
            const body = await resp.text();
            const nsdM = body.match(/\$_ts\.nsd\s*=\s*(\d+)/);
            respNsds.push({ url: u.replace('https://pmos.nx.sgcc.com.cn:10443', ''), nsd: nsdM ? +nsdM[1] : '?' });
          } catch (e) {}
        }
      }
    });
    try { await page.goto(TARGET, { timeout: 90000 }); } catch (e) {}
    await page.waitForTimeout(8000);
    try { await page.reload({ timeout: 90000 }); } catch (e) {}
    await page.waitForTimeout(20000);
    console.log('标题:', await page.evaluate(() => document.title).catch(() => ''));

    // 连续 5 个不同 API
    const apis = [
      '/px-common-authcenter/auth/v2/captcha/get',
      '/px-common-authcenter/auth/v2/verifyType/get',
      '/px-gateway/GatewayConfig/security',
      '/px-gateway/GatewayConfig/getGatewayConfig',
      '/px-common-authcenter/auth/v2/captcha/get',
    ];
    for (let i = 0; i < apis.length; i++) {
      const res = await page.evaluate(async (api) => {
        const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json;charset=UTF-8' }, body: '{}' });
        const t = await r.text();
        return { s: r.status, b: t.substring(0, 40) };
      }, apis[i]);
      const cks = await context.cookies();
      const o = cks.find(c => c.name.endsWith('O'));
      const p = cks.find(c => c.name.endsWith('P'));
      console.log(`#${i + 1} ${apis[i].split('/').pop()}: ${res.s} | O前8:${o ? o.value.substring(0, 8) : '无'} P长:${p ? p.value.length : 0}`);
      await page.waitForTimeout(600);
    }
    console.log('\n=== Set-Cookie 记录 ===');
    setCookies.forEach((sc, i) => console.log(`#${i + 1} ${sc.status} ${sc.url}: ${sc.sc}`));
    console.log('\n=== 412 nsd ===');
    respNsds.forEach((r, i) => console.log(`#${i + 1} ${r.url}: nsd=${r.nsd}`));
    await context.close();
  } finally { await browser.close(); }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
