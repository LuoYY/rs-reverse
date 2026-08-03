/**
 * 694_reverse_d4.js
 * jsdom 捕获 dynCode + 定位 basearr 构造函数（_$d4 @3:115820）→ 反编译 [25-28] 生成
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
  fs.writeFileSync('/tmp/nx_dyn_cur2.js', window.__dyn);

  // 分行 + 计算第 3 行偏移
  const lines = window.__dyn.split('\n');
  console.log('行数:', lines.length);
  lines.forEach((l, i) => console.log(`行${i + 1}: len=${l.length} 头=${l.substring(0, 60)}`));
  let off3 = 0;
  for (let i = 0; i < 2; i++) off3 += lines[i].length + 1;
  console.log('第 3 行起始偏移:', off3);
  const pos = off3 + 115820;
  console.log('\n=== @115820（第 3 行）真实位置', pos, '前后 1000 ===');
  console.log(window.__dyn.substring(pos - 500, pos + 500));

  // 找 _$d4 函数定义
  const d4Idx = window.__dyn.indexOf('function _$d4');
  console.log('\nfunction _$d4 @', d4Idx);
  if (d4Idx > 0) {
    const openBrace = window.__dyn.indexOf('{', d4Idx);
    let stack = 0, end = -1;
    for (let i = openBrace; i < Math.min(openBrace + 200000, window.__dyn.length); i++) {
      if (window.__dyn[i] === '{') stack++;
      else if (window.__dyn[i] === '}') { stack--; if (stack === 0) { end = i; break; } }
    }
    console.log('_$d4 定义 len:', end - d4Idx);
    console.log(window.__dyn.substring(d4Idx, Math.min(end + 1, d4Idx + 3000)));
    fs.writeFileSync('/tmp/nx_d4.js', window.__dyn.substring(d4Idx, end + 1));
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
