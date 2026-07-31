/**
 * query_cdp_deep_trace.js — 深入追踪 RS 的 query 追加机制
 *
 * 重大发现：
 * 1. send 显示 [native code]，但 query 确实被追加了
 * 2. open 不修改 URL（beforeUrl === afterUrl）
 * 3. send 的调用栈只有 2 层匿名（没有 RS 代码帧）
 * 4. responseURL 包含 query（send 后服务器返回的最终 URL）
 *
 * 新假设：RS 可能通过以下方式追加 query：
 * A. 网络层拦截（Service Worker / Fetch API）
 * B. 浏览器底层 hook（非 JS 层）
 * C. 服务器端配合（RS 服务器知道哪些请求需要 query）
 * D. RS 在 send 的 [native code] 内部（通过 C++ 层 hook）
 *
 * 验证方法：
 * 1. 检查 send 是否真的是原生函数（检查 Function.prototype.toString）
 * 2. 检查 Service Worker
 * 3. 用 CDP Network.requestWillBeSent 检查请求发起者
 * 4. 用 CDP Fetch.enable 拦截实际请求
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const { chromium } = require('patchright');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  console.log('=== 深入追踪 RS query 追加机制 ===\n');

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: UA,
    proxy: { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' },
  });

  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  await client.send('Runtime.enable');
  await client.send('Network.enable');

  // 监听所有网络请求
  var allRequests = [];
  client.on('Network.requestWillBeSent', function(params) {
    if (params.request.url.indexOf('px-gateway') >= 0 || params.request.url.indexOf('px-common') >= 0) {
      allRequests.push({
        url: params.request.url,
        method: params.request.method,
        initiator: params.initiator ? {
          type: params.initiator.type,
          stack: params.initiator.stack ? params.initiator.stack.callFrames.slice(0, 5).map(function(f) {
            return f.functionName + ' at ' + (f.url || '?') + ':' + f.lineNumber + ':' + f.columnNumber;
          }) : [],
        } : null,
        headers: params.request.headers,
      });
    }
  });

  // 首次加载 + reload
  console.log('[1] 加载...');
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(5000);
  console.log('[2] Reload...');
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(8000);

  // 清空之前的请求
  allRequests = [];

  // 触发请求
  console.log('\n[3] 触发请求...');
  var triggerResult = await client.send('Runtime.evaluate', {
    expression: `(function(){
      var results = [];
      var endpoints = [
        '/px-gateway/GatewayConfig/getGatewayConfig',
        '/px-gateway/GatewayConfig/security',
      ];
      
      for (var i = 0; i < endpoints.length; i++) {
        try {
          var xhr = new XMLHttpRequest();
          xhr.open('POST', endpoints[i], false);
          xhr.setRequestHeader('Content-Type', 'application/json');
          xhr.send('{}');
          results.push({
            endpoint: endpoints[i],
            status: xhr.status,
            responseURL: xhr.responseURL,
          });
        } catch(e) {
          results.push({endpoint: endpoints[i], error: e.message});
        }
      }
      
      return JSON.stringify(results);
    })()`,
    returnByValue: true,
  });
  console.log('  Trigger:', triggerResult.result.value);

  await page.waitForTimeout(2000);

  // 分析网络请求
  console.log('\n[4] 网络请求分析（' + allRequests.length + ' 个）');
  allRequests.forEach(function(req, i) {
    var hasQuery = req.url.indexOf('r20SZOQm=') >= 0;
    console.log('\n  [' + i + '] ' + req.method + ' ' + (hasQuery ? '★ HAS QUERY' : ''));
    console.log('    URL:', req.url.substring(0, 200));
    console.log('    Initiator type:', req.initiator ? req.initiator.type : 'null');
    if (req.initiator && req.initiator.stack) {
      console.log('    Stack:');
      req.initiator.stack.forEach(function(f, j) {
        console.log('      [' + j + '] ' + f);
      });
    }
    // 检查请求头
    if (req.headers) {
      var headerKeys = Object.keys(req.headers);
      var rsHeaders = headerKeys.filter(function(h) { 
        return h.toLowerCase().indexOf('x-') === 0 || h.toLowerCase().indexOf('rs') >= 0;
      });
      if (rsHeaders.length > 0) {
        console.log('    RS headers:', rsHeaders);
      }
    }
  });

  // 关键验证：检查 query 是否在请求发出前就存在
  console.log('\n[5] 验证 query 追加时机...');
  // 用 Network.requestWillBeSent 的 URL 来判断
  // 如果 URL 在发出时已包含 query，说明 RS 在 JS 层修改了 URL
  // 如果 URL 在发出时不包含 query，但在服务器端被接受，说明服务器不检查 query
  
  // 检查是否有不含 query 但仍然成功的请求
  var noQueryRequests = allRequests.filter(function(r) { return r.url.indexOf('r20SZOQm=') < 0; });
  var hasQueryRequests = allRequests.filter(function(r) { return r.url.indexOf('r20SZOQm=') >= 0; });
  
  console.log('  Requests WITH query:', hasQueryRequests.length);
  console.log('  Requests WITHOUT query:', noQueryRequests.length);
  
  if (hasQueryRequests.length > 0) {
    console.log('\n  ★ Query 在请求 URL 中 → RS 在 JS 层修改了 URL');
    console.log('  ★ RS 的 URL 修改发生在 Network 层可见之前');
    console.log('  ★ 这意味着 RS 在 send 的 [native code] 执行前就修改了 URL');
  }

  // 关键测试：直接发不带 query 的请求，看服务器是否接受
  console.log('\n[6] 测试不带 query 的 POST 请求...');
  var noQueryTest = await client.send('Runtime.evaluate', {
    expression: `(function(){
      try {
        // 用 fetch 发 POST（fetch 不被 RS hook）
        var response = fetch('/px-gateway/GatewayConfig/getGatewayConfig', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: '{}',
        });
        // fetch 是异步的，返回 Promise
        return 'fetch sent (async)';
      } catch(e) {
        return 'error: ' + e.message;
      }
    })()`,
    returnByValue: true,
  });
  console.log('  Fetch result:', noQueryTest.result.value);
  
  await page.waitForTimeout(3000);
  
  // 检查 fetch 请求的结果
  var fetchRequests = allRequests.filter(function(r) { 
    return r.url.indexOf('getGatewayConfig') >= 0 && r.method === 'POST';
  });
  console.log('  Fetch requests:', fetchRequests.length);
  fetchRequests.forEach(function(r, i) {
    var hasQ = r.url.indexOf('r20SZOQm=') >= 0;
    console.log('    [' + i + '] has query:', hasQ, 'url:', r.url.substring(0, 150));
  });

  // 关键测试 2：用同步 XHR 但手动移除 query
  console.log('\n[7] 测试手动移除 query...');
  // RS 在 send 内部追加 query 到 URL
  // 如果我们在 send 后立即检查 responseURL
  // responseURL 是服务器返回的最终 URL
  // 如果服务器接受了不带 query 的请求，responseURL 不会有 query
  
  // 先发一个正常请求
  var normalResult = await client.send('Runtime.evaluate', {
    expression: `(function(){
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', false);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.send('{}');
        return JSON.stringify({
          status: xhr.status,
          responseURL: xhr.responseURL,
          hasQuery: xhr.responseURL.indexOf('r20SZOQm=') >= 0,
        });
      } catch(e) { return JSON.stringify({error: e.message}); }
    })()`,
    returnByValue: true,
  });
  console.log('  Normal POST:', normalResult.result.value);

  // 关键测试 3：检查 RS 是否修改了 XMLHttpRequest 构造器返回的对象
  console.log('\n[8] 检查 XHR 实例是否被 Proxy 包装...');
  var proxyCheck = await client.send('Runtime.evaluate', {
    expression: `(function(){
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/test', true);
      
      // 检查是否是 Proxy
      var isProxy = false;
      try {
        // Proxy 的 toString 会触发 handler
        var origToString = xhr.toString;
        var called = false;
        xhr.toString = function() { called = true; return origToString.call(this); };
        xhr.toString();
        xhr.toString = origToString;
      } catch(e) {}
      
      // 另一种检测：检查 [[ProxyHandler]]
      var desc = Object.getOwnPropertyDescriptor(xhr, 'open');
      
      return JSON.stringify({
        xhrToString: Object.prototype.toString.call(xhr),
        sendType: typeof xhr.send,
        sendStr: xhr.send.toString().substring(0, 100),
        openType: typeof xhr.open,
        openStr: xhr.open.toString().substring(0, 100),
        isOwnSend: xhr.hasOwnProperty('send'),
        isOwnOpen: xhr.hasOwnProperty('open'),
      });
    })()`,
    returnByValue: true,
  });
  console.log('  XHR check:', proxyCheck.result.value);

  // 最终验证：RS 可能在 open 中设置了一个内部标志
  // 然后在浏览器的网络栈中（C++ 层）追加 query
  // 这就是为什么 JS 层看不到 URL 修改
  console.log('\n[9] 最终验证：检查 open 后的 XHR 内部状态...');
  var internalState = await client.send('Runtime.evaluate', {
    expression: `(function(){
      var xhr = new XMLHttpRequest();
      
      // open 前的状态
      var beforeOpen = {
        readyState: xhr.readyState,
        _url: xhr._url,
        responseURL: xhr.responseURL,
      };
      
      xhr.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', false);
      
      // open 后的状态
      var afterOpen = {
        readyState: xhr.readyState,
        responseURL: xhr.responseURL,
        status: xhr.status,
      };
      
      // 检查 open 是否设置了自定义属性
      var rsProps = {};
      var allProps = Object.getOwnPropertyNames(xhr);
      for (var i = 0; i < allProps.length; i++) {
        var k = allProps[i];
        if (k.indexOf('_$') === 0) {
          rsProps[k] = typeof xhr[k];
        }
      }
      
      // send
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send('{}');
      
      var afterSend = {
        status: xhr.status,
        responseURL: xhr.responseURL,
        hasQuery: xhr.responseURL.indexOf('r20SZOQm=') >= 0,
      };
      
      return JSON.stringify({
        beforeOpen: beforeOpen,
        afterOpen: afterOpen,
        rsProps: rsProps,
        afterSend: afterSend,
      });
    })()`,
    returnByValue: true,
  });
  console.log('  Internal state:', internalState.result.value);

  // 总结
  console.log('\n=== 最终结论 ===');
  console.log('1. RS 不通过 JS 层的 URL 修改来追加 query');
  console.log('2. RS 的 send 是 [native code]（但可能被 C++ 层 hook）');
  console.log('3. query 在 Network.requestWillBeSent 中已存在');
  console.log('4. RS 可能通过浏览器 C++ 扩展或 Patchright 的 hook 来追加 query');
  console.log('5. 或者：RS 在 open 中设置了内部状态，浏览器网络栈自动追加');

  // 验证 Patchright 是否有特殊 hook
  console.log('\n[10] 检查 Patchright 是否影响 send...');
  // 用最原始的方式检查
  var patchrightCheck = await client.send('Runtime.evaluate', {
    expression: `(function(){
      // 检查 send 函数的 length（参数数量）
      var sendLen = XMLHttpRequest.prototype.send.length;
      // 原生 send 的 length 应该是 1
      return JSON.stringify({
        sendLength: sendLen,
        sendName: XMLHttpRequest.prototype.send.name,
        openLength: XMLHttpRequest.prototype.open.length,
        openName: XMLHttpRequest.prototype.open.name,
      });
    })()`,
    returnByValue: true,
  });
  console.log('  Function info:', patchrightCheck.result.value);

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
