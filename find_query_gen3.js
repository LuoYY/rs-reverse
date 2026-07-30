// Dump the dynamic code (script 6) and search for XHR/query patterns
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { chromium } = require('patchright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' });
  const page = await context.newPage();
  
  // Capture the dynamic code via eval hook
  let dynCode = null;
  await context.addInitScript(() => {
    const origEval = window.eval;
    window.eval = function(code) {
      if (typeof code === 'string' && code.length > 50000) {
        // Store the dynamic code
        var xhr = new XMLHttpRequest();
        xhr.open('POST', '/__capture_dyn', false);
        xhr.send(code);
      }
      return origEval.call(this, code);
    };
  });
  
  // Intercept the capture request
  await page.route('**/__capture_dyn', async (route) => {
    const body = route.request().postData();
    if (body && body.length > 50000) {
      dynCode = body;
    }
    await route.fulfill({ status: 200, body: '' });
  });
  
  await page.goto('https://pmos.xj.sgcc.com.cn:20080/', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);
  
  await browser.close();
  
  if (!dynCode) {
    console.log('No dynamic code captured');
    process.exit(1);
  }
  
  console.log('Dynamic code length:', dynCode.length);
  
  // Save it
  fs.writeFileSync(path.join(__dirname, 'output/capture-20080/query-dyn-code.js'), dynCode);
  
  // Search for patterns
  const patterns = ['r20SZOQm', 'SZOQm', 'XMLHttpRequest', '.open', '.send', 'prototype', 'onreadystatechange', 'responseText', 'split', 'keys'];
  for (const p of patterns) {
    const indices = [];
    let idx = 0;
    while ((idx = dynCode.indexOf(p, idx)) !== -1) {
      indices.push(idx);
      idx += p.length;
      if (indices.length > 5) break;
    }
    if (indices.length > 0) {
      console.log('\n"' + p + '" found ' + indices.length + '+ times, first at', indices[0]);
      // Show context around first occurrence
      const ctx = dynCode.substring(Math.max(0, indices[0] - 80), indices[0] + 80);
      console.log('  Context:', ctx);
    }
  }
  
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
