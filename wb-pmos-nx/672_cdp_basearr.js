/**
 * 672_cdp_basearr.js
 * CDP 断点 Array.prototype.push：捕获 basearr 数组（150-180 全数字）
 * dump 调用栈 + 当前执行帧的 bytecode（_$h1）+ 指令指针
 * 目标：提取 basearr 生成子程序的 bytecode → 反编译 [25-28] 生成
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

  // 断点 Array.prototype.push
  const pushR = await cdp.send('Runtime.evaluate', { expression: 'Array.prototype.push' });
  await cdp.send('Debugger.setBreakpointOnFunctionCall', { objectId: pushR.result.objectId });

  console.log('[1] 断点设置，加载中...');
  let done = false, pauseCount = 0;
  cdp.on('Debugger.paused', async (params) => {
    pauseCount++;
    if (done) { await cdp.send('Debugger.resume').catch(() => {}); return; }
    if (pauseCount % 20 === 0) console.log('  暂停 #' + pauseCount);
    const f0 = params.callFrames[0];
    if (!f0) { await cdp.send('Debugger.resume').catch(() => {}); return; }
    // 检查 this 是否 basearr（长度 150-180 全数字）
    try {
      const thisR = await cdp.send('Runtime.evaluate', { expression: 'this.length >= 150 && this.length <= 185 && Array.prototype.every.call(this, function(x){return typeof x === "number";})', contextId: params.callFrames[0].callFrameId ? undefined : undefined });
      // 用 evaluateOnCallFrame 更可靠
      const r = await cdp.send('Debugger.evaluateOnCallFrame', { callFrameId: f0.callFrameId, expression: 'this.length >= 150 && this.length <= 185 && Array.prototype.every.call(this, function(x){return typeof x === "number";})', returnByValue: true });
      if (r.result?.value === true) {
        done = true;
        console.log('[2] ★ basearr 捕获! pause#' + pauseCount);
        // dump 数组
        const arrR = await cdp.send('Debugger.evaluateOnCallFrame', { callFrameId: f0.callFrameId, expression: 'Array.prototype.slice.call(this, 0, 200)', returnByValue: true });
        console.log('basearr len:', arrR.result?.value?.length);
        console.log('basearr:', JSON.stringify(arrR.result?.value?.slice(0, 40)));
        // dump 调用栈
        console.log('\n调用栈:');
        for (const cf of params.callFrames.slice(0, 12)) {
          console.log(`  ${cf.functionName || '(anonymous)'} @${cf.location.lineNumber}:${cf.location.columnNumber}`);
        }
        // dump frame0 作用域（找 bytecode _​$h1）
        const expr = `(function(){
          var out = { found: [] };
          function walk(obj, depth) {
            if (!obj || depth > 2) return;
            var ks = Object.keys(obj);
            for (var i = 0; i < Math.min(ks.length, 100); i++) {
              try {
                var v = obj[ks[i]];
                if (Array.isArray(v) && v.length > 100 && v.every(function(x){return typeof x === 'number';})) {
                  out.found.push({ name: ks[i], len: v.length, head: v.slice(0, 40) });
                }
              } catch (e) {}
            }
          }
          walk(this, 0);
          return out;
        })()`;
        const sc = await cdp.send('Debugger.evaluateOnCallFrame', { callFrameId: f0.callFrameId, expression: expr, returnByValue: true });
        console.log('bytecode 候选:', JSON.stringify(sc.result?.value?.found).substring(0, 800));
        // 保存
        fs.writeFileSync('/tmp/nx_cdp_basearr.json', JSON.stringify({
          arr: arrR.result?.value,
          stack: params.callFrames.slice(0, 12).map(cf => ({ fn: cf.functionName, loc: `${cf.location.lineNumber}:${cf.location.columnNumber}` })),
        }));
      }
    } catch (e) {}
    await cdp.send('Debugger.resume').catch(() => {});
  });

  await page.goto(TARGET, { timeout: 60000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 25000));
  console.log('[3] 完成, 总暂停:', pauseCount, done ? '★ 命中' : '未命中');
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
