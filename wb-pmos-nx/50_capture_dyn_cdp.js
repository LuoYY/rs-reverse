/**
 * 50_capture_dyn_cdp.js
 *
 * CDP scriptParsed 时立即抓取大 eval 脚本源码（浏览器真实动态代码）
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
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  await cdp.send('Debugger.enable');

  let challenge = null;
  const dynScripts = [];
  cdp.on('Debugger.scriptParsed', async (p) => {
    if (p.url === '' && p.length > 50000) {
      try {
        const src = await cdp.send('Debugger.getScriptSource', { scriptId: p.scriptId });
        if (src.scriptSource && src.scriptSource.length > 50000) {
          dynScripts.push({ len: src.scriptSource.length, source: src.scriptSource });
        }
      } catch (e) { console.log('获取脚本失败:', e.message.substring(0, 50)); }
    }
  });
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

  console.log('加载 + reload...');
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(8000);
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(15000);
  console.log('challenge nsd:', challenge ? challenge.nsd : 'null');
  console.log('抓到动态代码:', dynScripts.length);

  if (dynScripts.length) {
    // 取第一个（最长）
    dynScripts.sort((a, b) => b.len - a.len);
    const code = dynScripts[0].source;
    fs.writeFileSync(path.join(OUT, 'browser_dyn.js'), code);
    console.log('已保存 browser_dyn.js len:', code.length);
    let s = 0; for (let i = 0; i < code.length; i += 100) s += code.charCodeAt(i);
    console.log('checksum(cp3):', s);
    fs.writeFileSync(path.join(OUT, 'browser_dyn_meta.json'), JSON.stringify({ capturedAt: Date.now(), challenge }));
  }

  await browser.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
