/**
 * 365_neg_jump_trace.js
 * 动态插桩：提取 dispatcher #3 的 PC 变量，记录所有负数回退（PC+=-N）→ 定位死循环跳转
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
  if (!m) { console.log('无 $_ts'); process.exit(1); }
  const nsd = +m[1], cd = m[2];
  console.log('nsd=' + nsd + ' cdLen=' + cd.length);

  const { buildEnv } = require(path.join(ROOT, 'output/keygen/sandbox_keygen.js'));
  const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
  const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');
  const env = buildEnv({ nsd, cd }, { outerJsCode, target: TARGET, ua: UA, patchDyn: true, patchLoop: true, savePatched: true });
  const sandbox = env.sandbox;

  try { vm.runInContext(outerJsCode, sandbox, { timeout: 25000, filename: 'outer.js' }); } catch (e) {}
  await new Promise(r => setTimeout(r, 5000));
  let runCode = env.getPatchedDynCode() || env.getDynCode();
  if (!runCode) { console.log('无动态代码'); process.exit(1); }

  // ★ 动态提取 PC 变量 + 插桩负数回退
  const pcM = runCode.match(/window\.__pX3=([_$\w]+);/);
  if (pcM) {
    const pc = pcM[1];
    console.log('PC 变量:', pc);
    const pat = new RegExp(pc + '\\+=-\\d+;', 'g');
    let negCount = 0;
    runCode = runCode.replace(pat, (match) => {
      negCount++;
      return 'window.__negJ=window.__negJ||[];window.__negJ.push(' + JSON.stringify(match) + ');if(window.__negJ.length>30)window.__negJ.shift();' + match;
    });
    console.log('插桩负数跳转:', negCount);
  } else {
    console.log('未提取到 PC 变量');
  }

  fs.writeFileSync('/tmp/nx_dyncode_neg.js', runCode);
  console.log('[运行] 动态代码（timeout 60s）...');
  try {
    vm.runInContext(runCode, sandbox, { timeout: 60000, filename: 'dyn.js' });
    console.log('运行完成（未死循环）');
  } catch (e) {
    console.log('运行失败:', e.message.substring(0, 150));
  }
  // 诊断
  try {
    const diag = vm.runInContext(`JSON.stringify({
      lastW: window.__lastW, all: window.__all, w3: window.__w3,
      op3: window.__op3, pX3: window.__pX3,
      negJ: window.__negJ, dynDone: !!window.__dynDone,
    })`, sandbox);
    console.log('诊断:', diag);
  } catch (e) { console.log('诊断失败:', e.message.substring(0, 80)); }
  console.log('cookies:', JSON.stringify(env.captured.cookies).substring(0, 300));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
