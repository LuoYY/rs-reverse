/** 447 dump 沙箱外层 VM 后的 $_ts 全局 */
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
  // 预置 $_ts（外层 VM 可能引用）
  vm.runInContext('window.$_ts = window.$_ts || {};', sandbox);
  try { vm.runInContext(outerJsCode, sandbox, { timeout: 25000, filename: 'outer.js' }); } catch (e) {
    console.log('外层 VM 异常:', e.message.substring(0, 100));
  }
  await new Promise(r => setTimeout(r, 3000));
  // dump $_ts
  try {
    const dump = vm.runInContext(`(function(){
      var t = window['$_ts'] || {};
      var out = { keys: Object.keys(t), types: {} };
      for (var k in t) {
        var v = t[k];
        var tv = typeof v;
        if (Array.isArray(v)) tv = 'array[' + v.length + ']';
        out.types[k] = tv + ':' + String(v).substring(0, 40);
      }
      return JSON.stringify(out);
    })()`, sandbox);
    console.log('$_ts:', dump.substring(0, 800));
  } catch (e) { console.log('dump $_ts 失败:', e.message.substring(0, 100)); }
  // 也看 scj/aebi
  try {
    const sa = vm.runInContext(`JSON.stringify({ scj: (typeof window['$_ts']!=='undefined'&&window['$_ts'])?window['$_ts'].scj:'N/A', aebi: (typeof window['$_ts']!=='undefined'&&window['$_ts'])?window['$_ts'].aebi:'N/A' })`, sandbox);
    console.log('scj/aebi:', sa.substring(0, 300));
  } catch (e) {}
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
