/**
 * query_fresh_replay2.js — 用管线 cookie + 浏览器 query 重放
 * 
 * 浏览器 cookie 在 Node.js GET 中返回 412
 * 但管线 cookie 100% 有效
 * 方案：用管线 cookie 作为浏览器 seedCookie → 浏览器生成 query → Node.js 重放
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const { chromium } = require('patchright');
const https = require('https');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function nodePost(path, cookie, query, body) {
  return new Promise(function(resolve) {
    var fullUrl = path + (query ? '?r20SZOQm=' + query : '');
    var req = https.request({
      hostname: 'pmos.xj.sgcc.com.cn', port: 20080, path: fullUrl, method: 'POST',
      rejectUnauthorized: false,
      headers: { 'Cookie': cookie, 'User-Agent': UA, 'Content-Type': 'application/json;charset=UTF-8',
        'Origin': TARGET.replace(/\/$/, ''), 'Referer': TARGET, 'Accept': 'application/json, text/plain, */*' },
    }, function(res) { var d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve({status:res.statusCode,body:d})); });
    req.on('error', e => resolve({error:e.message}));
    req.write(body||'{}'); req.end();
  });
}

function nodeGet(path, cookie) {
  return new Promise(function(resolve) {
    var req = https.request({
      hostname: 'pmos.xj.sgcc.com.cn', port: 20080, path, method: 'GET',
      rejectUnauthorized: false, headers: { 'Cookie': cookie, 'User-Agent': UA },
    }, function(res) { var d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve({status:res.statusCode,body:d})); });
    req.on('error', e => resolve({error:e.message})); req.end();
  });
}

(async () => {
  console.log('=== 管线 cookie + 浏览器 query 重放 ===\n');

  // Step 1: 管线生成 cookie
  console.log('[1] 管线生成 cookie...');
  const { PmosXjClientProxy } = require('./pmos_xj_client_proxy');
  const { httpGet } = require('./proxy_http');
  
  var pipeClient = new PmosXjClientProxy();
  await pipeClient.init();
  var pipeCookie = pipeClient.cookieHeader;
  console.log('  管线 cookie ready');
  
  // 验证
  var getTest = await nodeGet('/px-gateway/GatewayConfig/security', pipeCookie);
  console.log('  GET test:', getTest.status);
  
  if (getTest.status !== 200) {
    console.log('  管线 cookie 无效');
    process.exit(1);
  }

  // Step 2: 浏览器中用管线 cookie 生成 query
  console.log('\n[2] 浏览器中生成 query...');
  
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true, userAgent: UA,
    proxy: { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' },
  });
  
  // 注入管线 cookie
  var parts = pipeCookie.split('; ');
  for (var p of parts) {
    var eq = p.indexOf('=');
    if (eq > 0) {
      await context.addCookies([{
        name: p.substring(0, eq), value: p.substring(eq + 1),
        domain: 'pmos.xj.sgcc.com.cn', path: '/', secure: true, httpOnly: p.startsWith('aoU85Lxl9xxNO'),
      }]);
    }
  }
  
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  
  console.log('  加载页面...');
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(5000);
  
  // 检查 RS 是否加载
  var rsCheck = await cdp.send('Runtime.evaluate', {
    expression: 'Function.prototype.toString.call(XMLHttpRequest.prototype.send).substring(0,30)',
    returnByValue: true,
  });
  console.log('  RS send:', rsCheck.result.value.substring(0, 40));
  
  if (rsCheck.result.value.indexOf('function _') !== 0) {
    console.log('  RS 未加载，reload...');
    await page.reload({ timeout: 120000 }).catch(() => {});
    await page.waitForTimeout(8000);
  }

  // 生成 query
  var ENDPOINT = '/px-common-authority/marketMapping/selectByCondition';
  var BODY = '{"data":{"marketName":"","newMarketCode":"","newUrl":"","oldUrl":""},"pageInfo":{"pageSizes1":["20","50","100","200","500","1000"],"pageSizes":[20,50,100,200,500,1000],"pageSize":100,"pageNum":1}}';

  var genResult = await cdp.send('Runtime.evaluate', {
    expression: `(function(){
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', ${JSON.stringify(ENDPOINT)}, false);
        xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
        xhr.send(${JSON.stringify(BODY)});
        var qMatch = (xhr.responseURL || '').match(/r20SZOQm=([^&]+)/);
        return JSON.stringify({ status: xhr.status, query: qMatch ? qMatch[1] : '', body: (xhr.responseText||'').substring(0,80) });
      } catch(e) { return JSON.stringify({error: e.message}); }
    })()`,
    returnByValue: true,
  });
  var gen = JSON.parse(genResult.result.value);
  console.log('  浏览器 status:', gen.status);
  console.log('  浏览器 query:', gen.query ? gen.query.substring(0,50)+'...' : 'none');
  console.log('  浏览器 body:', gen.body);

  // 获取浏览器最新 cookie（RS 可能更新了）
  var browserCookieResult = await cdp.send('Runtime.evaluate', { expression: 'document.cookie', returnByValue: true });
  var latestCookie = browserCookieResult.result.value;

  await browser.close();

  if (!gen.query) { console.log('FATAL: 无 query'); process.exit(1); }

  // Step 3: ★ 立即在 Node.js 中重放
  console.log('\n[3] ★ 立即重放（管线 cookie + 浏览器 query + 原始 body）...');
  var t0 = Date.now();
  var r1 = await nodePost(ENDPOINT, pipeCookie, gen.query, BODY);
  console.log('  status:', r1.status, '(' + (Date.now()-t0) + 'ms)');
  console.log('  body:', (r1.body||'').substring(0,100));

  // 用浏览器 cookie 重放
  console.log('\n[4] 用浏览器最新 cookie 重放...');
  var r2 = await nodePost(ENDPOINT, latestCookie, gen.query, BODY);
  console.log('  status:', r2.status);
  console.log('  body:', (r2.body||'').substring(0,100));

  // 测试不同 body
  console.log('\n[5] 不同 body 重放...');
  var r3 = await nodePost(ENDPOINT, pipeCookie, gen.query, '{"test":1}');
  console.log('  status:', r3.status);
  console.log('  body:', (r3.body||'').substring(0,100));

  // 测试空 body
  console.log('\n[6] 空 body 重放...');
  var r4 = await nodePost(ENDPOINT, pipeCookie, gen.query, '{}');
  console.log('  status:', r4.status);
  console.log('  body:', (r4.body||'').substring(0,100));

  // 多次重放
  console.log('\n[7] 多次重放...');
  for (var i = 0; i < 3; i++) {
    var r = await nodePost(ENDPOINT, pipeCookie, gen.query, BODY);
    console.log('  [' + i + ']', r.status, (r.body||'').substring(0,60));
  }

  // 延迟重放
  console.log('\n[8] 延迟重放（时间窗口）...');
  for (var delay of [10, 30, 60]) {
    await new Promise(r => setTimeout(r, delay * 1000));
    var r = await nodePost(ENDPOINT, pipeCookie, gen.query, BODY);
    console.log('  ' + delay + 's:', r.status, (r.body||'').substring(0,60));
    if (r.status !== 200) { console.log('  ★ 过期'); break; }
  }

  console.log('\n=== 总结 ===');
  if (r1.status === 200 || r2.status === 200) {
    console.log('★★★ query 可重放！ ★★★');
    console.log('原始 body:', r1.status === 200 ? 'OK' : 'FAIL');
    console.log('不同 body:', r3.status === 200 ? 'OK → query 与 body 无关' : 'FAIL → query 与 body 有关');
    console.log('空 body:', r4.status === 200 ? 'OK' : 'FAIL');
  } else {
    console.log('query 不可重放（即使立即重放）');
    console.log('→ query 绑定浏览器上下文');
  }
  
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
