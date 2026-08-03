/**
 * 601_global_enum.js
 * 直接枚举 nx 页面 window 上的 global 数组（通过捕获 VM dispatcher 的闭包）
 * 方法：hook Function.prototype.toString 收集所有非原生函数源码 → 找 VM dispatcher → global 数组
 * 然后定位 huffman 编码函数（numarrEncrypt 等价物）→ 断点捕获 basearr
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const http = require('http');
const tls = require('tls');
const { chromium } = require(path.join('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules', 'patchright'));

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY_URL = new URL('http://74940609:aFmWc5Fs@36.134.44.6:2018');
const PROXY_AUTH = 'Basic ' + Buffer.from(PROXY_URL.username + ':' + PROXY_URL.password).toString('base64');

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
      let body = '', raw = '';
      tlsSock.on('data', d => raw += d);
      tlsSock.on('end', () => {
        const headEnd = raw.indexOf('\r\n\r\n');
        if (headEnd >= 0) {
          const resHead = raw.substring(0, headEnd);
          const setCookies = [];
          resHead.split('\r\n').forEach(l => { if (/^set-cookie:/i.test(l)) setCookies.push(l.substring(11).split(';')[0]); });
          resolve({ status: parseInt((resHead.split(' ')[1] || '').trim()), body: raw.substring(headEnd + 4), setCookies });
        } else resolve({ status: 'ERR' });
      });
      tlsSock.on('error', e => resolve({ status: 'ERR' }));
    });
    connectReq.on('error', e => resolve({ status: 'ERR' }));
    connectReq.on('timeout', () => { connectReq.destroy(); resolve({ status: 'TIMEOUT' }); });
    connectReq.end();
  });
}

(async () => {
  const ch = await httpsGet(TARGET);
  if (ch.status !== 412) { console.log('挑战失败', ch.status); process.exit(1); }
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { process.exit(1); }
  console.log('nsd=' + m[1]);

  const browser = await chromium.launch({ headless: true, proxy: { server: 'http://36.134.44.6:2018', username: '74940609', password: 'aFmWc5Fs' }, args: ['--ignore-certificate-errors', '--no-sandbox'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA });
  const page = await context.newPage();
  await page.route('**/pmos.nx.sgcc.com.cn:10443/', (route) => { route.fulfill({ status: 412, contentType: 'text/html', body: ch.body }); });

  // 注入全局函数收集器（hook 所有函数 toString）
  await page.addInitScript(() => {
    window.__funcs = [];
    const orig = Function.prototype.toString;
    Function.prototype.toString = function() {
      try {
        const src = orig.call(this);
        if (!src.startsWith('function') && !src.startsWith('class')) return src;
        if (src.length > 300 && src.length < 4000 && window.__funcs.length < 5000) {
          window.__funcs.push(src);
        }
      } catch (e) {}
      return orig.call(this);
    };
  });
  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 20000));
  const ck = await context.cookies();
  const p = ck.find(c => c.name.endsWith('P'));
  console.log('P cookie:', p ? 'YES len=' + p.value.length : '无');

  const funcsJson = await page.evaluate('JSON.stringify(window.__funcs || [])');
  const funcs = JSON.parse(funcsJson);
  console.log('收集函数数:', funcs.length);
  fs.writeFileSync('/tmp/nx_all_funcs.json', JSON.stringify(funcs));

  // 找 VM dispatcher（4参 + 大量 <=N? 分支 + ._$cC 或 bytecode 属性）
  let disp = null;
  for (const s of funcs) {
    if (/function\s*\([^)]{1,60}\)\s*\{\s*var\s+[_$][\w$]*\s*=\s*[_$][\w$]*\./.test(s) && /while\(1\)|for\(/.test(s) && (s.match(/<=(\d+)\?/g) || []).length > 20) {
      disp = s; break;
    }
  }
  console.log('dispatcher:', disp ? '找到 len=' + disp.length : '未找到');
  if (disp) fs.writeFileSync('/tmp/nx_disp_browser.js', disp);

  // 找 huffman 编码函数（numarrEncrypt 特征：位运算 + 256 表 + push）
  const huff = funcs.filter(s => {
    return /while\s*\([^)]*>= 8|while\([^)]*>=8|two >= 8|val >= 8|bitLen|codeLen|<< 1|>> 1/.test(s) && s.length > 200 && s.length < 3000;
  });
  console.log('huffman 候选:', huff.length);
  huff.slice(0, 5).forEach((s, i) => {
    fs.writeFileSync('/tmp/nx_huff_browser_' + i + '.js', s);
    console.log('--- huff#' + i + ' len=' + s.length + ' ---');
    console.log(s.substring(0, 800));
  });
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
