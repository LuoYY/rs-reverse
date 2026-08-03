/**
 * 380_parse_dispatcher.js
 * 解析 dispatcher #0 的二分 if 结构 → opcode→分支 映射表
 * 理解死循环 24 个 opcode 的环境读取/跳转逻辑
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

// 解析二分 if 结构 → {opcode: 分支代码}
function parseBinary(code, opVar) {
  // 从 if(opVar<444){ 开始解析
  const map = {};
  const reIf = new RegExp('if\\(' + opVar + '<(\\d+)\\)\\{');
  // 简单解析：找所有 ===N 分支 + else 链
  // 用 tokenizer 处理嵌套
  let pos = code.indexOf('if(' + opVar + '<');
  if (pos < 0) return map;
  // 递归解析区间
  function parseRange(str, lo, hi, depth) {
    // str 是 `<lo..hi` 区间的代码
    const m = str.match(new RegExp('if\\(' + opVar + '<(\\d+)\\)\\{'));
    if (!m) return;
    const mid = +m[1];
    // 找到 if 块和 else 块
    let brace = str.indexOf('{', m.index);
    let i = brace, stack = 0;
    for (; i < str.length; i++) {
      if (str[i] === '{') stack++;
      else if (str[i] === '}') { stack--; if (stack === 0) break; }
    }
    const ifBlock = str.substring(brace + 1, i);
    const rest = str.substring(i + 1);
    // else 块
    let elseBlock = '';
    if (rest.startsWith('else')) {
      const b2 = rest.indexOf('{');
      let j = b2, st2 = 0;
      for (; j < rest.length; j++) {
        if (rest[j] === '{') st2++;
        else if (rest[j] === '}') { st2--; if (st2 === 0) break; }
      }
      elseBlock = rest.substring(b2 + 1, j);
    }
    // 叶子：===N
    const leaf = (block, l, h) => {
      const eq = block.match(new RegExp('if\\(' + opVar + '===(\\d+)\\)\\{'));
      if (eq) {
        const opN = +eq[1];
        let b = block.indexOf('{', eq.index);
        let k = b, s = 0;
        for (; k < block.length; k++) {
          if (block[k] === '{') s++;
          else if (block[k] === '}') { s--; if (s === 0) break; }
        }
        map[opN] = block.substring(b + 1, k).replace(/\n/g, ' ').substring(0, 120);
      } else {
        // 内部还有 if
        if (block.includes('if(' + opVar)) parseRange(block, l, h, depth + 1);
        else {
          // else 块 = 区间最后一个 opcode
          const last = h - 1;
          map[last] = block.replace(/\n/g, ' ').substring(0, 120);
        }
      }
    };
    if (ifBlock) leaf(ifBlock, lo, mid);
    if (elseBlock) leaf(elseBlock, mid, hi);
  }
  parseRange(code.substring(pos), 0, 444, 0);
  return map;
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
  fs.writeFileSync('/tmp/nx_dyncode_raw.js', dynCode);
  console.log('nsd=' + nsd + ' dynCode=' + dynCode.length);

  const dm = dynCode.match(/while\(1\)\{([_$\w]+)=([_$\w]+)\[([_$\w]+)\+\+\];if\(\1<444\)\{/);
  if (!dm) { console.log('无 dispatcher'); process.exit(1); }
  const op = dm[1];
  const seg = dynCode.substring(dm.index, dm.index + 40000);
  const map = parseBinary(seg, op);
  console.log('解析到 opcode 分支:', Object.keys(map).length);

  const loopOps = [383, 69, 141, 105, 356, 398, 122, 406, 318, 285, 401, 274, 135, 225, 0, 205, 388, 423, 386, 119, 337, 86, 410, 31];
  for (const opN of loopOps) {
    console.log(`\nop${opN}: ${map[opN] || '(未解析)'}`);
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
