/**
 * 728_A227_capture_base_gen.js
 * 聚焦采集：hook push 断点，捕获 113/179 开头数组的生成调用栈
 * 目标：定位 base（179 开头）生成时刻的 VM 程序与帧状态
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const { chromium } = require('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules/patchright');

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const CHROMIUM = '/Applications/Chromium.app/Contents/MacOS/Chromium';
const MOCK_DIR = '/Users/luoyy/work/github/GitHub/rs-reverse_glm/nx-mock';

(async () => {
  const http = require('http');
  const tls = require('tls');
  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  const PROXY_URL = new URL('http://74940609:aFmWc5Fs@36.134.44.6:2018');
  const PROXY_AUTH = 'Basic ' + Buffer.from(PROXY_URL.username + ':' + PROXY_URL.password).toString('base64');
  // 拉真实挑战页
  const chBody = await new Promise((resolve) => {
    const connectReq = http.request({
      host: PROXY_URL.hostname, port: +PROXY_URL.port, method: 'CONNECT',
      path: 'pmos.nx.sgcc.com.cn:10443',
      headers: { 'Proxy-Authorization': PROXY_AUTH, Host: 'pmos.nx.sgcc.com.cn:10443' },
      timeout: 25000,
    });
    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) { socket.destroy(); resolve(null); return; }
      const tlsSock = tls.connect({ socket, servername: 'pmos.nx.sgcc.com.cn', rejectUnauthorized: false }, () => {
        tlsSock.write(`GET / HTTP/1.1\r\nHost: pmos.nx.sgcc.com.cn:10443\r\nUser-Agent: ${UA}\r\nAccept: */*\r\nConnection: close\r\n\r\n`);
      });
      let raw = '';
      tlsSock.on('data', d => raw += d);
      tlsSock.on('end', () => {
        const headEnd = raw.indexOf('\r\n\r\n');
        if (headEnd < 0) { resolve(null); return; }
        let body = raw.substring(headEnd + 4);
        // 去除 chunked 长度前缀
        const m2 = body.match(/^[0-9a-fA-F]+\r\n/);
        if (m2) body = body.substring(m2[0].length);
        resolve(body);
      });
      tlsSock.on('error', () => resolve(null));
    });
    connectReq.on('error', () => resolve(null));
    connectReq.end();
  });
  if (!chBody) { console.log('拉挑战页失败'); process.exit(1); }
  const nsdM = chBody.match(/nsd=(\d+)/);
  console.log('挑战页 nsd:', nsdM ? nsdM[1] : '无');
  const browser = await chromium.launch({
    executablePath: CHROMIUM, headless: true,
    proxy: { server: 'http://36.134.44.6:2018', username: '74940609', password: 'aFmWc5Fs' },
    args: ['--ignore-certificate-errors', '--no-sandbox'],
  });
  const rawBody = chBody;
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  await cdp.send('Debugger.enable');

  // 不 route 拦截，真实访问让挑战 js 完整运行
  await page.goto(TARGET, { timeout: 60000, waitUntil: 'domcontentloaded' }).catch(() => {});

  await cdp.send('Runtime.evaluate', { expression: 'window.__cnt=0; window.__aqFound=false;' });
  // 第一步：先找 basearr 明文（113 开头）的 push，从调用栈获取 _$aq 函数对象
  const pushR = await cdp.send('Runtime.evaluate', { expression: 'Array.prototype.push' });
  const collected = [];
  let aqFuncId = null;
  await cdp.send('Debugger.setBreakpointOnFunctionCall', {
    objectId: pushR.result.objectId,
    condition: '(this.length >= 130 && this.length <= 350 && typeof this[0] === "number" && (this[0] === 113 || this[0] === 179 || this[0] === 100) && window.__cnt < 40) ? (window.__cnt++, true) : false',
  });

  const handler = async (params) => {
    try {
      const { callFrames } = params;
      const res = await cdp.send('Debugger.evaluateOnCallFrame', {
        callFrameId: callFrames[0].callFrameId,
        expression: '({h: this[0], n: this.length, a: Array.from(this.slice(0, 60))})',
        returnByValue: true,
      });
      if (res.result && res.result.result && res.result.result.value) {
        const v = res.result.result.value;
        const stack = callFrames.map(f => `${f.functionName}@${f.location.lineNumber}`).join(' <- ');
        console.log(`push h=${v.h} n=${v.n} | ${stack.substring(0, 140)}`);
        collected.push({ h: v.h, n: v.n, a: v.a, stack });
        // 找 _$aq 函数对象
        if (!aqFuncId) {
          for (const f of callFrames) {
            if (f.functionName === '_$aq' || f.functionName === '_$$1') {
              const fo = await cdp.send('Debugger.evaluateOnCallFrame', {
                callFrameId: f.callFrameId,
                expression: f.functionName,
              });
              if (fo.result && fo.result.result && fo.result.result.objectId) aqFuncId = fo.result.result.objectId;
            }
          }
        }
        if (v.h === 179 || v.h === 100) {
          console.log('FOUND base head:', v.a.join(','));
          fs.writeFileSync('/tmp/nx_179_arr.json', JSON.stringify({ arr: v.a, stack }));
        }
        if (v.h === 113 && v.n >= 140) {
          fs.writeFileSync('/tmp/nx_113_stack.json', JSON.stringify({ n: v.n, a: v.a, stack }));
        }
      }
    } catch (e) {}
    await cdp.send('Debugger.resume', {});
  };
  cdp.on('Debugger.paused', handler);

  await new Promise(r => setTimeout(r, 30000));
  console.log('total collected:', collected.length);
  fs.writeFileSync('/tmp/nx_push_collected.json', JSON.stringify(collected));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
