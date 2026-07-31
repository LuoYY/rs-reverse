/**
 * query_sync_xhr.js — 同步 XHR 调用 trampoline
 * 之前验证：同步 XHR（async=false）→ RS 追加 query
 * 现在：直接调用 trampoline（同步 XHR 创建的实例）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs'), path = require('path');
const ROOT = __dirname, TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';

(async () => {
  const { chromium } = require('patchright');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    proxy: { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' },
  });

  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  await client.send('Runtime.enable');

  console.log('Loading...');
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(5000);
  console.log('Reload...');
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(15000);

  // 1. 同步 XHR 验证 RS 追加 query
  console.log('\n=== 同步 XHR 验证 ===');
  const syncResult = await client.send('Runtime.evaluate', {
    expression: `(function(){
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', false);
      xhr.send('{}');
      return JSON.stringify({
        status: xhr.status,
        url: (xhr.responseURL || '').substring(0, 100),
        hasQuery: (xhr.responseURL || '').indexOf('r20SZOQm=') >= 0,
      });
    })()`,
    returnByValue: true,
  });
  console.log('Sync XHR:', syncResult.result.value);

  // 2. 在同步 XHR 实例上调用 trampoline
  console.log('\n=== 同步 XHR 实例上调用 trampoline ===');
  const trampResult = await client.send('Runtime.evaluate', {
    expression: `(function(){
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', false);
      xhr.send('{}');
      
      // 找到 trampoline 函数和 flag
      var allProps = Object.getOwnPropertyNames(xhr);
      var tramp = null, flagName = null;
      for (var k of allProps) {
        if (typeof xhr[k] === 'function' && k.startsWith('_$')) { tramp = xhr[k]; }
        if (typeof xhr[k] === 'boolean' && k.startsWith('_$')) { flagName = k; }
      }
      
      if (!tramp) return JSON.stringify({ error: 'no trampoline' });
      
      // 强制 flag = true
      if (flagName) xhr[flagName] = true;
      
      // 调用 trampoline
      var result;
      try {
        result = tramp.call(xhr, '{}');
      } catch(e) { result = 'err: ' + e.message.substring(0, 50); }
      
      return JSON.stringify({
        trampName: allProps.find(function(k) { return typeof xhr[k] === 'function' && k.startsWith('_$'); }),
        flagName: flagName,
        result: typeof result === 'string' ? result.substring(0, 100) : String(result),
        resultLen: typeof result === 'string' ? result.length : 0,
      });
    })()`,
    returnByValue: true,
  });
  console.log('Trampoline call:', trampResult.result.value);

  // 3. 用第二个同步 XHR 直接调用 trampoline（不 send）
  console.log('\n=== 第二个同步 XHR（只 open 不 send）调用 trampoline ===');
  const tramp2 = await client.send('Runtime.evaluate', {
    expression: `(function(){
      // 第一个 XHR（生成 cookie + query）
      var xhr1 = new XMLHttpRequest();
      xhr1.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', false);
      xhr1.send('{}');
      
      // 第二个 XHR（只 open，调用 trampoline）
      var xhr2 = new XMLHttpRequest();
      xhr2.open('POST', '/px-common-authority/marketMapping/selectByCondition', false);
      
      var allProps = Object.getOwnPropertyNames(xhr2);
      var tramp = null, flagName = null;
      for (var k of allProps) {
        if (typeof xhr2[k] === 'function' && k.startsWith('_$')) { tramp = xhr2[k]; }
        if (typeof xhr2[k] === 'boolean' && k.startsWith('_$')) { flagName = k; }
      }
      
      if (!tramp) return JSON.stringify({ error: 'no trampoline on xhr2' });
      if (flagName) xhr2[flagName] = true;
      
      var result;
      try { result = tramp.call(xhr2, '{}'); } catch(e) { result = 'err'; }
      
      return JSON.stringify({
        result: typeof result === 'string' ? result.substring(0, 100) : String(result),
        resultLen: typeof result === 'string' ? result.length : 0,
        url2: xhr2.responseURL || '',
      });
    })()`,
    returnByValue: true,
  });
  console.log('Trampoline on xhr2:', tramp2.result.value);

  // 4. 检查 RS 是否在 send 时生成 query（不是 trampoline）
  console.log('\n=== 检查 send 时 URL 修改 ===');
  const sendCheck = await client.send('Runtime.evaluate', {
    expression: `(function(){
      var xhr = new XMLHttpRequest();
      var origUrl = '/px-common-authority/marketMapping/selectByCondition';
      xhr.open('POST', origUrl, false);
      
      // 在 send 前检查 URL
      var beforeUrl = xhr._url || '';
      
      xhr.send('{}');
      
      // 在 send 后检查 URL
      var afterUrl = xhr.responseURL || '';
      
      return JSON.stringify({
        beforeUrl: beforeUrl.substring(0, 80),
        afterUrl: afterUrl.substring(0, 80),
        hasQuery: afterUrl.indexOf('r20SZOQm=') >= 0,
        status: xhr.status,
      });
    })()`,
    returnByValue: true,
  });
  console.log('Send check:', sendCheck.result.value);

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
