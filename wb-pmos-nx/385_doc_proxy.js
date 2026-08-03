/**
 * 385_doc_proxy.js
 * Proxy 监控 document 属性访问（documentMode 等）→ 定位读取对象与调用点
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
  if (ch.status !== 412) { console.log('挑战:', ch.status); process.exit(1); }
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { process.exit(1); }
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

  // ★ Proxy 监控 document 属性访问
  vm.runInContext(`
    try {
      const origDoc = document;
      const docHandler = {
        get(target, prop, recv) {
          if (prop === 'documentMode' || prop === 'documentElement' || prop === 'all' || prop === 'compatMode' || prop === 'doScroll') {
            window.__docAccess = window.__docAccess || [];
            window.__docAccess.push(String(prop));
            if (window.__docAccess.length > 30) window.__docAccess.shift();
          }
          const v = target[prop];
          if (typeof v === 'function' && (prop === 'getElementById' || prop === 'createElement')) {
            return v.bind(target);
          }
          return v;
        }
      };
      Object.defineProperty(window, 'document', { value: new Proxy(origDoc, docHandler), configurable: true });
    } catch (__eP) { window.__docAccess = ['proxy-fail:' + String(__eP)]; }
  `, sandbox);

  // patch op69 + IE 补丁 + 插桩
  let runCode = dynCode;
  const re69 = /!([_$\w]+)\?([_$\w]+)\+=-24:0;/;
  const m69 = runCode.match(re69);
  if (m69) {
    console.log('op69:', m69[0]);
    runCode = runCode.replace(re69, 'window.__flag69=' + m69[1] + ';!$1?($2+=0):0;');
  }
  vm.runInContext(`
    try { Object.defineProperty(document, 'documentMode', { value: 11, configurable: true, writable: true }); } catch (e) {}
    try { Object.defineProperty(document, 'compatMode', { value: 'CSS1Compat', configurable: true }); } catch (e) {}
    window.execScript = function(){};
    window.CollectGarbage = function(){};
    window.ActiveXObject = function(){};
    window.globalStorage = {};
    window.attachEvent = function(){};
    window.scriptEngine = function(){ return 'JScript'; };
  `, sandbox);

  let gIdx = 0;
  runCode = runCode.replace(/while\(1\)\{/g, () => {
    gIdx++;
    return 'while(1){window.__w' + gIdx + '=(window.__w' + gIdx + '||0)+1;window.__lastW=' + gIdx + ';if(window.__all>3000000)throw new Error("ALL_LOOP_w' + gIdx + '");window.__all=(window.__all||0)+1;';
  });
  console.log('插桩 while:', gIdx);

  console.log('[运行] 动态代码...');
  try {
    vm.runInContext(runCode, sandbox, { timeout: 90000, filename: 'dyn.js' });
    console.log('运行完成');
  } catch (e) {
    console.log('运行失败:', e.message.substring(0, 120));
  }
  try {
    const diag = vm.runInContext(`JSON.stringify({ lastW: window.__lastW, all: window.__all, docAccess: window.__docAccess, flag69: typeof window.__flag69!=='undefined'?window.__flag69:null, dynDone: !!window.__dynDone, cookie: document.cookie })`, sandbox);
    console.log('诊断:', diag.substring(0, 1200));
  } catch (e) { console.log('诊断失败:', e.message.substring(0, 80)); }
  await new Promise(r => setTimeout(r, 6000));
  console.log('cookies:', JSON.stringify(env.captured.cookies).substring(0, 300));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
