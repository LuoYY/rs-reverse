/**
 * 702_analyze_vm_sub.js
 * 捕获 dynCode + 分析第 3 行 basearr 构造的 VM 代码（_$ah @101969 / _$$z @106234 / _$m1 @41214）
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
  const ts = { nsd: +m[1], cd: m[2] };
  console.log('nsd=' + ts.nsd);

  const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: TARGET, referrer: TARGET, contentType: 'text/html', userAgent: UA,
    runScripts: 'outside-only', pretendToBeVisual: true, resources: 'usable',
  });
  const { window } = dom;
  window.$_ts = { nsd: ts.nsd, cd: ts.cd };
  window.__dyn = null;
  const origEval = window.eval.bind(window);
  window.eval = function (s) {
    if (typeof s === 'string' && s.length > 100000) window.__dyn = s;
    return origEval(s);
  };
  const cookiesWritten = [];
  let cookieJar = '';
  Object.defineProperty(window.document, 'cookie', {
    get() { return cookieJar; },
    set(v) { cookiesWritten.push(v); cookieJar = cookieJar ? cookieJar + '; ' + v : v; },
    configurable: true,
  });
  window.addEventListener('error', () => {});
  try { window.eval(outerJsCode); } catch (e) {}
  await new Promise(r => setTimeout(r, 15000));
  console.log('dynCode len:', window.__dyn ? window.__dyn.length : '无');
  if (!window.__dyn) process.exit(1);
  fs.writeFileSync('/tmp/nx_dyn_cur3.js', window.__dyn);

  // 分行找第 3 行（basearr 构造调用栈位置）
  const lines = window.__dyn.split('\n');
  console.log('行数:', lines.length);
  let off = 0;
  const lineOffsets = [0];
  for (let i = 0; i < lines.length; i++) {
    lineOffsets.push(off + lines[i].length + 1);
    off += lines[i].length + 1;
  }
  // 调用栈：第 3 行 @41214 / @101969 / @106234
  const line3 = lineOffsets[2]; // 第 3 行起始
  console.log('第 3 行起始:', line3, '第 3 行长:', lines[2] ? lines[2].length : 0);
  if (lines[2]) {
    console.log('第 3 行头:', lines[2].substring(0, 100));
    // 定位 41214 / 101969 / 106234（第 3 行的列偏移）
    for (const pos of [41214, 101969, 106234]) {
      const real = line3 + pos;
      console.log(`\n=== @${pos}（第 3 行）真实 ${real} ===`);
      console.log(window.__dyn.substring(real - 200, real + 200));
    }
    // 找 _$ah / _$$z / _$m1 定义
    for (const name of ['_$ah', '_$$z', '_$m1']) {
      const idx = window.__dyn.indexOf('function ' + name);
      console.log(`\nfunction ${name} @`, idx);
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
