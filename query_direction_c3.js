/**
 * query_direction_c3.js — 检查 RS 请求拦截机制
 *
 * XHR 构造器 hook 未捕获任何请求
 * RS 可能用其他方式追加 query
 *
 * 检查：
 * 1. CDP Network.requestWillBeSent 的 initiator
 * 2. Service Worker 注册状态
 * 3. fetch API hook
 * 4. XMLHttpRequest.prototype.open 的实际调用栈
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fs = require('fs'), path = require('path');
const ROOT = __dirname, TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';

(async () => {
  const { chromium } = require('patchright');

  console.log('=== 检查 RS 请求拦截机制 ===\n');

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    proxy: { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' },
  });

  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  await client.send('Network.enable');
  await client.send('Debugger.enable');

  // 捕获网络请求的 initiator 信息
  const requestInitiators = [];
  client.on('Network.requestWillBeSent', (event) => {
    const url = event.request.url;
    if (url.includes('r20SZOQm=') || (url.includes('/px-') && !url.includes('.js'))) {
      requestInitiators.push({
        url: url.substring(0, 100),
        method: event.request.method,
        type: event.type,
        initiator: {
          type: event.initiator.type,
          url: event.initiator.url?.substring(0, 60),
          lineNumber: event.initiator.lineNumber,
          stack: event.initiator.stack?.callFrames?.slice(0, 5).map(f => ({
            functionName: f.functionName || '(anon)',
            url: f.url?.substring(0, 40),
            lineNumber: f.lineNumber,
            columnNumber: f.columnNumber,
          })),
        },
      });
    }
  });

  // 捕获 query
  const capturedQueries = [];
  context.on('request', req => {
    const url = req.url();
    if (url.includes('r20SZOQm=')) {
      const m = url.match(/r20SZOQm=([^&]+)/);
      if (m) capturedQueries.push({ method: req.method(), path: new URL(url).pathname, query: m[1] });
    }
  });

  console.log('加载页面...');
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(5000);

  console.log('Reload...');
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(15000);

  console.log(`\nQueries: ${capturedQueries.length}`);
  console.log(`Request initiators: ${requestInitiators.length}`);

  // 显示 initiator 信息
  console.log('\n=== Request Initiators ===');
  requestInitiators.slice(0, 5).forEach((r, i) => {
    console.log(`\n[${i}] ${r.method} ${r.url.substring(0, 80)}`);
    console.log(`  type: ${r.type}`);
    console.log(`  initiator.type: ${r.initiator.type}`);
    console.log(`  initiator.url: ${r.initiator.url || 'N/A'}`);
    console.log(`  initiator.line: ${r.initiator.lineNumber}`);

    if (r.initiator.stack) {
      console.log(`  Call stack:`);
      r.initiator.stack.forEach((f, j) => {
        console.log(`    [${j}] ${f.functionName} at ${f.url}:${f.lineNumber}:${f.columnNumber}`);
      });
    }
  });

  // 检查 Service Worker
  console.log('\n=== Service Worker 检查 ===');
  const swInfo = await page.evaluate(async () => {
    const info = {
      hasSW: 'serviceWorker' in navigator,
      controller: navigator.serviceWorker?.controller ? {
        scriptURL: navigator.serviceWorker.controller.scriptURL,
        state: navigator.serviceWorker.controller.state,
      } : null,
    };

    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      info.registrations = regs.map(r => ({
        scope: r.scope,
        active: r.active ? { scriptURL: r.active.scriptURL, state: r.active.state } : null,
      }));
    } catch (e) {
      info.regError = e.message;
    }

    return info;
  }).catch(() => null);

  console.log('SW info:', JSON.stringify(swInfo, null, 2));

  // 保存
  fs.writeFileSync(
    path.join(ROOT, 'output/capture-20080/query-initiators.json'),
    JSON.stringify({
      queries: capturedQueries.map(q => ({ method: q.method, path: q.path, query: q.query })),
      initiators: requestInitiators,
      swInfo,
      timestamp: new Date().toISOString(),
    }, null, 2)
  );
  console.log('\n结果已保存');

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
