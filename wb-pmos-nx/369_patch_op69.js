/**
 * 369_patch_op69.js
 * 动态定位 dispatcher #3 的 op69（!flag?pc+=-24:0）→ patch 移除回退 → 打破死循环 → 生成 cookie/keys2
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
  console.log('动态代码:', runCode.length, '字节');

  // ★ 动态 patch op69：!<flag>?<pc>+=-24:0 → 移除回退
  // 先提取 PC 变量（__pX3 插桩记录了）
  const pcM = runCode.match(/window\.__pX3=([_$\w]+);/);
  if (pcM) {
    const pc = pcM[1];
    const re = new RegExp('!([_$\\w]+)\\?' + pc + '\\+=-24:0;');
    const m69 = runCode.match(re);
    if (m69) {
      console.log('op69 patch:', m69[0], '→ flag=' + m69[1]);
      runCode = runCode.replace(re, (mm, flag) => {
        // 记录 flag 值 + 移除回退
        return 'window.__flag69=' + flag + ';!' + flag + '?(' + pc + '+=0):0;';
      });
      // 在循环开头记录 flag 快照（关键环境值）
      runCode = runCode.replace(/while\(1\)\{window\.__w3=\(window\.__w3\|\|0\)\+1;/, (mm) => {
        return mm + 'window.__f69s=window.__f69s||[];window.__f69s.push(' + '!!window.__flag69' + ');if(window.__f69s.length>5)window.__f69s.shift();';
      });
    } else {
      console.log('未找到 op69 回退（PC=' + pc + '）');
    }
  } else {
    console.log('无 __pX3（op3 插桩未生效），从原始定位');
    const dm = runCode.match(/while\(1\)\{window\.__w3=\(window\.__w3\|\|0\)\+1;[\s\S]{0,400}?window\.__pX3=/);
    // 尝试其他方式
    const dm2 = runCode.match(/while\(1\)\{([_$\w]+)=([_$\w]+)\[([_$\w]+)\+\+\];if\(\1<444\)\{/);
    if (dm2) {
      const pc = dm2[3];
      const re = new RegExp('!([_$\\w]+)\\?' + pc + '\\+=-24:0;');
      const m69 = runCode.match(re);
      if (m69) {
        console.log('op69 patch(原始):', m69[0], '→ flag=' + m69[1]);
        runCode = runCode.replace(re, (mm, flag) => 'window.__flag69=' + flag + ';!' + flag + '?(' + pc + '+=0):0;');
      }
    }
  }
  fs.writeFileSync('/tmp/nx_dyncode_patched_op69.js', runCode);

  // 运行
  console.log('[运行] 动态代码（timeout 90s）...');
  const t0 = Date.now();
  try {
    const r = vm.runInContext(runCode, sandbox, { timeout: 90000, filename: 'dyn.js' });
    console.log('运行完成:', r === undefined ? 'undefined' : typeof r);
  } catch (e) {
    console.log('运行失败:', e.message.substring(0, 150));
  }
  console.log('耗时:', ((Date.now() - t0) / 1000).toFixed(1) + 's');
  // 诊断
  try {
    const diag = vm.runInContext(`JSON.stringify({
      lastW: window.__lastW, all: window.__all, w3: window.__w3,
      op3: window.__op3, dynDone: !!window.__dynDone,
      flag69: typeof window.__flag69!=='undefined'?window.__flag69:null,
      f69s: window.__f69s,
    })`, sandbox);
    console.log('诊断:', diag);
  } catch (e) { console.log('诊断失败:', e.message.substring(0, 80)); }
  await new Promise(r => setTimeout(r, 8000));
  console.log('cookies:', JSON.stringify(env.captured.cookies).substring(0, 400));
  console.log('missing 全集:', JSON.stringify(env.captured.missing).substring(0, 800));
  console.log('eval 次数:', (env.captured.evalLens || []).length, 'lens:', JSON.stringify(env.captured.evalLens).substring(0, 200));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
