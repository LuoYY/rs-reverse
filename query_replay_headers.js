/**
 * query_replay_headers.js — 检查请求头差异
 *
 * Node.js POST 400 可能是请求头问题
 * 对比浏览器和 Node.js 的请求头
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const { chromium } = require('patchright');
const https = require('https');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  console.log('=== 检查请求头差异 ===\n');

  // Step 1: 浏览器中捕获 POST 请求的完整请求头
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
  
  // 捕获 POST 请求的完整头
  var capturedHeaders = null;
  var capturedQuery = null;
  
  client.on('Network.requestWillBeSent', function(params) {
    if (params.request.url.indexOf('r20SZOQm=') >= 0 && params.request.method === 'POST') {
      capturedHeaders = params.request.headers;
      capturedQuery = (params.request.url.match(/r20SZOQm=([^&]+)/) || [])[1];
      console.log('[Browser] POST 请求头:');
      Object.keys(capturedHeaders).forEach(function(k) {
        console.log('  ' + k + ': ' + capturedHeaders[k].substring(0, 80));
      });
    }
  });
  
  // 也捕获响应
  client.on('Network.responseReceived', function(params) {
    if (params.response.url.indexOf('r20SZOQm=') >= 0) {
      console.log('\n[Browser] POST 响应:');
      console.log('  status:', params.response.status);
      console.log('  headers:');
      Object.keys(params.response.headers || {}).forEach(function(k) {
        console.log('    ' + k + ': ' + String(params.response.headers[k]).substring(0, 60));
      });
    }
  });

  console.log('[1] 加载...');
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(5000);
  console.log('[2] Reload...');
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(8000);

  // 获取 cookie
  var cookieResult = await client.send('Runtime.evaluate', { expression: 'document.cookie', returnByValue: true });
  var browserCookie = cookieResult.result.value;
  
  // 触发 POST
  console.log('\n[3] 触发 POST...');
  var postResult = await client.send('Runtime.evaluate', {
    expression: `(function(){
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', false);
        xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
        xhr.send('{}');
        return JSON.stringify({status: xhr.status, body: (xhr.responseText||'').substring(0, 80)});
      } catch(e) { return JSON.stringify({error: e.message}); }
    })()`,
    returnByValue: true,
  });
  console.log('  POST result:', postResult.result.value);

  await page.waitForTimeout(1000);
  await browser.close();

  if (!capturedQuery) {
    console.log('FATAL: 未捕获到 POST 请求');
    process.exit(1);
  }

  console.log('\n captured query:', capturedQuery.substring(0, 50) + '...');

  // Step 2: Node.js 用完全相同的头重放
  console.log('\n[4] Node.js 用浏览器头重放...');

  function nodePostWithHeaders(urlPath, cookie, query, body, extraHeaders) {
    return new Promise(function(resolve) {
      var fullUrl = urlPath + '?r20SZOQm=' + query;
      
      var headers = {
        'Cookie': cookie,
        'User-Agent': UA,
      };
      
      // 添加浏览器的头
      if (extraHeaders) {
        Object.keys(extraHeaders).forEach(function(k) {
          if (k.toLowerCase() !== 'cookie' && k.toLowerCase() !== 'content-length') {
            headers[k] = extraHeaders[k];
          }
        });
      }
      
      // 确保 Content-Type
      if (!headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json;charset=UTF-8';
      }

      var options = {
        hostname: 'pmos.xj.sgcc.com.cn',
        port: 20080,
        path: fullUrl,
        method: 'POST',
        rejectUnauthorized: false,
        headers: headers,
      };

      var req = https.request(options, function(res) {
        var data = '';
        res.on('data', function(chunk) { data += chunk; });
        res.on('end', function() {
          resolve({ status: res.statusCode, body: data, headers: res.headers });
        });
      });
      req.on('error', function(e) { resolve({ error: e.message }); });
      req.write(body || '{}');
      req.end();
    });
  }

  // 用浏览器的完整头重放
  var result1 = await nodePostWithHeaders(
    '/px-gateway/GatewayConfig/getGatewayConfig',
    browserCookie,
    capturedQuery,
    '{}',
    capturedHeaders
  );
  console.log('  浏览器头重放:');
  console.log('    status:', result1.status);
  console.log('    body:', (result1.body || '').substring(0, 80));

  // 用管线 cookie + 浏览器头
  const { PmosXjClientProxy } = require('./pmos_xj_client_proxy');
  const { httpGet } = require('./proxy_http');
  var pipeClient = new PmosXjClientProxy();
  await pipeClient.init();
  var pipeCookie = pipeClient.cookieHeader;
  
  var result2 = await nodePostWithHeaders(
    '/px-gateway/GatewayConfig/getGatewayConfig',
    pipeCookie,
    capturedQuery,
    '{}',
    capturedHeaders
  );
  console.log('\n  管线 cookie + 浏览器头:');
  console.log('    status:', result2.status);
  console.log('    body:', (result2.body || '').substring(0, 80));

  // 不带 query 的 POST（测试是否是 query 问题还是其他）
  console.log('\n[5] 不带 query 的 POST...');
  var result3 = await new Promise(function(resolve) {
    var options = {
      hostname: 'pmos.xj.sgcc.com.cn',
      port: 20080,
      path: '/px-gateway/GatewayConfig/getGatewayConfig',
      method: 'POST',
      rejectUnauthorized: false,
      headers: {
        'Cookie': pipeCookie,
        'User-Agent': UA,
        'Content-Type': 'application/json;charset=UTF-8',
      },
    };
    var req = https.request(options, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() { resolve({ status: res.statusCode, body: data }); });
    });
    req.on('error', function(e) { resolve({ error: e.message }); });
    req.write('{}');
    req.end();
  });
  console.log('  不带 query POST:');
  console.log('    status:', result3.status);
  console.log('    body:', (result3.body || '').substring(0, 80));

  // GET 测试（确认 cookie 有效）
  console.log('\n[6] GET 测试（确认 cookie 有效）...');
  var getResult = await new Promise(function(resolve) {
    https.get('https://pmos.xj.sgcc.com.cn:20080/px-gateway/GatewayConfig/security', {
      rejectUnauthorized: false,
      headers: { 'Cookie': pipeCookie, 'User-Agent': UA },
    }, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() { resolve({ status: res.statusCode, body: data }); });
    });
  });
  console.log('  GET status:', getResult.status);
  console.log('  GET body:', (getResult.body || '').substring(0, 80));

  console.log('\n=== 总结 ===');
  console.log('GET:', getResult.status);
  console.log('POST 无 query:', result3.status);
  console.log('POST 有 query(浏览器头):', result1.status);
  console.log('POST 有 query(管线cookie):', result2.status);

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
