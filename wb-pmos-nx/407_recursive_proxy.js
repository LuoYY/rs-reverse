/**
 * 407_recursive_proxy.js
 * 递归 Proxy 兜底：document 任何属性返回的对象继续包 Proxy，任何 .documentMode 返回 11
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const http = require('http');
const tls = require('tls');

const ROOT = path.join(__dirname, '..');
const PROXY = 'http://74940609:aFmWc5Fs@36.134.44.6:2018';
const PROXY_URL = new URL(PROXY);
const PROXY_AUTH = 'Basic ' + Buffer.from(PROXY_URL.username + ':' + PROXY_URL.password).toString('base64');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

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
      let body = '';
      tlsSock.on('data', d => body += d);
      tlsSock.on('end', () => {
        const headEnd = body.indexOf('\r\n\r\n');
        resolve({ status: headEnd >= 0 ? parseInt((body.substring(0, headEnd).split(' ')[1] || '').trim()) : 'ERR', body: body.substring(headEnd + 4) });
      });
      tlsSock.on('error', e => resolve({ status: 'ERR', error: e.message }));
    });
    connectReq.on('error', e => resolve({ status: 'ERR', error: e.message }));
    connectReq.on('timeout', () => { connectReq.destroy(); resolve({ status: 'ERR', error: 'TIMEOUT' }); });
    connectReq.end();
  });
}

(async () => {
  const ch = await httpsGet(TARGET);
  if (ch.status !== 412) { process.exit(1); }
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  const nsd = +m[1], cd = m[2];
  console.log('nsd=' + nsd);
  const { buildEnv } = require(path.join(ROOT, 'output/keygen/sandbox_keygen.js'));
  const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
  const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');
  const env = buildEnv({ nsd, cd }, { outerJsCode, target: TARGET, ua: UA, patchDyn: false });
  const sandbox = env.sandbox;
  try { vm.runInContext(outerJsCode, sandbox, { timeout: 25000, filename: 'outer.js' }); } catch (e) {}
  await new Promise(r => setTimeout(r, 5000));
  const dynCode = env.getDynCode();
  if (!dynCode) { console.log('无动态代码'); process.exit(1); }

  // ★ 递归 Proxy：在 Node 侧把 sandbox.document 换成递归 Proxy
  const seen = new Map();
  function recProxy(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (seen.has(obj)) return seen.get(obj);
    const p = new Proxy(obj, {
      get(t, prop) {
        if (prop === 'documentMode') return 11; // 兜底
        const v = t[prop];
        if (v && typeof v === 'object') return recProxy(v);
        if (typeof v === 'function') return v.bind(t);
        return v;
      },
      set(t, prop, val) { t[prop] = val; return true; },
    });
    seen.set(obj, p);
    return p;
  }
  try {
    // sandbox.document 可能是 Node 对象（buildEnv 的）或 Proxy
    const rawDoc = env.sandbox.document;
    if (rawDoc && typeof rawDoc === 'object') {
      // 如果是 Proxy，拿 target（可能不可直接拿）——直接重新构造沙箱 document
      // 用 vm 内替换：递归包 Node 侧对象
      env.sandbox.document = recProxy(rawDoc);
      env.sandbox.navigator = recProxy(env.sandbox.navigator || {});
      console.log('递归 Proxy 已设置');
    }
  } catch (e) { console.log('Proxy 设置失败:', e.message.substring(0, 100)); }

  // 注入 IE 兜底
  vm.runInContext(`
    try { Object.defineProperty(document, 'documentMode', { value: 11, configurable: true, writable: true }); } catch(e){}
    window.execScript = function(){};
    window.CollectGarbage = function(){};
    window.ActiveXObject = function(){};
    window.globalStorage = {};
  `, sandbox);

  let runCode = dynCode;
  const re69 = /!([_$\w]+)\?([_$\w]+)\+=-24:0;/;
  const m69 = runCode.match(re69);
  if (m69) { runCode = runCode.replace(re69, '!$1?($2+=0):0;'); console.log('op69 patched'); }
  runCode = runCode.replace(/while\(1\)\{/g, 'while(1){window.__all=(window.__all||0)+1;if(window.__all>5000000)throw new Error("LONG");');

  console.log('[运行] 动态代码...');
  try {
    const r = vm.runInContext(runCode, sandbox, { timeout: 90000, filename: 'dyn.js' });
    console.log('运行完成:', r === undefined ? 'undefined' : typeof r);
  } catch (e) {
    console.log('运行失败:', e.message.substring(0, 150));
  }
  try {
    const diag = vm.runInContext(`JSON.stringify({ all: window.__all, dynDone: !!window.__dynDone, cookie: document.cookie })`, sandbox);
    console.log('诊断:', diag);
  } catch (e) {}
  await new Promise(r => setTimeout(r, 6000));
  console.log('cookies:', JSON.stringify(env.captured.cookies).substring(0, 400));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
