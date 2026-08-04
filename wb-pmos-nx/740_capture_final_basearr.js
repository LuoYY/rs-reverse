/**
 * 740_capture_final_basearr.js
 * 捕获 basearr 最终长度（最大 push 数组）：
 * 条件断点每次 push 更新 window.__capArr（覆盖为更大），最后取最大
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const { chromium } = require('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules/patchright');

const ROOT = path.join(__dirname, '..');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const CHROMIUM = '/Applications/Chromium.app/Contents/MacOS/Chromium';
const REQABLE = 'http://127.0.0.1:9000';
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';

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
  const raw = fs.readFileSync(path.join(ROOT, 'nx-mock/412.raw'), 'utf8');
  const rawBody = raw.substring(raw.indexOf('\r\n\r\n') + 4);
  const nsd = +rawBody.match(/nsd=(\d+)/)[1];
  const cd = rawBody.match(/cd="([^"]+)"/)[1];
  const b86 = decodeB86(cd);
  console.log('nsd=' + nsd + ' b86 len=' + b86.length);

  const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true, proxy: { server: REQABLE }, args: ['--ignore-certificate-errors', '--no-sandbox'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  await cdp.send('Debugger.enable');
  const pushR = await cdp.send('Runtime.evaluate', { expression: 'Array.prototype.push' });
  await cdp.send('Debugger.setBreakpointOnFunctionCall', {
    objectId: pushR.result.objectId,
    condition: '(this.length >= 100 && this.every(function(x){return typeof x === "number" && x >= 0 && x < 256;})) ? (window.__capArr = Array.from(this), false) : false',
  });
  let pauses = 0;
  cdp.on('Debugger.paused', async () => { pauses++; await cdp.send('Debugger.resume').catch(() => {}); });
  await page.goto(TARGET, { timeout: 40000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 35000));
  let cap = null;
  try {
    const r = await cdp.send('Runtime.evaluate', { expression: 'window.__capArr ? JSON.stringify(window.__capArr) : "null"', returnByValue: true });
    cap = JSON.parse(r.result?.value || 'null');
  } catch (e) {}
  await browser.close();

  if (!cap) { console.log('未捕获', 'pauses=' + pauses); process.exit(1); }
  console.log('basearr 最终 len:', cap.length, 'pauses:', pauses);
  console.log('basearr[0-15]:', cap.slice(0, 16).join(','));
  console.log('basearr[16-31]:', cap.slice(16, 32).join(','));
  console.log('basearr[24-28]:', cap.slice(24, 29).join(','));
  console.log('basearr 尾10:', cap.slice(-10).join(','));

  // 对比公式（不同长度尝试）
  for (const L of [cap.length, 138, 140]) {
    const fb = b86.slice(2, 2 + L);
    const diffs = [];
    for (let i = 0; i < Math.min(fb.length, cap.length); i++) {
      if (fb[i] !== cap[i]) diffs.push(i);
    }
    const markers = diffs.filter(i => (i - 24) % 16 === 0);
    const nonM = diffs.filter(i => (i - 24) % 16 !== 0);
    console.log(`\n公式 b86[2:${2 + L}] len=${L}: 差异=${diffs.length} 标记=${markers.length} 非标记=${nonM.length}`);
    if (nonM.length <= 5) console.log('  非标记差异:', nonM.length ? nonM.join(',') : '★★★ 仅标记位置！');
    if (markers.length <= 12) console.log('  标记值:', markers.map(i => `${i}:${cap[i]}`).join(' '));
  }
  fs.writeFileSync('/tmp/nx_740_final.json', JSON.stringify({ cd, basearr: cap }));
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
