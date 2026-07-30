// Capture query generation by hooking XMLHttpRequest at the lowest level
// RS dynamic code replaces XHR prototype methods through JSVMP
// We need to intercept AFTER RS hooks, by using a MutationObserver-like polling
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { chromium } = require('patchright');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' });
  const page = await context.newPage();

  // Capture the query at the network layer
  let capturedQuery = null;
  let capturedMethod = null;
  let capturedPath = null;
  context.on('request', req => {
    const url = req.url();
    if (url.includes('r20SZOQm=') && !capturedQuery) {
      capturedQuery = url.match(/r20SZOQm=([^&]+)/)?.[1];
      capturedMethod = req.method();
      capturedPath = new URL(url).pathname;
    }
  });

  await page.goto('https://pmos.xj.sgcc.com.cn:20080/', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);

  // Now the page is loaded, RS has hooked XHR
  // Use CDP to set a conditional breakpoint on XHR.open
  const client = await context.newCDPSession(page);
  await client.send('Debugger.enable');

  // Get all script IDs
  const scripts = {};
  client.on('Debugger.scriptParsed', e => { scripts[e.scriptId] = e.url || ''; });

  // Search for the RS dynamic code script (the one that contains the VM)
  // It should be a large eval'd script
  // We already know it's ~189KB

  // Strategy: use Runtime.evaluate to hook XHR.open AFTER RS hooks
  // RS hooks are in place. Now we wrap the RS-wrapped open.
  const hookResult = await client.send('Runtime.evaluate', {
    expression: `
      (function() {
        // Check if XHR.open is native or hooked
        var openStr = XMLHttpRequest.prototype.open.toString();
        var sendStr = XMLHttpRequest.prototype.send.toString();
        
        // If native, RS might use a different mechanism
        // RS might have created a wrapper around XMLHttpRequest constructor
        // Or it might use defineProperty to intercept
        
        // Check all properties on XHR prototype
        var props = {};
        var proto = XMLHttpRequest.prototype;
        var desc = Object.getOwnPropertyDescriptor(proto, 'open');
        if (desc) {
          props.openConfigurable = desc.configurable;
          props.openWritable = desc.writable;
          props.openHasGet = !!desc.get;
          props.openHasSet = !!desc.set;
          props.openValueStr = desc.value ? desc.value.toString().substring(0, 100) : 'no value';
        }
        
        // Check if there are extra properties on the prototype
        var ownNames = Object.getOwnPropertyNames(proto);
        props.ownNames = ownNames;
        
        // Check the constructor
        var ctorDesc = Object.getOwnPropertyDescriptor(window, 'XMLHttpRequest');
        props.ctorConfigurable = ctorDesc ? ctorDesc.configurable : 'N/A';
        props.ctorWritable = ctorDesc ? ctorDesc.writable : 'N/A';
        props.ctorHasGet = ctorDesc ? !!ctorDesc.get : 'N/A';
        
        return JSON.stringify({
          openIsNative: openStr.includes('[native code]'),
          openStr: openStr.substring(0, 200),
          sendIsNative: sendStr.includes('[native code]'),
          sendStr: sendStr.substring(0, 200),
          props: props,
        });
      })()
    `,
    returnByValue: true,
  });

  console.log('XHR state:', hookResult.result.value);

  // Now try to hook XHR.open to capture the RS query generation
  // We need to wrap the CURRENT open (which might be RS-hooked or native)
  const wrapResult = await client.send('Runtime.evaluate', {
    expression: `
      (function() {
        // Save the current open (might be RS-wrapped or native)
        var currentOpen = XMLHttpRequest.prototype.open;
        var currentSend = XMLHttpRequest.prototype.send;
        
        // Wrap open to capture URL changes
        var capturedUrls = [];
        XMLHttpRequest.prototype.open = function(method, url) {
          var urlBefore = String(url);
          // Store for later comparison
          this.__urlBefore = urlBefore;
          this.__method = method;
          
          // Call the real open
          var result = currentOpen.apply(this, arguments);
          
          // After open, RS might have set a hook on this instance
          // Check if URL changed
          return result;
        };
        
        // Wrap send to capture the final URL (with query)
        XMLHttpRequest.prototype.send = function(body) {
          var urlAfter = this.__urlBefore || '';
          
          // At this point, RS has already modified the URL to include query
          // The URL is stored internally in the XHR object
          // We can check responseURL after the request completes
          // But we need the request URL, not response URL
          
          // RS modifies the URL by calling open again with the modified URL
          // So our open hook should have captured it
          
          if (this.__urlBefore && this.__urlBefore.includes('r20SZOQm=')) {
            window.__queryGenerated = this.__urlBefore;
          }
          
          return currentSend.apply(this, arguments);
        };
        
        return 'XHR hooks installed';
      })()
    `,
    returnByValue: true,
  });

  console.log('Hook result:', wrapResult.result.value);

  // Reset capture
  capturedQuery = null;

  // Trigger an XHR POST from the page
  const postResult = await page.evaluate(() => {
    return new Promise(resolve => {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
          resolve({
            status: xhr.status,
            responseURL: xhr.responseURL,
            queryGenerated: window.__queryGenerated,
          });
        }
      };
      xhr.send('{}');
    });
  });

  console.log('POST result:', postResult.status, 'queryGenerated:', postResult.queryGenerated?.substring(0, 60));
  console.log('responseURL:', postResult.responseURL?.substring(0, 100));
  console.log('Network captured query:', capturedQuery?.substring(0, 60));

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
