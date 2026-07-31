/**
 * query_direction_c2.js — 方向C 续: Hook XHR 构造器 + Proxy 拦截
 *
 * 重大发现：RS 用 Object.defineProperty 在 XHR prototype 上安装 getter/setter
 * 不替换 open/send（保持 [native code]）
 * 
 * 策略：在 RS 加载前替换 XMLHttpRequest 构造器
 * 返回 Proxy 包装的 XHR，拦截所有方法调用和属性访问
 * 当 RS 修改 URL 追加 query 时，Proxy 的 set trap 捕获
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fs = require('fs'), path = require('path');
const ROOT = __dirname, TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';

(async () => {
  const { chromium } = require('patchright');

  console.log('=== Hook XHR 构造器 + Proxy ===\n');

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    proxy: { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' },
  });

  // 安装 XHR Proxy hook
  await context.addInitScript(() => {
    window.__xhrCaptures = [];

    // 保存原始 XMLHttpRequest
    const OrigXHR = XMLHttpRequest;

    // 创建 Proxy 包装的构造器
    window.XMLHttpRequest = function() {
      const xhr = new OrigXHR();
      let origUrl = null;
      let origMethod = null;

      // 包装 open
      const origOpen = xhr.open.bind(xhr);
      xhr.open = function(method, url, ...args) {
        origUrl = String(url);
        origMethod = method;
        return origOpen(method, url, ...args);
      };

      // 包装 send — 检查 URL 是否被 RS 修改
      const origSend = xhr.send.bind(xhr);
      xhr.send = function(body) {
        // RS 可能在 send 之前修改了 URL
        // 检查 xhr 上是否有 URL 相关的属性
        const capture = {
          method: origMethod,
          origUrl: origUrl,
          body: typeof body === 'string' ? body.substring(0, 50) : '(non-string)',
          time: Date.now(),
        };

        // RS 用 defineProperty 安装了 getter/setter
        // 检查 xhr 的所有属性
        const props = {};
        for (const key of Object.getOwnPropertyNames(xhr)) {
          try {
            const val = xhr[key];
            if (typeof val === 'string' && val.length > 5) {
              props[key] = val.substring(0, 80);
            }
          } catch (e) {}
        }
        capture.xhrProps = props;

        // 检查 prototype 上的属性
        const proto = Object.getPrototypeOf(xhr);
        const protoProps = {};
        for (const key of Object.getOwnPropertyNames(proto)) {
          try {
            const desc = Object.getOwnPropertyDescriptor(proto, key);
            if (desc && desc.get) {
              const val = xhr[key]; // 触发 getter
              if (typeof val === 'string' && val.length > 5) {
                protoProps[key] = val.substring(0, 80);
              }
            }
          } catch (e) {}
        }
        capture.protoProps = protoProps;

        window.__xhrCaptures.push(capture);

        return origSend(body);
      };

      return xhr;
    };

    // 复制静态属性
    window.XMLHttpRequest.prototype = OrigXHR.prototype;
    window.XMLHttpRequest.DONE = OrigXHR.DONE;
    window.XMLHttpRequest.HEADERS_RECEIVED = OrigXHR.HEADERS_RECEIVED;
    window.XMLHttpRequest.LOADING = OrigXHR.LOADING;
    window.XMLHttpRequest.OPENED = OrigXHR.OPENED;
    window.XMLHttpRequest.UNSENT = OrigXHR.UNSENT;

    console.log('[Hook] XHR constructor wrapped');
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

  const page = await context.newPage();

  console.log('加载页面...');
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(5000);

  console.log('Reload...');
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(15000);

  console.log(`\nQueries: ${capturedQueries.length}`);
  capturedQueries.slice(0, 3).forEach((q, i) => console.log(`  [${i}] ${q.method} ${q.path} query=${q.query.substring(0, 40)}...`));

  // 收集 XHR 捕获
  const xhrCaptures = await page.evaluate(() => window.__xhrCaptures || []).catch(() => []);
  console.log(`\nXHR captures: ${xhrCaptures.length}`);

  // 显示前 5 个
  xhrCaptures.slice(0, 5).forEach((c, i) => {
    console.log(`\n  [${i}] ${c.method} ${c.origUrl?.substring(0, 60)}`);
    console.log(`      body: ${c.body}`);
    console.log(`      xhrProps:`, JSON.stringify(c.xhrProps).substring(0, 200));
    console.log(`      protoProps:`, JSON.stringify(c.protoProps).substring(0, 200));
  });

  // 关键：检查 protoProps 中是否有 URL 包含 query
  console.log('\n=== 检查 protoProps 中的 query ===');
  xhrCaptures.forEach((c, i) => {
    for (const [k, v] of Object.entries(c.protoProps || {})) {
      if (v.includes('r20SZOQm=')) {
        console.log(`  [${i}] protoProps.${k} contains query: ${v.substring(0, 80)}`);
      }
    }
    for (const [k, v] of Object.entries(c.xhrProps || {})) {
      if (v.includes('r20SZOQm=')) {
        console.log(`  [${i}] xhrProps.${k} contains query: ${v.substring(0, 80)}`);
      }
    }
  });

  // 保存
  fs.writeFileSync(
    path.join(ROOT, 'output/capture-20080/query-direction-c2.json'),
    JSON.stringify({
      queries: capturedQueries.map(q => ({ method: q.method, path: q.path, query: q.query })),
      xhrCaptures: xhrCaptures.slice(0, 10),
      timestamp: new Date().toISOString(),
    }, null, 2)
  );
  console.log('\n结果已保存');

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
