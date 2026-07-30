// RS hooks XHR at a lower level than prototype.open/send
// Since prototype.open is native, RS must hook at the constructor level
// or use a different mechanism (e.g., Proxy on window.XMLHttpRequest)
// 
// Strategy: Replace window.XMLHttpRequest with our own constructor
// that wraps the original and captures the URL modification
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { chromium } = require('patchright');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' });
  const page = await context.newPage();

  // Capture at network level
  let netQuery = null;
  context.on('request', req => {
    const url = req.url();
    if (url.includes('r20SZOQm=') && !netQuery) {
      netQuery = url.match(/r20SZOQm=([^&]+)/)?.[1];
    }
  });

  // Use addInitScript to replace XMLHttpRequest BEFORE RS loads
  // RS will then wrap OUR constructor, and we can intercept
  await context.addInitScript(() => {
    const OriginalXHR = window.XMLHttpRequest;
    
    // Create a wrapper that tracks URL changes
    window.__xhrLog = [];
    window.XMLHttpRequest = function() {
      const xhr = new OriginalXHR();
      const origOpen = xhr.open.bind(xhr);
      const origSend = xhr.send.bind(xhr);
      
      let urlHistory = [];
      
      xhr.open = function(method, url) {
        urlHistory.push({ phase: 'open', method, url: String(url) });
        return origOpen(method, url);
      };
      
      xhr.send = function(body) {
        urlHistory.push({ phase: 'send', body: body ? String(body).substring(0, 50) : null });
        // At this point, check if the URL has been modified
        // The responseURL will tell us the final URL
        const origCallback = xhr.onreadystatechange;
        xhr.onreadystatechange = function() {
          if (xhr.readyState === 2) { // HEADERS_RECEIVED
            urlHistory.push({ phase: 'response', responseURL: xhr.responseURL });
            if (xhr.responseURL && xhr.responseURL.includes('r20SZOQm=')) {
              window.__xhrLog.push(urlHistory);
            }
          }
          if (origCallback) origCallback.apply(this, arguments);
        };
        return origSend(body);
      };
      
      return xhr;
    };
    // Copy static properties
    window.XMLHttpRequest.prototype = OriginalXHR.prototype;
    Object.setPrototypeOf(window.XMLHttpRequest, OriginalXHR);
  });

  await page.goto('https://pmos.xj.sgcc.com.cn:20080/', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(5000);

  const xhrLog = await page.evaluate(() => window.__xhrLog || []);
  
  await browser.close();

  console.log('XHR log entries:', xhrLog.length);
  console.log('Network query:', netQuery?.substring(0, 50));

  if (xhrLog.length > 0) {
    const log = xhrLog[0];
    console.log('\nFirst XHR with query:');
    log.forEach(entry => {
      console.log('  ' + entry.phase + ':', JSON.stringify(entry).substring(0, 150));
    });
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
