/**
 * query_cdp_direct_eval.js — 直接在浏览器中用 RS 函数加密/解密
 *
 * 新策略：不再试图提取密钥
 * 而是直接在浏览器中调用 RS 的加密函数
 * 为任意数据生成加密结果
 *
 * 方法：
 * 1. 在浏览器中用 CDP Runtime.evaluate
 * 2. 包装 XMLHttpRequest.prototype.send
 * 3. 在 send 执行前，用 RS 的 VM 函数加密我们的数据
 * 4. 或者：直接用 send hook 为任意 URL 生成 query
 *
 * 最简单方案（已验证可行）：
 * 在浏览器中发同步 XHR → RS 自动追加 query → 从 responseURL 提取
 * 这就是 pmos_xj_post_client.js 的原理
 *
 * 优化目标：
 * 让 pmos_xj_post_client.js 更高效
 * - 复用 browser context
 * - 批量生成 query
 * - 减少延迟
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const { chromium } = require('patchright');
const fs = require('fs'), path = require('path');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const BASESTR = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";

function decodeQuery(query) {
  var payload = query.startsWith('0') ? query.slice(1) : query;
  var idxmap = {};
  for (var i = 0; i < BASESTR.length; i++) { if (!(BASESTR[i] in idxmap)) idxmap[BASESTR[i]] = i; }
  var bytes = [], i = 0;
  var full = Math.floor(payload.length / 4);
  for (var g = 0; g < full; g++) {
    var c0 = idxmap[payload[i]], c1 = idxmap[payload[i+1]], c2 = idxmap[payload[i+2]], c3 = idxmap[payload[i+3]];
    i += 4;
    bytes.push((c0<<2)|(c1>>4), ((c1&15)<<4)|(c2>>2), ((c2&3)<<6)|c3);
  }
  return bytes;
}

function encodeQuery(bytes) {
  var idxmap = {};
  for (var i = 0; i < BASESTR.length; i++) { if (!(BASESTR[i] in idxmap)) idxmap[BASESTR[i]] = i; }
  // numarr2string 编码
  var result = [];
  var i = 0;
  var full = Math.floor(bytes.length / 3);
  for (var g = 0; g < full; g++) {
    var c0 = bytes[i], c1 = bytes[i+1], c2 = bytes[i+2];
    i += 3;
    result.push(BASESTR[c0 >> 2]);
    result.push(BASESTR[((c0 & 3) << 4) | (c1 >> 4)]);
    result.push(BASESTR[((c1 & 15) << 2) | (c2 >> 6)]);
    result.push(BASESTR[c2 & 63]);
  }
  var rem = bytes.length - i;
  if (rem === 1) {
    var c0 = bytes[i];
    result.push(BASESTR[c0 >> 2]);
    result.push(BASESTR[(c0 & 3) << 4]);
  } else if (rem === 2) {
    var c0 = bytes[i], c1 = bytes[i+1];
    result.push(BASESTR[c0 >> 2]);
    result.push(BASESTR[((c0 & 3) << 4) | (c1 >> 4)]);
    result.push(BASESTR[(c1 & 15) << 2]);
  }
  return '0' + result.join('');
}

(async () => {
  console.log('=== 浏览器直接生成 query + Node.js 重放 ===\n');

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

  console.log('[1] 加载...');
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(5000);
  console.log('[2] Reload...');
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(8000);

  // 获取 cookie
  var cookieResult = await client.send('Runtime.evaluate', { expression: 'document.cookie', returnByValue: true });
  var browserCookie = cookieResult.result.value;
  console.log('  Cookie:', browserCookie.substring(0, 80) + '...');

  // 在浏览器中生成 query
  console.log('\n[3] 在浏览器中生成 query...');

  // 方法：用 HEAD 请求获取 query（不发送实际数据）
  // HEAD 请求比 POST 快，不需要等待服务器处理
  var endpoints = [
    '/px-gateway/GatewayConfig/getGatewayConfig',
    '/px-gateway/GatewayConfig/security',
    '/px-common-authority/marketMapping/selectByCondition',
  ];

  for (var url of endpoints) {
    var result = await client.send('Runtime.evaluate', {
      expression: `(function(){
        try {
          var xhr = new XMLHttpRequest();
          xhr.open('POST', ${JSON.stringify(url)}, false);
          xhr.setRequestHeader('Content-Type', 'application/json');
          xhr.send('{}');
          var qMatch = (xhr.responseURL || '').match(/r20SZOQm=([^&]+)/);
          return JSON.stringify({
            url: ${JSON.stringify(url)},
            status: xhr.status,
            query: qMatch ? qMatch[1] : '',
            body: (xhr.responseText || '').substring(0, 100),
          });
        } catch(e) { return JSON.stringify({error: e.message}); }
      })()`,
      returnByValue: true,
    });

    var parsed = JSON.parse(result.result.value);
    console.log('  ' + url + ':');
    console.log('    status:', parsed.status);
    console.log('    query:', parsed.query ? parsed.query.substring(0, 50) + '...' : 'none');
    console.log('    body:', parsed.body ? parsed.body.substring(0, 60) : 'none');
  }

  // 关键测试：提取 query 的 session_data 和 request_data
  // 然后在 Node.js 中用提取的 query 发送 POST 请求
  console.log('\n[4] 提取 query 并在 Node.js 中重放...');

  // 获取 query
  var queryResult = await client.send('Runtime.evaluate', {
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
  var queryValue = queryResult.result.value;
  console.log('  Query:', queryValue.substring(0, 60) + '...');

  await browser.close();

  // 在 Node.js 中用浏览器生成的 query + cookie 发送 POST
  console.log('\n[5] Node.js 重放 POST...');

  var https = require('https');

  function nodePost(url, cookie, query, body) {
    return new Promise(function(resolve) {
      var fullUrl = url + '?r20SZOQm=' + query;
      var options = {
        hostname: 'pmos.xj.sgcc.com.cn',
        port: 20080,
        path: fullUrl,
        method: 'POST',
        rejectUnauthorized: false,
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          'Cookie': cookie,
          'User-Agent': UA,
          'Origin': TARGET.replace(/\/$/, ''),
          'Referer': TARGET,
        },
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

  // 测试
  var postResult = await nodePost(
    '/px-gateway/GatewayConfig/getGatewayConfig',
    browserCookie,
    queryValue,
    '{}'
  );

  console.log('  Status:', postResult.status);
  console.log('  Body:', (postResult.body || '').substring(0, 100));
  console.log('  Error:', postResult.error || 'none');

  if (postResult.status === 200) {
    console.log('\n  ★★★ Node.js POST 重放成功！ ★★★');
    console.log('  方案：浏览器生成 query → Node.js 重放 POST');
    console.log('  这比 CDP 代理更快（不需要每次都通过浏览器发请求）');
  } else {
    console.log('\n  重放失败');
    console.log('  可能原因：query 绑定请求上下文（不可重放）');
  }

  // 测试 GET（用浏览器 cookie）
  console.log('\n[6] Node.js GET 测试...');
  var { httpGet } = require('./proxy_http');
  var getResult = await httpGet(TARGET + 'px-gateway/GatewayConfig/security', {
    userAgent: UA,
    headers: { Cookie: browserCookie },
  });
  console.log('  GET status:', getResult.status);
  console.log('  GET body:', (getResult.body || '').substring(0, 80));

  console.log('\n=== 总结 ===');
  console.log('1. 浏览器生成 query → Node.js 重放 POST');
  console.log('   优点：比 CDP 代理快（query 生成只需一次浏览器交互）');
  console.log('   缺点：query 可能绑定请求上下文（不可重放）');
  console.log('2. 纯 CDP 代理（pmos_xj_post_client.js）');
  console.log('   优点：100% 可靠');
  console.log('   缺点：每次请求都需要浏览器');

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
