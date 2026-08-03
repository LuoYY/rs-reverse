/**
 * 684_hook_vm_v4.js
 * 只处理 dynCode 主段（len>400000）的 eval，注入核心解释器 hook
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
  window.__kLog = [];

  const origEval = window.eval.bind(window);
  let injected = false;
  window.eval = function (s) {
    if (typeof s === 'string' && s.length > 400000 && !injected) {
      injected = true;
      const idx = s.indexOf('._$kN');
      if (idx > 0) {
        const fnStart = s.lastIndexOf('function', idx);
        if (fnStart >= 0 && idx - fnStart < 15000) {
          const sigEnd = s.indexOf(')', fnStart);
          const bodyStart = s.indexOf('{', sigEnd);
          if (bodyStart > 0 && bodyStart - fnStart < 500) {
            const inj = 'try{window.__kLog.push({pos:arguments[1],bc:arguments[0]&&arguments[0]._$kN?Array.from(arguments[0]._$kN.slice(0,800)):null});}catch(e){}';
            s = s.substring(0, bodyStart + 1) + inj + s.substring(bodyStart + 1);
            console.log('[hook] 注入成功 函数头:', s.substring(fnStart, bodyStart + 1).substring(0, 60));
          } else console.log('[hook] bodyStart 距离过大', fnStart, bodyStart);
        } else console.log('[hook] ._$kN 距离函数远');
      } else console.log('[hook] 无 ._$kN');
      // 保存注入后的 dynCode
      fs.writeFileSync('/tmp/nx_dyn_injected.js', s);
    }
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
  try { window.eval(outerJsCode); } catch (e) { console.log('外层 eval err:', e.message.substring(0, 80)); }
  await new Promise(r => setTimeout(r, 20000));
  const pJ = cookiesWritten.map(c => c.split(';')[0]).find(c => /P=/.test(c));
  console.log('jsdom P cookie:', pJ ? 'YES' : '无');

  console.log('__kLog 条数:', window.__kLog.length);
  let saved = 0;
  for (const [i, k] of window.__kLog.entries()) {
    if (k.bc && Array.isArray(k.bc) && k.bc.length > 20) {
      console.log(`kLog[${i}] pos=${k.pos} bc_len=${k.bc.length} 头=${k.bc.slice(0, 50).join(',')}`);
      if (saved < 10) { fs.writeFileSync('/tmp/nx_bytecode_' + i + '.json', JSON.stringify(k)); saved++; }
    }
  }
  console.log('已保存:', saved);
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
