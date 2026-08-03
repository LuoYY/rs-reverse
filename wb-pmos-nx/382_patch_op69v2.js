/**
 * 382_patch_op69v2.js
 * 动态 patch op69 回退：`!flag?pc+=-24:0` → 移除回退
 * 打破环境初始化死循环 → 看 keys2/cookie 是否生成
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

  // ★ IE 环境补丁（捕获后注入：documentMode/compatMode/execScript 等）
  vm.runInContext(`
    try { Object.defineProperty(document, 'documentMode', { value: 11, configurable: true, writable: true }); } catch (e) { try { document.documentMode = 11; } catch (e2) {} }
    try { Object.defineProperty(document, 'compatMode', { value: 'CSS1Compat', configurable: true }); } catch (e) {}
    try { document.documentElement = document.documentElement || {}; } catch (e) {}
    try { if (document.documentElement) document.documentElement.doScroll = document.documentElement.doScroll || function(){}; } catch (e) {}
    try { document.all = document.all || {}; } catch (e) {}
    window.execScript = function(){ return undefined; };
    window.CollectGarbage = function(){ return undefined; };
    window.ActiveXObject = function(){};
    window.globalStorage = {};
    window.attachEvent = function(){};
    window.detachEvent = function(){};
    window.scriptEngine = function(){ return 'JScript'; };
    window.scriptEngineMajorVersion = function(){ return 9; };
    window.scriptEngineMinorVersion = function(){ return 0; };
    window.scriptEngineBuildVersion = function(){ return 0; };
    window.external = {};
  `, sandbox);

  let runCode = dynCode;
  // ★ patch op69：!flag?pc+=-24:0 → 移除回退（并记录 flag 值）
  const re69 = /!([_$\w]+)\?([_$\w]+)\+=-24:0;/;
  const m69 = runCode.match(re69);
  if (m69) {
    console.log('op69 回退:', m69[0], '→ flag=' + m69[1] + ' pc=' + m69[2]);
    runCode = runCode.replace(re69, 'window.__flag69=' + m69[1] + ';!($1)?($2+=0):0;');
    // 再记录 flag 依赖的关键环境数组（_$lK 之类，从 op3/op8 找）
    const lkM = runCode.match(new RegExp(m69[1] + '=\\(\\s*!([_$\\w]+)\\[24\\]'));
    if (lkM) {
      console.log('flag 依赖数组:', lkM[1]);
      runCode = runCode.replace(new RegExp('!' + m69[1] + '\\?' + m69[2] + '\\+=0:0;'), 'window.__flag69=' + m69[1] + ';try{window.__lk24=' + lkM[1] + '[24];window.__lk64=' + lkM[1] + '[64];window.__lk4=' + lkM[1] + '[4];}catch(__eK){window.__lk24="e";}!($1)?($2+=0):0;');
    }
  } else {
    console.log('未找到 op69 回退');
  }

  // 通用 while 插桩（防其他死循环）
  let gIdx = 0;
  runCode = runCode.replace(/while\(1\)\{/g, () => {
    gIdx++;
    return 'while(1){window.__w' + gIdx + '=(window.__w' + gIdx + '||0)+1;window.__lastW=' + gIdx + ';if(window.__all>3000000)throw new Error("ALL_LOOP_w' + gIdx + '");window.__all=(window.__all||0)+1;';
  });
  console.log('插桩 while:', gIdx);
  fs.writeFileSync('/tmp/nx_dyncode_patch69.js', runCode);

  console.log('[运行] 动态代码（timeout 90s）...');
  const t0 = Date.now();
  try {
    const r = vm.runInContext(runCode, sandbox, { timeout: 90000, filename: 'dyn.js' });
    console.log('运行完成:', r === undefined ? 'undefined' : typeof r);
  } catch (e) {
    console.log('运行失败:', e.message.substring(0, 150));
    console.log('堆栈:', (e.stack || '').split('\n').slice(0, 6).join(' | '));
  }
  console.log('耗时:', ((Date.now() - t0) / 1000).toFixed(1) + 's');
  try {
    const diag = vm.runInContext(`JSON.stringify({ lastW: window.__lastW, all: window.__all, w3: window.__w3, flag69: typeof window.__flag69!=='undefined'?window.__flag69:null, lk24: window.__lk24, lk64: window.__lk64, lk4: window.__lk4, dynDone: !!window.__dynDone, cookie: document.cookie })`, sandbox);
    console.log('诊断:', diag.substring(0, 1500));
  } catch (e) { console.log('诊断失败:', e.message.substring(0, 100)); }
  await new Promise(r => setTimeout(r, 6000));
  console.log('cookies:', JSON.stringify(env.captured.cookies).substring(0, 300));
  console.log('missing:', JSON.stringify(env.captured.missing).substring(0, 300));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
