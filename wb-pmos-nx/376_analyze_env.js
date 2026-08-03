/**
 * 376_analyze_env.js
 * 分析 dispatcher #0 的 opcode 69 分支（跳转形式）+ 环境数组填充逻辑
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
  if (ch.status !== 412) { process.exit(1); }
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  const nsd = +m[1], cd = m[2];
  const { buildEnv } = require(path.join(ROOT, 'output/keygen/sandbox_keygen.js'));
  const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
  const env = buildEnv({ nsd, cd }, { outerJsCode: fs.readFileSync(OUTER_JS, 'utf8'), target: TARGET, ua: UA, patchDyn: false });
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env.sandbox, { timeout: 25000 }); } catch (e) {}
  await new Promise(r => setTimeout(r, 5000));
  const dynCode = env.getDynCode();
  if (!dynCode) { console.log('无动态代码'); process.exit(1); }
  fs.writeFileSync('/tmp/nx_dyncode_raw.js', dynCode);
  console.log('原始动态代码已存:', dynCode.length);

  // 分析 dispatcher #0
  const dm = dynCode.match(/while\(1\)\{([_$\w]+)=([_$\w]+)\[([_$\w]+)\+\+\];if\(\1<444\)\{/);
  if (!dm) { console.log('无 dispatcher'); process.exit(1); }
  const [op, arr, pc] = [dm[1], dm[2], dm[3]];
  console.log('dispatcher: op=' + op + ' arr=' + arr + ' pc=' + pc);
  const seg = dynCode.substring(dm.index, dm.index + 30000);

  // opcode 69 分支（op===69）
  const i69 = seg.indexOf('===' + op + '===69');
  console.log('\n=== opcode 69 分支 ===');
  if (i69 >= 0) {
    console.log(seg.substring(i69, i69 + 120));
  } else {
    // else 链搜索：找 >=X 边界
    // 直接找 opcode 69 相邻处理
    const idx69 = seg.indexOf('===69');
    console.log(idx69 >= 0 ? seg.substring(idx69, idx69 + 120) : '未找到 ===69');
  }

  // opcode 383 分支（else 链：384 是大 else）
  console.log('\n=== opcode 383 附近 ===');
  const i383 = seg.indexOf('>=384');
  console.log(i383 >= 0 ? seg.substring(i383 - 20, i383 + 150) : '无 >=384');

  // 环境数组读取模式（op0 = X=EnvArr[IdxArr[N]]）
  console.log('\n=== 环境数组读取（opcode 低段）===');
  const reads = seg.match(/\)\{[_$\w]+=([_$\w]+)\[([_$\w]+)\[[0-9]+\]\];/g);
  console.log('环境读取模式:', reads ? reads.slice(0, 10) : '无');
  // 环境数组赋值
  console.log('\n=== 环境数组赋值 ===');
  const writes = seg.match(/[_$\w]+\[[0-9]+\]=[_$\w]+\[[_$\w]+\[[0-9]+\]\];/g);
  console.log('环境赋值:', writes ? writes.slice(0, 10) : '无');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
