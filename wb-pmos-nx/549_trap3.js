/**
 * 549_trap3.js
 * 抓 len 155-180 数组（basearr 候选）+ 逆向 jsdom cookie basearr 对比
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
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];

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

  const captured = [];
  const AP = window.Array.prototype;
  const origPush = AP.push;
  AP.push = function (...args) {
    const newLen = this.length + args.length;
    if (newLen >= 155 && newLen <= 180) {
      try {
        captured.push({
          len: newLen,
          arr: this.slice(0, newLen).map(x => (typeof x === 'number' ? x : 0)),
        });
      } catch (e) {}
    }
    return origPush.apply(this, args);
  };

  try { window.eval(fs.readFileSync(OUTER_JS, 'utf8')); } catch (e) { console.log('eval err:', e.message.substring(0, 60)); }
  await new Promise(r => setTimeout(r, 14000));
  const p = cookiesWritten.map(c => c.split(';')[0]).find(c => /P=/.test(c));
  console.log('P cookie:', p ? 'YES len=' + p.length : '无');

  // 逆向 jsdom basearr
  try {
    require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
    require('@src/handler/parser/constData').init();
    const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
    const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
    const keys16arr = numarrAddTime([...K16], 0, 1 / 256)[0];
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
    if (p) {
      const dec = encryptMode2([...decodeB86(p.split('=')[1].slice(1))], keys16arr, 1);
      const na = dec.slice(4);
      const beLen = (na[59] & 0x7f) << 8 | na[60];
      const be = na.slice(61, 61 + beLen);
      console.log('jsdom dec len:', dec.length, 'na len:', na.length, 'beLen:', beLen);
    }
  } catch (e) { console.log('reverse err:', e.message.substring(0, 60)); }

  // 打印捕获的数组（去重）
  console.log('\n捕获 len 155-180 数组:', captured.length);
  const seen = {};
  for (const c of captured) {
    const head = c.arr.slice(0, 16).map(x => x.toString(16).padStart(2, '0')).join(' ');
    if (!seen[head + '|' + c.len]) {
      seen[head + '|' + c.len] = true;
      console.log(`[len=${c.len}] ${head}`);
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
