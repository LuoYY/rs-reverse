/**
 * 433_env_dispatch_bypass.js
 * 决定性实验：patch 环境检测巨型调度函数（体 >50KB，_$dy 类）入口 return 1
 * 验证：keys2 是否环境无关（若 keys2=f(nsd,cd) 纯计算，bypass 后仍生成正确 keys2）
 * 组合：op69 + env safe patch + env(2331)→true + 巨型函数 bypass
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
  // env(2331)→true
  let envTrueCnt = 0;
  runCode = runCode.replace(/([_$\w]+)\(2331,([^()]*)\)/g, () => { envTrueCnt++; return 'true'; });
  console.log('env(2331)→true:', envTrueCnt);
  // ★ patch 巨型环境检测调度函数（体 >50000）入口 return 1
  function findBigFns(code) {
    const fnRe = /function\s+([_$][\w$]*)\s*\(/g;
    const out = [];
    let fm;
    while ((fm = fnRe.exec(code)) !== null) {
      const open = code.indexOf('{', fm.index);
      if (open < 0) continue;
      let stack = 0, end = -1;
      for (let i = open; i < code.length; i++) {
        if (code[i] === '{') stack++;
        else if (code[i] === '}') { stack--; if (stack === 0) { end = i; break; } }
      }
      if (end > 0 && end - fm.index > 50000) out.push({ name: fm[1], open });
    }
    return out;
  }
  const bigFns = findBigFns(runCode);
  console.log('巨型函数:', bigFns.map(f => f.name).join(',') || '无');
  // 从后往前插入 return 1（避免偏移错乱）
  for (const f of bigFns.reverse()) {
    runCode = runCode.substring(0, f.open + 1) + 'return 1;' + runCode.substring(f.open + 1);
    console.log('  insert return 1 → ' + f.name);
  }
  // 通用 while 计数
  let gIdx = 0;
  runCode = runCode.replace(/while\(1\)\{/g, () => {
    gIdx++;
    return 'while(1){window.__w' + gIdx + '=(window.__w' + gIdx + '||0)+1;window.__lastW=' + gIdx + ';if(window.__all>10000000)throw new Error("ALL_LOOP_w' + gIdx + '");window.__all=(window.__all||0)+1;';
  });
  fs.writeFileSync('/tmp/nx_dyncode_bypass.js', runCode);

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
      props: (window.__props||[]).slice(-15)
    })`, sandbox);
    console.log('诊断:', diag.substring(0, 700));
  } catch (e) { console.log('诊断失败:', e.message.substring(0, 80)); }
  await new Promise(r => setTimeout(r, 8000));
  console.log('cookies:', JSON.stringify(env.captured.cookies).substring(0, 600));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
