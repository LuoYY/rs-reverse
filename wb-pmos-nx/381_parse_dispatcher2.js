/**
 * 381_parse_dispatcher2.js
 * 健壮的 dispatcher 二分解析器：处理 if/else if/else 链 → opcode→分支 映射
 * 理解死循环 24 个 opcode 的环境读取/跳转
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

function extractBlock(str, openIdx) {
  // 从 openIdx 处的 '{' 开始括号匹配，返回 { content, end }
  let i = openIdx, stack = 0;
  for (; i < str.length; i++) {
    if (str[i] === '{') stack++;
    else if (str[i] === '}') { stack--; if (stack === 0) break; }
  }
  return { content: str.substring(openIdx + 1, i), end: i };
}

function parseNode(node, lo, hi, map) {
  node = node.trim();
  if (!node) return;
  // 找 if(
  const m = node.match(/if\([_$\w]+(===|<)(\d+)\)\{/);
  if (!m) {
    // 纯 else 块：区间 [lo,hi) 的最后一个 opcode
    if (hi > lo) map[hi - 1] = node.substring(0, 160);
    return;
  }
  const isEq = m[1] === '===';
  const val = +m[2];
  const ifOpen = node.indexOf('{', m.index);
  const ifBlk = extractBlock(node, ifOpen);
  if (isEq) {
    // if(op===N){A} → map[N]
    map[val] = ifBlk.content.replace(/\n/g, ' ').substring(0, 160);
    // 剩余 else/else if 链
    let rest = node.substring(ifBlk.end + 1).trim();
    // 递归处理 else 链（区间 [val+1, hi)）
    if (rest.startsWith('else')) {
      parseNode(rest.substring(4), val + 1, hi, map);
    }
  } else {
    // if(op<mid){A} → [lo,mid)；else → [mid,hi)
    parseNode(ifBlk.content, lo, val, map);
    let rest = node.substring(ifBlk.end + 1).trim();
    if (rest.startsWith('else')) {
      parseNode(rest.substring(4), val, hi, map);
    }
  }
}

(async () => {
  const ch = await httpsGet(TARGET);
  if (ch.status !== 412) { console.log('挑战:', ch.status); process.exit(1); }
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { process.exit(1); }
  const nsd = +m[1], cd = m[2];
  const { buildEnv } = require(path.join(ROOT, 'output/keygen/sandbox_keygen.js'));
  const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
  const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');
  const env = buildEnv({ nsd, cd }, { outerJsCode, target: TARGET, ua: UA, patchDyn: false });
  try { vm.runInContext(outerJsCode, env.sandbox, { timeout: 25000 }); } catch (e) {}
  await new Promise(r => setTimeout(r, 5000));
  const dynCode = env.getDynCode();
  if (!dynCode) { console.log('无动态代码'); process.exit(1); }
  console.log('nsd=' + nsd + ' dynCode=' + dynCode.length);

  const dm = dynCode.match(/while\(1\)\{([_$\w]+)=([_$\w]+)\[([_$\w]+)\+\+\];if\(\1<444\)\{/);
  if (!dm) { console.log('无 dispatcher'); process.exit(1); }
  const op = dm[1];
  const seg = dynCode.substring(dm.index);
  // dispatcher 主体：if(op<444){...}else{...}
  const firstIf = seg.indexOf('if(' + op + '<444){');
  if (firstIf < 0) { console.log('无 if(op<444)'); process.exit(1); }
  const map = {};
  parseNode(seg.substring(firstIf), 0, 444, map);
  console.log('解析到 opcode 分支:', Object.keys(map).length);

  const loopOps = [383, 69, 141, 105, 356, 398, 122, 406, 318, 285, 401, 274, 135, 225, 0, 205, 388, 423, 386, 119, 337, 86, 410, 31];
  for (const opN of loopOps) {
    console.log(`\nop${opN}: ${map[opN] || '(未解析)'}`);
  }
  // 也打印 opcode 0-70 的常见环境读取
  console.log('\n=== opcode 0-10 与 60-70 ===');
  for (let i = 0; i <= 10; i++) if (map[i]) console.log(`op${i}: ${map[i]}`);
  for (let i = 60; i <= 70; i++) if (map[i]) console.log(`op${i}: ${map[i]}`);
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
