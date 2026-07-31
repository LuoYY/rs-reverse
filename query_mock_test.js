/**
 * query_mock_test.js — 用 Mock 服务器 + Patchright 捕获 query
 *
 * Mock 服务器提供固定的 412/200 响应
 * 变量名固定 → CDP 断点精确命中
 * Hook 注入到外层 JS 中
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fs = require('fs'), path = require('path');
const ROOT = __dirname;
const MOCK_URL = 'http://localhost:8585';

(async () => {
  const { chromium } = require('patchright');

  console.log('=== Mock 服务器 + Patchright ===\n');

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });

  // 捕获所有请求
  const allRequests = [];
  context.on('request', req => {
    allRequests.push({ method: req.method(), url: req.url() });
  });

  // 捕获 console 输出（hook 的 emit）
  const hookLogs = [];
  context.on('console', msg => {
    const text = msg.text();
    if (text.includes('[QHOOK]') || text.includes('[HOOK]')) {
      hookLogs.push(text);
    }
  });

  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  await client.send('Debugger.enable');

  // 收集脚本
  const scripts = {};
  client.on('Debugger.scriptParsed', (e) => { scripts[e.scriptId] = { url: e.url || '' }; });

  console.log('加载 Mock 页面...');
  await page.goto(MOCK_URL + '/', { waitUntil: 'networkidle', timeout: 30000 }).catch(e => console.log('goto:', e.message.substring(0, 50)));
  await page.waitForTimeout(3000);

  console.log(`Scripts: ${Object.keys(scripts).length}`);
  console.log(`Requests: ${allRequests.length}`);

  // 检查 RS 是否执行
  const rsCheck = await page.evaluate(() => ({
    tsKeys: Object.keys(window.$_ts || {}),
    hasHook: !!window.__QHOOK__,
    hookData: window.__QHOOK__ ? {
      queries: window.__QHOOK__.queries?.length || 0,
      keys: window.__QHOOK__.keys?.length || 0,
      arrays: window.__QHOOK__.arrays?.length || 0,
    } : null,
    cookies: document.cookie.substring(0, 80),
  })).catch(() => null);
  console.log('RS check:', JSON.stringify(rsCheck));

  // 检查 cookie 是否设置了
  if (rsCheck && rsCheck.cookies) {
    console.log('Has P cookie:', rsCheck.cookies.includes('aoU85Lxl9xxNP'));
  }

  // Reload（带 cookie → 200 页面 → RS 启用 query）
  console.log('\nReload...');
  allRequests.length = 0;
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 }).catch(e => console.log('reload:', e.message.substring(0, 50)));
  await page.waitForTimeout(5000);

  console.log(`\nRequests: ${allRequests.length}`);
  allRequests.forEach((r, i) => {
    console.log(`  [${i}] ${r.method} ${r.url.substring(0, 100)}`);
  });

  // 检查 query 请求
  const queryReqs = allRequests.filter(r => r.url.includes('r20SZOQm='));
  console.log(`\nQuery requests: ${queryReqs.length}`);

  // 检查 hook 数据
  const hookData = await page.evaluate(() => ({
    queries: window.__QHOOK__?.queries || [],
    keys: window.__QHOOK__?.keys || [],
    arrays: window.__QHOOK__?.arrays || [],
  })).catch(() => ({ queries: [], keys: [], arrays: [] }));

  console.log(`\nHook data: queries=${hookData.queries.length} keys=${hookData.keys.length} arrays=${hookData.arrays.length}`);

  // 检查 hook-capture.json
  const hookCapture = (() => {
    try { return JSON.parse(fs.readFileSync(path.join('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/go-mock/hook-capture.json'), 'utf8')); }
    catch (e) { return []; }
  })();
  console.log(`Hook capture file: ${hookCapture.length} entries`);

  // 显示捕获的数据
  if (hookCapture.length > 0) {
    console.log('\n=== Hook Capture ===');
    const byTag = {};
    hookCapture.forEach(e => { byTag[e.t] = (byTag[e.t] || 0) + 1; });
    console.log('By tag:', JSON.stringify(byTag));

    // 显示前 10 条
    hookCapture.slice(0, 10).forEach((e, i) => {
      console.log(`\n  [${i}] tag=${e.t} ts=${e.ts}`);
      console.log(`       data: ${JSON.stringify(e.d).substring(0, 200)}`);
    });

    // 特别显示 query 相关
    const xhrData = hookCapture.filter(e => e.t === 'xhr');
    console.log(`\n=== XHR captures: ${xhrData.length} ===`);
    xhrData.slice(0, 5).forEach((e, i) => {
      console.log(`  [${i}] ${e.d.method} ${e.d.url?.substring(0, 80)}`);
      if (e.d.hasQuery) console.log(`       query: ${e.d.query}`);
    });

    // 显示数组
    const arrData = hookCapture.filter(e => e.t === 'arr');
    console.log(`\n=== Array captures: ${arrData.length} ===`);
    arrData.slice(0, 10).forEach((e, i) => {
      console.log(`  [${i}] src=${e.d.src} len=${e.d.len} data=[${e.d.data?.join(',')}]`);
    });
  }

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
