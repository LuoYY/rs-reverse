/**
 * 687_capture_reinject.js
 * jsdom 捕获 dynCode → 静态修改 _$_K（核心解释器）注入 bytecode dump → 重新 eval
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

  // 阶段 1：jsdom 捕获 dynCode（不修改）
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
  console.log('捕获 dynCode len:', window.__dyn ? window.__dyn.length : '无');
  if (!window.__dyn) process.exit(1);
  const dyn = window.__dyn;

  // 阶段 2：静态修改 dynCode（注入 _$_K bytecode dump）
  // 找核心解释器（含 ._$kN）
  const idx = dyn.indexOf('._$kN');
  console.log('._$kN @', idx);
  if (idx < 0) process.exit(1);
  const fnStart = dyn.lastIndexOf('function', idx);
  console.log('function @', fnStart, ':', dyn.substring(fnStart, fnStart + 80));
  const sigEnd = dyn.indexOf(')', fnStart);
  const bodyStart = dyn.indexOf('{', sigEnd);
  console.log('bodyStart:', bodyStart, '距 fnStart:', bodyStart - fnStart);

  // 修改：在函数体注入 bytecode dump（限制次数）
  window.__kLog = [];
  const inj = 'if(window.__kLog&&window.__kLog.length<200){try{window.__kLog.push({pos:arguments[1],bc:arguments[0]&&arguments[0]._$kN?Array.from(arguments[0]._$kN.slice(0,800)):null});}catch(e){}}';
  const dyn2 = dyn.substring(0, bodyStart + 1) + inj + dyn.substring(bodyStart + 1);
  fs.writeFileSync('/tmp/nx_dyn_injected2.js', dyn2);
  console.log('修改完成，重新 eval...');

  // 阶段 3：重新 eval 修改后的 dynCode
  try {
    window.eval(dyn2);
  } catch (e) { console.log('重新 eval err:', e.message.substring(0, 100)); }
  await new Promise(r => setTimeout(r, 20000));
  console.log('__kLog 条数:', window.__kLog.length);
  let saved = 0;
  for (const [i, k] of window.__kLog.entries()) {
    if (k.bc && Array.isArray(k.bc) && k.bc.length > 20) {
      console.log(`kLog[${i}] pos=${k.pos} bc_len=${k.bc.length} 头=${k.bc.slice(0, 60).join(',')}`);
      if (saved < 10) { fs.writeFileSync('/tmp/nx_bytecode_' + i + '.json', JSON.stringify(k)); saved++; }
    }
  }
  console.log('已保存:', saved);
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
