/**
 * 738_full_closure_test.js
 * 固定环境（reqable nsd=67402）完整闭环：
 * 1. CDP 捕获浏览器真实 basearr（len 130-155 纯数字）+ P cookie
 * 2. 对比公式 basearr（b86[2:140]）→ 确认公式
 * 3. 重构 cookie（公式 basearr）测服务器 → 纯算法验证！
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const http = require('http');
const tls = require('tls');
const { chromium } = require('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules/patchright');

const ROOT = path.join(__dirname, '..');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const API = '/px-common-authcenter/auth/v2/captcha/get';
const CHROMIUM = '/Applications/Chromium.app/Contents/MacOS/Chromium';
const REQABLE = 'http://127.0.0.1:9000';
const PROXY_EXT = 'http://74940609:aFmWc5Fs@36.134.44.6:2018';
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const B86_64 = NX_BS.slice(0, 64);
const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function decodeB86(str) {
  const idxmap = {}; for (let i = 0; i < 64; i++) idxmap[NX_BS[i]] = i;
  const bytes = []; let qi = 0;
  for (let g = 0; g < Math.floor(str.length / 4); g++) {
    const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]], c3 = idxmap[str[qi + 3]];
    if (c0 === undefined) return null;
    qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  const rem = str.length - qi;
  if (rem === 2) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]]; if (c0 === undefined) return null; bytes.push((c0 << 2) | (c1 >> 4)); }
  else if (rem === 3) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]]; if (c0 === undefined) return null; bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2)); }
  return bytes;
}

(async () => {
  // 固定 nsd/cd
  const raw = fs.readFileSync(path.join(ROOT, 'nx-mock/412.raw'), 'utf8');
  const rawBody = raw.substring(raw.indexOf('\r\n\r\n') + 4);
  const nsd = +rawBody.match(/nsd=(\d+)/)[1];
  const cd = rawBody.match(/cd="([^"]+)"/)[1];
  const b86 = decodeB86(cd);
  console.log('nsd=' + nsd + ' b86 len=' + b86.length);
  const formulaBase = b86.slice(2, 140);
  console.log('公式[0-15]:', formulaBase.slice(0, 16).join(','));
  console.log('公式[25-28]:', formulaBase.slice(25, 29).join(','));

  // CDP 捕获 basearr + P cookie
  const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true, proxy: { server: REQABLE }, args: ['--ignore-certificate-errors', '--no-sandbox'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  await cdp.send('Debugger.enable');
  const pushR = await cdp.send('Runtime.evaluate', { expression: 'Array.prototype.push' });
  await cdp.send('Debugger.setBreakpointOnFunctionCall', {
    objectId: pushR.result.objectId,
    condition: '(this.length >= 130 && this.length <= 155 && this.every(function(x){return typeof x === "number" && x >= 0 && x < 256;}) && !window.__basearr) ? (window.__basearr = Array.from(this), true) : false',
  });
  let pushObjId = pushR.result.objectId;
  const cap = await new Promise(async (resolve) => {
    let done = false;
    const handler = async (params) => {
      if (done) { await cdp.send('Debugger.resume').catch(() => {}); return; }
      try {
        const r = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__basearr)', returnByValue: true });
        const arr = JSON.parse(r.result?.value || '[]');
        if (arr.length >= 130) {
          done = true;
          // 解除断点（condition false）
          await cdp.send('Debugger.setBreakpointOnFunctionCall', { objectId: pushObjId, condition: 'false' }).catch(() => {});
          cdp.off('Debugger.paused', handler);
          resolve(arr);
          return;
        }
      } catch (e) {}
      await cdp.send('Debugger.resume').catch(() => {});
    };
    cdp.on('Debugger.paused', handler);
    await page.goto(TARGET, { timeout: 40000, waitUntil: 'commit' }).catch(() => {});
    await new Promise(r => setTimeout(r, 20000));
    setTimeout(() => resolve(null), 5000);
  });
  // basearr 捕获后继续等 P cookie
  let p = null;
  for (let i = 0; i < 5; i++) {
    await new Promise(r => setTimeout(r, 6000));
    const ck = await context.cookies();
    p = ck.find(c => /P$/.test(c.name));
    if (p) break;
  }
  await browser.close();
  if (!cap) { console.log('basearr 采集失败'); process.exit(1); }
  console.log('CDP basearr len:', cap.length);
  console.log('CDP basearr[0-15]:', cap.slice(0, 16).join(','));
  console.log('CDP basearr[25-28]:', cap.slice(25, 29).join(','));
  console.log('P cookie len:', p ? p.value.length : '无');

  // 对比公式 vs CDP basearr
  const diffs = [];
  for (let i = 0; i < Math.min(formulaBase.length, cap.length); i++) {
    if (formulaBase[i] !== cap[i]) diffs.push(i);
  }
  console.log('\n公式 vs CDP basearr 差异:', diffs.length);
  if (diffs.length) {
    const markers = diffs.filter(i => (i - 24) % 16 === 0);
    const nonM = diffs.filter(i => (i - 24) % 16 !== 0);
    console.log('标记位置:', markers.join(','));
    console.log('非标记差异:', nonM.length ? nonM.join(',') : '★★★ 仅标记位置差异！');
    console.log('标记位置 CDP值:', markers.map(i => `${i}:${cap[i]}`).join(' '));
    console.log('标记位置 b86值:', markers.map(i => `${i}:${b86[i + 2]}`).join(' '));
  } else {
    console.log('★★★ 完全一致！公式验证通过！');
  }
  fs.writeFileSync('/tmp/nx_738_cap.json', JSON.stringify({ cd, cap, pVal: p ? p.value : null }));
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
