/**
 * 548_jsdom_trap2.js
 * 精确抓取 len 145-190 的数组（basearr 候选），完整打印 head 60B
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const http = require('http');
const tls = require('tls');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');

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

  const seen = {};
  const AP = window.Array.prototype;
  const origPush = AP.push;
  AP.push = function (...args) {
    const newLen = this.length + args.length;
    if (newLen >= 145 && newLen <= 195) {
      try {
        const head = this.slice(0, 60).map(x => (typeof x === 'number' ? x.toString(16).padStart(2, '0') : String(x).substring(0, 6))).join(' ');
        if (!seen[head]) {
          seen[head] = true;
          const stk = new window.Error().stack ? new window.Error().stack.split('\n').slice(3, 8).map(s => s.trim().substring(0, 90)).join('\n    ') : '';
          console.log(`\n[push len=${newLen}] ${head}`);
          console.log('  stack:', stk);
        }
      } catch (e) {}
    }
    return origPush.apply(this, args);
  };

  try { window.eval(fs.readFileSync(OUTER_JS, 'utf8')); } catch (e) { console.log('eval err:', e.message.substring(0, 60)); }
  await new Promise(r => setTimeout(r, 14000));
  const p = cookiesWritten.map(c => c.split(';')[0]).find(c => /P=/.test(c));
  console.log('\nP cookie:', p ? 'YES len=' + p.length : '无');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
