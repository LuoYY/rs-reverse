// 用 sandbox_keygen 的 Node vm 沙箱 + Proxy eval 截获 nx dynCode，插桩追踪 basearr 构造
// 关键：Proxy eval 的 patchDyn 分支可以直接替换 dynCode 文本（dynCode 文本固定）
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const http = require('http');
const tls = require('tls');

const ROOT = path.join(__dirname, '..', '..');
const PROXY = 'http://ericshi:583315@120.221.249.98:2018';
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
  if (!m) { console.log('未匹配 nsd/cd'); process.exit(1); }
  const nsd = +m[1], cd = m[2];
  console.log('[SBX] nsd=' + nsd);

  const { buildEnv, runSandbox } = require(path.join(ROOT, 'output/keygen/sandbox_keygen.js'));
  const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
  const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');

  const env = buildEnv({ nsd, cd }, { outerJsCode, target: TARGET, ua: UA, patchDyn: false, timeout: 90000, waitMs: 0 });
  const sandbox = env.sandbox;
  const vm = require('vm');
  // 先跑外层 VM（内部 Proxy eval 会截获 dynCode）
  const t0 = Date.now();
  try { vm.runInContext(outerJsCode, sandbox, { timeout: 60000, filename: 'outer.js' }); }
  catch (e) { console.log('[SBX] outer 异常:', e.message.substring(0, 120)); }

  const dynCode = env.getDynCode();
  console.log('[SBX] dynCode len:', dynCode ? dynCode.length : 0);
  if (!dynCode) { console.log('[SBX] 无 dynCode'); process.exit(0); }

  // ★ 对 dynCode 做插桩（文本固定）
  let code = dynCode;
  // 1. 尾部标记
  code = code.replace(/\}\)\(_ts\.scj,_ts\.aebi\);\s*$/, ';globalThis.__TAIL_HIT=1;}($_ts.scj,$_ts.aebi);');
  // 2. _$dJ 插桩（弹栈入口）
  const dJPattern = 'function _$dJ(){_$hh=_$dp[_$oU[103]](),_$g0=_$dp[_$oU[103]]();}';
  if (code.indexOf(dJPattern) >= 0) {
    code = code.replace(dJPattern, `function _$dJ(){try{globalThis.__DJ_HIT=(globalThis.__DJ_HIT||0)+1;}catch(e){globalThis.__DJ_ERR=String(e);}}`);
    console.log('[SBX] _$dJ 插桩 OK');
  } else { console.log('[SBX] ✗ _$dJ 模式未找到'); }
  // 3. _$k6 dump
  const k6Mark = '_$k6=_$mD[5][_$oU[17]](';
  if (code.indexOf(k6Mark) >= 0) {
    code = code.replace(k6Mark, 'globalThis.__K6_SAVE=_$k6;' + k6Mark);
    console.log('[SBX] _$k6 插桩 OK');
  }
  // 4. basearr 头 59/179 检查（插桩输出处）
  fs.writeFileSync('/tmp/nx_dynCode_sandbox_patched.js', code);
  console.log('[SBX] 已保存 patched, len=' + code.length);

  // 手动执行插桩版 dynCode（模拟 eval 路径）
  try {
    const r = vm.runInContext(code, sandbox, { timeout: 90000, filename: 'dyn_patched.js' });
    console.log('[SBX] dynCode 执行完成, r=', typeof r);
  } catch (e) {
    console.log('[SBX] dynCode 异常:', e.message.substring(0, 150));
  }
  await new Promise(r => setTimeout(r, 15000));

  // dump 插桩标记
  for (const k of ['__TAIL_HIT', '__DJ_HIT', '__DJ_ERR', '__K6_SAVE']) {
    try {
      const v = vm.runInContext(`typeof ${k}!=='undefined'?${k}:null`, sandbox);
      if (typeof v === 'string') console.log('[SBX] ' + k + ':', v.substring(0, 300));
      else console.log('[SBX] ' + k + ':', v);
    } catch (e) { console.log('[SBX] ' + k + ' err:', e.message); }
  }
  console.log('[SBX] cookies:', env.captured.cookies.length, env.captured.cookies.map(c => c.split(';')[0]).slice(-2));
  console.log('[SBX] errors:', env.captured.errors.slice(0, 3));
  console.log('[SBX] 耗时', Date.now() - t0, 'ms');
  process.exit(0);
})().catch(e => { console.error('[SBX] FATAL:', e.message); process.exit(1); });
