/**
 * 728_A212_test_nx_cookie.js
 * 验证 len243-nx 适配器：用 412.raw 真实 nsd/cd 生成 P cookie → 请求服务器
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const http = require('http');
const tls = require('tls');

const ROOT = '/Users/luoyy/work/github/GitHub/rs-reverse_glm';
const MOCK_DIR = path.join(ROOT, 'nx-mock');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function httpsGet(url, cookie, ua) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const connectReq = http.request({ host: '127.0.0.1', port: 9000, method: 'CONNECT', path: `${u.hostname}:${u.port || 443}`, timeout: 25000 });
    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) { socket.destroy(); resolve({ status: 'ERR' }); return; }
      const tlsSock = tls.connect({ socket, servername: u.hostname, rejectUnauthorized: false }, () => {
        const cookieHeader = cookie ? `Cookie: ${cookie}\r\n` : '';
        tlsSock.write(`GET ${u.pathname} HTTP/1.1\r\nHost: ${u.hostname}:${u.port || 443}\r\n${cookieHeader}User-Agent: ${ua || UA}\r\nAccept: */*\r\nConnection: close\r\n\r\n`);
      });
      let body = '';
      tlsSock.on('data', d => body += d);
      tlsSock.on('end', () => {
        const headEnd = body.indexOf('\r\n\r\n');
        resolve({ status: headEnd >= 0 ? parseInt((body.substring(0, headEnd).split(' ')[1] || '').trim()) : 'ERR', body: body.substring(headEnd + 4).substring(0, 300) });
      });
      tlsSock.on('error', e => resolve({ status: 'ERR', error: e.message }));
    });
    connectReq.on('error', e => resolve({ status: 'ERR', error: e.message }));
    connectReq.on('timeout', () => { connectReq.destroy(); resolve({ status: 'ERR', error: 'TIMEOUT' }); });
    connectReq.end();
  });
}

(async () => {
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  const pathsUtil = require('@utils/paths');
  const gv = require('@src/handler/globalVarible');
  const makeCookie = require('@src/makeCookie');

  // 1. 拉挑战页（通过 nx-mock 412.raw）
  const raw = fs.readFileSync(path.join(MOCK_DIR, '412.raw'), 'utf8');
  const rawBody = raw.substring(raw.indexOf('\r\n\r\n') + 4);
  const nsd = +rawBody.match(/nsd=(\d+)/)[1];
  const cd = rawBody.match(/cd="([^"]+)"/)[1];
  console.log('nsd:', nsd, 'cd len:', cd.length);

  // 2. 配置 gv
  gv.config.url = { hostname: 'pmos.nx.sgcc.com.cn', pathname: '/', href: TARGET };
  gv.config.hostname = 'pmos.nx.sgcc.com.cn';
  gv.config.adapt = { hasDebug: true, lastWord: 'P', flag: 1801, getKey: 0x68, cdBasestr: 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^', basestr: 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{', cookiePrefix: 'a' };
  gv.config.immucfg = JSON.parse(fs.readFileSync(path.join(MOCK_DIR, 'immucfg.json'), 'utf8'));

  // 3. 生成 cookie
  const ts = { nsd, cd };
  try {
    const cookie = makeCookie(ts, (name) => path.join('/tmp', name));
    console.log('生成 cookie len:', cookie.length);
    console.log('cookie:', cookie.substring(0, 80) + '...');

    // 4. 请求服务器
    const cookieName = 'aoU85Lxl9xxN';
    const r = await httpsGet(TARGET, `${cookieName}=${cookie}`);
    console.log('请求状态:', r.status);
    if (r.status !== 200) console.log('body:', r.body.substring(0, 150));
  } catch (e) {
    console.error('生成失败:', e.message, e.stack ? e.stack.split('\n').slice(0, 8).join('\n') : '');
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
