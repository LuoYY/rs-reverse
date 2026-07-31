/**
 * 49_capture_browser_dyn.js
 *
 * 在页面加载前注入 eval hook，抓浏览器实际执行的动态代码（>50000）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const { chromium } = require('patchright');
const fs = require('fs');
const path = require('path');

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' };
const OUT = path.join(__dirname, 'captures');

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
  const page = await context.newPage();

  let challenge = null;
  page.on('response', async (resp) => {
    if (resp.status() === 412 && !challenge) {
      try {
        const body = await resp.text();
        const nsdM = body.match(/\$_ts\.nsd\s*=\s*(\d+)/);
        const cdM = body.match(/\$_ts\.cd\s*=\s*"([^"]+)"/);
        challenge = { nsd: nsdM ? +nsdM[1] : null, cd: cdM ? cdM[1] : null };
      } catch (e) {}
    }
  });

  // 页面初始化 hook（外层 VM eval 前）
  await page.addInitScript(() => {
    window.__dynCodes = [];
    window.__evalHook = true;
    const origEval = window.eval;
    window.eval = function(code) {
      try {
        if (typeof code === 'string' && code.length > 50000) {
          window.__dynCodes.push(code);
        }
      } catch (e) {}
      return origEval(code);
    };
    // 也 hook Function
    const origFunc = Function;
    window.Function = function() {
      const args = Array.from(arguments);
      const body = args.pop() || '';
      try {
        if (typeof body === 'string' && body.length > 50000) {
          window.__dynCodes.push(body);
        }
      } catch (e) {}
      return origFunc.apply(this, [...args, body]);
    };
    window.Function.prototype = origFunc.prototype;
  });

  console.log('加载 + reload...');
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(8000);
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(15000);
  console.log('challenge nsd:', challenge ? challenge.nsd : 'null');

  const dynR = await page.evaluate('window.__dynCodes ? window.__dynCodes.map(c => c.length) : []');
  console.log('浏览器动态代码:', JSON.stringify(dynR));

  const codesR = await page.evaluate('window.__dynCodes || []');
  if (codesR && codesR.length) {
    const code = codesR[0];
    fs.writeFileSync(path.join(OUT, 'browser_dyn.js'), code);
    console.log('已保存 browser_dyn.js len:', code.length);
    // checksum
    let s = 0; for (let i = 0; i < code.length; i += 100) s += code.charCodeAt(i);
    console.log('checksum(cp3):', s);
  }

  // 保存 challenge
  fs.writeFileSync(path.join(OUT, 'browser_dyn_meta.json'), JSON.stringify({ capturedAt: Date.now(), challenge }));

  await browser.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
