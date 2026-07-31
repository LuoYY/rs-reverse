/**
 * query_cdp_deep.js — 深入检查 RS hook 机制
 *
 * 发现：prototype.send 断点未命中 → RS 没替换 send
 * 检查：RS 是否用 Object.defineProperty accessor？是否 hook open？
 * 策略：在 open 上设断点 + 检查属性描述符
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';

(async () => {
  const { chromium } = require('patchright');

  console.log('=== 深入检查 RS hook 机制 ===\n');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--ignore-certificate-errors'],
  });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  await client.send('Debugger.enable');
  await client.send('Runtime.enable');

  const capturedQueries = [];
  context.on('request', req => {
    const url = req.url();
    if (url.includes('r20SZOQm=')) {
      const m = url.match(/r20SZOQm=([^&]+)/);
      if (m) capturedQueries.push({ method: req.method(), path: new URL(url).pathname, query: m[1] });
    }
  });

  // Step 1: 加载页面
  console.log('[Step 1] 加载页面...');
  await page.goto(TARGET, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(3000);

  // Step 2: 检查属性描述符
  console.log('\n[Step 2] 检查 XHR prototype 属性描述符...');
  const descCheck = await page.evaluate(() => {
    const results = {};
    const proto = XMLHttpRequest.prototype;
    const props = ['open', 'send', 'setRequestHeader', 'abort', 'getAllResponseHeaders'];

    for (const p of props) {
      const desc = Object.getOwnPropertyDescriptor(proto, p);
      if (desc) {
        results[p] = {
          hasValue: 'value' in desc,
          hasGetter: 'get' in desc,
          hasSetter: 'set' in desc,
          configurable: desc.configurable,
          enumerable: desc.enumerable,
          writable: desc.writable,
          valueIsFunction: desc.value ? typeof desc.value === 'function' : false,
          valueToString: desc.value ? desc.value.toString().substring(0, 60) : null,
        };
      }
    }

    // 也检查 XMLHttpRequest 构造器本身
    const ctorDesc = Object.getOwnPropertyDescriptor(window, 'XMLHttpRequest');
    results.XMLHttpRequest = {
      hasValue: 'value' in ctorDesc,
      hasGetter: 'get' in ctorDesc,
      hasSetter: 'set' in ctorDesc,
      configurable: ctorDesc.configurable,
      writable: ctorDesc.writable,
    };

    return results;
  }).catch(e => {
    console.log('  Error:', e.message);
    return {};
  });

  console.log('  Property descriptors:', JSON.stringify(descCheck, null, 2));

  // Step 3: 在 open 上设断点
  console.log('\n[Step 3] 在 XHR.open 上设断点...');
  const openResult = await client.send('Runtime.evaluate', {
    expression: 'XMLHttpRequest.prototype.open',
  });

  if (openResult.result.objectId) {
    let openBpHit = false;
    let openCallFrame = null;

    client.on('Debugger.paused', async (event) => {
      console.log('\n  *** DEBUGGER PAUSED on open ***');
      console.log(`  Call frames: ${event.callFrames.length}`);

      openBpHit = true;

      for (let i = 0; i < Math.min(event.callFrames.length, 8); i++) {
        const frame = event.callFrames[i];
        console.log(`\n  Frame ${i}: ${frame.functionName || '(anon)'}`);
        console.log(`    Script: ${frame.url || 'unknown'}`);
        console.log(`    Line: ${frame.location?.lineNumber}:${frame.location?.columnNumber}`);

        // 检查 arguments
        try {
          const argsResult = await client.send('Debugger.evaluateOnCallFrame', {
            callFrameId: frame.callFrameId,
            expression: `JSON.stringify(Array.from(arguments).map(a => typeof a === 'string' ? a.substring(0, 80) : typeof a))`,
            returnByValue: true,
          });
          console.log(`    args: ${argsResult.result.value}`);
        } catch (e) {}

        // 检查 this 上的 URL 属性
        try {
          const urlResult = await client.send('Debugger.evaluateOnCallFrame', {
            callFrameId: frame.callFrameId,
            expression: `
              var r = {};
              if (this._url) r._url = this._url.substring(0, 100);
              if (this.url) r.url = this.url.substring(0, 100);
              for (var k in this) {
                var v = this[k];
                if (typeof v === 'string' && v.length > 5) {
                  if (v.includes('r20SZOQm') || v.includes('px-') || v.includes('?')) {
                    r[k] = v.substring(0, 100);
                  }
                }
              }
              JSON.stringify(r);
            `,
            returnByValue: true,
          });
          if (urlResult.result.value && urlResult.result.value !== '{}') {
            console.log(`    URL vars: ${urlResult.result.value}`);
          }
        } catch (e) {}

        // 检查局部变量中的字符串
        try {
          const strResult = await client.send('Debugger.evaluateOnCallFrame', {
            callFrameId: frame.callFrameId,
            expression: `
              var r = {};
              var scope = this;
              for (var k in scope) {
                var v = scope[k];
                if (typeof v === 'string' && v.length > 10 && v.length < 200) {
                  r[k] = v.substring(0, 80);
                }
              }
              JSON.stringify(r);
            `,
            returnByValue: true,
          });
          if (strResult.result.value && strResult.result.value !== '{}') {
            console.log(`    Strings: ${strResult.result.value.substring(0, 300)}`);
          }
        } catch (e) {}

        // 检查数组变量
        try {
          const arrResult = await client.send('Debugger.evaluateOnCallFrame', {
            callFrameId: frame.callFrameId,
            expression: `
              var r = {};
              for (var k in this) {
                var v = this[k];
                if (Array.isArray(v) && v.length > 0) {
                  var allBytes = v.every(function(x) { return typeof x === 'number' && x >= 0 && x <= 255; });
                  r[k] = 'arr[' + v.length + ']' + (allBytes ? ' bytes' : '');
                }
              }
              JSON.stringify(r);
            `,
            returnByValue: true,
          });
          if (arrResult.result.value && arrResult.result.value !== '{}') {
            console.log(`    Arrays: ${arrResult.result.value}`);
          }
        } catch (e) {}

        // 特别检查 frame 0 的 arguments（open 的参数）
        if (i === 0) {
          openCallFrame = frame;
        }
      }

      await client.send('Debugger.resume');
    });

    try {
      const bp = await client.send('Debugger.setBreakpointOnFunctionCall', {
        objectId: openResult.result.objectId,
      });
      console.log(`  Open breakpoint: ${bp.breakpointId}`);
    } catch (e) {
      console.log(`  Open breakpoint error: ${e.message.substring(0, 100)}`);
    }

    // Step 4: Reload
    console.log('\n[Step 4] Reload...');
    await page.reload({ waitUntil: 'load', timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(15000);

    console.log(`\n  Captured queries: ${capturedQueries.length}`);
    console.log(`  Open breakpoint hit: ${openBpHit}`);

    if (openBpHit) {
      console.log('\n  *** Open breakpoint was hit! RS hooks open! ***');
    }
  }

  // Step 5: 如果 open 断点也没命中，检查其他 hook 方式
  if (capturedQueries.length > 0) {
    console.log('\n[Step 5] 检查其他 hook 方式...');

    // 检查 Service Worker
    const swCheck = await page.evaluate(async () => {
      const regs = await navigator.serviceWorker?.getRegistrations().catch(() => []);
      return {
        hasSW: !!navigator.serviceWorker,
        registrations: regs ? regs.length : 0,
      };
    }).catch(() => ({ hasSW: false, registrations: 0 }));
    console.log('  Service Worker:', JSON.stringify(swCheck));

    // 检查 PerformanceObserver / Resource entries
    const resourceCheck = await page.evaluate(() => {
      const entries = performance.getEntriesByType('resource');
      const apiEntries = entries.filter(e => e.name.includes('r20SZOQm='));
      return {
        totalResources: entries.length,
        apiResources: apiEntries.length,
        firstApiUrl: apiEntries[0]?.name?.substring(0, 100),
      };
    }).catch(() => null);
    console.log('  Resources:', JSON.stringify(resourceCheck));

    // 检查 window 上的自定义属性
    const windowCheck = await page.evaluate(() => {
      const custom = [];
      const standard = new Set(['document', 'window', 'self', 'name', 'location', 'customElements',
        'history', 'navigation', 'locationbar', 'menubar', 'personalbar', 'scrollbars',
        'statusbar', 'toolbar', 'status', 'closed', 'frames', 'length', 'top', 'opener',
        'parent', 'frameElement', 'navigator', 'origin', 'external', 'screen', 'visualViewport',
        'innerWidth', 'innerHeight', 'outerWidth', 'outerHeight', 'devicePixelRatio',
        'clientInformation', 'screenX', 'screenY', 'screenLeft', 'screenTop',
        'styleMedia', 'ondevicemotion', 'ondeviceorientation', 'ondeviceorientationabsolute',
        'print', 'stop', 'alert', 'confirm', 'prompt', 'scroll', 'scrollTo', 'scrollBy',
        'open', 'close', 'postMessage', 'captureEvents', 'releaseEvents', 'getComputedStyle',
        'getSelection', 'matchMedia', 'find', 'createImageBitmap', 'fetch', 'onmessage',
        'onmessageerror', 'onbeforeinput', 'onbeforematch', 'onbeforetoggle', 'onbeforexrselect',
        'oncontentvisibilityautostatechange', 'scrollend', 'onscrollend', 'onresize',
        'onscroll', 'onfullscreenchange', 'onfullscreenerror', 'getScreenDetails',
        'reportError', 'structuredClone', 'queueMicrotask', 'atob', 'btoa', 'setTimeout',
        'setInterval', 'clearTimeout', 'clearInterval', 'addEventListener', 'removeEventListener',
        'dispatchEvent', 'requestAnimationFrame', 'cancelAnimationFrame',
        'requestIdleCallback', 'cancelIdleCallback', 'XMLHttpRequest', 'DOMParser',
        'Image', 'Option', 'Audio', 'Event', 'CustomEvent', 'MessageEvent', 'ProgressEvent',
        'Promise', 'PromiseRejectionEvent', 'Symbol', 'Proxy', 'Reflect', 'Math', 'JSON',
        'Date', 'RegExp', 'Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError',
        'EvalError', 'URIError', 'Array', 'String', 'Number', 'Boolean', 'Object',
        'Function', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Uint8Array', 'Uint16Array',
        'Uint32Array', 'Int8Array', 'Int16Array', 'Int32Array', 'Float32Array', 'Float64Array',
        'ArrayBuffer', 'SharedArrayBuffer', 'DataView', 'TextEncoder', 'TextDecoder',
        'Intl', 'WebAssembly', 'crypto', 'performance', 'console', 'localStorage',
        'sessionStorage', 'indexedDB', 'caches', 'originAgentCluster', 'crossOriginIsolated',
        'scheduler', 'cookieStore', 'onpageswap', 'onpagereveal', 'onscrollend',
        'navigator', 'chrome', 'Notification', 'ServiceWorker', 'SharedWorker',
        'WebSocket', 'EventSource', 'BroadcastChannel', 'MessageChannel', 'MessagePort',
        'MutationObserver', 'ResizeObserver', 'IntersectionObserver', 'PerformanceObserver',
        'ReportingObserver', 'AbortController', 'AbortSignal', 'ReadableStream',
        'WritableStream', 'TransformStream', 'ByteLengthQueuingStrategy',
        'CountQueuingStrategy', 'Blob', 'File', 'FileReader', 'FileList', 'URL',
        'URLSearchParams', 'Headers', 'Request', 'Response', 'FormData', 'CanvasRenderingContext2D',
        'HTMLCanvasElement', 'HTMLImageElement', 'HTMLVideoElement', 'HTMLAudioElement',
        'HTMLInputElement', 'HTMLFormElement', 'HTMLSelectElement', 'HTMLTextAreaElement',
        'HTMLButtonElement', 'HTMLDivElement', 'HTMLSpanElement', 'HTMLAnchorElement',
        'HTMLElement', 'HTMLDocument', 'Document', 'Node', 'Element', 'Text', 'Comment',
        'DocumentFragment', 'ShadowRoot', 'Attr', 'NodeList', 'HTMLCollection',
        'DOMTokenList', 'NamedNodeMap', 'MutationRecord', 'CSSStyleDeclaration',
        'CSSRule', 'CSSStyleSheet', 'CSSStyleRule', 'MediaList', 'getComputedStyle',
        'matchMedia', 'devicePixelRatio', 'isSecureContext', 'crossOriginIsolated',
        'origin', 'name', 'status', 'closed', 'length', 'top', 'opener', 'parent',
        'frames', 'frameElement', 'navigator', 'external', 'screen', 'visualViewport',
        'innerWidth', 'innerHeight', 'outerWidth', 'outerHeight', 'screenX', 'screenY',
        'screenLeft', 'screenTop', 'styleMedia', 'ondevicemotion', 'ondeviceorientation',
        'ondeviceorientationabsolute', 'print', 'stop', 'alert', 'confirm', 'prompt',
        'scroll', 'scrollTo', 'scrollBy', 'open', 'close', 'postMessage',
        'captureEvents', 'releaseEvents', 'getComputedStyle', 'getSelection',
        'matchMedia', 'find', 'createImageBitmap', 'fetch', 'onmessage',
        'onmessageerror', 'onbeforeinput', 'onbeforematch', 'onbeforetoggle',
        'onbeforexrselect', 'oncontentvisibilityautostatechange', 'scrollend',
        'onscrollend', 'onresize', 'onscroll', 'onfullscreenchange', 'onfullscreenerror',
        'getScreenDetails', 'reportError', 'structuredClone', 'queueMicrotask',
        'atob', 'btoa', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
        'addEventListener', 'removeEventListener', 'dispatchEvent', 'requestAnimationFrame',
        'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback',
        'XMLHttpRequest', 'DOMParser', 'Image', 'Option', 'Audio', 'Event',
        'CustomEvent', 'MessageEvent', 'ProgressEvent', 'Promise',
        'PromiseRejectionEvent', 'Symbol', 'Proxy', 'Reflect', 'Math', 'JSON',
        'Date', 'RegExp', 'Error', 'TypeError', 'RangeError', 'SyntaxError',
        'ReferenceError', 'EvalError', 'URIError', 'Array', 'String', 'Number',
        'Boolean', 'Object', 'Function', 'Map', 'Set', 'WeakMap', 'WeakSet',
        'Uint8Array', 'Uint16Array', 'Uint32Array', 'Int8Array', 'Int16Array',
        'Int32Array', 'Float32Array', 'Float64Array', 'ArrayBuffer',
        'SharedArrayBuffer', 'DataView', 'TextEncoder', 'TextDecoder', 'Intl',
        'WebAssembly', 'crypto', 'performance', 'console', 'localStorage',
        'sessionStorage', 'indexedDB', 'caches', 'originAgentCluster',
        'crossOriginIsolated', 'scheduler', 'cookieStore', 'onpageswap',
        'onpagereveal', 'onscrollend', 'navigator', 'chrome', 'Notification',
        'ServiceWorker', 'SharedWorker', 'WebSocket', 'EventSource',
        'BroadcastChannel', 'MessageChannel', 'MessagePort', 'MutationObserver',
        'ResizeObserver', 'IntersectionObserver', 'PerformanceObserver',
        'ReportingObserver', 'AbortController', 'AbortSignal', 'ReadableStream',
        'WritableStream', 'TransformStream', 'ByteLengthQueuingStrategy',
        'CountQueuingStrategy', 'Blob', 'File', 'FileReader', 'FileList',
        'URL', 'URLSearchParams', 'Headers', 'Request', 'Response', 'FormData',
      ]);

      for (const k of Object.getOwnPropertyNames(window)) {
        if (!standard.has(k) && !k.startsWith('on') && k.length < 20) {
          try {
            const v = window[k];
            if (typeof v === 'function') {
              custom.push(k + ':fn');
            } else if (typeof v === 'object' && v !== null) {
              custom.push(k + ':obj');
            } else if (typeof v === 'string') {
              custom.push(k + ':str:' + v.substring(0, 20));
            }
          } catch (e) {}
        }
      }
      return custom;
    }).catch(() => []);
    console.log(`  Custom window props: ${windowCheck.length}`);
    windowCheck.slice(0, 20).forEach(p => console.log(`    ${p}`));
  }

  // 保存
  fs.writeFileSync(
    path.join(ROOT, 'output/capture-20080/query-cdp-deep.json'),
    JSON.stringify({
      timestamp: new Date().toISOString(),
      descCheck,
      capturedQueries: capturedQueries.map(q => ({ method: q.method, path: q.path, query: q.query })),
    }, null, 2)
  );

  await browser.close();
  process.exit(0);
})().catch(e => {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
