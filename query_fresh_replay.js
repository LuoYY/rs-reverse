/**
 * query_fresh_replay.js — 新鲜 query 立即重放测试
 *
 * 用户指出：不可重放可能是时间戳过期或幂等检查
 * 之前测试用的是旧数据（已过期）
 *
 * 方案：
 * 1. 浏览器生成新鲜 query
 * 2. 立即（< 1秒）在 Node.js 中重放
 * 3. 测试时间窗口
 * 4. 测试不同 body（验证 query 是否和 body 有关）
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const { chromium } = require('patchright');
const https = require('https');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function nodePost(path, cookie, query, body, extraHeaders) {
  return new Promise(function(resolve) {
    var headers = {
      'Cookie': cookie,
      'User-Agent': UA,
      'Content-Type': 'application/json;charset=UTF-8',
      'Origin': TARGET.replace(/\/$/, ''),
      'Referer': TARGET,
      'Accept': 'application/json, text/plain, */*',
    };
    if (extraHeaders) Object.assign(headers, extraHeaders);
    
    var fullUrl = path;
    if (query) fullUrl += '?r20SZOQm=' + query;
    
    var req = https.request({
      hostname: 'pmos.xj.sgcc.com.cn',
      port: 20080,
      path: fullUrl,
      method: 'POST',
      rejectUnauthorized: false,
      headers: headers,
    }, function(res) {
      var data = '';
      res.on('data', function(c) { data += c; });
      res.on('end', function() { resolve({ status: res.statusCode, body: data }); });
    });
    req.on('error', function(e) { resolve({ error: e.message }); });
    req.write(body || '{}');
    req.end();
  });
}

function nodeGet(path, cookie) {
  return new Promise(function(resolve) {
    var req = https.request({
      hostname: 'pmos.xj.sgcc.com.cn',
      port: 20080,
      path: path,
      method: 'GET',
      rejectUnauthorized: false,
      headers: { 'Cookie': cookie, 'User-Agent': UA },
    }, function(res) {
      var data = '';
      res.on('data', function(c) { data += c; });
      res.on('end', function() { resolve({ status: res.statusCode, body: data }); });
    });
    req.on('error', function(e) { resolve({ error: e.message }); });
    req.end();
  });
}

(async () => {
  console.log('=== 新鲜 query 立即重放 ===\n');

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
  console.log('  Cookie ready');

  // 验证 cookie 有效
  var getTest = await nodeGet('/px-gateway/GatewayConfig/security', browserCookie);
  console.log('  GET test:', getTest.status);

  if (getTest.status !== 200) {
    console.log('  Cookie 无效，退出');
    process.exit(1);
  }

  // 在浏览器中为 selectByCondition 生成 query
  var ENDPOINT = '/px-common-authority/marketMapping/selectByCondition';
  var BODY = '{"data":{"marketName":"","newMarketCode":"","newUrl":"","oldUrl":""},"pageInfo":{"pageSizes1":["20","50","100","200","500","1000"],"pageSizes":[20,50,100,200,500,1000],"pageSize":100,"pageNum":1}}';

  console.log('\n[3] 浏览器生成 query...');
  var genResult = await client.send('Runtime.evaluate', {
    expression: `(function(){
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', ${JSON.stringify(ENDPOINT)}, false);
        xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
        xhr.send(${JSON.stringify(BODY)});
        var qMatch = (xhr.responseURL || '').match(/r20SZOQm=([^&]+)/);
        return JSON.stringify({
          status: xhr.status,
          query: qMatch ? qMatch[1] : '',
          body: (xhr.responseText || '').substring(0, 100),
        });
      } catch(e) { return JSON.stringify({error: e.message}); }
    })()`,
    returnByValue: true,
  });
  
  var gen = JSON.parse(genResult.result.value);
  console.log('  浏览器 status:', gen.status);
  console.log('  浏览器 query:', gen.query ? gen.query.substring(0, 50) + '...' : 'none');
  console.log('  浏览器 body:', gen.body);

  if (!gen.query) {
    console.log('FATAL: 无 query');
    await browser.close();
    process.exit(1);
  }

  // ★ 立即在 Node.js 中重放（< 1 秒延迟）
  console.log('\n[4] ★ 立即重放（原始 body）...');
  var t0 = Date.now();
  var r1 = await nodePost(ENDPOINT, browserCookie, gen.query, BODY);
  var t1 = Date.now();
  console.log('  status:', r1.status, '(' + (t1 - t0) + 'ms)');
  console.log('  body:', (r1.body || '').substring(0, 100));

  // 测试不同 body
  console.log('\n[5] 重放（不同 body）...');
  var r2 = await nodePost(ENDPOINT, browserCookie, gen.query, '{"test":1}');
  console.log('  status:', r2.status);
  console.log('  body:', (r2.body || '').substring(0, 100));

  // 测试空 body
  console.log('\n[6] 重放（空 body）...');
  var r3 = await nodePost(ENDPOINT, browserCookie, gen.query, '');
  console.log('  status:', r3.status);
  console.log('  body:', (r3.body || '').substring(0, 100));

  // 测试不同端点（query 跨端点）
  console.log('\n[7] 重放（不同端点 getGatewayConfig）...');
  var r4 = await nodePost('/px-gateway/GatewayConfig/getGatewayConfig', browserCookie, gen.query, '{}');
  console.log('  status:', r4.status);
  console.log('  body:', (r4.body || '').substring(0, 100));

  // 多次重放（幂等检查）
  console.log('\n[8] 多次重放（幂等检查）...');
  for (var i = 0; i < 3; i++) {
    var r = await nodePost(ENDPOINT, browserCookie, gen.query, BODY);
    console.log('  [' + i + ']', r.status, (r.body || '').substring(0, 60));
  }

  // 时间窗口测试（延迟后重放）
  console.log('\n[9] 延迟后重放（时间窗口）...');
  for (var delay of [5, 10, 30, 60]) {
    console.log('  等待 ' + delay + ' 秒...');
    await new Promise(r => setTimeout(r, delay * 1000));
    var r = await nodePost(ENDPOINT, browserCookie, gen.query, BODY);
    console.log('  ' + delay + 's:', r.status, (r.body || '').substring(0, 60));
    if (r.status !== 200) {
      console.log('  ★ query 在 ' + delay + ' 秒后过期');
      break;
    }
  }

  await browser.close();
  
  console.log('\n=== 总结 ===');
  console.log('原始 body 重放:', r1.status);
  console.log('不同 body:', r2.status);
  console.log('空 body:', r3.status);
  console.log('跨端点:', r4.status);
  
  if (r1.status === 200) {
    console.log('\n★★★ query 可重放！ ★★★');
    if (r2.status === 200) {
      console.log('→ query 与 body 无关！');
    } else {
      console.log('→ query 与 body 有关！');
    }
  }
  
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
