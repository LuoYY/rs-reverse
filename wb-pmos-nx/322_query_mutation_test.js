/**
 * 322_query_mutation_test.js
 * 同 context：抓自动 query（URL+header）→ 原样重放 → 逐字段变异重放
 * 定位服务器校验边界：request_data / prefix / header 必要性
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const path = require('path');
const fs = require('fs');
const { chromium } = require('patchright');

const ROOT = path.join(__dirname, '..');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = { server: 'http://39.91.164.125:2018', username: '74940609', password: 'aFmWc5Fs' };
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const B86_64 = NX_BS.slice(0, 64);

function decodeB86(str) {
  const idxmap = {}; for (let i = 0; i < B86_64.length; i++) idxmap[B86_64[i]] = i;
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
function encodeB86(bytes) {
  let str = '';
  for (let i = 0; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    str += B86_64[(n >> 18) & 63] + B86_64[(n >> 12) & 63] + B86_64[(n >> 6) & 63] + B86_64[n & 63];
  }
  const rem = bytes.length % 3;
  if (rem === 1) {
    const n = bytes[bytes.length - 1];
    str += B86_64[(n >> 2) & 63] + B86_64[(n & 3) << 4];
  } else if (rem === 2) {
    const n = (bytes[bytes.length - 2] << 8) | bytes[bytes.length - 1];
    str += B86_64[(n >> 10) & 63] + B86_64[(n >> 4) & 63] + B86_64[(n & 15) << 2];
  }
  return str;
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const captured = [];
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
    const page = await context.newPage();
    page.on('request', (req) => {
      const u = req.url();
      if (u.includes('/px-common-authcenter/auth/v2/captcha/get') && !u.includes('.js')) {
        const qm = u.includes('?') ? u.split('?')[1] : null;
        const headers = req.headers();
        captured.push({
          urlQuery: qm ? qm.split('=')[1] : null,
          hdrQuery: headers['murr7rxg'] || null,
          t: Date.now(),
        });
      }
    });
    try { await page.goto(TARGET, { timeout: 90000 }); } catch (e) {}
    await page.waitForTimeout(8000);
    try { await page.reload({ timeout: 90000 }); } catch (e) {}
    await page.waitForTimeout(20000);
    console.log('页面标题:', await page.evaluate(() => document.title).catch(() => ''));

    // 触发多个 API 捕获完整 query
    await page.evaluate(async () => {
      await fetch('/px-common-authcenter/auth/v2/captcha/get', { method: 'POST', headers: { 'Content-Type': 'application/json;charset=UTF-8', 'ClientTag': 'OUTNET_BROWSE', 'CurrentRoute': '/outNet' }, body: JSON.stringify({ captchaType: 'blockPuzzle' }) });
    });
    await page.waitForTimeout(1500);
    await page.evaluate(async () => {
      await fetch('/px-common-authcenter/auth/v2/captcha/get', { method: 'POST', headers: { 'Content-Type': 'application/json;charset=UTF-8', 'ClientTag': 'OUTNET_BROWSE', 'CurrentRoute': '/outNet' }, body: JSON.stringify({ captchaType: 'blockPuzzle' }) });
    });
    await page.waitForTimeout(1500);

    const last = captured.filter(c => c.urlQuery)[captured.filter(c => c.urlQuery).length - 1];
    if (!last || !last.urlQuery) { console.log('无自动 query'); process.exit(1); }
    const urlQ = last.urlQuery;
    const hdrQ = last.hdrQuery;
    console.log('自动 URL query:', urlQ.substring(0, 30) + '... len:', urlQ.length);
    console.log('自动 HDR query:', (hdrQ || '无').substring(0, 30) + '... len:', hdrQ ? hdrQ.length : 0);
    const uBytes = decodeB86(urlQ.slice(1));
    const hBytes = hdrQ ? decodeB86(hdrQ.slice(1)) : null;
    console.log('URL query 解码:', uBytes.length, 'B crc:', uBytes.slice(0, 4).map(b => b.toString(16).padStart(2, '0')).join(' '), '标记:', uBytes.slice(4, 7).join(','));
    console.log('URL request_data:', uBytes.slice(56, 88).map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('HDR request_data:', hBytes ? hBytes.slice(56, 88).map(b => b.toString(16).padStart(2, '0')).join(' ') : '无');

    // 保存供后续分析
    fs.writeFileSync('/tmp/322_auto_queries.json', JSON.stringify({ urlQ, hdrQ, uBytes, hBytes }, null, 2));

    // ===== 黑盒变异测试（同 context fetch）=====
    const API = '/px-common-authcenter/auth/v2/captcha/get';
    async function testFetch(label, { urlQ: uq, hdrQ: hq, withHdr }) {
      const res = await page.evaluate(async ({ api, uq, hq, withHdr }) => {
        const headers = { 'Content-Type': 'application/json;charset=UTF-8', 'ClientTag': 'OUTNET_BROWSE', 'CurrentRoute': '/outNet' };
        if (withHdr && hq) headers['MurR7rxG'] = hq;
        const r = await fetch(api + (uq ? '?' + uq : ''), { method: 'POST', headers, body: JSON.stringify({ captchaType: 'blockPuzzle' }) });
        const t = await r.text();
        return { s: r.status, b: t.substring(0, 60) };
      }, { api: API, uq, hq, withHdr });
      console.log(`${label}: ${res.s} ${res.b.replace(/\n/g, ' ').substring(0, 50)}`);
      return res.s;
    }

    console.log('\n=== 变异测试（同 context）===');
    // 1. 原样重放（URL + header）
    await testFetch('原样(URL+HDR)', { urlQ, hdrQ, withHdr: true });
    // 2. 原样仅 URL（无 header）
    await testFetch('仅URL(无HDR)', { urlQ, hdrQ: null, withHdr: false });
    // 3. 无 query
    await testFetch('无query', { urlQ: null, hdrQ: null, withHdr: false });
    // 4. URL query 的 request_data 改 1 字节（第 60 字节 XOR 1）
    const uMut1 = [...uBytes]; uMut1[60] ^= 1;
    const qMut1 = 'a' + encodeB86(uMut1);
    await testFetch('URL request_data[4]^1', { urlQ: qMut1, hdrQ, withHdr: true });
    // 5. URL query 的 prefix 段改 1 字节（第 10 字节 XOR 1，即 request_data 明文 prefix 区）
    const uMut2 = [...uBytes]; uMut2[10] ^= 1;
    const qMut2 = 'a' + encodeB86(uMut2);
    await testFetch('URL bytes[10]^1', { urlQ: qMut2, hdrQ, withHdr: true });
    // 6. URL query 的 CRC 改 1 字节
    const uMut3 = [...uBytes]; uMut3[0] ^= 1;
    const qMut3 = 'a' + encodeB86(uMut3);
    await testFetch('URL crc[0]^1', { urlQ: qMut3, hdrQ, withHdr: true });
    // 7. header query 的 request_data 改 1 字节
    if (hBytes) {
      const hMut = [...hBytes]; hMut[60] ^= 1;
      const qHMut = 'a' + encodeB86(hMut);
      await testFetch('HDR request_data[4]^1', { urlQ, hdrQ: qHMut, withHdr: true });
    }
    // 8. 完全去掉 URL query 只 header
    await testFetch('仅HDR', { urlQ: null, hdrQ, withHdr: true });

    await context.close();
  } finally { await browser.close(); }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
