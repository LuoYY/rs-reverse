/**
 * 696_cdp_stack.js
 * CDP 条件断点 + Error().stack 获取调用栈（f0.callFrameId 尝试）
 * 定位 basearr [25-28] 生成代码
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
  const cond = '(this[0] === 113 && this.length === 26) ? (window.__cap = this, true) : false';
  await cdp.send('Debugger.setBreakpointOnFunctionCall', { objectId: pushR.result.objectId, condition: cond });
  console.log('[1] 条件断点设置（len 26 时捕获）');

  let done = false, pauseCount = 0;
  cdp.on('Debugger.paused', async (params) => {
    pauseCount++;
    if (done) { await cdp.send('Debugger.resume').catch(() => {}); return; }
    done = true;
    console.log('[2] ★ basearr len=26 捕获! pause#' + pauseCount);
    try {
      const arrR = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__cap)', returnByValue: true });
      console.log('basearr:', arrR.result?.value);
      console.log('[25]:', JSON.parse(arrR.result.value)[25]);
    } catch (e) {}
    // 尝试 callFrames
    console.log('\ncallFrames:', params.callFrames.length);
    for (let fi = 0; fi < Math.min(20, params.callFrames.length); fi++) {
      const cf = params.callFrames[fi];
      console.log(`  ${cf.functionName || '(anon)'} @${cf.location.lineNumber}:${cf.location.columnNumber} url=${cf.url ? cf.url.substring(0, 50) : '?'}`);
    }
    // Error().stack（如果 callFrames 空）
    if (!params.callFrames.length) {
      try {
        const st = await cdp.send('Runtime.evaluate', { expression: 'new Error().stack', returnByValue: true });
        console.log('\nError stack:', st.result?.value?.substring(0, 1500));
      } catch (e) {}
    }
    await cdp.send('Debugger.resume').catch(() => {});
  });

  await page.goto(TARGET, { timeout: 60000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 25000));
  console.log('[3] 总暂停:', pauseCount, done ? '★ 完成' : '未完成');
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
