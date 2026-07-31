/**
 * query_cookie_binding_test.js — 验证两个猜想
 * 
 * 猜想1：cookie 需要新鲜生成（旧 cookie 过期导致 412/400）
 * 猜想2：query 与 cookie 有关（query = f(body, cookie)）
 * 
 * 方案：
 * 1. 管线生成新鲜 cookie
 * 2. 浏览器用同一 cookie 生成 query
 * 3. Node.js 用同一 cookie + query 重放
 * 4. 关键：确保 cookie 是新鲜的，且浏览器和 Node.js 用同一个
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
  console.log('=== Cookie + Query 绑定测试 ===\n');

  // Step 1: 管线生成新鲜 cookie（每次测试都重新生成）
  console.log('[1] 管线生成新鲜 cookie...');
  const { PmosXjClientProxy } = require('./pmos_xj_client_proxy');
  const { httpGet } = require('./proxy_http');
  
  // 获取新挑战页
  var ch = await httpGet(TARGET, { userAgent: UA });
  var sc = [].concat(ch.headers['set-cookie'] || []);
  var oCookie = sc.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || sc.map(c => c.split(';')[0])[0];
  var m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  var nsd = +m[1], cd = m[2];
  console.log('  nsd:', nsd);
  
  var pipeClient = new PmosXjClientProxy();
  await pipeClient.init();
  var cp3 = pipeClient._extractCp3(nsd, cd);
  var ts = { nsd, cd, from: TARGET, hasDebug: false, keynameNum: 909, cp3Override: cp3 };
  var gen = await pipeClient._genCookie(ts, cp3);
  var pipeCookie = oCookie + '; ' + gen.name + '=' + gen.cookie;
  console.log('  Cookie ready, P cookie length:', gen.cookie.length);
  
  // 立即验证 cookie 有效
  var getTest = await nodeGet('/px-gateway/GatewayConfig/security', pipeCookie);
  console.log('  GET test (fresh cookie):', getTest.status, getTest.status === 200 ? '✅' : '❌');
  
  if (getTest.status !== 200) {
    console.log('  管线 cookie 无效！退出');
    process.exit(1);
  }

  // Step 2: 浏览器中用同一 cookie 生成 query
  console.log('\n[2] 浏览器中用同一 cookie 生成 query...');
  
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true, userAgent: UA,
    proxy: { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' },
  });
  
  // 注入管线 cookie
  for (var p of pipeCookie.split('; ')) {
    var eq = p.indexOf('=');
    if (eq > 0) {
      await context.addCookies([{
        name: p.substring(0, eq), value: p.substring(eq + 1),
        domain: 'pmos.xj.sgcc.com.cn', path: '/', secure: true,
        httpOnly: p.startsWith('aoU85Lxl9xxNO'),
      }]);
    }
  }
  
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  
  // 加载页面
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(5000);
  
  // 检查 RS
  var rsCheck = await cdp.send('Runtime.evaluate', {
    expression: 'Function.prototype.toString.call(XMLHttpRequest.prototype.send).substring(0,20)',
    returnByValue: true,
  });
  if (rsCheck.result.value.indexOf('function _') !== 0) {
    console.log('  RS 未加载，reload...');
    await page.reload({ timeout: 120000 }).catch(() => {});
    await page.waitForTimeout(8000);
  }
  
  // 获取浏览器中的 cookie（RS 可能更新了 P cookie）
  var browserCookieBefore = await cdp.send('Runtime.evaluate', { expression: 'document.cookie', returnByValue: true });
  console.log('  浏览器 cookie (before send):', browserCookieBefore.result.value.substring(0, 60) + '...');
  
  // 生成 query（简单端点）
  var ENDPOINT = '/px-gateway/GatewayConfig/getGatewayConfig';
  var BODY = '{}';
  
  var genResult = await cdp.send('Runtime.evaluate', {
    expression: `(function(){
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', ${JSON.stringify(ENDPOINT)}, false);
        xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
        xhr.send(${JSON.stringify(BODY)});
        var qMatch = (xhr.responseURL || '').match(/r20SZOQm=([^&]+)/);
        return JSON.stringify({ status: xhr.status, query: qMatch ? qMatch[1] : '', bodyLen: (xhr.responseText||'').length });
      } catch(e) { return JSON.stringify({error: e.message}); }
    })()`,
    returnByValue: true,
  });
  var qgen = JSON.parse(genResult.result.value);
  console.log('  浏览器 POST:', qgen.status, qgen.bodyLen > 0 ? '有响应' : '');
  console.log('  Query:', qgen.query ? qgen.query.substring(0, 50) + '...' : 'NONE');
  
  // 获取浏览器中的 cookie（send 后）
  var browserCookieAfter = await cdp.send('Runtime.evaluate', { expression: 'document.cookie', returnByValue: true });
  console.log('  浏览器 cookie (after send):', browserCookieAfter.result.value.substring(0, 60) + '...');
  
  // 检查 cookie 是否变化
  var cookieChanged = browserCookieBefore.result.value !== browserCookieAfter.result.value;
  console.log('  Cookie 变化:', cookieChanged ? 'YES ★（RS 更新了 cookie）' : 'NO');
  
  if (cookieChanged) {
    console.log('  Before:', browserCookieBefore.result.value.substring(0, 120));
    console.log('  After:', browserCookieAfter.result.value.substring(0, 120));
  }
  
  await browser.close();

  if (!qgen.query) { console.log('FATAL: 无 query'); process.exit(1); }

  // Step 3: ★ 立即重放 — 用管线原始 cookie
  console.log('\n[3] ★ 重放测试（管线原始 cookie）...');
  var r1 = await nodePost(ENDPOINT, pipeCookie, qgen.query, BODY);
  console.log('  管线 cookie + 浏览器 query:', r1.status, r1.status === 200 ? '✅' : '❌');
  console.log('  body:', (r1.body||'').substring(0, 80));

  // Step 4: ★ 重放 — 用浏览器更新后的 cookie
  if (cookieChanged) {
    console.log('\n[4] ★ 重放测试（浏览器更新后 cookie）...');
    var r2 = await nodePost(ENDPOINT, browserCookieAfter.result.value, qgen.query, BODY);
    console.log('  浏览器 cookie + 浏览器 query:', r2.status, r2.status === 200 ? '✅' : '❌');
    console.log('  body:', (r2.body||'').substring(0, 80));
  }

  // Step 5: 测试不同 body（验证 query 是否和 body 有关）
  console.log('\n[5] 不同 body 重放...');
  var r3 = await nodePost(ENDPOINT, pipeCookie, qgen.query, '{"different":"body"}');
  console.log('  不同 body:', r3.status, r3.status === 200 ? '✅ → query 与 body 无关' : '❌ → 可能与 body 有关');

  // Step 6: 测试不带 query
  console.log('\n[6] 不带 query...');
  var r4 = await nodePost(ENDPOINT, pipeCookie, null, BODY);
  console.log('  无 query:', r4.status);

  // Step 7: 测试 GET（确认 cookie 仍然有效）
  console.log('\n[7] GET（确认 cookie 仍有效）...');
  var getTest2 = await nodeGet('/px-gateway/GatewayConfig/security', pipeCookie);
  console.log('  GET:', getTest2.status);

  console.log('\n=== 总结 ===');
  console.log('管线 cookie GET:', getTest.status);
  console.log('浏览器 POST:', qgen.status);
  console.log('Node.js 重放(管线cookie):', r1.status);
  if (cookieChanged) console.log('Node.js 重放(浏览器cookie):', r2.status);
  console.log('不同 body:', r3.status);
  console.log('Cookie 变化:', cookieChanged ? 'YES' : 'NO');
  
  if (r1.status === 200) {
    console.log('\n★★★ query 可重放！ ★★★');
  } else if (cookieChanged && r2 && r2.status === 200) {
    console.log('\n★★★ query 需要浏览器更新后的 cookie！ ★★★');
    console.log('→ RS 在 send 时更新了 cookie');
    console.log('→ query 与更新后的 cookie 绑定');
  } else {
    console.log('\nquery 不可重放');
    console.log('→ query 可能与 cookie 内容绑定（hash/md5）');
  }
  
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
