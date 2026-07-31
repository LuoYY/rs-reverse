/**
 * query_browser_extract.js — P1: 浏览器内直接提取 query 生成
 *
 * 在真实浏览器中，RS 所有条件都满足，trampoline 能正常生成 query。
 * 策略：
 * 1. Patchright 加载页面（412→cookie→reload→200）
 * 2. 在浏览器内创建 XHR，调用 RS hooked open/send
 * 3. RS trampoline 生成 query → 修改 URL
 * 4. 捕获 query 值 + 同会话 keys
 * 5. 用 keys 尝试解密 query
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';

(async () => {
  const { chromium } = require('patchright');

  console.log('=== P1: 浏览器内直接提取 query 生成 ===\n');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--ignore-certificate-errors'],
  });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();

  // 捕获所有带 query 的请求
  const capturedQueries = [];
  context.on('request', req => {
    const url = req.url();
    if (url.includes('r20SZOQm=')) {
      const m = url.match(/r20SZOQm=([^&]+)/);
      if (m) {
        capturedQueries.push({
          method: req.method(),
          path: new URL(url).pathname,
          query: m[1],
          body: req.postData() || '',
        });
      }
    }
  });

  // Step 1: 加载页面（412 → cookie → reload → 200）
  console.log('[Step 1] 加载页面...');
  await page.goto(TARGET, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(3000);

  // reload 触发 SPA API 调用（带 query）
  console.log('[Step 2] Reload 触发 API...');
  await page.reload({ waitUntil: 'load', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(10000);

  // 获取 cookies
  const cookies = await context.cookies();
  const pCookie = cookies.find(c => c.name.endsWith('P'));
  const oCookie = cookies.find(c => c.name.endsWith('O'));
  console.log(`  P cookie: ${pCookie?.name}=${pCookie?.value.substring(0, 30)}... (${pCookie?.value.length} chars)`);
  console.log(`  O cookie: ${oCookie?.name}=${oCookie?.value.substring(0, 30)}...`);

  console.log(`  Captured queries: ${capturedQueries.length}`);
  capturedQueries.slice(0, 5).forEach((q, i) => {
    console.log(`    [${i}] ${q.method} ${q.path} query=${q.query.substring(0, 40)}...`);
  });

  // Step 3: 在浏览器内直接调用 RS trampoline
  console.log('\n[Step 3] 浏览器内调用 RS trampoline...');

  const trampolineResult = await page.evaluate(() => {
    const results = {};

    // 检查 XHR prototype 是否被 hook
    const openStr = XMLHttpRequest.prototype.open.toString();
    const sendStr = XMLHttpRequest.prototype.send.toString();
    results.openHooked = !openStr.includes('native');
    results.openSource = openStr.substring(0, 100);
    results.sendSource = sendStr.substring(0, 100);

    // 创建 XHR 并调用 open
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);

    // 检查 RS 设置的实例属性
    results.rsProps = {};
    for (const k of Object.getOwnPropertyNames(xhr)) {
      if (k.startsWith('_$') || k.startsWith('_$$')) {
        const v = xhr[k];
        results.rsProps[k] = {
          type: typeof v,
          value: typeof v === 'function' ? v.toString().substring(0, 100) : String(v).substring(0, 50),
        };
      }
    }

    // 找到 trampoline 函数和 flag
    let trampoline = null;
    let trampolineName = null;
    let flagName = null;

    for (const k of Object.getOwnPropertyNames(xhr)) {
      if (k.startsWith('_$') || k.startsWith('_$$')) {
        if (typeof xhr[k] === 'function' && !trampoline) {
          trampoline = xhr[k];
          trampolineName = k;
        }
        if (typeof xhr[k] === 'boolean' && !flagName) {
          flagName = k;
          results.flagValue = xhr[k];
        }
      }
    }

    results.trampolineName = trampolineName;
    results.flagName = flagName;

    // 调用 trampoline（在浏览器中应该能生成 query）
    if (trampoline) {
      try {
        const queryValue = trampoline.call(xhr, '{}');
        results.trampolineResult = {
          type: typeof queryValue,
          value: String(queryValue).substring(0, 200),
          length: typeof queryValue === 'string' ? queryValue.length : 0,
        };
      } catch (e) {
        results.trampolineError = e.message.substring(0, 100);
      }
    }

    // 也尝试 send（RS 应该修改 URL）
    try {
      const xhr2 = new XMLHttpRequest();
      xhr2.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);

      // Hook send 的原始版本来捕获 URL
      const origSend = XMLHttpRequest.prototype.send;
      let capturedUrl = null;
      XMLHttpRequest.prototype.send = function(body) {
        // RS 修改 URL 后会调用原始 send
        // 检查 this 的 URL 相关属性
        for (const k of Object.getOwnPropertyNames(this)) {
          const v = this[k];
          if (typeof v === 'string' && v.includes('r20SZOQm=')) {
            capturedUrl = v;
          }
        }
        // 也检查 _url
        if (this._url && this._url.includes('r20SZOQm=')) {
          capturedUrl = this._url;
        }
      };
      xhr2.send('{}');
      XMLHttpRequest.prototype.send = origSend;

      results.sendResult = {
        capturedUrl: capturedUrl ? capturedUrl.substring(0, 200) : null,
      };
    } catch (e) {
      results.sendError = e.message.substring(0, 100);
    }

    return results;
  }).catch(e => {
    console.log('  Evaluate error:', e.message.substring(0, 100));
    return null;
  });

  if (trampolineResult) {
    console.log('  XHR.open hooked:', trampolineResult.openHooked);
    console.log('  open source:', trampolineResult.openSource);
    console.log('  RS props:', JSON.stringify(trampolineResult.rsProps, null, 2).substring(0, 300));
    console.log('  Flag:', trampolineResult.flagName, '=', trampolineResult.flagValue);
    console.log('  Trampoline:', trampolineResult.trampolineName);

    if (trampolineResult.trampolineResult) {
      console.log('\n  *** Trampoline result ***');
      console.log('  type:', trampolineResult.trampolineResult.type);
      console.log('  value:', trampolineResult.trampolineResult.value);
      console.log('  length:', trampolineResult.trampolineResult.length);

      if (trampolineResult.trampolineResult.length > 10) {
        console.log('\n  *** [BREAKTHROUGH] Trampoline generated query in browser! ***');
      }
    }

    if (trampolineResult.trampolineError) {
      console.log('  Trampoline error:', trampolineResult.trampolineError);
    }

    if (trampolineResult.sendResult) {
      console.log('\n  Send result:');
      console.log('  capturedUrl:', trampolineResult.sendResult.capturedUrl);
    }
  }

  // Step 4: 获取同会话的 keys
  console.log('\n[Step 4] 获取同会话 keys...');

  // 从页面提取 $_ts
  const tsInfo = await page.evaluate(() => {
    const ts = window.$_ts || {};
    return {
      keys: Object.keys(ts),
      hasNsd: 'nsd' in ts,
      hasCd: 'cd' in ts,
      nsd: ts.nsd,
      cd: ts.cd ? ts.cd.substring(0, 30) + '...' : undefined,
    };
  }).catch(() => null);

  console.log('  $_ts info:', JSON.stringify(tsInfo, null, 2));

  // 从页面提取 RS 内部状态
  const rsState = await page.evaluate(() => {
    const state = {};

    // 检查 $_ts 的所有属性
    const ts = window.$_ts || {};
    for (const k of Object.keys(ts)) {
      const v = ts[k];
      if (typeof v === 'function') {
        state[k] = 'function: ' + v.toString().substring(0, 80);
      } else if (Array.isArray(v)) {
        state[k] = 'array[' + v.length + ']';
      } else if (typeof v === 'object' && v !== null) {
        state[k] = 'object: ' + Object.keys(v).join(',');
      } else {
        state[k] = String(v).substring(0, 50);
      }
    }

    // 检查 window 上是否有 RS 相关全局变量
    for (const k of Object.getOwnPropertyNames(window)) {
      if (k.startsWith('_$') && k.length < 10) {
        try {
          const v = window[k];
          if (typeof v === 'object' && v !== null) {
            state['window.' + k] = 'object: ' + Object.keys(v).slice(0, 5).join(',');
          }
        } catch (e) {}
      }
    }

    return state;
  }).catch(() => null);

  console.log('  RS state:', JSON.stringify(rsState, null, 2).substring(0, 500));

  // Step 5: 保存结果
  const result = {
    timestamp: new Date().toISOString(),
    cookies: cookies.map(c => ({ name: c.name, value: c.value.substring(0, 50) + '...' })),
    capturedQueries: capturedQueries.map(q => ({
      method: q.method,
      path: q.path,
      query: q.query,
      queryLen: q.query.length,
      body: q.body,
    })),
    trampolineResult,
    tsInfo,
    rsState,
  };

  fs.writeFileSync(
    path.join(ROOT, 'output/capture-20080/query-browser-extract.json'),
    JSON.stringify(result, null, 2)
  );
  console.log('\n结果已保存到 output/capture-20080/query-browser-extract.json');

  await browser.close();
  process.exit(0);
})().catch(e => {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
