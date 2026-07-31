/**
 * query_cdp_extract2.js — CDP 提取 RS 动态代码 + query 结构分析
 *
 * 从 v1 发现：成功捕获了 8 个 query 值！
 * 所有 query 有共同前缀：0XXX???qWlukWfuKjcyCWPeJu1f86Mc5iJNrl8a2RQXamwsg2vvxRRmYePI_lThyjKS972hvfn
 * 这说明 session_data 部分确实在同会话内固定
 *
 * 新目标：
 * 1. 获取 RS 动态代码（修正 scriptId 获取方式）
 * 2. 在动态代码中搜索 query 生成逻辑
 * 3. 分析 query 的编码结构
 * 4. 尝试在浏览器中直接提取加密密钥
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const { chromium } = require('patchright');
const fs = require('fs'), path = require('path');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  console.log('=== CDP 提取 RS 动态代码 + query 分析 v2 ===\n');

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

  // 收集脚本
  var scriptList = [];
  client.on('Debugger.scriptParsed', function(params) {
    scriptList.push({
      scriptId: params.scriptId,
      url: params.url || '',
      length: params.length || 0,
    });
  });

  // 监听网络请求
  var queryRequests = [];
  client.on('Network.requestWillBeSent', function(params) {
    var url = params.request.url;
    if (url.indexOf('r20SZOQm=') >= 0) {
      var queryMatch = url.match(/r20SZOQm=([^&]+)/);
      queryRequests.push({
        path: (url.match(/https?:\/\/[^/]+([^?]+)/) || [])[1] || url,
        query: queryMatch ? queryMatch[1] : '',
        method: params.request.method,
      });
    }
  });

  // 首次加载 + reload
  console.log('[1] 加载页面...');
  await page.goto(TARGET, { timeout: 120000 }).catch(function() {});
  await page.waitForTimeout(5000);
  console.log('[2] Reload...');
  await page.reload({ timeout: 120000 }).catch(function() {});
  await page.waitForTimeout(8000);

  // 找到 RS 动态代码
  scriptList.sort(function(a, b) { return b.length - a.length; });
  console.log('\n[3] Top scripts:');
  scriptList.slice(0, 5).forEach(function(s) {
    console.log('  scriptId=' + s.scriptId + ' len=' + s.length + ' url=' + (s.url || 'inline').substring(0, 60));
  });

  // 获取最长的脚本
  var dynCode = '';
  for (var i = 0; i < Math.min(3, scriptList.length); i++) {
    if (scriptList[i].length > 100000) {
      try {
        var src = await client.send('Debugger.getScriptSource', { scriptId: scriptList[i].scriptId });
        if (src.scriptSource && src.scriptSource.length > 100000) {
          dynCode = src.scriptSource;
          console.log('\n  Got dynamic code from scriptId=' + scriptList[i].scriptId + ', length=' + dynCode.length);
          break;
        }
      } catch(e) {}
    }
  }

  if (!dynCode) {
    console.log('\n  FATAL: No dynamic code found');
    await browser.close();
    process.exit(1);
  }

  // 分析 query 编码
  console.log('\n[4] Query 结构分析');
  console.log('  Captured queries:', queryRequests.length);

  if (queryRequests.length >= 2) {
    // 解码 query 值（base64 变体 → 字节数组）
    // query 以 '0' 开头，与 cookie 相同的编码方式
    var q1 = queryRequests[0].query;
    var q2 = queryRequests[1].query;

    console.log('\n  Query 1:', q1);
    console.log('  Query 2:', q2);
    console.log('\n  Query 1 length:', q1.length);
    console.log('  Query 2 length:', q2.length);

    // 找共同前缀
    var commonLen = 0;
    for (var j = 0; j < Math.min(q1.length, q2.length); j++) {
      if (q1[j] === q2[j]) commonLen++;
      else break;
    }
    console.log('\n  Common prefix length:', commonLen);
    console.log('  Common prefix:', q1.substring(0, commonLen));

    // 所有 query 的共同前缀
    if (queryRequests.length >= 3) {
      var allCommon = queryRequests[0].query;
      for (var k = 1; k < queryRequests.length; k++) {
        var q = queryRequests[k].query;
        var newCommon = '';
        for (var m = 0; m < Math.min(allCommon.length, q.length); m++) {
          if (allCommon[m] === q[m]) newCommon += allCommon[m];
          else break;
        }
        allCommon = newCommon;
      }
      console.log('\n  All queries common prefix:', allCommon);
      console.log('  Common prefix length:', allCommon.length);
    }

    // 分析 query 的字节结构
    // query 去掉 '0' 前缀后用 basestr 解码
    // basestr 是 86 字符的编码表
    // 但我们不知道当前会话的 basestr
    // 可以从动态代码中提取
    console.log('\n[5] 从动态代码提取 basestr...');
    // basestr 通常是一个 86 字符的字符串
    // 在动态代码中搜索 86 字符的字符串
    var basestrPattern = /'([0-9a-zA-Z_\-.~]{86})'/g;
    var basestrMatch;
    var baseStrs = [];
    while ((basestrMatch = basestrPattern.exec(dynCode)) !== null) {
      baseStrs.push(basestrMatch[1]);
    }
    console.log('  Found basestr candidates:', baseStrs.length);
    if (baseStrs.length > 0) {
      console.log('  First basestr:', baseStrs[0]);
    }

    // 搜索 numarr2string 相关代码
    var numarr2strPos = dynCode.indexOf('numarr2string');
    console.log('\n  "numarr2string" in code:', numarr2strPos >= 0);

    // 搜索 query 参数名
    var paramNamePos = dynCode.indexOf('r20SZOQm');
    console.log('  "r20SZOQm" in code:', paramNamePos >= 0 ? 'at pos ' + paramNamePos : 'NO');

    // 搜索 query 相关代码
    var queryPatterns = ['_$cc', 'query', 'r20SZOQm'];
    queryPatterns.forEach(function(p) {
      var pos = dynCode.indexOf(p);
      if (pos >= 0) {
        console.log('  "' + p + '" at pos ' + pos + ':', dynCode.substring(pos, pos + 100).substring(0, 80));
      }
    });
  }

  // 方法：在浏览器中直接提取 query 生成函数
  console.log('\n[6] 在浏览器中提取 RS 内部状态...');

  // 提取 $_ts
  var tsResult = await client.send('Runtime.evaluate', {
    expression: 'JSON.stringify(window.$_ts || {})',
    returnByValue: true,
  });
  var ts = JSON.parse(tsResult.result.value);
  console.log('  $_ts keys:', Object.keys(ts));

  // 提 $_ts.cd（用于同会话沙箱）
  if (ts.cd) {
    console.log('  $_ts.cd length:', ts.cd.length);
    console.log('  $_ts.nsd:', ts.nsd);
  }

  // 关键：在浏览器中用同步 XHR 获取 responseURL（包含 query）
  console.log('\n[7] 获取多个端点的 query...');
  var endpoints = [
    '/px-gateway/GatewayConfig/getGatewayConfig',
    '/px-gateway/GatewayConfig/security',
    '/px-common-authority/marketMapping/selectByCondition',
  ];

  var capturedData = { queries: [], nsd: ts.nsd, cd: ts.cd, timestamp: new Date().toISOString() };

  for (var ei = 0; ei < endpoints.length; ei++) {
    var ep = endpoints[ei];
    var r = await client.send('Runtime.evaluate', {
      expression: '(function(){ try { var xhr = new XMLHttpRequest(); xhr.open("POST", ' + JSON.stringify(ep) + ', false); xhr.setRequestHeader("Content-Type", "application/json"); xhr.send("{}"); return JSON.stringify({status: xhr.status, responseURL: xhr.responseURL || "", body: (xhr.responseText||"").substring(0, 100)}); } catch(e) { return JSON.stringify({error: e.message}); } })()',
      returnByValue: true,
    });
    var parsed = JSON.parse(r.result.value);
    var qMatch = parsed.responseURL ? parsed.responseURL.match(/r20SZOQm=([^&]+)/) : null;
    var queryValue = qMatch ? qMatch[1] : '';
    console.log('  ' + ep + ':', parsed.status, queryValue ? 'query len=' + queryValue.length : 'no query');

    capturedData.queries.push({
      endpoint: ep,
      status: parsed.status,
      query: queryValue,
      responseURL: parsed.responseURL,
    });
  }

  // 同端点多次请求（检查 request_data 变化）
  console.log('\n[8] 同端点多次请求...');
  for (var ri = 0; ri < 3; ri++) {
    var r = await client.send('Runtime.evaluate', {
      expression: '(function(){ try { var xhr = new XMLHttpRequest(); xhr.open("POST", "/px-gateway/GatewayConfig/getGatewayConfig", false); xhr.setRequestHeader("Content-Type", "application/json"); xhr.send("{}"); return JSON.stringify({responseURL: xhr.responseURL || ""}); } catch(e) { return JSON.stringify({error: e.message}); } })()',
      returnByValue: true,
    });
    var parsed = JSON.parse(r.result.value);
    var qMatch = parsed.responseURL ? parsed.responseURL.match(/r20SZOQm=([^&]+)/) : null;
    console.log('  Request ' + ri + ':', qMatch ? qMatch[1].substring(0, 60) + '...' : 'no query');
    if (qMatch) {
      capturedData.queries.push({
        endpoint: '/px-gateway/GatewayConfig/getGatewayConfig (repeat ' + ri + ')',
        status: 200,
        query: qMatch[1],
      });
    }
  }

  // 保存
  fs.writeFileSync(
    path.join(__dirname, 'output/capture-20080/query-browser-extracted.json'),
    JSON.stringify(capturedData, null, 2)
  );
  console.log('\nSaved to output/capture-20080/query-browser-extracted.json');

  // 保存动态代码（用于沙箱分析）
  fs.writeFileSync(
    path.join(__dirname, 'output/capture-20080/dyn-code-browser.js'),
    dynCode
  );
  console.log('Dynamic code saved to output/capture-20080/dyn-code-browser.js');

  // 分析：用同会话的 nsd/cd 在沙箱中执行
  console.log('\n[9] 同会话 nsd/cd 可用于沙箱执行');
  console.log('  nsd:', ts.nsd);
  console.log('  cd length:', ts.cd ? ts.cd.length : 0);

  // 最终总结
  console.log('\n=== 总结 ===');
  console.log('1. 浏览器 CDP 成功捕获 query 值');
  console.log('2. 同会话 nsd/cd 已提取，可用于沙箱对照');
  console.log('3. 动态代码已保存');
  console.log('4. 下一步：用同会话 nsd/cd 在沙箱中执行，对比 trampoline 行为');

  await browser.close();
  process.exit(0);
})().catch(function(e) { console.error('FATAL:', e.message, e.stack); process.exit(1); });
