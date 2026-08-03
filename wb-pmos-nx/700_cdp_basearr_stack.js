/**
 * 700_cdp_basearr_stack.js
 * 普通断点 + 对 _$_H（核心 push 调用点）检查 basearr（__cap length 24-30 纯数字）
 * 命中 → dump 完整调用栈（定位 [25-28] 生成）
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
  await cdp.send('Debugger.setBreakpointOnFunctionCall', { objectId: pushR.result.objectId });
  console.log('[1] 断点设置');

  let count = 0, checked = 0, hits = 0;
  let done = false;
  const hitData = [];
  cdp.on('Debugger.paused', async (params) => {
    count++;
    if (done) { await cdp.send('Debugger.resume').catch(() => {}); return; }
    // 只检查 _$_H 调用点（basearr 构造候选）
    const cf0 = params.callFrames && params.callFrames[0];
    const isCore = cf0 && (cf0.functionName === '_$_H' || cf0.functionName === '_$$8' || cf0.functionName === '_$kz');
    if (isCore) {
      checked++;
      try {
        const r = await cdp.send('Debugger.evaluateOnCallFrame', {
          callFrameId: cf0.callFrameId,
          expression: 'this.length >= 24 && this.length <= 30 && Array.prototype.every.call(this, function(x){return typeof x === "number";})',
          returnByValue: true,
        });
        if (r.result?.value === true) {
          hits++;
          const arrR = await cdp.send('Debugger.evaluateOnCallFrame', { callFrameId: cf0.callFrameId, expression: 'JSON.stringify(this)', returnByValue: true });
          console.log(`\n[★] basearr len26-30 命中! 数组=${arrR.result?.value?.substring(0, 150)}`);
          console.log('  调用栈:');
          const stack = [];
          for (let fi = 0; fi < Math.min(20, params.callFrames.length); fi++) {
            const cf = params.callFrames[fi];
            stack.push({ fn: cf.functionName || '(anon)', loc: `${cf.location.lineNumber}:${cf.location.columnNumber}` });
            console.log(`    ${cf.functionName || '(anon)'} @${cf.location.lineNumber}:${cf.location.columnNumber}`);
          }
          hitData.push({ arr: JSON.parse(arrR.result.value), stack });
          if (hits >= 3) {
            done = true;
            fs.writeFileSync('/tmp/nx_basearr_stack_final.json', JSON.stringify(hitData));
          }
        }
      } catch (e) {}
    }
    if (count > 15000) done = true;
    await cdp.send('Debugger.resume').catch(() => {});
  });

  await page.goto(TARGET, { timeout: 60000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 25000));
  console.log('[3] 总暂停:', count, '核心检查:', checked, 'basearr 命中:', hits, done ? (hits >= 3 ? '★ 完成' : '超时') : '未完成');
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
