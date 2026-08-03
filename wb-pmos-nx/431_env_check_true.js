/**
 * 431_env_check_true.js
 * patch 所有 `XXX(2331,...)` 环境检测调用 → `true`
 * 2331 是环境检测通行 ID（跨会话固定）：
 * - 返回 true → 走 if 分支（方法缓存初始化为空数组 []，for 不执行，安全）
 * - 返回 false → 走 else 分支（_$lb._$mC 缓存 → getFloat16 报错）
 * 验证：沙箱能否跑完内层 VM 生成 cookie/keys2
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
  console.log('dynCode len:', dynCode.length);

  let runCode = dynCode;
  // patch op69
  const re69 = /!([_$\w]+)\?([_$\w]+)\+=-24:0;/;
  if (re69.test(runCode)) {
    runCode = runCode.replace(re69, '!$1?($2+=0):0;');
    console.log('op69 patched');
  }
  // ★ env patch：!A[B[N]] → 安全访问（解决 documentMode 报错）
  let safeCnt = 0;
  runCode = runCode.replace(/!([_$\w]+)\[([_$\w]+)\[(\d+)\]\]/g, (mm, obj, arr, num) => {
    safeCnt++;
    return '((window.__props=window.__props||[]).push((' + arr + ')[' + num + ']),!((' + obj + ')&&(' + obj + ')[(' + arr + ')[' + num + ']]))';
  });
  console.log('env safe patch:', safeCnt);
  // ★ patch 所有 `XXX(2331, ...)` → true（环境检测通过）
  let envTrueCnt = 0;
  runCode = runCode.replace(/([_$\w]+)\(2331,([^()]*)\)/g, (mm, fn) => {
    envTrueCnt++;
    return 'true';
  });
  console.log('env(2331) → true:', envTrueCnt);
  // 通用 while 计数
  let gIdx = 0;
  runCode = runCode.replace(/while\(1\)\{/g, () => {
    gIdx++;
    return 'while(1){window.__w' + gIdx + '=(window.__w' + gIdx + '||0)+1;window.__lastW=' + gIdx + ';if(window.__all>10000000)throw new Error("ALL_LOOP_w' + gIdx + '");window.__all=(window.__all||0)+1;';
  });
  fs.writeFileSync('/tmp/nx_dyncode_envtrue.js', runCode);

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
      cookie: document.cookie, cookieLen: (document.cookie||'').length
    })`, sandbox);
    console.log('诊断:', diag.substring(0, 400));
  } catch (e) { console.log('诊断失败:', e.message.substring(0, 80)); }
  await new Promise(r => setTimeout(r, 6000));
  console.log('cookies:', JSON.stringify(env.captured.cookies).substring(0, 500));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
