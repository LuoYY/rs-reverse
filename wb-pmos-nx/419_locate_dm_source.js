/**
 * 419_locate_dm_source.js
 * 精确定位 documentMode 报错的原始动态代码位置：
 * 1. patch op69 打破死循环
 * 2. wrap try-catch 运行，捕获报错 stack（wrap.js:行:col）
 * 3. col - wrap前缀长度 = 原始动态代码偏移
 * 4. 打印该位置前后代码 → 分析 X（宿主对象）来源
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
  fs.writeFileSync('/tmp/nx_dyncode_raw.js', dynCode);

  let runCode = dynCode;
  // patch op69：!flag?pc+=-24:0 → 移除回退
  const re69 = /!([_$\w]+)\?([_$\w]+)\+=-24:0;/;
  if (re69.test(runCode)) {
    runCode = runCode.replace(re69, '!$1?($2+=0):0;');
    console.log('op69 patched');
  }
  // 通用 while 计数（防死循环）
  let gIdx = 0;
  runCode = runCode.replace(/while\(1\)\{/g, () => {
    gIdx++;
    return 'while(1){window.__w' + gIdx + '=(window.__w' + gIdx + '||0)+1;window.__lastW=' + gIdx + ';if(window.__all>3000000)throw new Error("ALL_LOOP_w' + gIdx + '");window.__all=(window.__all||0)+1;';
  });
  fs.writeFileSync('/tmp/nx_dyncode_patch69.js', runCode);

  // wrap try-catch：前缀固定长度计算原始偏移
  const PREFIX = '(function(){ try { ';
  const wrapped = PREFIX + runCode + '; window.__dynOK = true; } catch(__e) { window.__err = { msg: String(__e.message), stack: String(__e.stack), name: String(__e.name) }; throw __e; } })()';
  console.log('wrap 前缀长度:', PREFIX.length);
  console.log('[运行] 动态代码...');
  try {
    vm.runInContext(wrapped, sandbox, { timeout: 90000, filename: 'wrap.js' });
    console.log('运行完成!');
  } catch (e) {
    console.log('运行失败:', e.message.substring(0, 100));
  }
  const errStr = vm.runInContext('window.__err ? JSON.stringify(window.__err) : "no-err"', sandbox);
  console.log('=== 错误 ===');
  console.log(errStr.substring(0, 2500));

  // 解析 stack 偏移
  if (errStr && errStr !== 'no-err') {
    const err = JSON.parse(errStr);
    const lines = err.stack.split('\n');
    console.log('\n=== 堆栈行 ===');
    for (const ln of lines) console.log(ln);
    // 找 wrap.js:行:col
    const wm = err.stack.match(/wrap\.js:(\d+):(\d+)/);
    if (wm) {
      const col = +wm[2];
      const origOff = col - PREFIX.length;
      console.log('\n=== 原始动态代码偏移 ===');
      console.log('col=' + col + ' → origOff=' + origOff);
      if (origOff >= 0 && origOff < runCode.length) {
        console.log('\n=== 报错位置前 220 字符 ===');
        console.log(runCode.substring(Math.max(0, origOff - 220), origOff));
        console.log('\n=== ★ 报错位置后 220 字符 ===');
        console.log(runCode.substring(origOff, Math.min(runCode.length, origOff + 220)));
      }
    }
  }
  await new Promise(r => setTimeout(r, 4000));
  console.log('\ncookies:', JSON.stringify(env.captured.cookies).substring(0, 200));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
