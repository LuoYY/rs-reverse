/**
 * 122_nx_cookie_derived.js
 *
 * nx cookie 纯算法完整流程（绕过 runTask）：
 *   1. 拉挑战（代理）→ nsd/cd/O
 *   2. runOuterVM → cp3
 *   3. Coder.run() → 重建代码
 *   4. decrypt(cd) → K16 锚扫描推导 offset（keys16==K16 唯一命中）
 *   5. gv.dynamicTaskOffset = offset → parser.init（tscd 用推导 offset）
 *   6. new Cookie(coder).run() → cookie
 *   7. 重放验证
 *
 * 用法：node 122_nx_cookie_derived.js [次数]
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
const K16 = [0xd7, 0x5a, 0x5c, 0x72, 0xbe, 0xa1, 0xd2, 0x3b, 0x37, 0xc0, 0xcc, 0x02, 0xd1, 0x5f, 0x11, 0xad];
const PROXY = { host: '119.167.233.189', port: 2018, auth: '74940609:aFmWc5Fs' };

function httpReq(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const headers = { 'User-Agent': UA, ...(opts.headers || {}) };
    const req = https.request({
      hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: 'GET',
      headers, rejectUnauthorized: false,
      agent: new https.Agent({ keepAlive: false }),
      host: PROXY.host,
      // CONNECT 隧道代理
      createConnection: () => {
        const net = require('net');
        const socket = net.connect(PROXY.port, PROXY.host, () => {
          socket.write(`CONNECT ${u.hostname}:${u.port} HTTP/1.1\r\nHost: ${u.hostname}:${u.port}\r\nProxy-Authorization: Basic ${Buffer.from(PROXY.auth).toString('base64')}\r\n\r\n`);
        });
        let connected = false;
        socket.once('data', (d) => {
          if (!connected && d.toString().includes('200')) { connected = true; socket.emit('connect'); }
        });
        return socket;
      },
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function fetchChallenge() {
  const r = await httpReq(TARGET);
  const m = r.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) throw new Error('无挑战: ' + r.status);
  const o = [].concat(r.headers['set-cookie'] || []).map(c => c.split(';')[0]).find(c => /O=/.test(c)) || '';
  return { nsd: +m[1], cd: m[2], oCookie: o };
}

function deriveOffset(tail) {
  for (let pos = 0; pos + 16 <= tail.length; pos++) {
    const offset = new Array(8);
    let valid = true;
    for (let i = 0; i < 16; i++) {
      const idx = (pos + i) % 8;
      const val = tail[pos + i] ^ K16[i];
      if (offset[idx] === undefined) offset[idx] = val;
      else if (offset[idx] !== val) { valid = false; break; }
    }
    if (!valid) continue;
    const ans = tail.map((b, i) => b ^ offset[i % 8]);
    if (ans[0] < 20 || ans[0] > 120) continue;
    // genKeys step1 验证 keys16
    const keys = genKeysSim(ans, 1);
    if (keys && keys[16] && keys[16].length === 16 && keys[16].every((v, i) => v === K16[i])) {
      return { pos, offset: [...offset], keys, numKeys: ans[0] };
    }
  }
  return null;
}
function getLensGo(numarr, idx) {
  const item = numarr[idx]; idx++;
  let lens;
  if ((item & 128) === 0) lens = item;
  else if ((item & 192) === 128) { lens = ((item & 63) << 8) | numarr[idx]; idx++; }
  else if ((item & 224) === 192) { lens = ((item & 31) << 16) | (numarr[idx] << 8) | numarr[idx + 1]; idx += 2; }
  else if ((item & 240) === 224) { lens = ((item & 15) << 24) | (numarr[idx] << 16) | (numarr[idx + 1] << 8) | numarr[idx + 2]; idx += 3; }
  else if ((item & 248) === 240) { lens = (numarr[idx] << 24) | (numarr[idx + 1] << 16) | (numarr[idx + 2] << 8) | numarr[idx + 3]; idx += 4; }
  else lens = item;
  return [lens, idx];
}
function genKeysSim(ans, step) {
  const keys = [];
  let op = 1, gap;
  try {
    for (let i = 0; i < ans[0]; i++) {
      if (step === 2) { if (op + 1 >= ans.length) return null; gap = (ans[op] << 8) | ans[op + 1]; op += 2; }
      else { [gap, op] = getLensGo(ans, op); }
      if (gap < 0 || op + gap > ans.length) return null;
      keys.push(ans.slice(op, op + gap));
      op += gap;
    }
  } catch (e) { return null; }
  return keys;
}

async function makeCookieOnce(i) {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  const { runOuterVM } = require(path.join(ROOT, 'extract_dyncode_20080.js'));
  const decrypt = require('@src/handler/parser/common/decrypt');

  const ch = await fetchChallenge();
  console.log(`#${i} nsd=${ch.nsd} cdLen=${ch.cd.length}`);

  // 1. Coder + cp3
  const gv = require('@src/handler/globalVarible');
  const { getCode } = require('@utils/');
  const ts = { nsd: ch.nsd, cd: ch.cd, from: TARGET, hasDebug: false, keynameNum: 1151, cp3Override: undefined };
  fs.writeFileSync('/tmp/nx122-ts.json', JSON.stringify(ts));
  const argv = { file: '/tmp/nx122-ts.json', jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(ROOT, 'output'), level: 'warn', _: ['makecookie'] };
  const codeRet = await getCode(argv.jsurls);
  argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
  gv._setAttr('argv', argv);
  require('@src/config/')(gv);
  gv._setAttr('_ts', ts);
  const Coder = require('@src/handler/Coder');
  const coder = new Coder({ hasCodemap: true, hasDebug: false, ...ts }, gv.config.immucfg);
  coder.run();
  const cp3 = coder.$_ts.cp[3];
  console.log('  cp3(Coder):', cp3);

  // 2. K16 锚扫描推导 offset
  const cdArr = decrypt(ch.cd);
  const end = (cdArr[0] << 8 | cdArr[1]) + 2;
  const d = deriveOffset(cdArr.slice(end));
  if (!d) { console.log('  offset 推导失败'); return null; }
  console.log('  offset:', d.offset.map(b => b.toString(16).padStart(2, '0')).join(' '), 'numKeys:', d.numKeys);
  console.log('  keys2:', d.keys[2].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '), 'keys17:', d.keys[17].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // 3. 注入 offset + keys → Cookie
  gv._setAttr('dynamicTaskOffset', d.offset);
  gv._setAttr('rebuiltCode', coder.code);
  gv.config.codemap = coder.run().codemap;
  // 重新拿 codemap（coder.run 两次？不，一次）
  const coder2 = new Coder({ hasCodemap: true, hasDebug: false, ...ts }, gv.config.immucfg);
  const { $_ts: fullTs, codemap } = coder2.run();
  fullTs.cp[3] = cp3;
  gv.config.codemap = codemap;
  const Cookie = require('@src/handler/Cookie');
  const cookie = new Cookie(coder2).run();
  const name = gv.utils.ascii2string(gv.keys[7]).split(';')[5] + (gv.config.adapt?.lastWord || 'P');
  console.log('  cookie name:', name, 'len:', cookie.length);
  const cookieHeader = `${ch.oCookie}; ${name}=${cookie}`;

  // 4. 重放验证
  const replay = await httpReq(TARGET, { headers: { 'User-Agent': UA, 'Cookie': cookieHeader } });
  console.log(`  重放: ${replay.status}`);
  return { status: replay.status, nsd: ch.nsd, cookieHeader };
}

(async () => {
  const n = parseInt(process.argv[2] || '3', 10);
  let ok = 0, bad = 0;
  for (let i = 1; i <= n; i++) {
    try {
      const r = await makeCookieOnce(i);
      if (r && r.status === 200) ok++; else bad++;
    } catch (e) { bad++; console.log('  错误:', e.message.substring(0, 100)); }
  }
  console.log(`\n=== 汇总: 200=${ok} 非200=${bad} (${n}次) ===`);
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
