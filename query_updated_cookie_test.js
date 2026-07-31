/**
 * query_updated_cookie_test.js — 用浏览器更新后的 cookie 在 Node.js POST
 *
 * 发现：RS 在 send 时更新了 cookie，更新后的 cookie 允许 POST
 * 方案：
 * 1. 浏览器加载 → RS 初始化
 * 2. 浏览器发一次 XHR（让 RS 更新 cookie）
 * 3. 提取更新后的 cookie
 * 4. Node.js 用更新后的 cookie POST（不带 query）
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const { chromium } = require('patchright');
const https = require('https');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function nodeRequest(method, path, cookie, body) {
  return new Promise(function(resolve) {
    var headers = { 'Cookie': cookie, 'User-Agent': UA };
    if (method === 'POST') headers['Content-Type'] = 'application/json;charset=UTF-8';
    var req = https.request({
      hostname: 'pmos.xj.sgcc.com.cn', port: 20080, path, method,
      rejectUnauthorized: false, headers,
    }, function(res) {
      var d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', e => resolve({ error: e.message }));
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  console.log('=== 用浏览器更新后 cookie POST ===\n');

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true, userAgent: UA,
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

  // 获取 cookie（reload 后，RS 已初始化）
  var cookie1 = await client.send('Runtime.evaluate', { expression: 'document.cookie', returnByValue: true });
  console.log('  Cookie (after reload):', cookie1.result.value.substring(0, 60) + '...');

  // 发一次 XHR 让 RS 更新 cookie
  console.log('\n[3] 发 XHR 让 RS 更新 cookie...');
  var xhrResult = await client.send('Runtime.evaluate', {
    expression: `(function(){
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', false);
        xhr.send('{}');
        return JSON.stringify({status: xhr.status});
      } catch(e) { return JSON.stringify({error: e.message}); }
    })()`,
    returnByValue: true,
  });
  console.log('  XHR:', JSON.parse(xhrResult.result.value));

  // 获取更新后的 cookie
  var cookie2 = await client.send('Runtime.evaluate', { expression: 'document.cookie', returnByValue: true });
  console.log('  Cookie (after XHR):', cookie2.result.value.substring(0, 60) + '...');
  
  var cookieChanged = cookie1.result.value !== cookie2.result.value;
  console.log('  Cookie changed:', cookieChanged ? 'YES ★' : 'NO');

  // 也获取 HttpOnly 的 O cookie（document.cookie 读不到）
  var allCookies = await context.cookies();
  var fullCookie = allCookies.map(c => c.name + '=' + c.value).join('; ');
  console.log('\n  Full cookie (from context):', fullCookie.substring(0, 80) + '...');

  await browser.close();

  // ★ Node.js 用浏览器 cookie POST
  console.log('\n[4] Node.js 用浏览器 cookie POST...');
  
  // 先 GET 验证
  var getTest = await nodeRequest('GET', '/px-gateway/GatewayConfig/security', fullCookie);
  console.log('  GET:', getTest.status, getTest.status === 200 ? '✅' : '❌');

  // POST 不带 query
  console.log('\n[5] POST 不带 query...');
  var post1 = await nodeRequest('POST', '/px-gateway/GatewayConfig/getGatewayConfig', fullCookie, '{}');
  console.log('  Status:', post1.status, post1.status === 200 ? '✅' : '❌');
  console.log('  Body:', (post1.body || '').substring(0, 100));

  // POST 带 body
  console.log('\n[6] POST selectByCondition...');
  var body = JSON.stringify({"data":{"marketName":"","newMarketCode":"","newUrl":"","oldUrl":""},"pageInfo":{"pageSizes1":["20","50","100","200","500","1000"],"pageSizes":[20,50,100,200,500,1000],"pageSize":100,"pageNum":1}});
  var post2 = await nodeRequest('POST', '/px-common-authority/marketMapping/selectByCondition', fullCookie, body);
  console.log('  Status:', post2.status, post2.status === 200 ? '✅' : '❌');
  console.log('  Body:', (post2.body || '').substring(0, 100));

  // POST captcha
  console.log('\n[7] POST captcha...');
  var post3 = await nodeRequest('POST', '/px-common-authcenter/auth/v2/captcha/get', fullCookie, '{}');
  console.log('  Status:', post3.status, post3.status === 200 ? '✅' : '❌');
  console.log('  Body:', (post3.body || '').substring(0, 100));

  console.log('\n=== 总结 ===');
  console.log('GET:', getTest.status);
  console.log('POST getGatewayConfig:', post1.status);
  console.log('POST selectByCondition:', post2.status);
  console.log('POST captcha:', post3.status);
  
  var postOk = [post1, post2].every(r => r.status === 200);
  if (postOk) {
    console.log('\n★★★★★ Node.js POST 成功！ ★★★★★');
    console.log('★ 方案：浏览器获取 cookie → Node.js POST（不需要 query）');
    console.log('★ 不需要逆向 query 加密算法！');
  }
  
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
