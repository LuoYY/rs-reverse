/**
 * 399_check_doc_chain.js
 * 报错后检查 document 相关链，定位 documentMode 报错的 undefined 对象
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

  // 检查 document 链
  const checks = `
    (function(){var out = {};
    try { out.docType = typeof document; } catch(e) { out.docType = 'e:' + e.message; }
    try { out.docMode = document.documentMode; } catch(e) { out.docMode = 'e:' + e.message; }
    try { out.docEl = typeof document.documentElement; } catch(e) { out.docEl = 'e:' + e.message; }
    try { out.docElDM = document.documentElement.documentMode; } catch(e) { out.docElDM = 'e:' + e.message; }
    try { out.allType = typeof document.all; } catch(e) { out.allType = 'e:' + e.message; }
    try { out.all0 = document.all[0] === undefined ? 'undefined' : 'obj:' + typeof document.all[0]; } catch(e) { out.all0 = 'e:' + e.message; }
    try { out.all0DM = document.all[0].documentMode; } catch(e) { out.all0DM = 'e:' + e.message; }
    try { out.bodyType = typeof document.body; } catch(e) { out.bodyType = 'e:' + e.message; }
    try { out.bodyDM = document.body.documentMode; } catch(e) { out.bodyDM = 'e:' + e.message; }
    try { out.h = document.getElementsByTagName('html'); out.geth = out.h.length + ':' + (out.h[0] ? typeof out.h[0] : 'undef'); } catch(e) { out.geth = 'e:' + e.message; }
    try {     out.gethDM = document.getElementsByTagName('html')[0].documentMode; } catch(e) { out.gethDM = 'e:' + e.message; }
    return out;})()
  `;
  const r = vm.runInContext('(' + checks + ')', sandbox);
  console.log('document 链检查:', JSON.stringify(r, null, 1));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
