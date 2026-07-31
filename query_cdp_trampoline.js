/**
 * query_cdp_trampoline.js — 在浏览器中用 CDP 直接调用 RS trampoline
 *
 * 之前验证：CDP Runtime.evaluate 发 XHR 时 RS 自动追加 query
 * 现在：用 CDP 检查 XHR 实例上的 trampoline 函数并直接调用
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

  // 1. 检查 XHR 实例上的 trampoline
  console.log('\n=== 检查 XHR trampoline ===');
  const trampCheck = await client.send('Runtime.evaluate', {
    expression: `(function(){
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
      
      var props = {};
      var allProps = Object.getOwnPropertyNames(xhr);
      for (var k of allProps) {
        try {
          var v = xhr[k];
          if (typeof v === 'function') props[k] = { type: 'fn', src: v.toString().substring(0, 100) };
          else if (typeof v === 'boolean') props[k] = { type: 'bool', value: v };
          else if (typeof v === 'string' && v.length > 3) props[k] = { type: 'str', value: v.substring(0, 40) };
          else if (typeof v === 'number') props[k] = { type: 'num', value: v };
        } catch(e) {}
      }
      
      return JSON.stringify(props);
    })()`,
    returnByValue: true,
  });
  console.log('Trampoline check:', trampCheck.result.value);

  // 2. 直接调用 trampoline
  console.log('\n=== 直接调用 trampoline ===');
  const trampCall = await client.send('Runtime.evaluate', {
    expression: `(function(){
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
      
      // 找到 trampoline 函数
      var tramp = null;
      var trampName = null;
      var allProps = Object.getOwnPropertyNames(xhr);
      for (var k of allProps) {
        if (typeof xhr[k] === 'function' && k.startsWith('_$')) {
          tramp = xhr[k];
          trampName = k;
          break;
        }
      }
      
      if (!tramp) return JSON.stringify({ error: 'no trampoline found' });
      
      // 找到 boolean flag
      var flagName = null;
      for (var k of allProps) {
        if (typeof xhr[k] === 'boolean' && k.startsWith('_$')) {
          flagName = k;
          break;
        }
      }
      
      // 强制 flag = true
      if (flagName) xhr[flagName] = true;
      
      // 调用 trampoline
      var result;
      try {
        result = tramp.call(xhr, '{}');
      } catch(e) {
        result = 'error: ' + e.message.substring(0, 60);
      }
      
      return JSON.stringify({
        trampName: trampName,
        flagName: flagName,
        flagValue: flagName ? xhr[flagName] : null,
        result: typeof result === 'string' ? result.substring(0, 200) : String(result),
        resultLen: typeof result === 'string' ? result.length : 0,
        url: xhr._url || 'no _url',
      });
    })()`,
    returnByValue: true,
  });
  console.log('Trampoline call:', trampCall.result.value);

  // 3. 用不同的参数调用 trampoline
  console.log('\n=== 不同参数调用 trampoline ===');
  const paramTests = [
    { label: 'url only', expr: 'tramp.call(xhr, "/px-gateway/GatewayConfig/getGatewayConfig")' },
    { label: 'url+body', expr: 'tramp.call(xhr, "/px-gateway/GatewayConfig/getGatewayConfig", "{}")' },
    { label: 'method+url', expr: 'tramp.call(xhr, "POST", "/px-gateway/GatewayConfig/getGatewayConfig")' },
    { label: 'method+url+body', expr: 'tramp.call(xhr, "POST", "/px-gateway/GatewayConfig/getGatewayConfig", "{}")' },
    { label: 'xhr instance', expr: 'tramp.call(xhr, xhr)' },
    { label: 'no args', expr: 'tramp.call(xhr)' },
  ];

  for (const test of paramTests) {
    const result = await client.send('Runtime.evaluate', {
      expression: `(function(){
        var xhr = new XMLHttpRequest();
        xhr.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
        var tramp = null;
        var allProps = Object.getOwnPropertyNames(xhr);
        for (var k of allProps) {
          if (typeof xhr[k] === 'function' && k.startsWith('_$')) { tramp = xhr[k]; break; }
        }
        if (!tramp) return 'no tramp';
        for (var k of allProps) {
          if (typeof xhr[k] === 'boolean' && k.startsWith('_$')) { xhr[k] = true; break; }
        }
        try {
          var r = ${test.expr.replace(/tramp\.call\(xhr/g, 'tramp.call(xhr')};
          return typeof r === 'string' ? r.substring(0, 100) : String(r);
        } catch(e) { return 'err: ' + e.message.substring(0, 50); }
      })()`,
      returnByValue: true,
    });
    console.log(`  ${test.label}: ${result.result.value?.substring(0, 80)}`);
  }

  // 4. 用 send() 而不是直接调用 trampoline
  console.log('\n=== 用 send() 检查 URL 修改 ===');
  const sendCheck = await client.send('Runtime.evaluate', {
    expression: `(function(){
      var xhr = new XMLHttpRequest();
      var origUrl = '/px-gateway/GatewayConfig/getGatewayConfig';
      
      // Hook 原始 open 来捕获 URL
      var origOpen = XMLHttpRequest.prototype.open;
      var capturedUrls = [];
      
      // 先调用 open（RS 会 hook）
      xhr.open('POST', origUrl, true);
      
      // 找到 boolean flag 并强制 true
      var allProps = Object.getOwnPropertyNames(xhr);
      for (var k of allProps) {
        if (typeof xhr[k] === 'boolean' && k.startsWith('_$')) { xhr[k] = true; break; }
      }
      
      // 调用 send
      xhr.send('{}');
      
      // 检查 xhr 的所有属性是否有 URL
      var urlProps = {};
      for (var k of Object.getOwnPropertyNames(xhr)) {
        try {
          var v = xhr[k];
          if (typeof v === 'string' && v.length > 10 && (v.indexOf('r20SZOQm') >= 0 || v.indexOf('px-') >= 0)) {
            urlProps[k] = v.substring(0, 100);
          }
        } catch(e) {}
      }
      
      return JSON.stringify({
        responseURL: xhr.responseURL || '',
        urlProps: urlProps,
        status: xhr.status,
      });
    })()`,
    returnByValue: true,
  });
  console.log('Send check:', sendCheck.result.value);

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
