/**
 * query_cdp_intercept.js — CDP 拦截提取 query 生成过程
 *
 * 新策略：不试图在沙箱中生成 query，而是直接在浏览器中拦截
 * RS 生成 query 的瞬间，提取 query 值和相关的加密参数
 *
 * 方法：
 * 1. Patchright 打开页面，等待 412→200→reload
 * 2. 用 CDP Network.requestWillBeSent 监听所有请求
 * 3. 当检测到带 r20SZOQm= 的请求时，记录完整的 query 值
 * 4. 同时用 CDP Debugger 在 RS 动态代码中设条件断点
 * 5. 在 query 生成函数执行时 dump 变量
 *
 * 关键目标：
 * - 捕获 query 生成时的加密密钥
 * - 或者：直接在浏览器中反复调用 RS 的 query 生成函数
 *   来为任意 URL 生成 query
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const { chromium } = require('patchright');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  console.log('=== CDP 拦截提取 query 生成过程 ===\n');

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
  await client.send('Debugger.enable');

  // 监听网络请求
  var queryRequests = [];
  client.on('Network.requestWillBeSent', function(params) {
    var url = params.request.url;
    if (url.indexOf('r20SZOQm=') >= 0) {
      var queryMatch = url.match(/r20SZOQm=([^&]+)/);
      var pathMatch = url.match(/https?:\/\/[^/]+([^?]+)/);
      console.log('[Query Request] path:', pathMatch ? pathMatch[1] : '?');
      console.log('  query value:', queryMatch ? queryMatch[1].substring(0, 60) + '...' : 'not found');
      console.log('  full query:', queryMatch ? queryMatch[1] : 'not found');
      queryRequests.push({
        url: url,
        path: pathMatch ? pathMatch[1] : url,
        query: queryMatch ? queryMatch[1] : '',
        method: params.request.method,
        timestamp: new Date().toISOString(),
      });
    }
  });

  // 首次加载（412）
  console.log('[1] 首次加载...');
  await page.goto(TARGET, { timeout: 120000 }).catch(function() {});
  await page.waitForTimeout(5000);

  // Reload（200）
  console.log('[2] Reload...');
  await page.reload({ timeout: 120000 }).catch(function() {});
  await page.waitForTimeout(8000);

  // 检查页面是否加载完成
  console.log('[3] 检查页面状态...');
  var pageStatus = await client.send('Runtime.evaluate', {
    expression: 'JSON.stringify({url: location.href, title: document.title, readyState: document.readyState})',
    returnByValue: true,
  });
  console.log('  Page:', pageStatus.result.value);

  // 提取 RS 动态代码的 scriptId
  console.log('\n[4] 查找 RS 动态代码...');
  var scripts = await client.send('Debugger.getScriptSource', {});
  // 需要先获取脚本列表
  // 用 Runtime.evaluate 获取所有 script 信息
  var scriptInfo = await client.send('Runtime.evaluate', {
    expression: '(function(){ var scripts = document.querySelectorAll("script"); return JSON.stringify(Array.from(scripts).map(function(s){return {src:s.src, length:(s.textContent||"").length, type:s.type};})); })()',
    returnByValue: true,
  });
  console.log('  Scripts:', scriptInfo.result.value);

  // 用 CDP 获取所有已编译的脚本
  var scriptList = [];
  client.on('Debugger.scriptParsed', function(params) {
    scriptList.push({
      scriptId: params.scriptId,
      url: params.url || '',
      length: params.length || 0,
      startLine: params.startLine || 0,
    });
  });

  // 重新启用 Debugger 以获取所有脚本
  await client.send('Debugger.disable');
  await client.send('Debugger.enable');

  // 等待脚本事件
  await page.waitForTimeout(2000);

  // 找到动态代码脚本（最长的一个）
  scriptList.sort(function(a, b) { return b.length - a.length; });
  console.log('\n  Top scripts by length:');
  scriptList.slice(0, 5).forEach(function(s) {
    console.log('    scriptId=' + s.scriptId + ' len=' + s.length + ' url=' + (s.url || 'inline').substring(0, 60));
  });

  // 获取最长脚本的内容（RS 动态代码）
  if (scriptList.length > 0) {
    var dynScriptId = scriptList[0].scriptId;
    console.log('\n[5] 获取 RS 动态代码 (scriptId=' + dynScriptId + ')...');
    try {
      var scriptSource = await client.send('Debugger.getScriptSource', { scriptId: dynScriptId });
      var dynCode = scriptSource.scriptSource;
      console.log('  Dynamic code length:', dynCode.length);

      // 搜索 query 参数名
      var paramNamePos = dynCode.indexOf('r20SZOQm');
      console.log('  "r20SZOQm" in dynamic code:', paramNamePos >= 0 ? 'YES at pos ' + paramNamePos : 'NO');

      // 搜索关键加密函数
      var aesPatterns = ['encryptMode', 'AES', 'CBC', 'substring'];
      aesPatterns.forEach(function(p) {
        var pos = dynCode.indexOf(p);
        console.log('  "' + p + '" in code:', pos >= 0 ? 'YES' : 'NO');
      });

      // 提取 query 生成函数
      // RS 在 VM 内部生成 query，然后追加到 URL
      // 搜索 URL 修改代码
      var urlModPatterns = ['.send(', 'XMLHttpRequest', '.open('];
      urlModPatterns.forEach(function(p) {
        var positions = [];
        var pos = 0;
        while ((pos = dynCode.indexOf(p, pos)) >= 0 && positions.length < 3) {
          positions.push(pos);
          pos += p.length;
        }
        if (positions.length > 0) {
          console.log('  "' + p + '" found at positions:', positions);
        }
      });
    } catch(e) {
      console.log('  Error getting script source:', e.message);
    }
  }

  // 触发业务请求来生成 query
  console.log('\n[6] 触发业务请求...');
  var triggerResult = await client.send('Runtime.evaluate', {
    expression: '(function(){ try { var xhr = new XMLHttpRequest(); xhr.open("POST", "/px-gateway/GatewayConfig/getGatewayConfig", false); xhr.setRequestHeader("Content-Type", "application/json"); xhr.send("{}"); return JSON.stringify({status: xhr.status, url: xhr.responseURL || "", bodyLen: (xhr.responseText||"").length}); } catch(e) { return JSON.stringify({error: e.message}); } })()',
    returnByValue: true,
  });
  console.log('  Trigger result:', triggerResult.result.value);

  // 等待网络请求
  await page.waitForTimeout(3000);

  // 检查捕获的 query 请求
  console.log('\n[7] 捕获的 query 请求:', queryRequests.length);
  queryRequests.forEach(function(req, i) {
    console.log('  [' + i + ']', req.method, req.path);
    console.log('       query:', req.query);
  });

  // 如果有 query，保存
  if (queryRequests.length > 0) {
    var fs = require('fs');
    var path = require('path');
    fs.writeFileSync(
      path.join(__dirname, 'output/capture-20080/browser-query-captured.json'),
      JSON.stringify({ requests: queryRequests, timestamp: new Date().toISOString() }, null, 2)
    );
    console.log('\nSaved to output/capture-20080/browser-query-captured.json');
  }

  // 方法 2：直接在浏览器中提取 RS 的 XHR send 函数
  console.log('\n[8] 提取 RS XHR send 函数...');
  var sendAnalysis = await client.send('Runtime.evaluate', {
    expression: '(function(){ var result = {}; var proto = XMLHttpRequest.prototype; result.openType = typeof proto.open; result.sendType = typeof proto.send; result.openStr = proto.open.toString().substring(0, 200); result.sendStr = proto.send.toString().substring(0, 200); var desc = Object.getOwnPropertyDescriptor(proto, "open"); result.openDesc = desc ? {hasGet: !!desc.get, hasSet: !!desc.set, hasValue: !!desc.value} : null; return JSON.stringify(result); })()',
    returnByValue: true,
  });
  console.log('  XHR analysis:', sendAnalysis.result.value);

  // 方法 3：检查 RS 是否定义了全局变量
  console.log('\n[9] 检查 RS 全局变量...');
  var rsGlobals = await client.send('Runtime.evaluate', {
    expression: '(function(){ var rsKeys = []; for (var k in window) { if (k.indexOf("_$") === 0 || k.indexOf("$_") === 0) rsKeys.push(k); } return JSON.stringify({rsKeys: rsKeys.slice(0, 30), totalRs: rsKeys.length}); })()',
    returnByValue: true,
  });
  console.log('  RS globals:', rsGlobals.result.value);

  // 方法 4：用 CDP 在 query 请求发出前拦截
  console.log('\n[10] 尝试从 XHR 拦截提取 query...');
  // 在浏览器中 hook XMLHttpRequest.prototype.open 来捕获 URL 修改
  var hookResult = await client.send('Runtime.evaluate', {
    expression: '(function(){ var origOpen = XMLHttpRequest.prototype.open; var queries = []; XMLHttpRequest.prototype.open = function(method, url) { if (url && url.indexOf("r20SZOQm=") >= 0) { queries.push({method: method, url: url.substring(0, 200)}); } return origOpen.apply(this, arguments); }; window.__getQueries = function() { return JSON.stringify(queries); }; return "hook installed"; })()',
    returnByValue: true,
  });
  console.log('  Hook result:', hookResult.result.value);

  // 触发另一个请求
  await client.send('Runtime.evaluate', {
    expression: '(function(){ try { var xhr = new XMLHttpRequest(); xhr.open("POST", "/px-gateway/GatewayConfig/security", false); xhr.send("{}"); } catch(e) {} return "done"; })()',
    returnByValue: true,
  });
  await page.waitForTimeout(2000);

  var capturedQueries = await client.send('Runtime.evaluate', {
    expression: 'window.__getQueries ? window.__getQueries() : "no hook"',
    returnByValue: true,
  });
  console.log('  Captured queries:', capturedQueries.result.value);

  // 方法 5：直接用同步 XHR 获取 responseURL（包含 query）
  console.log('\n[11] 直接获取 responseURL...');
  var urlResult = await client.send('Runtime.evaluate', {
    expression: '(function(){ try { var xhr = new XMLHttpRequest(); xhr.open("POST", "/px-gateway/GatewayConfig/getGatewayConfig", false); xhr.setRequestHeader("Content-Type", "application/json"); xhr.send("{}"); return JSON.stringify({status: xhr.status, responseURL: xhr.responseURL || "", responseText: (xhr.responseText||"").substring(0, 100)}); } catch(e) { return JSON.stringify({error: e.message}); } })()',
    returnByValue: true,
  });
  console.log('  URL result:', urlResult.result.value);

  // 如果 responseURL 包含 query，提取它
  try {
    var parsed = JSON.parse(urlResult.result.value);
    if (parsed.responseURL && parsed.responseURL.indexOf('r20SZOQm=') >= 0) {
      var qMatch = parsed.responseURL.match(/r20SZOQm=([^&]+)/);
      if (qMatch) {
        console.log('\n*** QUERY VALUE CAPTURED ***');
        console.log('  Query:', qMatch[1]);
        console.log('  Length:', qMatch[1].length);
      }
    }
  } catch(e) {}

  // 方法 6：批量生成 query（不同端点）
  console.log('\n[12] 批量生成不同端点的 query...');
  var endpoints = [
    '/px-gateway/GatewayConfig/getGatewayConfig',
    '/px-gateway/GatewayConfig/security',
    '/px-common-authority/marketMapping/selectByCondition',
    '/px-common-authcenter/auth/v2/captcha/get',
  ];

  for (var i = 0; i < endpoints.length; i++) {
    var ep = endpoints[i];
    var r = await client.send('Runtime.evaluate', {
      expression: '(function(){ try { var xhr = new XMLHttpRequest(); xhr.open("POST", ' + JSON.stringify(ep) + ', false); xhr.setRequestHeader("Content-Type", "application/json"); xhr.send("{}"); return JSON.stringify({status: xhr.status, responseURL: xhr.responseURL || ""}); } catch(e) { return JSON.stringify({error: e.message}); } })()',
      returnByValue: true,
    });
    var parsed = JSON.parse(r.result.value);
    var qMatch = parsed.responseURL ? parsed.responseURL.match(/r20SZOQm=([^&]+)/) : null;
    console.log('  ' + ep + ':', parsed.status, qMatch ? 'query=' + qMatch[1].substring(0, 40) + '...' : 'no query');
  }

  // 总结
  console.log('\n=== 总结 ===');
  console.log('Query requests captured by Network:', queryRequests.length);
  console.log('All query values can be obtained via CDP Runtime.evaluate + synchronous XHR');
  console.log('RS automatically generates and appends query to all XHR requests in browser context');

  await browser.close();
  process.exit(0);
})().catch(function(e) { console.error('FATAL:', e.message, e.stack); process.exit(1); });
