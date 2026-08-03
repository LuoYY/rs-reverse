/**
 * 718_multi_nsd_capture.js
 * 从真实站点拉多个不同 nsd/cd 的 412 html → route.fulfill 加载 → 采集 _$dh
 * 验证 _$dh = f(nsd, cd) 纯函数（换 nsd → dh 变），收集样本对供推导公式
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
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

async function captureWithHtml(browser, html) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  // 预置 O cookie（nx-mock 检查非空才下发 js）
  await context.addCookies([{ name: '3RKyaeh47p90O', value: 'x', domain: 'pmos.nx.sgcc.com.cn', path: '/', secure: true }]);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  await cdp.send('Debugger.enable');
  // route.fulfill 提供指定 html（含固定 nsd/cd），js 走 reqable（nx-mock 固定）
  await page.route('**/*', (route) => {
    if (route.request().resourceType() === 'document') {
      route.fulfill({ status: 412, contentType: 'text/html', body: html }).catch(() => {});
    } else {
      route.continue().catch(() => {});
    }
  });
  const pushR = await cdp.send('Runtime.evaluate', { expression: 'Array.prototype.push' });
  await cdp.send('Debugger.setBreakpointOnFunctionCall', {
    objectId: pushR.result.objectId,
    condition: '(this.length === 28 && this.every(function(x){return typeof x === "number" && x >= 0 && x < 256;}) && !window.__cap28) ? (window.__cap28 = Array.from(this), true) : false',
  });
  const result = await new Promise(async (resolve) => {
    const handler = async (params) => {
      try {
        let pjFrame = null;
        for (const f of params.callFrames || []) {
          if ((f.functionName || '') === '_$pj') { pjFrame = f; break; }
        }
        if (pjFrame) {
          const r1 = await cdp.send('Debugger.evaluateOnCallFrame', { callFrameId: pjFrame.callFrameId, expression: 'Array.isArray(_$dh) ? JSON.stringify(Array.from(_$dh)) : "NA"', returnByValue: true });
          const r2 = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__cap28)', returnByValue: true });
          cdp.off('Debugger.paused', handler);
          resolve({ dh: JSON.parse(r1.result?.value || '[]'), b28: JSON.parse(r2.result?.value || '[]') });
          return;
        }
      } catch (e) {}
      await cdp.send('Debugger.resume').catch(() => {});
    };
    cdp.on('Debugger.paused', handler);
    await page.goto(TARGET, { timeout: 40000, waitUntil: 'commit' }).catch(() => {});
    await new Promise(r => setTimeout(r, 13000));
    setTimeout(() => resolve(null), 5000);
  });
  await context.close();
  return result;
}

(async () => {
  // 拉 3 个不同 412 html
  const samples = [];
  for (let i = 0; i < 3; i++) {
    const ch = await httpsGet(TARGET);
    if (ch.status !== 412) { console.log('拉取失败', i, ch.status); continue; }
    const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
    samples.push({ nsd: m ? +m[1] : null, cd: m ? m[2] : null, html: ch.body });
    console.log(`样本${i + 1}: nsd=${samples[i].nsd} cd len=${samples[i].cd ? samples[i].cd.length : '?'}`);
  }

  const browser = await chromium.launch({
    executablePath: CHROMIUM, headless: true,
    proxy: { server: PROXY_REQABLE },
    args: ['--ignore-certificate-errors', '--no-sandbox'],
  });

  const results = [];
  for (let i = 0; i < samples.length; i++) {
    const res = await captureWithHtml(browser, samples[i].html);
    if (res && res.dh.length) {
      results.push({ nsd: samples[i].nsd, cd: samples[i].cd, dh: res.dh, b28: res.b28 });
      console.log(`采集${i + 1}: dh[0-31]=${res.dh.slice(0, 32).join(',')}`);
      console.log(`  [24-28]: ${res.dh.slice(24, 29).join(',')}`);
    } else {
      console.log(`采集${i + 1}: 未捕获 (nsd=${samples[i].nsd})`);
    }
  }

  console.log('\n=== 跨 nsd 对比 ===');
  if (results.length >= 2) {
    for (let i = 1; i < results.length; i++) {
      const diffs = [];
      for (let j = 0; j < Math.min(results[0].dh.length, results[i].dh.length); j++) {
        if (results[0].dh[j] !== results[i].dh[j]) diffs.push(`${j}:${results[0].dh[j]}→${results[i].dh[j]}`);
      }
      console.log(`nsd${results[0].nsd} vs nsd${results[i].nsd}: 差异 ${diffs.length} 处`);
      if (diffs.length) console.log('  ', diffs.slice(0, 20).join(' '));
      else console.log('  ★★★ 完全相同！');
    }
  }
  fs.writeFileSync('/tmp/nx_multi_nsd.json', JSON.stringify({ results: results.map(r => ({ nsd: r.nsd, cd: r.cd, dh: r.dh })) }));
  console.log('已保存 /tmp/nx_multi_nsd.json');
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
