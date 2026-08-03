/**
 * 547_jsdom_array_trap.js
 * jsdom 数组陷阱：hook push/slice/map/concat，抓取瑞数生成的 basearr 数组（~165B）
 * 记录调用栈，定位 basearr 生成代码
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');

// 拉挑战（用简单 HTTP，不用复杂代理）
const http = require('http');
const tls = require('tls');
function httpsGet(url) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const PROXY_URL = new URL('http://74940609:aFmWc5Fs@36.134.44.6:2018');
    const PROXY_AUTH = 'Basic ' + Buffer.from(PROXY_URL.username + ':' + PROXY_URL.password).toString('base64');
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
      let raw = '';
      tlsSock.on('data', d => raw += d);
      tlsSock.on('end', () => {
        const headEnd = raw.indexOf('\r\n\r\n');
        if (headEnd >= 0) {
          const resHead = raw.substring(0, headEnd);
          resolve({ status: parseInt((resHead.split(' ')[1] || '').trim()), body: raw.substring(headEnd + 4) });
        } else resolve({ status: 'ERR' });
      });
      tlsSock.on('error', e => resolve({ status: 'ERR' }));
    });
    connectReq.on('error', e => resolve({ status: 'ERR' }));
    connectReq.end();
  });
}

(async () => {
  const ch = await httpsGet(TARGET);
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { console.log('挑战解析失败'); process.exit(1); }
  const ts = { nsd: +m[1], cd: m[2] };
  console.log('nsd=' + ts.nsd);

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

  // ★ 数组陷阱（hook jsdom realm 的 Array）
  const captured = [];
  const AP = window.Array.prototype;
  const origPush = AP.push;
  AP.push = function (...args) {
    const newLen = this.length + args.length;
    if (newLen >= 100 && newLen <= 260) {
      try {
        captured.push({
          op: 'push', len: newLen,
          head: this.slice(0, 12).map(x => x.toString(16).padStart(2, '0')).join(' '),
          stack: new window.Error().stack ? new window.Error().stack.split('\n').slice(2, 6).map(s => s.trim().substring(0, 100)).join(' | ') : '',
        });
      } catch (e) {}
    }
    return origPush.apply(this, args);
  };
  const origSlice = AP.slice;
  AP.slice = function (a, b) {
    const res = origSlice.apply(this, arguments);
    if (res && res.length >= 100 && res.length <= 260 && this.length >= 100) {
      try {
        captured.push({
          op: 'slice', len: res.length,
          head: res.slice(0, 12).map(x => x.toString(16).padStart(2, '0')).join(' '),
          stack: new window.Error().stack ? new window.Error().stack.split('\n').slice(2, 6).map(s => s.trim().substring(0, 100)).join(' | ') : '',
        });
      } catch (e) {}
    }
    return res;
  };

  try { window.eval(fs.readFileSync(OUTER_JS, 'utf8')); } catch (e) { console.log('eval err:', e.message.substring(0, 60)); }
  await new Promise(r => setTimeout(r, 14000));

  console.log('\n捕获数组事件:', captured.length);
  const p = cookiesWritten.map(c => c.split(';')[0]).find(c => /P=/.test(c));
  console.log('P cookie:', p ? 'YES len=' + p.length : '无');

  // 过滤：找 basearr 相关（多次相同 head 的 push）
  const freq = {};
  for (const c of captured) {
    const key = c.op + ':' + c.head;
    freq[key] = (freq[key] || 0) + 1;
  }
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.log('\n高频事件:');
  for (const [k, v] of sorted) console.log(`  ${v}x ${k}`);
  console.log('\n前 20 个事件:');
  for (const c of captured.slice(0, 20)) console.log(`  ${c.op} len=${c.len} ${c.head} | ${c.stack.substring(0, 120)}`);
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
