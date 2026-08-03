/**
 * 577_browser_array_trap.js
 * 浏览器数组陷阱：hook Array.prototype.push 抓 basearr 数组构造
 * 记录 len 150-180 数组的完整内容 + 每字节来源（区分 环境值/keys）
 * 关键：basearr 明文 = [0-23]稳定指纹 + [24-29]动态 + [30-68]稳定 + [69+]keys
 * 用浏览器真实会话（patchright）验证捕获
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const http = require('http');
const tls = require('tls');
const { chromium } = require(path.join('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules', 'patchright'));

const ROOT = path.join(__dirname, '..');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY_URL = new URL('http://74940609:aFmWc5Fs@36.134.44.6:2018');
const PROXY_AUTH = 'Basic ' + Buffer.from(PROXY_URL.username + ':' + PROXY_URL.password).toString('base64');

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

(async () => {
  const ch = await httpsGet(TARGET);
  if (ch.status !== 412) { console.log('挑战失败', ch.status); process.exit(1); }
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { process.exit(1); }
  const ts = { nsd: +m[1], cd: m[2] };
  console.log('nsd=' + ts.nsd);

  const browser = await chromium.launch({ headless: true, proxy: { server: 'http://36.134.44.6:2018', username: '74940609', password: 'aFmWc5Fs' }, args: ['--ignore-certificate-errors', '--no-sandbox'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA });
  const page = await context.newPage();
  await page.route('**/pmos.nx.sgcc.com.cn:10443/', (route) => { route.fulfill({ status: 412, contentType: 'text/html', body: ch.body }); });

  // 注入数组陷阱（记录 push 到 155-180 长度的数组，保存完整内容）
  await page.addInitScript(() => {
    window.__trapped = [];
    const AP = Array.prototype;
    const origPush = AP.push;
    AP.push = function (...args) {
      const newLen = this.length + args.length;
      if (newLen >= 155 && newLen <= 180) {
        try {
          const arr = [];
          for (let i = 0; i < this.length; i++) arr.push(typeof this[i] === 'number' ? this[i] : null);
          for (const a of args) arr.push(typeof a === 'number' ? a : null);
          window.__trapped.push({ len: newLen, arr });
        } catch (e) {}
      }
      return origPush.apply(this, args);
    };
  });
  try { await page.goto(TARGET, { timeout: 60000, waitUntil: 'domcontentloaded' }); } catch (e) {}
  await page.waitForTimeout(10000);
  const ck = await context.cookies();
  const p = ck.find(c => c.name.endsWith('P'));
  console.log('P cookie:', p ? 'YES len=' + p.value.length : '无');

  // 提取捕获的数组
  const trapped = await page.evaluate('JSON.stringify(window.__trapped || [])');
  const arrs = JSON.parse(trapped);
  console.log('捕获数组数:', arrs.length);

  // 去重打印（按首 16 字节）
  const seen = new Set();
  for (const t of arrs) {
    const head = (t.arr || []).slice(0, 24).map(x => x === null ? '??' : x.toString(16).padStart(2, '0')).join(' ');
    const key = head + '|' + t.len;
    if (!seen.has(key)) {
      seen.add(key);
      console.log(`[len=${t.len}] ${head}`);
    }
  }
  await page.close();
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
