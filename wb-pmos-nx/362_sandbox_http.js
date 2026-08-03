/**
 * 362_sandbox_http.js
 * 纯 HTTP 挑战 + 沙箱（patchDyn/patchLoop）跑 nx → cookie/missing/keys2
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
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

  const { runSandbox } = require(path.join(ROOT, 'output/keygen/sandbox_keygen.js'));
  const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
  const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');
  console.log('运行沙箱...');
  const t0 = Date.now();
  const sand = await runSandbox({ nsd, cd }, {
    outerJsCode, target: TARGET, ua: UA, timeout: 90000, waitMs: 15000,
    patchDyn: true, patchLoop: true, debugLog: false,
  });
  console.log('耗时:', ((Date.now() - t0) / 1000).toFixed(1) + 's');
  console.log('cookie:', (sand.pCookie || '').substring(0, 30), 'len:', (sand.pCookie || '').length);
  console.log('errors:', JSON.stringify(sand.errors).substring(0, 300));
  console.log('missing:', JSON.stringify(sand.missing).substring(0, 400));
  console.log('dynCodeLen:', sand.dynCodeLen, 'cp3:', sand.cp3);
  console.log('cookies:', JSON.stringify(sand.cookies).substring(0, 300));

  // 提取沙箱 keys2（如果 cookie 有）
  if (sand.pCookie) {
    for (const k of Object.keys(require.cache)) delete require.cache[k];
    require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
    require('@src/handler/parser/constData').init();
    const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
    const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
    const sc = sand.pCookie.split('=')[1] || sand.pCookie;
    const payload = sc.startsWith('a') ? sc.slice(1) : sc;
    const sC = decodeB86(payload);
    if (sC) {
      const sArr = numarrAddTime([...K16], 0, 1 / 256)[0];
      const sDec = encryptMode2([...sC], sArr, 1);
      const sK2 = sDec.slice(15, 63);
      console.log('沙箱 keys2 前8:', sK2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
      console.log('沙箱 nextarr 头:', sDec.slice(0, 15).map(b => b.toString(16).padStart(2, '0')).join(' '));
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
