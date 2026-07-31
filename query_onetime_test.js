/**
 * query_onetime_test.js — 验证 query 是否一次性 + 浏览器内重放
 *
 * 关键发现：RS 在 send 时更新了 P cookie
 * 需要验证：
 * 1. 浏览器中同一个 query 能否用于第二次请求（一次性验证）
 * 2. 浏览器中能否手动用旧 cookie + 旧 query 发请求
 * 3. query 是否包含 cookie 的 hash
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const { chromium } = require('patchright');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  console.log('=== Query 一次性验证 ===\n');

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

  // 测试 1：浏览器中连续发两次相同请求
  console.log('\n[3] 浏览器中连续两次相同请求（验证 query 是否一次性）...');
  
  // 第一次请求
  var r1 = await client.send('Runtime.evaluate', {
    expression: `(function(){
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', false);
        xhr.send('{}');
        var q = (xhr.responseURL||'').match(/r20SZOQm=([^&]+)/);
        return JSON.stringify({ status: xhr.status, query: q?q[1]:'', body: (xhr.responseText||'').substring(0,60) });
      } catch(e) { return JSON.stringify({error:e.message}); }
    })()`,
    returnByValue: true,
  });
  var j1 = JSON.parse(r1.result.value);
  console.log('  第一次:', j1.status, 'query:', j1.query ? j1.query.substring(0,40)+'...' : 'none');

  // 第二次请求（同样的 URL）
  var r2 = await client.send('Runtime.evaluate', {
    expression: `(function(){
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', false);
        xhr.send('{}');
        var q = (xhr.responseURL||'').match(/r20SZOQm=([^&]+)/);
        return JSON.stringify({ status: xhr.status, query: q?q[1]:'', body: (xhr.responseText||'').substring(0,60) });
      } catch(e) { return JSON.stringify({error:e.message}); }
    })()`,
    returnByValue: true,
  });
  var j2 = JSON.parse(r2.result.value);
  console.log('  第二次:', j2.status, 'query:', j2.query ? j2.query.substring(0,40)+'...' : 'none');

  // query 是否相同？
  console.log('  Query 相同:', j1.query === j2.query ? 'YES' : 'NO（每次生成新 query）');

  // 测试 2：用第一次的 query 手动发请求（绕过 RS send hook）
  console.log('\n[4] 用第一次的 query 手动发请求（绕过 RS）...');
  
  // 保存第一次的 query 和 cookie
  var savedQuery = j1.query;
  var cookieBefore = await client.send('Runtime.evaluate', { expression: 'document.cookie', returnByValue: true });
  
  // 用 fetch 发请求（fetch 不被 RS hook）
  var r3 = await client.send('Runtime.evaluate', {
    expression: `(function(){
      try {
        // 用 fetch 绕过 RS 的 send hook
        var url = '/px-gateway/GatewayConfig/getGatewayConfig?r20SZOQm=' + ${JSON.stringify(savedQuery)};
        // fetch 是异步的，返回 Promise
        return 'fetch_sent';
      } catch(e) { return e.message; }
    })()`,
    returnByValue: true,
  });
  
  // 用同步 XHR 但手动添加 query 到 URL
  // RS 的 send hook 会再次追加 query，导致 URL 有两个 query
  // 所以我们需要绕过 RS 的 hook
  
  // 方法：直接用原生 send（不经过 RS hook）
  // 但 RS 替换了 prototype.send，我们无法绕过
  
  // 替代方法：在浏览器中用 fetch（异步）
  console.log('\n[5] 用 fetch 测试（绕过 RS send hook）...');
  
  // 先用 fetch 不带 query（验证 fetch 是否被 RS 处理）
  var fetchResult1 = await client.send('Runtime.evaluate', {
    expression: `(async function(){
      try {
        var resp = await fetch('/px-gateway/GatewayConfig/getGatewayConfig', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        var text = await resp.text();
        return JSON.stringify({ status: resp.status, body: text.substring(0,80), url: resp.url.substring(0,80) });
      } catch(e) { return JSON.stringify({error: e.message}); }
    })()`,
    returnByValue: true,
    awaitPromise: true,
  });
  var fr1 = JSON.parse(fetchResult1.result.value);
  console.log('  fetch 不带 query:', fr1.status, fr1.body ? fr1.body.substring(0,60) : fr1.error);
  console.log('  fetch url:', fr1.url);
  
  // 用 fetch 带旧 query
  var fetchResult2 = await client.send('Runtime.evaluate', {
    expression: `(async function(){
      try {
        var url = '/px-gateway/GatewayConfig/getGatewayConfig?r20SZOQm=' + ${JSON.stringify(savedQuery)};
        var resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        var text = await resp.text();
        return JSON.stringify({ status: resp.status, body: text.substring(0,80) });
      } catch(e) { return JSON.stringify({error: e.message}); }
    })()`,
    returnByValue: true,
    awaitPromise: true,
  });
  var fr2 = JSON.parse(fetchResult2.result.value);
  console.log('  fetch 带旧 query:', fr2.status, fr2.body ? fr2.body.substring(0,60) : fr2.error);
  
  if (fr2.status === 200) {
    console.log('  ★★★ 旧 query 在 fetch 中可用！ ★★★');
    console.log('  → query 不是一次性的');
    console.log('  → RS 的 send hook 做了额外处理（更新 cookie 等）');
    console.log('  → fetch 绕过了 RS 的处理，所以旧 query 仍然有效');
  } else {
    console.log('  → 旧 query 在 fetch 中也不可用');
  }

  // 测试 3：用 fetch 带新 query（RS 没处理 fetch）
  console.log('\n[6] 用 fetch 发 POST（RS 不 hook fetch？）...');
  
  // 先生成一个新 query（通过 XHR）
  var newQueryResult = await client.send('Runtime.evaluate', {
    expression: `(function(){
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', '/px-gateway/GatewayConfig/security', false);
        xhr.send('{}');
        var q = (xhr.responseURL||'').match(/r20SZOQm=([^&]+)/);
        return q ? q[1] : '';
      } catch(e) { return ''; }
    })()`,
    returnByValue: true,
  });
  var newQuery = newQueryResult.result.value;
  console.log('  新 query:', newQuery ? newQuery.substring(0,40)+'...' : 'none');
  
  // 用 fetch 带这个 query 请求 security
  var fetchResult3 = await client.send('Runtime.evaluate', {
    expression: `(async function(){
      try {
        var url = '/px-gateway/GatewayConfig/security?r20SZOQm=' + ${JSON.stringify(newQuery)};
        var resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        var text = await resp.text();
        return JSON.stringify({ status: resp.status, body: text.substring(0,80) });
      } catch(e) { return JSON.stringify({error: e.message}); }
    })()`,
    returnByValue: true,
    awaitPromise: true,
  });
  var fr3 = JSON.parse(fetchResult3.result.value);
  console.log('  fetch 带新 query:', fr3.status, fr3.body ? fr3.body.substring(0,60) : fr3.error);

  // 测试 4：fetch 不带 query 但带正确 cookie
  console.log('\n[7] fetch 不带 query...');
  var fetchResult4 = await client.send('Runtime.evaluate', {
    expression: `(async function(){
      try {
        var resp = await fetch('/px-gateway/GatewayConfig/getGatewayConfig', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        var text = await resp.text();
        return JSON.stringify({ status: resp.status, bodyLen: text.length, body: text.substring(0,60) });
      } catch(e) { return JSON.stringify({error: e.message}); }
    })()`,
    returnByValue: true,
    awaitPromise: true,
  });
  var fr4 = JSON.parse(fetchResult4.result.value);
  console.log('  fetch 无 query:', fr4.status, fr4.body || fr4.error);

  await browser.close();

  console.log('\n=== 总结 ===');
  console.log('XHR 第一次:', j1.status);
  console.log('XHR 第二次:', j2.status);
  console.log('Query 相同:', j1.query === j2.query ? 'YES' : 'NO');
  console.log('fetch 无 query:', fr1.status);
  console.log('fetch 旧 query:', fr2.status);
  console.log('fetch 新 query:', fr3.status);
  
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
