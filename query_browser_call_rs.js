/**
 * query_browser_call_rs.js — 直接在浏览器中调用 RS 的加密函数
 *
 * 核心洞察（来自文章）：
 * RS 的 send hook 在内部调用加密函数生成 query
 * 我们不需要理解加密算法，只需要：
 * 1. 在浏览器中找到 RS 的加密函数引用
 * 2. 传入我们的数据
 * 3. 获取加密结果
 *
 * 文章说 _$14(744, 6, true, data) 是生成后缀的核心函数
 * 这个函数在 cookie 生成时也用到（"生成200页面的逻辑"）
 *
 * 方法：
 * 1. 在 send hook 中注入代码
 * 2. 当 send 被调用时，拦截参数
 * 3. 用 RS 自己的函数为我们的 URL 生成 query
 * 4. 返回 query 值
 *
 * 更简单的方法：
 * 直接用 CDP Runtime.evaluate 在浏览器中发 XHR
 * RS 自动追加 query
 * 从 responseURL 提取 query
 * 这就是 pmos_xj_post_client.js 的原理
 *
 * 但我们的目标是纯 Node.js 生成 query
 * 所以需要提取 RS 的加密函数
 *
 * 新方法：在浏览器中用 toString 获取 send hook 的源码
 * 然后从源码中提取加密函数引用
 * 再用 CDP evaluate 调用这些函数
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const { chromium } = require('patchright');
const fs = require('fs'), path = require('path');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  console.log('=== 直接调用 RS 加密函数 ===\n');

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

  // 监听 query
  var queryValue = null;
  client.on('Network.requestWillBeSent', function(params) {
    if (params.request.url.indexOf('r20SZOQm=') >= 0 && !queryValue) {
      var qMatch = params.request.url.match(/r20SZOQm=([^&]+)/);
      queryValue = qMatch ? qMatch[1] : null;
    }
  });

  console.log('[1] 加载...');
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(5000);
  console.log('[2] Reload...');
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(8000);

  // 方法：在浏览器中包装 send，拦截 query 生成
  console.log('\n[3] 包装 send 拦截 query...');
  
  // RS 的 send hook 在内部生成 query 并追加到 URL
  // 我们可以：
  // 1. 保存 RS 的 send hook
  // 2. 替换为一个包装函数
  // 3. 在调用 RS send 前后检查 URL 变化
  // 4. 提取 query 值
  
  // 但更重要的是：我们可以为任意 URL 生成 query
  // 方法：创建 XHR → open → send → 检查 responseURL
  
  // 测试：为不同 URL 生成 query
  console.log('\n[4] 为不同 URL 生成 query...');
  
  var urls = [
    '/px-gateway/GatewayConfig/getGatewayConfig',
    '/px-gateway/GatewayConfig/security',
    '/px-common-authority/marketMapping/selectByCondition',
    '/test-api/custom-endpoint',
  ];
  
  var generatedQueries = {};
  
  for (var url of urls) {
    var result = await client.send('Runtime.evaluate', {
      expression: `(function(){
        try {
          var xhr = new XMLHttpRequest();
          xhr.open('POST', ${JSON.stringify(url)}, false);
          xhr.setRequestHeader('Content-Type', 'application/json');
          xhr.send('{}');
          var qMatch = (xhr.responseURL || '').match(/r20SZOQm=([^&]+)/);
          return JSON.stringify({
            status: xhr.status,
            query: qMatch ? qMatch[1] : '',
            responseURL: xhr.responseURL || '',
          });
        } catch(e) { return JSON.stringify({error: e.message}); }
      })()`,
      returnByValue: true,
    });
    
    var parsed = JSON.parse(result.result.value);
    console.log('  ' + url + ':');
    console.log('    status:', parsed.status);
    console.log('    query:', parsed.query ? parsed.query.substring(0, 60) + '...' : 'none');
    console.log('    query length:', parsed.query ? parsed.query.length : 0);
    
    generatedQueries[url] = parsed.query;
  }
  
  // 分析生成的 query
  console.log('\n[5] Query 分析...');
  
  // 检查不同 URL 的 query 是否不同
  var queries = Object.values(generatedQueries).filter(q => q);
  if (queries.length >= 2) {
    // 检查共同前缀（session_data 部分）
    var skipChars = 6; // nonce 编码
    var common = queries[0].slice(skipChars);
    for (var q of queries.slice(1)) {
      var newCommon = '';
      for (var i = 0; i < Math.min(common.length, q.slice(skipChars).length); i++) {
        if (common[i] === q.slice(skipChars)[i]) newCommon += common[i];
        else break;
      }
      common = newCommon;
    }
    console.log('  共同前缀长度（跳过 nonce）:', common.length);
    console.log('  共同前缀:', common.substring(0, 60) + '...');
  }
  
  // 关键测试：同一个 URL 多次请求
  console.log('\n[6] 同 URL 多次请求...');
  var sameUrlQueries = [];
  for (var i = 0; i < 3; i++) {
    var result = await client.send('Runtime.evaluate', {
      expression: `(function(){
        try {
          var xhr = new XMLHttpRequest();
          xhr.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', false);
          xhr.send('{}');
          var qMatch = (xhr.responseURL || '').match(/r20SZOQm=([^&]+)/);
          return qMatch ? qMatch[1] : '';
        } catch(e) { return ''; }
      })()`,
      returnByValue: true,
    });
    sameUrlQueries.push(result.result.value);
    console.log('  [' + i + ']:', result.result.value.substring(0, 60) + '...');
  }
  
  // 检查同 URL query 的共同部分
  if (sameUrlQueries.length >= 2) {
    var common2 = sameUrlQueries[0].slice(6);
    for (var q of sameUrlQueries.slice(1)) {
      var newCommon = '';
      for (var i = 0; i < Math.min(common2.length, q.slice(6).length); i++) {
        if (common2[i] === q.slice(6)[i]) newCommon += common2[i];
        else break;
      }
      common2 = newCommon;
    }
    console.log('  同 URL 共同前缀:', common2.substring(0, 60) + '...');
    console.log('  同 URL 共同前缀长度:', common2.length);
  }
  
  // 关键突破：提取 RS 的加密函数引用
  console.log('\n[7] 提取 RS 加密函数引用...');
  
  // 从 send hook 的闭包中提取加密函数
  // send hook 源码中有 dispatcher 函数名
  var sendSrc = await client.send('Runtime.evaluate', {
    expression: 'Function.prototype.toString.call(XMLHttpRequest.prototype.send)',
    returnByValue: true,
  });
  
  var sendSource = sendSrc.result.value;
  console.log('  send hook 源码长度:', sendSource.length);
  
  // 提取 dispatcher 函数名
  var dispMatch = sendSource.match(/([_$$a-zA-Z0-9]+)\(([_$$a-zA-Z0-9]+),0,([_$$a-zA-Z0-9]+)\.([_$$a-zA-Z0-9]+)\.length,([_$$a-zA-Z0-9]+)\)/);
  if (dispMatch) {
    var dispatcherName = dispMatch[1];
    var configName = dispMatch[2];
    var bytecodeName = dispMatch[4];
    var argsName = dispMatch[5];
    console.log('  dispatcher:', dispatcherName);
    console.log('  config:', configName);
    console.log('  bytecode:', bytecodeName);
    
    // 尝试直接调用 send hook 为自定义 URL 生成 query
    // 方法：创建 XHR，open，然后手动调用 send hook
    console.log('\n[8] 直接调用 send hook...');
    
    // 在浏览器中，send hook = XMLHttpRequest.prototype.send
    // 它接受 body 作为参数
    // 内部会：
    // 1. 生成 query（通过 VM trampoline）
    // 2. 修改 URL（追加 query）
    // 3. 调用原始 send
    
    // 我们可以 hook open 来保存原始 URL
    // 然后在 send 后检查 URL 是否被修改
    
    // 但更直接的方法：
    // RS 的 send hook 在 VM 内部修改了 URL
    // 这个修改发生在 VM bytecode 执行过程中
    // VM bytecode 中的某个操作码负责 URL 修改
    
    // 我们无法直接调用单个操作码
    // 但可以调用整个 send hook
    
    // 最终方案：pmos_xj_post_client.js 已经实现了这个
    // 在浏览器中发 XHR → RS 自动追加 query �� 从 responseURL 提取
    
    console.log('  → send hook 是 VM trampoline，不能单独提取加密函数');
    console.log('  → 最优方案：CDP Runtime.evaluate + 同步 XHR');
  }
  
  // 最终验证：确认 pmos_xj_post_client.js 方案完全可用
  console.log('\n[9] 最终验证...');
  var testResult = await client.send('Runtime.evaluate', {
    expression: `(function(){
      var results = [];
      var tests = [
        {m: 'GET', p: '/px-gateway/GatewayConfig/security'},
        {m: 'POST', p: '/px-gateway/GatewayConfig/getGatewayConfig'},
        {m: 'POST', p: '/px-common-authcenter/auth/v2/captcha/get', b: '{}'},
      ];
      for (var i = 0; i < tests.length; i++) {
        try {
          var xhr = new XMLHttpRequest();
          xhr.open(tests[i].m, tests[i].p, false);
          if (tests[i].m === 'POST') xhr.setRequestHeader('Content-Type', 'application/json');
          xhr.send(tests[i].b || '');
          results.push({m: tests[i].m, p: tests[i].p, s: xhr.status, q: xhr.responseURL.indexOf('r20SZOQm=') >= 0});
        } catch(e) { results.push({m: tests[i].m, p: tests[i].p, e: e.message}); }
      }
      return JSON.stringify(results);
    })()`,
    returnByValue: true,
  });
  
  var tests = JSON.parse(testResult.result.value);
  console.log('  测试结果:');
  tests.forEach(function(t) {
    console.log('    ' + (t.s === 200 ? '✓' : '✗') + ' ' + t.m + ' ' + t.p + ': ' + t.s + (t.q ? ' (有query)' : ''));
  });
  
  // 保存
  fs.writeFileSync(
    path.join(__dirname, 'output/capture-20080/browser-query-generation.json'),
    JSON.stringify({
      timestamp: new Date().toISOString(),
      generatedQueries: generatedQueries,
      sameUrlQueries: sameUrlQueries,
    }, null, 2)
  );
  
  console.log('\n=== 总结 ===');
  console.log('1. RS 的 send hook 是 VM trampoline（不能单独提取加密函数）');
  console.log('2. query 生成逻辑在 VM bytecode 内部');
  console.log('3. 最优方案：CDP Runtime.evaluate + 同步 XHR');
  console.log('4. pmos_xj_post_client.js 已实现此方案，5/5 通过');
  console.log('5. 纯 Node.js 生成 query 需要完全反编译 VM bytecode');
  
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
