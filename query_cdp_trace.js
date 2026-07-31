/**
 * query_cdp_trace.js — CDP 断点追踪 RS query 生成
 *
 * RS 伪装 prototype.open 为 [native code]，但 CDP 可以在 JS 层设断点。
 * 策略：
 * 1. Patchright 加载页面（412→cookie→reload→200）
 * 2. CDP 搜索所有脚本中的 "r20SZOQm" 字符串
 * 3. 如果找到，在那些位置设断点
 * 4. 如果没找到（JSVMP 编码），用 Debugger.pause + 单步追踪
 * 5. 或：hook XHR.open 的调用，在 RS 修改 URL 时捕获
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';

(async () => {
  const { chromium } = require('patchright');

  console.log('=== CDP 断点追踪 RS query 生成 ===\n');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--ignore-certificate-errors'],
  });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();

  // CDP session
  const client = await context.newCDPSession(page);
  await client.send('Debugger.enable');
  await client.send('Runtime.enable');

  // 收集所有脚本
  const scripts = {};
  client.on('Debugger.scriptParsed', (event) => {
    scripts[event.scriptId] = {
      url: event.url || '',
      startLine: event.startLine,
      endLine: event.endLine,
    };
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

  // Step 1: 加载页面
  console.log('[Step 1] 加载页面...');
  await page.goto(TARGET, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(3000);

  console.log(`  Scripts loaded: ${Object.keys(scripts).length}`);

  // Step 2: 搜索 "r20SZOQm" 在所有脚本中
  console.log('\n[Step 2] 搜索 "r20SZOQm" 在所有脚本中...');
  let foundInScript = null;

  for (const [scriptId, info] of Object.entries(scripts)) {
    try {
      const result = await client.send('Debugger.searchInContent', {
        scriptId: scriptId,
        query: 'r20SZOQm',
        caseSensitive: false,
      });
      if (result.result && result.result.length > 0) {
        foundInScript = { scriptId, url: info.url, matches: result.result };
        console.log(`  FOUND in script ${scriptId} (${info.url || 'eval'}) : ${result.result.length} matches`);
        break;
      }
    } catch (e) {}
  }

  if (!foundInScript) {
    console.log('  "r20SZOQm" not found in any script (JSVMP encoded)');

    // 搜索其他关键词
    console.log('\n  Searching for other keywords...');
    const keywords = ['prototype', 'XMLHttpRequest', '.open', '.send', 'onreadystatechange'];

    for (const kw of keywords) {
      let totalMatches = 0;
      for (const [scriptId, info] of Object.entries(scripts)) {
        if (!info.url && scriptId !== '1') { // 只搜索 eval 的脚本
          try {
            const result = await client.send('Debugger.searchInContent', {
              scriptId: scriptId,
              query: kw,
              caseSensitive: false,
            });
            if (result.result && result.result.length > 0) {
              totalMatches += result.result.length;
              if (result.result.length > 5) {
                console.log(`    "${kw}" in script ${scriptId}: ${result.result.length} matches`);
              }
            }
          } catch (e) {}
        }
      }
      if (totalMatches > 0) console.log(`  "${kw}": ${totalMatches} total matches`);
    }
  }

  // Step 3: Reload 触发 query 生成
  console.log('\n[Step 3] Reload 触发 API...');
  await page.reload({ waitUntil: 'load', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(10000);

  console.log(`  Captured queries: ${capturedQueries.length}`);
  capturedQueries.slice(0, 3).forEach((q, i) => {
    console.log(`    [${i}] ${q.method} ${q.path} query=${q.query.substring(0, 40)}...`);
  });

  // Step 4: 如果有 query，用 CDP 检查 RS 内部状态
  if (capturedQueries.length > 0) {
    console.log('\n[Step 4] 检查 RS 内部状态...');

    // 检查 window 上的 RS 变量
    const rsVars = await page.evaluate(() => {
      const vars = {};
      // 检查所有以 _$ 开头的全局变量
      for (const k of Object.getOwnPropertyNames(window)) {
        if (k.startsWith('_$') && k.length < 10) {
          try {
            const v = window[k];
            if (typeof v === 'object' && v !== null) {
              const keys = Object.keys(v);
              if (keys.length > 0 && keys.length < 50) {
                vars[k] = { type: 'object', keys: keys.slice(0, 10) };
              }
            } else if (typeof v === 'function') {
              vars[k] = { type: 'function', src: v.toString().substring(0, 80) };
            } else if (typeof v === 'number' || typeof v === 'boolean') {
              vars[k] = { type: typeof v, value: v };
            }
          } catch (e) {}
        }
      }

      // 也检查 $_ts
      vars['$_ts'] = { type: 'object', keys: Object.keys(window.$_ts || {}) };

      // 检查 XMLHttpRequest.prototype 上是否有自定义属性
      const xhrProto = XMLHttpRequest.prototype;
      const protoProps = {};
      for (const k of Object.getOwnPropertyNames(xhrProto)) {
        if (k !== 'constructor' && !k.startsWith('on')) {
          try {
            const v = xhrProto[k];
            if (typeof v === 'function') {
              protoProps[k] = { type: 'function', native: v.toString().includes('[native code]') };
            }
          } catch (e) {}
        }
      }
      vars['xhrProto'] = protoProps;

      return vars;
    }).catch(e => {
      console.log('  Evaluate error:', e.message);
      return {};
    });

    console.log('  RS variables:', JSON.stringify(rsVars, null, 2).substring(0, 500));

    // Step 5: 用 CDP 获取 RS hooked open 的真实源码
    console.log('\n[Step 5] 获取 RS hooked open 的真实源码...');
    const openInfo = await page.evaluate(() => {
      const openFn = XMLHttpRequest.prototype.open;
      // 尝试获取函数的真实源码
      let src = '';
      try {
        src = openFn.toString();
      } catch (e) {
        src = 'toString failed: ' + e.message;
      }

      // 检查函数的属性
      const props = Object.getOwnPropertyNames(openFn);
      const openProps = {};
      for (const p of props) {
        try {
          openProps[p] = typeof openFn[p];
        } catch (e) {}
      }

      return {
        source: src.substring(0, 200),
        length: src.length,
        isNative: src.includes('[native code]'),
        props: openProps,
        name: openFn.name,
      };
    }).catch(e => {
      console.log('  Error:', e.message);
      return null;
    });

    if (openInfo) {
      console.log('  open source:', openInfo.source);
      console.log('  isNative:', openInfo.isNative);
      console.log('  name:', openInfo.name);
      console.log('  props:', JSON.stringify(openInfo.props));
    }

    // Step 6: 用 CDP Runtime.evaluate 直接调用 RS 内部函数
    console.log('\n[Step 6] 检查 RS 内部函数...');
    const rsFunctions = await page.evaluate(() => {
      // RS 可能把内部函数存在 window.l__ 或其他地方
      const result = {};

      // 检查 $_ts.l__
      if (window.$_ts && typeof window.$_ts.l__ === 'function') {
        result.l__ = {
          type: 'function',
          src: window.$_ts.l__.toString().substring(0, 200),
        };
      }

      // 检查 window 上所有函数
      for (const k of Object.getOwnPropertyNames(window)) {
        try {
          const v = window[k];
          if (typeof v === 'function' && k.startsWith('_$') && k.length < 8) {
            result[k] = {
              type: 'function',
              src: v.toString().substring(0, 100),
            };
          }
        } catch (e) {}
      }

      return result;
    }).catch(() => ({}));

    console.log('  RS functions:', JSON.stringify(rsFunctions, null, 2).substring(0, 500));

    // Step 7: 尝试在浏览器内创建 XHR 并检查 RS hook
    console.log('\n[Step 7] 浏览器内创建 XHR 检查 RS hook...');
    const xhrCheck = await page.evaluate(() => {
      // 创建 XHR 但不发送
      const xhr = new XMLHttpRequest();

      // 列出所有实例属性（包括 RS 设置的）
      const allProps = {};
      const proto = Object.getPrototypeOf(xhr);
      const protoProps = Object.getOwnPropertyNames(proto);
      const instProps = Object.getOwnPropertyNames(xhr);

      allProps.protoProps = protoProps.filter(p => !p.startsWith('on'));
      allProps.instProps = instProps;

      // 检查是否有 RS 设置的属性
      allProps.rsProps = {};
      for (const k of instProps) {
        try {
          const v = xhr[k];
          allProps.rsProps[k] = {
            type: typeof v,
            value: typeof v === 'string' ? v.substring(0, 50) :
                   typeof v === 'function' ? v.toString().substring(0, 80) :
                   String(v).substring(0, 50),
          };
        } catch (e) {}
      }

      // 调用 open 并检查
      xhr.open('POST', '/test-query-check', true);
      allProps.afterOpen = {};
      for (const k of Object.getOwnPropertyNames(xhr)) {
        if (!instProps.includes(k)) {
          try {
            const v = xhr[k];
            allProps.afterOpen[k] = {
              type: typeof v,
              value: typeof v === 'string' ? v.substring(0, 50) :
                     typeof v === 'function' ? v.toString().substring(0, 80) :
                     String(v).substring(0, 50),
            };
          } catch (e) {}
        }
      }

      return allProps;
    }).catch(e => {
      console.log('  Error:', e.message);
      return null;
    });

    if (xhrCheck) {
      console.log('  Proto props:', xhrCheck.protoProps?.join(', '));
      console.log('  Instance props:', xhrCheck.instProps?.join(', '));
      console.log('  RS props:', JSON.stringify(xhrCheck.rsProps, null, 2).substring(0, 200));
      console.log('  After open:', JSON.stringify(xhrCheck.afterOpen, null, 2).substring(0, 300));
    }
  }

  // 保存结果
  fs.writeFileSync(
    path.join(ROOT, 'output/capture-20080/query-cdp-trace.json'),
    JSON.stringify({
      timestamp: new Date().toISOString(),
      scriptsCount: Object.keys(scripts).length,
      capturedQueries: capturedQueries.map(q => ({ method: q.method, path: q.path, query: q.query })),
      foundInScript: foundInScript,
    }, null, 2)
  );

  await browser.close();
  process.exit(0);
})().catch(e => {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
