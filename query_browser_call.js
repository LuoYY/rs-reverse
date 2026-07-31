/**
 * query_browser_call.js — 在浏览器中找到并调用 RS query 生成函数
 *
 * RS 的 query 生成在 VM 内部
 * 但 VM 函数在动态代码闭包中
 * 通过 CDP Runtime.evaluate 可以访问主 context
 * 
 * 策略：
 * 1. 检查 window 上的所有变量（包括非 _$ 前缀）
 * 2. 检查 $_ts 的所有属性
 * 3. 检查 document 上的属性
 * 4. 尝试调用 $_ts.l__（唯一暴露的函数）
 * 5. 检查是否能通过 XHR 触发 query 生成
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

  const queries = [];
  context.on('request', req => {
    const url = req.url();
    if (url.includes('r20SZOQm=')) {
      const m = url.match(/r20SZOQm=([^&]+)/);
      if (m) queries.push({ method: req.method(), path: new URL(url).pathname, query: m[1] });
    }
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

  console.log(`Queries: ${queries.length}`);

  // 1. 检查 window 上的所有自定义属性
  console.log('\n=== Window custom properties ===');
  const winCheck = await client.send('Runtime.evaluate', {
    expression: `(function(){
      var standard = new Set(['document','window','self','name','location','customElements','history','navigation','locationbar','menubar','personalbar','scrollbars','statusbar','toolbar','status','closed','frames','length','top','opener','parent','frameElement','navigator','origin','external','screen','visualViewport','innerWidth','innerHeight','outerWidth','outerHeight','devicePixelRatio','screenX','screenY','screenLeft','screenTop','styleMedia','print','stop','alert','confirm','prompt','scroll','scrollTo','scrollBy','open','close','postMessage','captureEvents','releaseEvents','getComputedStyle','getSelection','matchMedia','find','createImageBitmap','fetch','onmessage','setTimeout','setInterval','clearTimeout','clearInterval','addEventListener','removeEventListener','dispatchEvent','requestAnimationFrame','cancelAnimationFrame','XMLHttpRequest','DOMParser','Image','Option','Audio','Event','Promise','Symbol','Proxy','Reflect','Math','JSON','Date','RegExp','Error','Array','String','Number','Boolean','Object','Function','Map','Set','WeakMap','WeakSet','Uint8Array','Uint16Array','Uint32Array','Int8Array','Int16Array','Int32Array','Float32Array','Float64Array','ArrayBuffer','DataView','TextEncoder','TextDecoder','Intl','WebAssembly','crypto','performance','console','localStorage','sessionStorage','indexedDB','atob','btoa','isNaN','isFinite','parseInt','parseFloat','NaN','Infinity','undefined','globalThis','encodeURIComponent','decodeURIComponent','encodeURI','decodeURI','escape','unescape','eval','Buffer','chrome','URL','URLSearchParams','Headers','Request','Response','FormData','Blob','File','FileReader','MutationObserver','ResizeObserver','IntersectionObserver','PerformanceObserver','AbortController','AbortSignal','ReadableStream','WritableStream','TransformStream']);
      var custom = [];
      for (var k of Object.getOwnPropertyNames(window)) {
        if (!standard.has(k) && !k.startsWith('on') && k.length < 30) {
          try {
            var v = window[k];
            var t = typeof v;
            if (t === 'function') custom.push(k + ':fn:' + (v.name || ''));
            else if (t === 'object' && v !== null) custom.push(k + ':obj{' + Object.keys(v).slice(0,5).join(',') + '}');
            else if (t !== 'undefined') custom.push(k + ':' + t + ':' + String(v).substring(0, 30));
          } catch(e) { custom.push(k + ':ERR'); }
        }
      }
      return JSON.stringify(custom);
    })()`,
    returnByValue: true,
  });
  const custom = JSON.parse(winCheck.result.value || '[]');
  console.log(`Custom props: ${custom.length}`);
  custom.forEach(p => console.log(`  ${p}`));

  // 2. 检查 $_ts
  console.log('\n=== $_ts ===');
  const tsCheck = await client.send('Runtime.evaluate', {
    expression: `(function(){
      var ts = window.$_ts || {};
      var r = {};
      for (var k of Object.keys(ts)) {
        var v = ts[k];
        if (typeof v === 'function') r[k] = 'fn:' + v.toString().substring(0, 80);
        else if (Array.isArray(v)) r[k] = 'arr[' + v.length + ']';
        else if (typeof v === 'object' && v !== null) r[k] = 'obj{' + Object.keys(v).slice(0,5).join(',') + '}';
        else r[k] = String(v).substring(0, 30);
      }
      return JSON.stringify(r);
    })()`,
    returnByValue: true,
  });
  console.log('$_ts:', tsCheck.result.value);

  // 3. 尝试通过 CDP 在主 context 中发 XHR
  // RS 应该 hook 了 XHR 并追加 query
  console.log('\n=== XHR via CDP ===');
  const xhrResult = await client.send('Runtime.evaluate', {
    expression: `(function(){
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', '/px-gateway/test-query', false);
        xhr.send('{}');
        return JSON.stringify({status: xhr.status, url: xhr.responseURL || 'no-url', respLen: xhr.responseText.length});
      } catch(e) { return JSON.stringify({error: e.message.substring(0, 80)}); }
    })()`,
    returnByValue: true,
  });
  console.log('XHR result:', xhrResult.result.value);

  // 4. 检查 XHR 发送后的 URL（是否被 RS 修改）
  console.log('\n=== Check XHR URL modification ===');
  const xhrCheck = await client.send('Runtime.evaluate', {
    expression: `(function(){
      // 创建 XHR 但不发送
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/px-gateway/test-check', true);
      
      // 检查 XHR 的所有属性
      var props = {};
      var allProps = Object.getOwnPropertyNames(xhr);
      // 也检查原型链上的属性
      var proto = Object.getPrototypeOf(xhr);
      var protoProps = Object.getOwnPropertyNames(proto);
      
      // 检查是否有 RS 设置的自定义属性
      for (var k of allProps) {
        try {
          var v = xhr[k];
          if (typeof v === 'function') props[k] = 'fn';
          else if (typeof v === 'string' && v.length > 5) props[k] = v.substring(0, 40);
          else if (typeof v === 'number') props[k] = v;
          else if (typeof v === 'boolean') props[k] = v;
        } catch(e) {}
      }
      
      return JSON.stringify({
        instProps: allProps,
        protoProps: protoProps.filter(function(p) { return !p.startsWith('on'); }),
        values: props
      });
    })()`,
    returnByValue: true,
  });
  console.log('XHR check:', xhrCheck.result.value?.substring(0, 500));

  // 5. 关键：在浏览器中同步发 XHR 并检查 responseURL
  console.log('\n=== Sync XHR with query check ===');
  const syncXhr = await client.send('Runtime.evaluate', {
    expression: `(function(){
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', false);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.send('{}');
        var url = xhr.responseURL || '';
        var qMatch = url.match(/r20SZOQm=([^&]+)/);
        return JSON.stringify({
          status: xhr.status,
          url: url.substring(0, 120),
          hasQuery: url.indexOf('r20SZOQm=') >= 0,
          query: qMatch ? qMatch[1].substring(0, 60) : null,
          body: xhr.responseText.substring(0, 60)
        });
      } catch(e) { return JSON.stringify({error: e.message.substring(0, 80)}); }
    })()`,
    returnByValue: true,
  });
  console.log('Sync XHR:', syncXhr.result.value);

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
