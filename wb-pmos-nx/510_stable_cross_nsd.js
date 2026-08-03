/**
 * 510_stable_cross_nsd.js
 * 关键判断实验：稳定段（dec 65-80）跨 nsd/cd 是否变化？
 * - 浏览器：两个不同挑战（不同 nsd/cd），各生成 cookie 解稳定段
 *   → 若稳定段相同 → f(环境) 纯环境指纹（纯算法硬墙）
 *   → 若稳定段不同 → f(环境, nsd, cd) 含挑战因子（有纯算法可能）
 * - jsdom：同样两个挑战 → jsdom 稳定段是否含 nsd/cd 因子
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const http = require('http');
const tls = require('tls');
const { JSDOM } = require('jsdom');
const { chromium } = require(path.join('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules', 'patchright'));

const ROOT = path.join(__dirname, '..');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
const PROXY_URL = new URL('http://74940609:aFmWc5Fs@36.134.44.6:2018');
const PROXY_AUTH = 'Basic ' + Buffer.from(PROXY_URL.username + ':' + PROXY_URL.password).toString('base64');
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];

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
function httpsGet(url) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const connectReq = http.request({
      host: PROXY_URL.hostname, port: +PROXY_URL.port, method: 'CONNECT',
      path: `${u.hostname}:${u.port || 443}`,
      headers: { 'Proxy-Authorization': PROXY_AUTH, Host: `${u.hostname}:${u.port || 443}` },
      timeout: 25000,
    });
    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) { socket.destroy(); resolve({ status: 'ERR' }); return; }
      const tlsSock = tls.connect({ socket, servername: u.hostname, rejectUnauthorized: false }, () => {
        tlsSock.write(`GET ${u.pathname + u.search} HTTP/1.1\r\nHost: ${u.hostname}:${u.port || 443}\r\nUser-Agent: ${UA}\r\nAccept: */*\r\nConnection: close\r\n\r\n`);
      });
      let body = '', raw = '';
      tlsSock.on('data', d => raw += d);
      tlsSock.on('end', () => {
        const headEnd = raw.indexOf('\r\n\r\n');
        if (headEnd >= 0) {
          const resHead = raw.substring(0, headEnd);
          const setCookies = [];
          resHead.split('\r\n').forEach(l => { if (/^set-cookie:/i.test(l)) setCookies.push(l.substring(11).split(';')[0]); });
          resolve({ status: parseInt((resHead.split(' ')[1] || '').trim()), body: raw.substring(headEnd + 4), setCookies });
        } else resolve({ status: 'ERR' });
      });
      tlsSock.on('error', e => resolve({ status: 'ERR' }));
    });
    connectReq.on('error', e => resolve({ status: 'ERR' }));
    connectReq.on('timeout', () => { connectReq.destroy(); resolve({ status: 'TIMEOUT' }); });
    connectReq.end();
  });
}

function jsdomRun(ts, outerJsCode) {
  return new Promise((resolve) => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      url: TARGET, referrer: TARGET, contentType: 'text/html', userAgent: UA,
      runScripts: 'outside-only', pretendToBeVisual: true, resources: 'usable',
    });
    const { window } = dom;
    window.$_ts = { nsd: ts.nsd, cd: ts.cd };
    const cookiesWritten = [];
    let cookieJar = '';
    Object.defineProperty(window.document, 'cookie', {
      get() { return cookieJar; },
      set(v) { cookiesWritten.push(v); cookieJar = cookieJar ? cookieJar + '; ' + v : v; },
      configurable: true,
    });
    window.addEventListener('error', () => {});
    try { window.eval(outerJsCode); } catch (e) {}
    setTimeout(() => {
      const p = cookiesWritten.map(c => c.split(';')[0]).find(c => /P=/.test(c));
      resolve(p ? p.split('=')[1] : null);
    }, 12000);
  });
}

(async () => {
  // 拉两个挑战
  const ch1 = await httpsGet(TARGET);
  const ch2 = await httpsGet(TARGET);
  if (ch1.status !== 412 || ch2.status !== 412) { console.log('挑战拉取失败', ch1.status, ch2.status); process.exit(1); }
  const m1 = ch1.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  const m2 = ch2.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m1 || !m2) { console.log('nsd/cd 解析失败'); process.exit(1); }
  const ts1 = { nsd: +m1[1], cd: m1[2] };
  const ts2 = { nsd: +m2[1], cd: m2[2] };
  console.log('挑战1 nsd=' + ts1.nsd + ' cd=' + ts1.cd.substring(0, 8) + '...');
  console.log('挑战2 nsd=' + ts2.nsd + ' cd=' + ts2.cd.substring(0, 8) + '...');
  console.log('nsd 相同:', ts1.nsd === ts2.nsd);

  try { require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package)); } catch (e) {}
  require(path.join(ROOT, 'src/handler/parser/constData')).init();
  const { encryptMode2 } = require(path.join(ROOT, 'src/handler/parser/common/modeEncrypt'));
  const numarrAddTime = require(path.join(ROOT, 'src/handler/parser/common/numarrAddTime'));
  const arr = numarrAddTime([...K16], 0, 1 / 256)[0];
  const dec = (p) => p ? encryptMode2([...decodeB86(p.slice(1))], arr, 1) : null;

  // 浏览器两个挑战
  const browser = await chromium.launch({ headless: true, proxy: { server: 'http://36.134.44.6:2018', username: '74940609', password: 'aFmWc5Fs' }, args: ['--ignore-certificate-errors', '--no-sandbox'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA });
  const bDecs = [];
  for (const [i, ch, ts] of [[0, ch1, ts1], [1, ch2, ts2]]) {
    const page = await context.newPage();
    await page.route('**/pmos.nx.sgcc.com.cn:10443/', (route) => { route.fulfill({ status: 412, contentType: 'text/html', body: ch.body }); });
    try { await page.goto(TARGET, { timeout: 60000, waitUntil: 'domcontentloaded' }); } catch (e) {}
    await page.waitForTimeout(9000);
    const ck = await context.cookies();
    const p = ck.find(c => c.name.endsWith('P'));
    bDecs.push(dec(p ? p.value : null));
    console.log(`浏览器挑战${i + 1} P len=${p ? p.value.length : '无'} nsd=${ts.nsd}`);
    await page.close();
  }
  await browser.close();

  // jsdom 两个挑战
  const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');
  const jDecs = [];
  for (const [i, ts] of [[0, ts1], [1, ts2]]) {
    const p = await jsdomRun(ts, outerJsCode);
    jDecs.push(dec(p));
    console.log(`jsdom 挑战${i + 1} P len=${p ? p.length : '无'} nsd=${ts.nsd}`);
  }

  // 对比
  console.log('\n=== 稳定段（65-80）跨 nsd/cd 对比 ===');
  console.log('浏览器 挑战1 vs 挑战2:', bDecs[0] && bDecs[1] ? bDecs[0].slice(65, 81).map((v, i) => v === bDecs[1][65 + i]).filter(Boolean).length + '/16' : '数据缺失');
  console.log('  B1:', bDecs[0] ? bDecs[0].slice(65, 81).map(b => b.toString(16).padStart(2, '0')).join(' ') : '');
  console.log('  B2:', bDecs[1] ? bDecs[1].slice(65, 81).map(b => b.toString(16).padStart(2, '0')).join(' ') : '');
  console.log('jsdom 挑战1 vs 挑战2:', jDecs[0] && jDecs[1] ? jDecs[0].slice(65, 81).map((v, i) => v === jDecs[1][65 + i]).filter(Boolean).length + '/16' : '数据缺失');
  console.log('  J1:', jDecs[0] ? jDecs[0].slice(65, 81).map(b => b.toString(16).padStart(2, '0')).join(' ') : '');
  console.log('  J2:', jDecs[1] ? jDecs[1].slice(65, 81).map(b => b.toString(16).padStart(2, '0')).join(' ') : '');
  if (bDecs[0] && jDecs[0]) console.log('浏览器 vs jsdom（同挑战1）:', bDecs[0].slice(65, 81).map((v, i) => v === jDecs[0][65 + i]).filter(Boolean).length + '/16');
  if (bDecs[0] && bDecs[1]) console.log('\n浏览器 keys2 跨 nsd 相同:', bDecs[0].slice(15, 63).map((v, i) => v === bDecs[1][15 + i]).filter(Boolean).length + '/48');
  if (jDecs[0] && jDecs[1]) console.log('jsdom keys2 跨 nsd 相同:', jDecs[0].slice(15, 63).map((v, i) => v === jDecs[1][15 + i]).filter(Boolean).length + '/48');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
