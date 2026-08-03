/**
 * 619_capture_envarr.js
 * 浏览器采集内层 VM 环境数组（_$iV / _$pS 等价物）
 * 方法：hook 内层 VM dispatcher 入口函数，dump 第 4 参数（环境数组）完整内容
 * 然后 jsdom 注入 → basearr 生成
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const http = require('http');
const tls = require('tls');
const { chromium } = require(path.join('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules', 'patchright'));

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
  if (ch.status !== 412) { process.exit(1); }
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { process.exit(1); }
  const ts = { nsd: +m[1], cd: m[2] };
  console.log('nsd=' + ts.nsd);

  const browser = await chromium.launch({ headless: true, proxy: { server: 'http://36.134.44.6:2018', username: '74940609', password: 'aFmWc5Fs' }, args: ['--ignore-certificate-errors', '--no-sandbox'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  await cdp.send('Debugger.enable');
  await page.route('**/pmos.nx.sgcc.com.cn:10443/', (route) => { route.fulfill({ status: 412, contentType: 'text/html', body: ch.body }); });
  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 15000));

  // 找内层 VM dispatcher：通过 window 上的函数
  // 瑞数内层 VM dispatcher 有 4 参数 + 属性访问
  const result = await page.evaluate(`(function(){
    const out = [];
    // 枚举 window 上所有函数，找 4 参数 + 含 bytecode 属性的
    const keys = Object.keys(window);
    for (const k of keys) {
      try {
        const v = window[k];
        if (typeof v === 'function' && v.length === 4) {
          const src = Function.prototype.toString.call(v);
          if (src.includes('._') && (src.includes('while(1)') || src.includes('while ('))) {
            out.push({ name: k, len: src.length, head: src.substring(0, 200) });
          }
        }
      } catch (e) {}
    }
    return out;
  })()`);
  console.log('内层 VM 候选:', result.length);
  result.forEach((r, i) => console.log(`#${i} ${r.name} len=${r.len}: ${r.head.replace(/\n/g, ' ').substring(0, 120)}`));

  // 找全局对象数组（瑞数 global）
  const gres = await page.evaluate(`(function(){
    const out = {};
    try {
      // 通过 XMLHttpRequest 闭包找？send 是原生，但 fetch 可能包装
      const fsrc = Function.prototype.toString.call(window.fetch || {});
      out.fetch = fsrc.substring(0, 200);
    } catch(e) { out.fetch = 'ERR'; }
    // 找 165 索引的 global 数组
    out.windowKeys = Object.keys(window).length;
    return out;
  })()`);
  console.log('fetch:', gres.fetch);
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
