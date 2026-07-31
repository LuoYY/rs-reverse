/**
 * query_cdp_fetch.js — 用 CDP Fetch 拦截 + 调用栈检查
 *
 * 轻量方案：不 hook 任何 JS 函数
 * 用 CDP Fetch domain 拦截带 query 的请求
 * 在拦截时用 Debugger.evaluateOnCallFrame 检查调用栈
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fs = require('fs'), path = require('path');
const ROOT = __dirname, TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';

(async () => {
  const { chromium } = require('patchright');

  console.log('=== CDP Fetch 拦截 + 调用栈 ===\n');

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  await client.send('Debugger.enable');
  await client.send('Runtime.enable');

  // 收集脚本
  const scripts = {};
  client.on('Debugger.scriptParsed', (e) => { scripts[e.scriptId] = { url: e.url || '' }; });

  // 捕获 query
  const capturedQueries = [];
  context.on('request', req => {
    const url = req.url();
    if (url.includes('r20SZOQm=')) {
      const m = url.match(/r20SZOQm=([^&]+)/);
      if (m) capturedQueries.push({ method: req.method(), path: new URL(url).pathname, query: m[1] });
    }
  });

  // Step 1: 加载页面
  console.log('[Step 1] 加载页面...');
  await page.goto(TARGET, { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(5000);
  console.log(`  Scripts: ${Object.keys(scripts).length}`);

  // Step 2: 设置 Debugger pause on exception
  // 当 RS 生成 query 时，可能会有异常或条件检查
  // 用 Debugger.setPauseOnExceptions 捕获

  // Step 3: Reload
  console.log('\n[Step 3] Reload...');
  
  // 在 reload 前安装一个轻量 hook：只捕获 join 结果以 '0' 开头且长度 > 50 的
  await context.addInitScript(() => {
    window.__queryStrings = [];
    const origJoin = Array.prototype.join;
    Array.prototype.join = function(sep) {
      const result = origJoin.call(this, sep);
      if (typeof result === 'string' && result.length > 50 && result[0] === '0' && result.indexOf('r20SZOQm') < 0) {
        // 可能是编码后的 query 值（以 '0' 开头）
        window.__queryStrings.push({
          result: result.substring(0, 150),
          arrLen: this.length,
          sep: String(sep),
          time: Date.now(),
        });
      }
      return result;
    };
  });

  await page.reload({ waitUntil: 'networkidle', timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(15000);

  console.log(`\nCaptured queries: ${capturedQueries.length}`);
  capturedQueries.slice(0, 3).forEach((q, i) => {
    console.log(`  [${i}] ${q.method} ${q.path} query=${q.query.substring(0, 40)}...`);
  });

  // Step 4: 收集 hook 数据
  console.log('\n[Step 4] 收集 hook 数据...');
  const hookData = await page.evaluate(() => ({
    queryStrings: window.__queryStrings || [],
  })).catch(() => ({ queryStrings: [] }));

  console.log(`Captured strings: ${hookData.queryStrings.length}`);
  hookData.queryStrings.slice(0, 10).forEach((s, i) => {
    console.log(`  [${i}] arrLen=${s.arrLen} sep="${s.sep}" result="${s.result.substring(0, 80)}"`);
  });

  // Step 5: 匹配 query
  if (hookData.queryStrings.length > 0 && capturedQueries.length > 0) {
    console.log('\n[Step 5] 匹配...');
    const queryVal = capturedQueries[0].query;
    
    hookData.queryStrings.forEach((s, i) => {
      // query 值以 '0' 开头，hook 捕获的也以 '0' 开头
      if (s.result.startsWith(queryVal.substring(0, 10))) {
        console.log(`  *** String[${i}] matches query prefix! ***`);
        console.log(`    Full: ${s.result}`);
        console.log(`    Query: ${queryVal.substring(0, 80)}...`);
        console.log(`    Array length: ${s.arrLen}`);
        console.log(`    Separator: "${s.sep}"`);
      }
    });

    // 也检查所有捕获的字符串是否包含 query 值
    hookData.queryStrings.forEach((s, i) => {
      if (s.result.includes(queryVal.substring(0, 20))) {
        console.log(`  *** String[${i}] contains query! ***`);
      }
    });
  }

  // Step 6: 如果没有捕获到，检查 RS 是否用了不同的编码方式
  if (hookData.queryStrings.length === 0 && capturedQueries.length > 0) {
    console.log('\n[Step 6] 未捕获到 join 结果');
    console.log('RS 可能不用 Array.join 编码 query');
    console.log('可能用 String.fromCharCode 或直接字符串拼接');

    // 检查页面上的 RS 状态
    const rsState = await page.evaluate(() => {
      const ts = window.$_ts || {};
      return {
        tsKeys: Object.keys(ts),
        tsL__: typeof ts.l__ === 'function' ? ts.l__.toString().substring(0, 100) : 'N/A',
      };
    }).catch(() => null);
    console.log('RS state:', JSON.stringify(rsState));
  }

  // 保存
  fs.writeFileSync(
    path.join(ROOT, 'output/capture-20080/query-cdp-fetch.json'),
    JSON.stringify({
      timestamp: new Date().toISOString(),
      capturedQueries: capturedQueries.map(q => ({ method: q.method, path: q.path, query: q.query })),
      queryStrings: hookData.queryStrings,
    }, null, 2)
  );
  console.log('\n结果已保存');

  await browser.close();
  process.exit(0);
})().catch(e => {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
