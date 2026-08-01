/**
 * 325_split_query_test.js
 * 分离错误源：自动 query 的 request_data（已知有效）拼 Node 结构 → 若 200 则 keys2/结构/CRC 对，问题只在 request_data
 * 若 412 则 keys2/结构/CRC 也有问题
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const path = require('path');
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
function crc32b(buf) {
  let c = 0xffffffff;
  for (const b of buf) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return (c ^ 0xffffffff) >>> 0;
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
        captured.push({ urlQuery: qm ? qm.split('=')[1] : null, hdrQuery: req.headers()['murr7rxg'] || null });
      }
    });
    try { await page.goto(TARGET, { timeout: 90000 }); } catch (e) {}
    await page.waitForTimeout(8000);
    try { await page.reload({ timeout: 90000 }); } catch (e) {}
    await page.waitForTimeout(20000);
    console.log('页面标题:', await page.evaluate(() => document.title).catch(() => ''));

    // 触发 API
    await page.evaluate(async () => {
      await fetch('/px-common-authcenter/auth/v2/captcha/get', { method: 'POST', headers: { 'Content-Type': 'application/json;charset=UTF-8', 'ClientTag': 'OUTNET_BROWSE', 'CurrentRoute': '/outNet' }, body: JSON.stringify({ captchaType: 'blockPuzzle' }) });
    });
    await page.waitForTimeout(1500);

    const valid = captured.find(c => c.urlQuery);
    if (!valid) { console.log('无自动 query'); process.exit(1); }
    const autoU = valid.urlQuery;
    const autoH = valid.hdrQuery;
    const aUB = decodeB86(autoU.slice(1));
    const aHB = autoH ? decodeB86(autoH.slice(1)) : null;
    console.log('自动 URL query:', autoU.substring(0, 25) + '... len:', autoU.length);
    console.log('自动 keys2:', aUB.slice(7, 15).map(b => b.toString(16).padStart(2, '0')).join(' '));
    const autoReqU = aUB.slice(56, 88);
    const autoReqH = aHB ? aHB.slice(56, 88) : null;

    // 构造 query：结构按 Node 算法，request_data 用自动的
    function buildQuery(keys2, requestData) {
      const body = [4, 0, 48, ...keys2, 32, ...requestData];
      const crc = crc32b(Buffer.from(body));
      return 'a' + encodeB86([(crc >>> 24) & 255, (crc >>> 16) & 255, (crc >>> 8) & 255, crc & 255, ...body]);
    }
    const k2 = aUB.slice(7, 55);
    // 方案A: keys2 + request_data 都自动，CRC 重算 → 验证重算 CRC 是否正确
    const qA = buildQuery(k2, autoReqU);
    // 方案B: 用自动 URL query 的 header request_data
    const qB = autoReqH ? buildQuery(k2, autoReqH) : null;
    // 方案C: 原样自动 URL query（重放，应 400 反重放）
    const qC = autoU;

    async function testFetch(label, uq, hq, withHdr) {
      const res = await page.evaluate(async ({ api, uq, hq, withHdr }) => {
        const headers = { 'Content-Type': 'application/json;charset=UTF-8', 'ClientTag': 'OUTNET_BROWSE', 'CurrentRoute': '/outNet' };
        if (withHdr && hq) headers['MurR7rxG'] = hq;
        const r = await fetch(api + (uq ? '?' + uq : ''), { method: 'POST', headers, body: JSON.stringify({ captchaType: 'blockPuzzle' }) });
        const t = await r.text();
        return { s: r.status, b: t.substring(0, 60) };
      }, { api: '/px-common-authcenter/auth/v2/captcha/get', uq, hq, withHdr });
      console.log(`${label}: ${res.s} ${res.b.replace(/\n/g, ' ').substring(0, 50)}`);
      return res.s;
    }

    console.log('\n=== 分离测试 ===');
    console.log('qA(自动reqU+重算CRC) 前8:', qA.slice(0, 8));
    await testFetch('A 自动reqU+重算CRC (URL+HDR)', qA, autoH, true);
    await testFetch('A2 自动reqU+重算CRC (仅URL)', qA, null, false);
    if (qB) {
      console.log('qB(自动reqH+重算CRC) 前8:', qB.slice(0, 8));
      await testFetch('B 自动reqH+重算CRC (URL+HDR)', qB, autoH, true);
    }
    await testFetch('C 原样自动 (URL+HDR)', qC, autoH, true);
    // 用全新的浏览器生成 query（触发页面自己再生成，避免反重放）
    console.log('\n=== 页面重新触发（验证反重放 vs query 有效）===');
    await page.evaluate(async () => {
      await fetch('/px-common-authcenter/auth/v2/captcha/get', { method: 'POST', headers: { 'Content-Type': 'application/json;charset=UTF-8', 'ClientTag': 'OUTNET_BROWSE', 'CurrentRoute': '/outNet' }, body: JSON.stringify({ captchaType: 'blockPuzzle' }) });
    });
    await page.waitForTimeout(1500);
    const valid2 = captured[captured.length - 1];
    if (valid2 && valid2.urlQuery && valid2.urlQuery !== autoU) {
      const aUB2 = decodeB86(valid2.urlQuery.slice(1));
      const k22 = aUB2.slice(7, 55);
      console.log('新自动 keys2 相同:', k22.every((v, i) => v === k2[i]));
      await testFetch('D 新自动 query 重放 (URL+HDR)', valid2.urlQuery, valid2.hdrQuery, true);
    } else {
      console.log('无新 query（可能被反重放拦截）');
    }

    await context.close();
  } finally { await browser.close(); }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
