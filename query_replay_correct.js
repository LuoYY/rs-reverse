/**
 * query_replay_correct.js — 正确的 query 重放测试
 *
 * 修正：
 * 1. 用管线生成的 cookie（100% 有效），不是浏览器 cookie
 * 2. 在浏览器中用管线 cookie 作为 seedCookie
 * 3. 浏览器生成 query
 * 4. Node.js 用管线 cookie + 浏览器 query 重放 POST
 *
 * 关键：cookie 没有指纹绑定（纯 Go 100% 证明）
 * 所以 Node.js 用管线 cookie 应该也能通过
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const { chromium } = require('patchright');
const https = require('https');
const fs = require('fs'), path = require('path');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function nodeRequest(method, urlPath, cookie, query, body) {
  return new Promise(function(resolve) {
    var fullUrl = urlPath;
    if (query) fullUrl += '?r20SZOQm=' + query;
    
    var options = {
      hostname: 'pmos.xj.sgcc.com.cn',
      port: 20080,
      path: fullUrl,
      method: method,
      rejectUnauthorized: false,
      headers: {
        'Cookie': cookie,
        'User-Agent': UA,
        'Origin': TARGET.replace(/\/$/, ''),
        'Referer': TARGET,
      },
    };
    
    if (method === 'POST') {
      options.headers['Content-Type'] = 'application/json;charset=UTF-8';
    }

    var req = https.request(options, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        resolve({ status: res.statusCode, body: data });
      });
    });
    req.on('error', function(e) { resolve({ error: e.message }); });
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  console.log('=== 正确的 query 重放测试 ===\n');

  // Step 1: 管线生成 cookie
  console.log('[1] 管线生成 cookie...');
  const { PmosXjClientProxy } = require('./pmos_xj_client_proxy');
  const { httpGet } = require('./proxy_http');
  
  var client = new PmosXjClientProxy();
  await client.init();
  // client 已经有有效的 cookie（100% 通过率）
  var pipeCookie = client.cookieHeader;
  console.log('  管线 cookie:', pipeCookie.substring(0, 80) + '...');
  
  // 验证管线 cookie 在 Node.js 中是否有效
  console.log('\n[2] 验证管线 cookie (Node.js GET)...');
  var getTest = await nodeRequest('GET', '/px-gateway/GatewayConfig/security', pipeCookie);
  console.log('  GET status:', getTest.status);
  console.log('  GET body:', (getTest.body || '').substring(0, 80));
  
  if (getTest.status !== 200) {
    console.log('  管线 cookie GET 失败，可能需要重新初始化');
    // 重新获取
    var ch = await httpGet(TARGET, { userAgent: UA });
    var sc = [].concat(ch.headers['set-cookie'] || []);
    var oCookie = sc.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || sc.map(c => c.split(';')[0])[0];
    var m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
    var nsd = +m[1], cd = m[2];
    var cp3 = client._extractCp3(nsd, cd);
    var ts = { nsd, cd, from: TARGET, hasDebug: false, keynameNum: 909, cp3Override: cp3 };
    var gen = await client._genCookie(ts, cp3);
    pipeCookie = oCookie + '; ' + gen.name + '=' + gen.cookie;
    console.log('  重新生成 cookie:', pipeCookie.substring(0, 80) + '...');
    
    getTest = await nodeRequest('GET', '/px-gateway/GatewayConfig/security', pipeCookie);
    console.log('  GET status (retry):', getTest.status);
    console.log('  GET body:', (getTest.body || '').substring(0, 80));
  }

  // Step 2: 浏览器中用管线 cookie 生成 query
  console.log('\n[3] 浏览器中生成 query...');
  
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: UA,
    proxy: { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' },
  });
  
  // 注入管线 cookie
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  
  // 设置 cookie
  var cookieParts = pipeCookie.split('; ');
  for (var part of cookieParts) {
    var eqIdx = part.indexOf('=');
    if (eqIdx > 0) {
      var name = part.substring(0, eqIdx);
      var value = part.substring(eqIdx + 1);
      await context.addCookies([{
        name: name,
        value: value,
        domain: 'pmos.xj.sgcc.com.cn',
        path: '/',
        secure: true,
        httpOnly: name === 'O',
      }]);
    }
  }
  
  // 加载页面（应该直接 200，不需要 reload）
  console.log('  加载页面（带管线 cookie）...');
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(5000);
  
  // 检查页面状态
  var pageStatus = await cdp.send('Runtime.evaluate', {
    expression: 'JSON.stringify({url: location.href, title: document.title, readyState: document.readyState})',
    returnByValue: true,
  });
  console.log('  Page:', pageStatus.result.value);
  
  // 检查 RS 是否加载
  var rsCheck = await cdp.send('Runtime.evaluate', {
    expression: 'typeof XMLHttpRequest.prototype.send === "function" ? Function.prototype.toString.call(XMLHttpRequest.prototype.send).substring(0, 50) : "no send"',
    returnByValue: true,
  });
  console.log('  RS send:', rsCheck.result.value.substring(0, 60));
  
  // 如果 RS 没加载，reload
  if (rsCheck.result.value.indexOf('function') !== 0) {
    console.log('  RS 未加载，reload...');
    await page.reload({ timeout: 120000 }).catch(() => {});
    await page.waitForTimeout(8000);
  }
  
  // 生成 query
  var queryResult = await cdp.send('Runtime.evaluate', {
    expression: `(function(){
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', false);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.send('{}');
        var qMatch = (xhr.responseURL || '').match(/r20SZOQm=([^&]+)/);
        return JSON.stringify({
          status: xhr.status,
          query: qMatch ? qMatch[1] : '',
          body: (xhr.responseText || '').substring(0, 80),
        });
      } catch(e) { return JSON.stringify({error: e.message}); }
    })()`,
    returnByValue: true,
  });
  
  var qResult = JSON.parse(queryResult.result.value);
  console.log('  浏览器 POST status:', qResult.status);
  console.log('  浏览器 query:', qResult.query ? qResult.query.substring(0, 50) + '...' : 'none');
  console.log('  浏览器 body:', qResult.body);
  
  // 获取浏览器中的 cookie（可能 RS 更新了 cookie）
  var browserCookieResult = await cdp.send('Runtime.evaluate', {
    expression: 'document.cookie',
    returnByValue: true,
  });
  var browserCookie = browserCookieResult.result.value;
  
  await browser.close();
  
  if (!qResult.query) {
    console.log('\nFATAL: 浏览器未生成 query');
    process.exit(1);
  }
  
  // Step 3: Node.js 重放
  console.log('\n[4] Node.js 重放 POST...');
  
  // 用管线 cookie 重放
  console.log('  用管线 cookie:');
  var postResult1 = await nodeRequest('POST', '/px-gateway/GatewayConfig/getGatewayConfig', pipeCookie, qResult.query, '{}');
  console.log('    status:', postResult1.status);
  console.log('    body:', (postResult1.body || '').substring(0, 80));
  
  // 用浏览器 cookie 重放
  console.log('  用浏览器 cookie:');
  var postResult2 = await nodeRequest('POST', '/px-gateway/GatewayConfig/getGatewayConfig', browserCookie, qResult.query, '{}');
  console.log('    status:', postResult2.status);
  console.log('    body:', (postResult2.body || '').substring(0, 80));
  
  // 也测试不同端点（query 中的 request_data 绑定 URL）
  console.log('\n[5] 不同端点测试...');
  
  // 为 security 端点生成新 query
  // 但我们只有一个 query（getGatewayConfig 的）
  // request_data 包含 URL，所以不能用于不同端点
  
  // 测试同端点重放
  console.log('  同端点重放:');
  var postResult3 = await nodeRequest('POST', '/px-gateway/GatewayConfig/getGatewayConfig', pipeCookie, qResult.query, '{}');
  console.log('    status:', postResult3.status);
  console.log('    body:', (postResult3.body || '').substring(0, 80));
  
  // 结论
  console.log('\n=== 结论 ===');
  if (postResult1.status === 200 || postResult2.status === 200) {
    console.log('★★★ query 可重放！ ★★★');
    console.log('方案：浏览器生成 query → Node.js 重放 POST');
    console.log('注意：query 的 request_data 绑定 URL，每个端点需要单独生成');
  } else {
    console.log('query 不可重放');
    console.log('request_data 可能绑定浏览器上下文（不仅仅是 URL）');
  }
  
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
