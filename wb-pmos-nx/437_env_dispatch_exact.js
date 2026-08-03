/**
 * 437_env_dispatch_exact.js
 * 精准 bypass 环境检测调度器：
 * 1. 提取 `XXX(2331,` 调用的函数名（环境检测入口）
 * 2. patch 该函数定义入口 return 1（只影响环境检测，不碰主 dispatcher）
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
  fs.writeFileSync('/tmp/nx_nsd_cd.json', JSON.stringify({ nsd, cd }));

  const { buildEnv } = require(path.join(ROOT, 'output/keygen/sandbox_keygen.js'));
  const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
  const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');
  const env = buildEnv({ nsd, cd }, { outerJsCode, target: TARGET, ua: UA, patchDyn: false });
  const sandbox = env.sandbox;
  try { vm.runInContext(outerJsCode, sandbox, { timeout: 25000, filename: 'outer.js' }); } catch (e) {}
  await new Promise(r => setTimeout(r, 5000));
  const dynCode = env.getDynCode();
  if (!dynCode) { console.log('无动态代码'); process.exit(1); }
  console.log('dynCode len:', dynCode.length);

  let runCode = dynCode;
  // patch op69
  const re69 = /!([_$\w]+)\?([_$\w]+)\+=-24:0;/;
  if (re69.test(runCode)) {
    runCode = runCode.replace(re69, '!$1?($2+=0):0;');
    console.log('op69 patched');
  }
  // env safe patch
  let safeCnt = 0;
  runCode = runCode.replace(/!([_$\w]+)\[([_$\w]+)\[(\d+)\]\]/g, (mm, obj, arr, num) => {
    safeCnt++;
    return '((window.__props=window.__props||[]).push((' + arr + ')[' + num + ']),!((' + obj + ')&&(' + obj + ')[(' + arr + ')[' + num + ']]))';
  });
  console.log('env safe patch:', safeCnt);

  // ★ 提取 `XXX(2331,` 的函数名（环境检测入口）
  const envFns = new Set();
  const idRe = /([_$\w]+)\(\d+,/g;
  let im;
  while ((im = idRe.exec(runCode)) !== null) envFns.add(im[1]);
  console.log('环境检测候选函数:', [...envFns].join(','));
  // 也找 (1689, 等大 ID 调用
  const idRe2 = /([_$\w]+)\(\d+,[_$\w]+,\[/g;
  let im2;
  while ((im2 = idRe2.exec(runCode)) !== null) envFns.add(im2[1]);
  console.log('(加3参模式) 候选函数:', [...envFns].join(','));

  // patch 这些函数的定义：入口 return 1（从后往前避免偏移）
  for (const fn of envFns) {
    const defIdx = runCode.lastIndexOf('function ' + fn + '(');
    if (defIdx < 0) continue;
    const open = runCode.indexOf('{', defIdx);
    if (open < 0) continue;
    // 检查是否已 patch
    if (runCode.substring(open + 1, open + 10).includes('return 1;')) continue;
    runCode = runCode.substring(0, open + 1) + 'return 1;' + runCode.substring(open + 1);
    console.log('  env bypass → ' + fn);
  }

  // 通用 while 计数
  let gIdx = 0;
  runCode = runCode.replace(/while\(1\)\{/g, () => {
    gIdx++;
    return 'while(1){window.__w' + gIdx + '=(window.__w' + gIdx + '||0)+1;window.__lastW=' + gIdx + ';if(window.__all>10000000)throw new Error("ALL_LOOP_w' + gIdx + '");window.__all=(window.__all||0)+1;';
  });
  fs.writeFileSync('/tmp/nx_dyncode_envexact.js', runCode);

  console.log('[运行] 动态代码（timeout 120s）...');
  const t0 = Date.now();
  try {
    vm.runInContext(runCode, sandbox, { timeout: 120000, filename: 'dyn.js' });
    console.log('运行完成!');
  } catch (e) {
    console.log('运行失败:', e.message.substring(0, 200));
    console.log('堆栈:', (e.stack || '').split('\n').slice(0, 4).join(' | '));
  }
  console.log('耗时:', ((Date.now() - t0) / 1000).toFixed(1) + 's');
  try {
    const diag = vm.runInContext(`JSON.stringify({
      lastW: window.__lastW, all: window.__all,
      cookie: document.cookie, cookieLen: (document.cookie||'').length,
      props: (window.__props||[]).slice(-20)
    })`, sandbox);
    console.log('诊断:', diag.substring(0, 700));
  } catch (e) { console.log('诊断失败:', e.message.substring(0, 80)); }
  await new Promise(r => setTimeout(r, 8000));
  console.log('cookies:', JSON.stringify(env.captured.cookies).substring(0, 600));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
