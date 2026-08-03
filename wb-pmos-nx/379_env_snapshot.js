/**
 * 379_env_snapshot.js
 * 动态提取 dispatcher #0 的环境数组（EnvArr）→ w3 死循环时记录快照 → 定位缺失环境值
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

  // 定位 dispatcher #0 + 提取环境数组
  const dm = dynCode.match(/while\(1\)\{([_$\w]+)=([_$\w]+)\[([_$\w]+)\+\+\];if\(\1<444\)\{/);
  if (!dm) { console.log('无 dispatcher'); process.exit(1); }
  const [op, arr, pc] = [dm[1], dm[2], dm[3]];
  console.log('dispatcher: op=' + op + ' arr=' + arr + ' pc=' + pc);

  // 找环境数组（op0 分支 X=EnvArr[IdxArr[N]]）
  const seg = dynCode.substring(dm.index, dm.index + 4000);
  const envRead = seg.match(new RegExp('===' + op + '===0\\)\\{[_$\\w]+=([_$\\w]+)\\[[^\\]]+\\[[0-9]+\\]\\];'));
  let envArr = envRead ? envRead[1] : null;
  if (!envArr) {
    // 更宽松：找 `[_$\w]=ARR[IDXARR[N]];` 模式
    const m2 = seg.match(/[_$\w]+=([_$\w]+)\[[_$\w]+\[[0-9]+\]\];/);
    envArr = m2 ? m2[1] : null;
  }
  console.log('环境数组变量:', envArr);

  // 插桩：w3 循环记录环境数组快照（每 1000 次）
  let gIdx = 0;
  let runCode = dynCode.replace(/while\(1\)\{/g, () => {
    gIdx++;
    return 'while(1){window.__w' + gIdx + '=(window.__w' + gIdx + '||0)+1;window.__lastW=' + gIdx + ';if(window.__all>3000000)throw new Error("ALL_LOOP_w' + gIdx + '");window.__all=(window.__all||0)+1;';
  });
  if (envArr) {
    // 在 w3 循环里（dispatcher #0）每 5000 次记录环境快照
    const snapCode = `if(window.__w3&&window.__w3%5000===0){window.__envSnap=window.__envSnap||[];try{window.__envSnap.push(JSON.stringify({len:${envArr}&&${envArr}.length,head:${envArr}&&${envArr}.slice(0,50)}));}catch(__eS){window.__envSnap.push("e:"+String(__eS));}if(window.__envSnap.length>6)window.__envSnap.shift();}`;
    runCode = runCode.replace(/while\(1\)\{window\.__w3=\(window\.__w3\|\|0\)\+1;window\.__lastW=3;/, (mm) => mm + snapCode);
  }
  fs.writeFileSync('/tmp/nx_dyncode_envsnap.js', runCode);

  console.log('[运行] 动态代码（timeout 90s）...');
  const t0 = Date.now();
  try {
    vm.runInContext(runCode, sandbox, { timeout: 90000, filename: 'dyn.js' });
    console.log('运行完成');
  } catch (e) {
    console.log('运行失败:', e.message.substring(0, 100));
  }
  console.log('耗时:', ((Date.now() - t0) / 1000).toFixed(1) + 's');
  try {
    const diag = vm.runInContext(`JSON.stringify({ lastW: window.__lastW, all: window.__all, w3: window.__w3, envSnap: window.__envSnap, dynDone: !!window.__dynDone })`, sandbox);
    console.log('诊断:', diag.substring(0, 2000));
  } catch (e) { console.log('诊断失败:', e.message.substring(0, 100)); }
  await new Promise(r => setTimeout(r, 6000));
  console.log('cookies:', JSON.stringify(env.captured.cookies).substring(0, 300));
  console.log('missing:', JSON.stringify(env.captured.missing).substring(0, 400));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
