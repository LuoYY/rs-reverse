/**
 * 690_cdp_capture.js
 * CDP 条件断点：条件里捕获 push 的 this（数组）到 window.__cap
 * 暂停后从 window.__cap 获取 basearr + dump 调用栈/bytecode
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
  if (ch.status !== 412) { process.exit(1); }
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { process.exit(1); }
  console.log('nsd=' + m[1]);

  const browser = await chromium.launch({ headless: true, proxy: { server: 'http://36.134.44.6:2018', username: '74940609', password: 'aFmWc5Fs' }, args: ['--ignore-certificate-errors', '--no-sandbox'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  await cdp.send('Debugger.enable');
  await page.route('**/pmos.nx.sgcc.com.cn:10443/', (route) => { route.fulfill({ status: 412, contentType: 'text/html', body: ch.body }); });

  const pushR = await cdp.send('Runtime.evaluate', { expression: 'Array.prototype.push' });
  await cdp.send('Debugger.setBreakpointOnFunctionCall', {
    objectId: pushR.result.objectId,
    condition: 'window.__cap = this, this.length >= 150 && this.length <= 185',
  });
  console.log('[1] 条件断点设置（捕获数组到 window.__cap）');

  let done = false, pauseCount = 0;
  cdp.on('Debugger.paused', async (params) => {
    pauseCount++;
    if (done) { await cdp.send('Debugger.resume').catch(() => {}); return; }
    done = true;
    console.log('[2] ★ basearr 捕获! pause#' + pauseCount);
    // 从 window.__cap 获取数组
    try {
      const capR = await cdp.send('Runtime.evaluate', { expression: 'Array.isArray(window.__cap) ? JSON.stringify(window.__cap) : "not-array"', returnByValue: true });
      const val = capR.result?.value;
      if (typeof val === 'string' && val.startsWith('[')) {
        const arr = JSON.parse(val);
        console.log('basearr len:', arr.length);
        console.log('basearr:', val.substring(0, 400));
      } else {
        console.log('__cap:', val);
      }
    } catch (e) { console.log('__cap 获取失败:', e.message.substring(0, 50)); }
    // 调用栈
    console.log('\n调用栈:');
    for (const cf of params.callFrames.slice(0, 12)) {
      console.log(`  ${cf.functionName || '(anon)'} @${cf.location.lineNumber}:${cf.location.columnNumber}`);
    }
    await cdp.send('Debugger.resume').catch(() => {});
  });

  await page.goto(TARGET, { timeout: 60000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 25000));
  console.log('[3] 总暂停:', pauseCount, done ? '★ 命中' : '未命中');
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
