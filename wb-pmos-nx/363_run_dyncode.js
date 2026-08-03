/**
 * 363_run_dyncode.js
 * 关键思路：外层 VM 短超时捕获动态代码（dynCode）→ 直接运行动态代码（内层 VM）→ 生成 cookie → keys2
 * 绕开外层完整执行（外层死循环/超时不影响动态代码运行）
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
const K16 = [0xd7, 0x5a, 0x5c, 0x72, 0xbe, 0xa1, 0xd2, 0x3b, 0x37, 0xc0, 0xcc, 0x02, 0xd1, 0x5f, 0x11, 0xad];
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const B86_64 = NX_BS.slice(0, 64);

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
function decodeB86(str) {
  const idxmap = {}; for (let i = 0; i < B86_64.length; i++) idxmap[B86_64[i]] = i;
  const bytes = []; let qi = 0;
  for (let g = 0; g < Math.floor(str.length / 4); g++) {
    const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]], c3 = idxmap[str[qi + 3]];
    if (c0 === undefined) return null;
    qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  const rem = str.length - qi;
  if (rem === 2) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]]; if (c0 === undefined) return null; bytes.push((c0 << 2) | (c1 >> 4)); }
  else if (rem === 3) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]]; if (c0 === undefined) return null; bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2)); }
  return bytes;
}

(async () => {
  const ch = await httpsGet(TARGET);
  if (ch.status !== 412) { console.log('挑战:', ch.status, ch.error || ''); process.exit(1); }
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { console.log('无 $_ts'); process.exit(1); }
  const nsd = +m[1], cd = m[2];
  console.log('纯HTTP nsd=' + nsd + ' cdLen=' + cd.length);

  const { buildEnv } = require(path.join(ROOT, 'output/keygen/sandbox_keygen.js'));
  const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
  const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');

  const env = buildEnv({ nsd, cd }, { outerJsCode, target: TARGET, ua: UA, patchDyn: true, patchLoop: true, savePatched: true });
  const sandbox = env.sandbox;

  // 外层短超时（捕获动态代码）
  console.log('\n[1] 外层 VM 执行（短超时 25s）...');
  let outerErr = null;
  try {
    vm.runInContext(outerJsCode, sandbox, { timeout: 25000, filename: 'outer.js' });
  } catch (e) {
    outerErr = e.message;
  }
  console.log('外层结果:', outerErr || '完成');
  console.log('外层错误:', JSON.stringify(env.captured.errors).substring(0, 200));

  // 等待异步回调（setTimeout 回调里 eval 动态代码）
  console.log('等待异步回调 5s...');
  await new Promise(r => setTimeout(r, 5000));
  console.log('外层 eval 次数:', (env.captured.evalLens || []).length, 'eval 长度:', JSON.stringify(env.captured.evalLens || []).slice(0, 120));

  const dynCode = env.getDynCode();
  console.log('动态代码捕获:', dynCode ? dynCode.length : '无');
  if (!dynCode) { console.log('无动态代码'); process.exit(1); }
  fs.writeFileSync('/tmp/nx_dyncode.js', dynCode);

  // [2] 运行动态代码（内层 VM）——优先用插桩后代码（防死循环）
  let runCode = env.getPatchedDynCode() || dynCode;
  console.log('运行代码来源:', env.getPatchedDynCode() ? '插桩后(' + runCode.length + ')' : '原始');
  console.log('插桩检查: ALL_LOOP=' + (runCode.match(/ALL_LOOP/g) || []).length + ' __dynDone=' + (runCode.match(/__dynDone/g) || []).length);
  fs.writeFileSync('/tmp/nx_dyncode_patched.js', runCode);
  console.log('\n[2] 运行动态代码（内层 VM, timeout 60s）...');
  try {
    const r = vm.runInContext(runCode, sandbox, { timeout: 60000, filename: 'dyn.js' });
    console.log('动态代码运行完成:', r === undefined ? 'undefined' : typeof r);
  } catch (e) {
    console.log('动态代码运行失败:', e.message.substring(0, 200));
  }
  // 死循环诊断信息
  try {
    const diag = vm.runInContext(`JSON.stringify({
      lastW: window.__lastW,
      all: window.__all,
      w3: window.__w3,
      op3: window.__op3,
      pX3: window.__pX3,
      dynDone: !!window.__dynDone,
      aSnap: window.__aSnap,
    })`, sandbox);
    console.log('死循环诊断:', diag);
  } catch (e) { console.log('诊断读取失败:', e.message.substring(0, 80)); }

  // 等待异步回调
  console.log('\n[3] 等待异步回调 15s...');
  await new Promise(r => setTimeout(r, 15000));
  console.log('捕获的 cookies:', JSON.stringify(env.captured.cookies).substring(0, 400));
  console.log('错误:', JSON.stringify(env.captured.errors).substring(0, 200));

  // 提取 P cookie → keys2
  const pCookie = env.captured.cookies.map(c => c.split(';')[0]).find(c => /P=/.test(c));
  console.log('\nP cookie:', pCookie ? pCookie.substring(0, 30) + '... len:' + (pCookie.split('=')[1] || '').length : '无');
  if (pCookie) {
    const val = pCookie.split('=')[1];
    const payload = val.startsWith('a') ? val.slice(1) : val;
    for (const k of Object.keys(require.cache)) delete require.cache[k];
    require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
    require('@src/handler/parser/constData').init();
    const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
    const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
    const sC = decodeB86(payload);
    if (sC) {
      const sArr = numarrAddTime([...K16], 0, 1 / 256)[0];
      const sDec = encryptMode2([...sC], sArr, 1);
      console.log('沙箱 keys2 前8:', sDec.slice(15, 23).map(b => b.toString(16).padStart(2, '0')).join(' '));
      console.log('沙箱 nextarr 头:', sDec.slice(0, 15).map(b => b.toString(16).padStart(2, '0')).join(' '));
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
