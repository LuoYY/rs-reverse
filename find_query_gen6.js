// RS intercepts at a level below our XHR constructor replacement
// RS might be using the browser's internal network stack hook (CDP/Fetch domain)
// or it patches the native code directly
//
// New strategy: use CDP Fetch.enable to intercept requests at the protocol level
// This lets us see the URL BEFORE and AFTER RS modifies it
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { chromium } = require('patchright');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' });
  const page = await context.newPage();

  const client = await context.newCDPSession(page);
  await client.send('Fetch.enable', {
    patterns: [{ urlPattern: '*', requestStage: 'Request' }],
  });

  const requestMap = {};
  client.on('Fetch.requestPaused', async (event) => {
    const url = event.request.url;
    if (url.includes('/px-') || url.includes('r20SZOQm=')) {
      const hasQuery = url.includes('r20SZOQm=');
      console.log('Fetch.requestPaused:', event.request.method, hasQuery ? 'QUERY' : 'no-query', url.substring(0, 120));
      
      if (hasQuery) {
        const queryVal = url.match(/r20SZOQm=([^&]+)/)?.[1];
        console.log('  Query value:', queryVal?.substring(0, 50));
        console.log('  Request ID:', event.requestId);
        // Check the request headers for clues
        console.log('  Headers:', JSON.stringify(event.request.headers).substring(0, 200));
      }
    }
    await client.send('Fetch.continueRequest', { requestId: event.requestId });
  });

  await page.goto('https://pmos.xj.sgcc.com.cn:20080/', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(5000);

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
