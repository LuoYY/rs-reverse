/**
 * 424_patch_calls.js
 * 迭代 v2：patch 方法调用 `X[Y[N]](args)` → `X[Y[N]]&&X[Y[N]](args)`（方法缺失静默跳过）
 * + 记录真实属性名（修正 push(prop) bug）+ 注入现代 API
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
  // ★ 注入现代 API（getFloat16 等 ES2025 + Web API 存在性）
  vm.runInContext(`
    try { window.DataView = DataView; } catch(e){}
    try { window.Float16Array = Float16Array; } catch(e){}
    try { window.ArrayBuffer = ArrayBuffer; window.Uint8Array = Uint8Array; window.Int8Array = Int8Array; window.Uint16Array = Uint16Array; window.Int16Array = Int16Array; window.Uint32Array = Uint32Array; window.Int32Array = Int32Array; window.Float32Array = Float32Array; window.Float64Array = Float64Array; window.BigInt64Array = BigInt64Array; window.BigUint64Array = BigUint64Array; } catch(e){}
    try { window.Promise = Promise; window.Symbol = Symbol; window.Map = Map; window.Set = Set; window.WeakMap = WeakMap; window.WeakSet = WeakSet; window.Reflect = Reflect; window.Proxy = Proxy; window.Array = Array; window.Object = Object; window.JSON = JSON; window.Math = Math; window.Date = Date; window.RegExp = RegExp; window.Error = Error; window.TypeError = TypeError; window.Function = Function; window.String = String; window.Number = Number; window.Boolean = Boolean; window.parseInt = parseInt; window.parseFloat = parseFloat; window.isNaN = isNaN; window.isFinite = isFinite; window.encodeURIComponent = encodeURIComponent; window.decodeURIComponent = decodeURIComponent; window.atob = atob; window.btoa = btoa; } catch(e){}
    try { window.fetch = undefined; window.WebSocket = undefined; window.XMLHttpRequest = undefined; } catch(e){}
    // DataView.getFloat16 存在性（Node 22+ 有）
    try { window.__hasFloat16 = typeof DataView.prototype.getFloat16 === 'function'; } catch(e){ window.__hasFloat16 = false; }
  `, sandbox);
  try { vm.runInContext(outerJsCode, sandbox, { timeout: 25000, filename: 'outer.js' }); } catch (e) {}
  await new Promise(r => setTimeout(r, 5000));
  const dynCode = env.getDynCode();
  if (!dynCode) { console.log('无动态代码'); process.exit(1); }
  console.log('dynCode len:', dynCode.length);
  console.log('hasFloat16:', vm.runInContext('window.__hasFloat16', sandbox));

  let runCode = dynCode;
  // patch op69
  const re69 = /!([_$\w]+)\?([_$\w]+)\+=-24:0;/;
  if (re69.test(runCode)) {
    runCode = runCode.replace(re69, '!$1?($2+=0):0;');
    console.log('op69 patched');
  }
  // ★ safe 方法调用 patch：X[Y[N]](args) → X[Y[N]]&&X[Y[N]](args) + 记录属性名
  let callCnt = 0;
  runCode = runCode.replace(/([_$\w]+)\[([_$\w]+)\[(\d+)\]\]\(/g, (mm, obj, arr, num) => {
    callCnt++;
    return '((window.__props=window.__props||[]).push((' + arr + ')[' + num + ']),(' + obj + ')[(' + arr + ')[' + num + ']]&&(' + obj + ')[(' + arr + ')[' + num + ']](';
  });
  console.log('call patch:', callCnt);
  // ★ safe 环境访问 patch：!A[B[N]] → !(A&&A[B[N]]) + 记录
  let envCnt = 0;
  runCode = runCode.replace(/!([_$\w]+)\[([_$\w]+)\[(\d+)\]\]/g, (mm, obj, arr, num) => {
    envCnt++;
    return '((window.__props=window.__props||[]).push((' + arr + ')[' + num + ']),!((' + obj + ')&&(' + obj + ')[(' + arr + ')[' + num + ']]))';
  });
  console.log('env patch:', envCnt);
  // 通用 while 计数
  let gIdx = 0;
  runCode = runCode.replace(/while\(1\)\{/g, () => {
    gIdx++;
    return 'while(1){window.__w' + gIdx + '=(window.__w' + gIdx + '||0)+1;window.__lastW=' + gIdx + ';if(window.__all>8000000)throw new Error("ALL_LOOP_w' + gIdx + '");window.__all=(window.__all||0)+1;';
  });
  fs.writeFileSync('/tmp/nx_dyncode_safe.js', runCode);

  const PREFIX = '(function(){ try { ';
  const wrapped = PREFIX + runCode + '; window.__dynOK = true; } catch(__e) { window.__err = { msg: String(__e.message), stack: String(__e.stack) }; throw __e; } })()';
  console.log('[运行] 动态代码...');
  try {
    vm.runInContext(wrapped, sandbox, { timeout: 110000, filename: 'wrap.js' });
    console.log('运行完成!');
  } catch (e) {
    console.log('运行失败:', e.message.substring(0, 120));
  }
  try {
    const diag = vm.runInContext(`JSON.stringify({
      dynOK: !!window.__dynOK, lastW: window.__lastW, all: window.__all,
      cookie: document.cookie, propsLen: (window.__props||[]).length,
      props: (window.__props||[]).slice(-40), err: window.__err
    })`, sandbox);
    fs.writeFileSync('/tmp/422diag.json', diag);
    const d = JSON.parse(diag);
    console.log('dynOK:', d.dynOK, 'all:', d.all, 'cookie:', String(d.cookie).substring(0, 30));
    console.log('propsLen:', d.propsLen, 'props最后20:', JSON.stringify(d.props));
    if (d.err && d.err.stack) {
      const wm = d.err.stack.match(/wrap\.js:(\d+):(\d+)/);
      if (wm) {
        const origOff = +wm[2] - PREFIX.length;
        console.log('\n=== 报错 origOff=' + origOff + ' ===');
        console.log('前 200: ' + runCode.substring(Math.max(0, origOff - 200), origOff));
        console.log('★后 200: ' + runCode.substring(origOff, Math.min(runCode.length, origOff + 200)));
      }
    }
  } catch (e) { console.log('诊断失败:', e.message.substring(0, 100)); }
  await new Promise(r => setTimeout(r, 5000));
  console.log('cookies:', JSON.stringify(env.captured.cookies).substring(0, 300));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
