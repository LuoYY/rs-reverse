/**
 * 143_debug_offset_fail.js
 *
 * 拉多个在线挑战，dump tail 前 12 字节，检查 numKeys=51 假设的适用性
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const http = require('http');
const tls = require('tls');

const ROOT = path.join(__dirname, '..');
const PROXY = 'http://74940609:aFmWc5Fs@119.167.233.189:2018';
const PROXY_URL = new URL(PROXY);
const PROXY_AUTH = 'Basic ' + Buffer.from(PROXY_URL.username + ':' + PROXY_URL.password).toString('base64');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function httpsGetWithProxy(url) {
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
      let data = '';
      tlsSock.on('data', d => data += d);
      tlsSock.on('end', () => resolve({ status: 200, body: data }));
      tlsSock.on('error', e => resolve({ status: 'ERR', error: e.message }));
    });
    connectReq.on('error', e => resolve({ status: 'ERR', error: e.message }));
    connectReq.end();
  });
}

(async () => {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const decrypt = require('@src/handler/parser/common/decrypt');

  for (let i = 0; i < 5; i++) {
    const ch = await httpsGetWithProxy(TARGET);
    const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
    if (!m) { console.log('#', i, '无挑战'); continue; }
    const nsd = +m[1], cd = m[2];
    const cdArr = decrypt(cd);
    const end = (cdArr[0] << 8 | cdArr[1]) + 2;
    const tail = cdArr.slice(end);
    console.log('#', i, 'nsd=' + nsd, 'end=' + end, 'tail前12:', tail.slice(0, 12).join(','));
    // numKeys 假设验证
    const off0 = tail[0] ^ 51;
    const ans0 = tail[0] ^ off0;
    console.log('   ans[0]=', ans0, '(应为51)', 'tail[0]=', tail[0]);
    // 各假设检查
    const checks = {
      'numKeys=51': tail[0] ^ 51,
      'gap0=2(tail[1]^2)': tail[1] ^ 2,
      'k0[0]=54(tail[2]^54)': tail[2] ^ 54,
      'k0[1]=52(tail[3]^52)': tail[3] ^ 52,
    };
    console.log('   offset 假设:', JSON.stringify(checks));
    await new Promise(r => setTimeout(r, 500));
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
