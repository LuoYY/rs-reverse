/**
 * 47_compare_dyncode.js
 *
 * 对比浏览器实际执行的动态代码 vs 沙箱（runOuterVM）提取的动态代码
 * 判断 cp3 是否一致
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

function checksum(code) { let s = 0; for (let i = 0; i < code.length; i += 100) s += code.charCodeAt(i); return s; }

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  await cdp.send('Debugger.enable');

  let challenge = null;
  const dynScripts = [];
  cdp.on('Debugger.scriptParsed', (p) => {
    // 大 eval 脚本（瑞数动态代码）
    if (p.url === '' && p.length > 50000) {
      dynScripts.push({ scriptId: p.scriptId, len: p.length, hash: p.hash });
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
  console.log('浏览器动态代码 scripts:', dynScripts.length);
  dynScripts.forEach(s => console.log('  scriptId=' + s.scriptId + ' len=' + s.len + ' hash=' + s.hash));

  // 获取第一个大 eval 的内容
  let browserDyn = null;
  if (dynScripts.length) {
    try {
      const src = await cdp.send('Debugger.getScriptSource', { scriptId: dynScripts[0].scriptId });
      browserDyn = src.scriptSource;
      console.log('浏览器 dynCode len:', browserDyn.length, 'checksum:', checksum(browserDyn));
      fs.writeFileSync(path.join(OUT, 'browser_dyn.js'), browserDyn);
    } catch (e) { console.log('获取失败:', e.message.substring(0, 60)); }
  }

  // 沙箱提取
  if (challenge) {
    const { runOuterVM } = require(path.join(__dirname, '..', 'extract_dyncode_20080.js'));
    const OUTER_JS = path.join(__dirname, '..', 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
    const r = runOuterVM({ nsd: challenge.nsd, cd: challenge.cd }, fs.readFileSync(OUTER_JS, 'utf8'));
    console.log('\n沙箱 dynCode len:', r.dynLen, 'checksum(cp3):', r.cp3);
    fs.writeFileSync(path.join(OUT, 'sandbox_dyn.js'), r.dynCode || '');
    if (browserDyn && r.dynCode) {
      const same = browserDyn === r.dynCode;
      console.log('浏览器 dyn == 沙箱 dyn:', same ? 'YES ✓' : 'NO ✗');
      if (!same) {
        // 找差异
        let diffAt = -1;
        for (let i = 0; i < Math.min(browserDyn.length, r.dynCode.length); i++) {
          if (browserDyn[i] !== r.dynCode[i]) { diffAt = i; break; }
        }
        console.log('首个差异 @', diffAt, '浏览器len=' + browserDyn.length, '沙箱len=' + r.dynCode.length);
        if (diffAt >= 0) {
          console.log('浏览器:', browserDyn.substring(diffAt - 30, diffAt + 30));
          console.log('沙箱  :', r.dynCode.substring(diffAt - 30, diffAt + 30));
        }
      }
    }
  }

  await browser.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
