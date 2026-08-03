/**
 * 721_capture_len145.js
 * 不依赖函数名：直接捕获 basearr 完整数组（len 140-150 纯数字 push）
 * 跨 nsd 采样验证 _$dh/basearr = f(nsd, cd)
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const http = require('http');
const tls = require('tls');
const { chromium } = require('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules/patchright');

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const CHROMIUM = '/Applications/Chromium.app/Contents/MacOS/Chromium';
const PROXY_REQABLE = 'http://127.0.0.1:9000';
const PROXY_EXT = new URL('http://74940609:aFmWc5Fs@36.134.44.6:2018');
const PROXY_EXT_AUTH = 'Basic ' + Buffer.from(PROXY_EXT.username + ':' + PROXY_EXT.password).toString('base64');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function httpsGet(url) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const connectReq = http.request({
      host: PROXY_EXT.hostname, port: +PROXY_EXT.port, method: 'CONNECT',
      path: `${u.hostname}:${u.port || 443}`,
      headers: { 'Proxy-Authorization': PROXY_EXT_AUTH, Host: `${u.hostname}:${u.port || 443}` },
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
          resolve({ status: parseInt((resHead.split(' ')[1] || '').trim()), body: raw.substring(headEnd + 4) });
        } else resolve({ status: 'ERR' });
      });
      tlsSock.on('error', e => resolve({ status: 'ERR' }));
    });
    connectReq.on('error', e => resolve({ status: 'ERR' }));
    connectReq.on('timeout', () => { connectReq.destroy(); resolve({ status: 'TIMEOUT' }); });
    connectReq.end();
  });
}

async function captureOne(browser, html) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  await cdp.send('Debugger.enable');
  await page.route('**/*', (route) => {
    if (route.request().resourceType() === 'document') {
      route.fulfill({ status: 412, contentType: 'text/html', headers: { 'Set-Cookie': '3RKyaeh47p90O=test; Path=/; Secure; HttpOnly' }, body: html }).catch(() => {});
    } else route.continue().catch(() => {});
  });
  const pushR = await cdp.send('Runtime.evaluate', { expression: 'Array.prototype.push' });
  await cdp.send('Debugger.setBreakpointOnFunctionCall', {
    objectId: pushR.result.objectId,
    condition: '(this.length >= 138 && this.length <= 152 && this.every(function(x){return typeof x === "number" && x >= 0 && x < 256;}) && !window.__basearr) ? (window.__basearr = Array.from(this), true) : false',
  });
  const result = await new Promise(async (resolve) => {
    let done = false;
    const handler = async (params) => {
      if (done) { await cdp.send('Debugger.resume').catch(() => {}); return; }
      try {
        const r = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__basearr)', returnByValue: true });
        const arr = JSON.parse(r.result?.value || '[]');
        if (arr.length >= 138) {
          done = true;
          cdp.off('Debugger.paused', handler);
          console.log(`[帧] ${(params.callFrames || []).slice(0, 5).map(f => `${f.functionName || '(anon)'}@${f.location.lineNumber}:${f.location.columnNumber}`).join(' <- ')}`);
          resolve(arr);
          return;
        }
      } catch (e) {}
      await cdp.send('Debugger.resume').catch(() => {});
    };
    cdp.on('Debugger.paused', handler);
    await page.goto(TARGET, { timeout: 40000, waitUntil: 'commit' }).catch(() => {});
    await new Promise(r => setTimeout(r, 15000));
    setTimeout(() => resolve(null), 5000);
  });
  await context.close();
  return result;
}

(async () => {
  // 3 个真实样本 + 1 个固定环境（nx-mock）
  const samples = [];
  for (let i = 0; i < 3; i++) {
    const ch = await httpsGet(TARGET);
    if (ch.status !== 412) continue;
    const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
    samples.push({ nsd: m ? +m[1] : null, cd: m ? m[2] : null, html: ch.body, src: 'real' });
    console.log(`样本${i + 1} (real): nsd=${samples[i].nsd}`);
  }
  // 固定环境：nx-mock 的 html（走 reqable 默认，不 fulfill）
  samples.push({ nsd: 67402, cd: null, html: null, src: 'mock' });
  console.log('样本4 (mock): nsd=67402 (reqable 默认)');

  const browser = await chromium.launch({
    executablePath: CHROMIUM, headless: true,
    proxy: { server: PROXY_REQABLE },
    args: ['--ignore-certificate-errors', '--no-sandbox'],
  });

  const results = [];
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    let res;
    if (s.src === 'mock') {
      // 直接走 reqable（nx-mock 默认 html），不 fulfill
      const context = await browser.newContext({ ignoreHTTPSErrors: true });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Runtime.enable');
      await cdp.send('Debugger.enable');
      const pushR = await cdp.send('Runtime.evaluate', { expression: 'Array.prototype.push' });
      await cdp.send('Debugger.setBreakpointOnFunctionCall', {
        objectId: pushR.result.objectId,
        condition: '(this.length >= 138 && this.length <= 152 && this.every(function(x){return typeof x === "number" && x >= 0 && x < 256;}) && !window.__basearr) ? (window.__basearr = Array.from(this), true) : false',
      });
      res = await new Promise(async (resolve) => {
        let done = false;
        const handler = async (params) => {
          if (done) { await cdp.send('Debugger.resume').catch(() => {}); return; }
          try {
            const r = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__basearr)', returnByValue: true });
            const arr = JSON.parse(r.result?.value || '[]');
            if (arr.length >= 138) { done = true; cdp.off('Debugger.paused', handler); resolve(arr); return; }
          } catch (e) {}
          await cdp.send('Debugger.resume').catch(() => {});
        };
        cdp.on('Debugger.paused', handler);
        await page.goto(TARGET, { timeout: 40000, waitUntil: 'commit' }).catch(() => {});
        await new Promise(r => setTimeout(r, 15000));
        setTimeout(() => resolve(null), 5000);
      });
      await context.close();
    } else {
      res = await captureOne(browser, s.html);
    }
    if (res && res.length >= 138) {
      results.push({ nsd: s.nsd, src: s.src, basearr: res });
      console.log(`采集${i + 1}: basearr len=${res.length}`);
      console.log(`  [0-31]: ${res.slice(0, 32).join(',')}`);
    } else {
      console.log(`采集${i + 1}: 未捕获 (nsd=${s.nsd})`);
    }
  }

  console.log('\n=== 跨 nsd 对比 ===');
  if (results.length >= 2) {
    for (let i = 1; i < results.length; i++) {
      const diffs = [];
      for (let j = 0; j < Math.min(results[0].basearr.length, results[i].basearr.length); j++) {
        if (results[0].basearr[j] !== results[i].basearr[j]) diffs.push(`${j}:${results[0].basearr[j]}→${results[i].basearr[j]}`);
      }
      console.log(`nsd${results[0].nsd} vs nsd${results[i].nsd}: 差异 ${diffs.length} 处`);
      if (diffs.length) console.log('  ', diffs.slice(0, 30).join(' '));
      else console.log('  ★★★ 完全相同！');
    }
  }
  fs.writeFileSync('/tmp/nx_multi_nsd3.json', JSON.stringify(results));
  console.log('已保存 /tmp/nx_multi_nsd3.json');
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
