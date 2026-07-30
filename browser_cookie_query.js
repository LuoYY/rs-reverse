/**
 * browser_cookie_query.js — 用 Patchright 获取浏览器真实 cookie，注入沙箱启用 query 生成
 *
 * 流程：
 *   1. Patchright 加载 https://pmos.xj.sgcc.com.cn:20080/（自动处理 412→cookie→reload→200）
 *   2. 提取浏览器中的真实 O+P cookie
 *   3. 同时从浏览器捕获 XHR 请求中的 query 参数（作为验证基准）
 *   4. 创建全新沙箱（buildEnv），seedCookie 设为真实 O+P cookie
 *   5. 运行外层 VM
 *   6. 检查 flag 是否为 true
 *   7. 如果是，发 XHR POST，捕获沙箱生成的 query 值
 *   8. 对比沙箱 query 与浏览器 query
 *
 * 用法：nvm exec 22 node browser_cookie_query.js
 *
 * Patchright 引入：NODE_PATH=/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const fs = require('fs');
const path = require('path');
const https = require('https');
const vm = require('vm');

// Patchright from sibling project
const PATCHRIGHT_PATH = '/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules';
const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const OUTER_JS = path.join(__dirname, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');

function httpGet(url, cookies) {
  return new Promise(r => {
    var opts = { rejectUnauthorized: false, headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' } };
    if (cookies) opts.headers.Cookie = cookies;
    https.get(url, opts, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => r({ status: res.statusCode, body: b, headers: res.headers }));
    }).on('error', e => r({ status: 'ERR', body: '' }));
  });
}

// ============= Step 1: Patchright 获取浏览器真实 cookie + query =============
async function getBrowserCookieAndQuery() {
  console.log('[browser] Launching Patchright...');
  const { chromium } = require(path.join(PATCHRIGHT_PATH, 'patchright'));

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--ignore-certificate-errors'],
  });

  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();

  // Capture XHR requests to find query parameter
  var capturedQuery = null;
  var capturedUrl = null;
  var capturedRequestUrls = [];
  page.on('request', request => {
    var url = request.url();
    // Log ALL requests to see what RS modifies
    if (url.includes('20080') && !url.includes('.js') && !url.includes('.css') && !url.includes('.png')) {
      capturedRequestUrls.push({ method: request.method(), url: url.substring(0, 200) });
    }
    if (url.includes('r20SZOQm=')) {
      var match = url.match(/r20SZOQm=([^&]+)/);
      if (match) {
        capturedQuery = match[1];
        capturedUrl = url;
        console.log('[browser] Captured query:', match[1].substring(0, 60) + '...');
      }
    }
  });

  // Navigate to target - Patchright handles 412→cookie→reload automatically
  console.log('[browser] Navigating to', TARGET);
  try {
    await page.goto(TARGET, { waitUntil: 'networkidle', timeout: 30000 });
  } catch(e) {
    console.log('[browser] Navigation timeout (expected for RS):', e.message.substring(0, 80));
  }

  // Wait for page to stabilize
  await page.waitForTimeout(3000);

  // Reload to ensure RS gets the "validated" state (second load = 200)
  console.log('[browser] Reloading page to trigger RS validation state...');
  try {
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
  } catch(e) {
    console.log('[browser] Reload timeout:', e.message.substring(0, 80));
  }
  await page.waitForTimeout(3000);

  // Get cookies
  var cookies = await context.cookies();
  console.log('[browser] Cookie count:', cookies.length);
  var cookieStr = cookies.map(c => c.name + '=' + c.value).join('; ');
  console.log('[browser] Cookie string length:', cookieStr.length);

  var oCookie = cookies.find(c => c.name === 'aoU85Lxl9xxNO');
  var pCookie = cookies.find(c => c.name === 'aoU85Lxl9xxNP');
  console.log('[browser] O cookie:', oCookie ? oCookie.value.substring(0, 30) + '...' : 'null');
  console.log('[browser] P cookie:', pCookie ? pCookie.value.substring(0, 30) + '...' : 'null');
  console.log('[browser] P cookie length:', pCookie ? pCookie.value.length : 0);

  // If no query captured yet, try triggering an XHR from the page
  if (!capturedQuery) {
    console.log('[browser] No query captured yet, trying to trigger XHR...');

    // First, let's intercept ALL requests to see what the page does
    var allRequests = [];
    page.on('request', request => {
      var url = request.url();
      if (url.includes('20080') || url.includes('px-gateway') || url.includes('r20SZOQm')) {
        allRequests.push({ method: request.method(), url: url.substring(0, 120) });
      }
    });

    // Try making XHR POSTs to various endpoints
    var endpoints = [
      '/px-gateway/GatewayConfig/getGatewayConfig',
      '/px-gateway/security/login',
      '/px-system/api/system/index/selectByCondition',
    ];

    for (var ep of endpoints) {
      try {
        console.log('[browser] Trying XHR POST to', ep);
        var xhrResult = await page.evaluate(async (endpoint) => {
          return new Promise(resolve => {
            try {
              var xhr = new XMLHttpRequest();
              xhr.open('POST', endpoint, true);
              xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
              xhr.onreadystatechange = function() {
                if (xhr.readyState === 4) {
                  resolve({
                    status: xhr.status,
                    responseURL: xhr.responseURL,
                    responseText: xhr.responseText.substring(0, 100),
                  });
                }
              };
              xhr.send('{}');
              setTimeout(() => resolve({ status: -1, responseURL: '', responseText: 'timeout' }), 5000);
            } catch(e) {
              resolve({ status: -2, error: e.message });
            }
          });
        }, ep);
        console.log('[browser] XHR result:', JSON.stringify(xhrResult).substring(0, 120));
        await page.waitForTimeout(1000);
      } catch(e) {
        console.log('[browser] XHR error:', e.message.substring(0, 80));
      }
    }

    // Log all captured requests
    console.log('[browser] All requests captured:', capturedRequestUrls.length);
    capturedRequestUrls.slice(0, 20).forEach(r => console.log('  ', r.method, r.url));

    // Check: did the XHR to getGatewayConfig have query param?
    // The request interceptor should have caught it
    var gatewayReq = capturedRequestUrls.find(r => r.url.includes('getGatewayConfig'));
    if (gatewayReq) {
      console.log('\n[browser] GatewayConfig request URL:', gatewayReq.url);
      if (gatewayReq.url.includes('r20SZOQm=')) {
        var match = gatewayReq.url.match(/r20SZOQm=([^&]+)/);
        if (match) {
          capturedQuery = match[1];
          console.log('[browser] *** QUERY FOUND IN REQUEST! ***', match[1].substring(0, 60));
        }
      } else {
        console.log('[browser] No query param in GatewayConfig request');
        console.log('[browser] RS may not be hooking XHR in headless mode');
      }
    }

    // Check if RS is active on the page
    console.log('\n[browser] Checking RS state...');
    try {
      var rsState = await page.evaluate(() => {
        var result = {};
        // Check if XMLHttpRequest.prototype.open is hooked
        result.openHooked = XMLHttpRequest.prototype.open.toString().includes('[native code]') ||
                           !XMLHttpRequest.prototype.open.toString().includes('{ method');
        result.openSrc = XMLHttpRequest.prototype.open.toString().substring(0, 100);
        result.sendSrc = XMLHttpRequest.prototype.send.toString().substring(0, 100);
        // Check $_ts
        result.tsKeys = typeof $_ts !== 'undefined' ? Object.keys($_ts) : 'undefined';
        // Check if there's a meta tag with RS content
        var meta = document.querySelector('meta[content]');
        result.metaCount = document.querySelectorAll('meta').length;
        return result;
      });
      console.log('[browser] RS state:', JSON.stringify(rsState).substring(0, 200));
    } catch(e) {
      console.log('[browser] RS state check error:', e.message.substring(0, 80));
    }

    // KEY TEST: Create XHR in browser context and check if RS adds query
    console.log('\n[browser] Checking if RS hooks XHR prototype.open...');
    try {
      var xhrHookCheck = await page.evaluate(() => {
        // Check the ACTUAL prototype.open, not the toString
        var openFn = XMLHttpRequest.prototype.open;
        var sendFn = XMLHttpRequest.prototype.send;

        // Save original and create test XHR
        var xhr = new XMLHttpRequest();

        // Before open - check prototype
        var protoOpenBefore = openFn.toString().substring(0, 200);
        var protoSendBefore = sendFn.toString().substring(0, 200);

        // Call open
        xhr.open('POST', '/test-check-query', true);

        // After open - check instance properties
        var instanceProps = {};
        var propNames = Object.getOwnPropertyNames(xhr);
        for (var i = 0; i < propNames.length; i++) {
          var k = propNames[i];
          try {
            var v = xhr[k];
            instanceProps[k] = {
              type: typeof v,
              value: typeof v === 'boolean' ? v :
                     typeof v === 'string' ? v.substring(0, 60) :
                     typeof v === 'function' ? '[fn:' + v.toString().substring(0, 60) + ']' :
                     typeof v === 'number' ? v : String(v).substring(0, 40),
            };
          } catch(e) {}
        }

        // Check if prototype.open was modified by calling open
        var protoOpenAfter = XMLHttpRequest.prototype.open.toString().substring(0, 200);

        return {
          protoOpenBefore: protoOpenBefore,
          protoOpenAfter: protoOpenAfter,
          protoSendBefore: protoSendBefore,
          instanceProps: instanceProps,
          instancePropNames: propNames,
        };
      });
      console.log('[browser] XHR hook check:');
      console.log('  proto.open before:', xhrHookCheck.protoOpenBefore.substring(0, 100));
      console.log('  proto.open after:', xhrHookCheck.protoOpenAfter.substring(0, 100));
      console.log('  proto.send:', xhrHookCheck.protoSendBefore.substring(0, 100));
      console.log('  instance prop names:', JSON.stringify(xhrHookCheck.instancePropNames));
      console.log('  instance props:', JSON.stringify(xhrHookCheck.instanceProps).substring(0, 400));

      // Check for boolean flags
      if (xhrHookCheck.instanceProps) {
        var boolProps = Object.entries(xhrHookCheck.instanceProps).filter(function(e) { return e[1].type === 'boolean'; });
        console.log('  Boolean props:', JSON.stringify(boolProps));
        var fnProps = Object.entries(xhrHookCheck.instanceProps).filter(function(e) { return e[1].type === 'function'; });
        console.log('  Function props:', JSON.stringify(fnProps));
      }
    } catch(e) {
      console.log('[browser] XHR hook check error:', e.message.substring(0, 80));
    }
  }

  // Also try to get the $_ts from the page
  var tsData = null;
  try {
    tsData = await page.evaluate(() => {
      return {
        nsd: typeof $_ts !== 'undefined' ? $_ts.nsd : null,
        cd: typeof $_ts !== 'undefined' ? $_ts.cd : null,
        keys: typeof $_ts !== 'undefined' ? Object.keys($_ts) : [],
      };
    });
    console.log('[browser] $_ts keys:', tsData.keys);
    if (tsData.nsd) console.log('[browser] $_ts.nsd:', tsData.nsd);
  } catch(e) {
    console.log('[browser] Cannot read $_ts:', e.message.substring(0, 60));
  }

  // Get the page's current URL to check if it loaded successfully
  var pageUrl = page.url();
  var pageStatus = await page.evaluate(() => document.title).catch(() => 'error');
  console.log('[browser] Page URL:', pageUrl);
  console.log('[browser] Page title:', pageStatus);

  await browser.close();

  return {
    cookieStr,
    oCookie: oCookie ? oCookie.value : null,
    pCookie: pCookie ? pCookie.value : null,
    capturedQuery,
    capturedUrl,
    tsData,
  };
}

// ============= Step 2: 沙箱注入真实 cookie =============
async function sandboxWithRealCookie(browserData) {
  const { buildEnv } = require('./output/keygen/sandbox_keygen.js');
  const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');

  console.log('\n[sandbox] Building sandbox with real browser cookie...');
  console.log('[sandbox] Cookie length:', browserData.cookieStr.length);

  // We need fresh nsd/cd - use the one from browser if available, or fetch new
  var nsd, cd;
  if (browserData.tsData && browserData.tsData.nsd) {
    nsd = browserData.tsData.nsd;
    cd = browserData.tsData.cd;
    console.log('[sandbox] Using browser $_ts: nsd=', nsd);
  } else {
    console.log('[sandbox] No browser $_ts, fetching fresh challenge...');
    var ch = await httpGet(TARGET);
    var m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
    if (!m) { console.log('[sandbox] ERROR: no $_ts'); return null; }
    nsd = +m[1]; cd = m[2];
    console.log('[sandbox] Fresh nsd:', nsd);
  }

  const queryCapture = { value: null, url: null };

  function RSXHR() {}
  RSXHR.prototype = {
    readyState: 0, status: 0, responseText: '', responseURL: '',
    UNSENT: 0, OPENED: 1, HEADERS_RECEIVED: 2, LOADING: 3, DONE: 4,
    timeout: 0, withCredentials: false,
    open: function(method, url) { this._method = method; this._url = String(url); this._headers = {}; this.readyState = 1; },
    send: function(body) {
      var self = this;
      console.log('[sandbox XHR send] url:', self._url);
      if (self._url && self._url.includes('r20SZOQm=')) {
        var match = self._url.match(/r20SZOQm=([^&]+)/);
        if (match) {
          queryCapture.value = match[1];
          queryCapture.url = self._url;
          console.log('[sandbox XHR send] QUERY CAPTURED:', match[1].substring(0, 60));
        }
      }
      Promise.resolve().then(function() {
        if (self._url && self._url.includes('r20SZOQm=')) {
          var match2 = self._url.match(/r20SZOQm=([^&]+)/);
          if (match2) {
            queryCapture.value = match2[1];
            queryCapture.url = self._url;
          }
        }
        self.readyState = 4; self.status = 200;
        self.responseText = '{"status":0,"message":"Success","data":{}}';
        self.responseURL = self._url;
        if (self.onreadystatechange) { try { self.onreadystatechange(); } catch(e) {} }
        if (self.onload) { try { self.onload(); } catch(e) {} }
      });
    },
    setRequestHeader: function(k, v) { if (!this._headers) this._headers = {}; this._headers[k] = v; },
    abort: function() {}, overrideMimeType: function() {},
    getAllResponseHeaders: function() { return ''; }, getResponseHeader: function() { return null; },
    addEventListener: function(type, fn) { if (type === 'load') this.onload = fn; },
    removeEventListener: function() {},
    upload: { addEventListener: function() {}, removeEventListener: function() {} },
  };

  // Build sandbox with real cookie
  const env = buildEnv({ nsd, cd }, {
    outerJsCode,
    seedCookie: browserData.cookieStr,
    timeout: 30000,
  });
  env.sandbox.XMLHttpRequest = RSXHR;

  // Patch dynamic code: force trampoline exit code
  var origEval = env.sandbox.eval;
  var dynCode = null;
  env.sandbox.eval = function(code) {
    if (typeof code === 'string' && code.length > 50000) {
      dynCode = code;
      code = code.replace(/if\((\S+?)===1\)return\s+/g, 'if(true)return ');
    }
    return origEval.call(this, code);
  };

  // Run outer VM
  console.log('[sandbox] Running outer VM...');
  try {
    vm.runInContext(outerJsCode, env.proxied, { timeout: 30000, filename: 'outer.js' });
    console.log('[sandbox] Outer VM completed');
  } catch(e) {
    console.log('[sandbox] Outer VM error:', e.message.substring(0, 100));
  }
  await new Promise(r => setTimeout(r, 2000));

  // Check cookies generated in sandbox
  console.log('[sandbox] Cookies captured:', env.captured.cookies.length);
  var sandboxPCookie = env.captured.cookies.find(c => c.includes('P='));
  console.log('[sandbox] P cookie generated:', sandboxPCookie ? 'yes (' + sandboxPCookie.substring(0, 40) + '...)' : 'no');

  // Check RS hooks
  var rsOpen = RSXHR.prototype.open;
  var rsSend = RSXHR.prototype.send;
  console.log('[sandbox] prototype.open hooked:', rsOpen.toString().includes('[native'));

  // Find flag and trampoline
  var testXhr = new RSXHR();
  rsOpen.call(testXhr, 'POST', '/test', true);
  var ownProps = Object.getOwnPropertyNames(testXhr);
  var flagName = null, trampName = null;
  for (var k of ownProps) {
    if (k.startsWith('_') && typeof testXhr[k] === 'boolean') flagName = k;
    if (k.startsWith('_') && typeof testXhr[k] === 'function') trampName = k;
  }
  console.log('[sandbox] Flag:', flagName, '=', flagName ? testXhr[flagName] : 'N/A');
  console.log('[sandbox] Trampoline:', trampName);

  // Test trampoline directly
  if (trampName) {
    console.log('\n[sandbox] Testing trampoline...');
    var xhr = new RSXHR();
    rsOpen.call(xhr, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
    if (flagName) xhr[flagName] = true;

    var tramp = xhr[trampName];
    var result = tramp.call(xhr, '{"test":1}');
    console.log('[sandbox] Trampoline result type:', typeof result);
    console.log('[sandbox] Trampoline result value:', JSON.stringify(result)?.substring(0, 100));
    console.log('[sandbox] Trampoline result length:', result ? result.length : 0);

    if (typeof result === 'string' && result.length > 0) {
      console.log('[sandbox] *** NON-EMPTY TRAMPOLINE RESULT! ***');
      if (result.includes('r20SZOQm') || result.length > 50) {
        queryCapture.value = result;
        console.log('[sandbox] *** POTENTIAL QUERY VALUE! ***');
      }
    }
  }

  // Full XHR POST test
  console.log('\n[sandbox] Full XHR POST test...');
  var xhr2 = new RSXHR();
  xhr2.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
  if (flagName) xhr2[flagName] = true;
  xhr2.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
  xhr2.onreadystatechange = function() {
    console.log('[sandbox CB] readyState=' + xhr2.readyState + ' url=' + xhr2._url?.substring(0, 80));
  };
  xhr2.send('{}');
  console.log('[sandbox] After send: _url =', xhr2._url);

  await new Promise(r => setTimeout(r, 1000));

  // Also try in-context XHR
  console.log('\n[sandbox] In-context XHR test...');
  try {
    var inCtxResult = vm.runInContext([
      'try {',
      '  var xhr = new XMLHttpRequest();',
      '  xhr.open("POST", "/px-gateway/GatewayConfig/getGatewayConfig", true);',
      '  var props = {};',
      '  for (var k in xhr) {',
      '    if (k.charAt(0) === "_" && typeof xhr[k] === "boolean") props[k] = xhr[k];',
      '  }',
      '  for (var k in xhr) { if (typeof xhr[k] === "boolean") xhr[k] = true; }',
      '  xhr.send("{}");',
      '  JSON.stringify({',
      '    url: xhr._url,',
      '    hasQuery: (xhr._url||"").indexOf("r20SZOQm") >= 0,',
      '    props: props,',
      '  });',
      '} catch(e) {',
      '  JSON.stringify({ error: e.message.substring(0, 80) });',
      '}',
    ].join('\n'), env.proxied, { timeout: 5000 });
    console.log('[sandbox] In-context result:', inCtxResult);
    var parsed = JSON.parse(inCtxResult);
    if (parsed.hasQuery) {
      var match = parsed.url.match(/r20SZOQm=([^&]+)/);
      if (match) queryCapture.value = match[1];
    }
  } catch(e) {
    console.log('[sandbox] In-context error:', e.message);
  }

  return { queryCapture, flagName, trampName, flagValue: flagName ? testXhr[flagName] : null };
}

// ============= Main =============
(async () => {
  console.log('=== Browser Cookie → Sandbox Query Injection ===\n');

  // Step 1: Get browser cookie + query
  var browserData = await getBrowserCookieAndQuery();
  console.log('\n[browser] Query captured:', browserData.capturedQuery ? browserData.capturedQuery.substring(0, 60) + '...' : 'null');

  if (!browserData.pCookie) {
    console.log('\nERROR: No P cookie from browser');
    process.exit(1);
  }

  // Step 2: Sandbox with real cookie
  var sandboxResult = await sandboxWithRealCookie(browserData);

  // Summary
  console.log('\n=== FINAL RESULTS ===');
  console.log('Browser query:', browserData.capturedQuery || 'NOT CAPTURED');
  console.log('Sandbox query:', sandboxResult?.queryCapture?.value || 'NOT CAPTURED');
  console.log('Sandbox flag:', sandboxResult?.flagName, '=', sandboxResult?.flagValue);

  if (sandboxResult?.queryCapture?.value) {
    console.log('\n*** SUCCESS: Sandbox generated query! ***');
    console.log('Query value:', sandboxResult.queryCapture.value.substring(0, 80));
    if (browserData.capturedQuery) {
      console.log('Browser query:', browserData.capturedQuery.substring(0, 80));
      console.log('Match:', sandboxResult.queryCapture.value === browserData.capturedQuery);
    }
  } else {
    console.log('\nQuery not generated in sandbox.');
    console.log('Flag was:', sandboxResult?.flagValue);
    if (sandboxResult?.flagValue === false) {
      console.log('Flag is still false even with real cookie.');
      console.log('This means RS checks something beyond cookie existence.');
    }
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
