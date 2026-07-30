// Search for the query param name and XHR hook patterns
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { chromium } = require('patchright');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' });
  const page = await context.newPage();
  
  const client = await context.newCDPSession(page);
  await client.send('Debugger.enable');
  
  const scripts = {};
  client.on('Debugger.scriptParsed', (event) => {
    scripts[event.scriptId] = { url: event.url || '', length: event.length || 0 };
  });
  
  await page.goto('https://pmos.xj.sgcc.com.cn:20080/', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);
  
  // Get the param name from the page
  const paramName = await page.evaluate(() => {
    // The param name comes from keys[7].split(';')[1]
    // But keys are in the RS closure. Lets try to find it.
    // Actually, we know it from the network: r20SZOQm
    return 'r20SZOQm';
  });
  
  // Search for various patterns in ALL scripts
  const searchTerms = ['r20SZOQm', 'SZOQm', 'prototype.open', 'prototype.send', '.send(', 'XMLHttpRequest'];
  
  for (const [scriptId, info] of Object.entries(scripts)) {
    try {
      for (const term of searchTerms) {
        const result = await client.send('Debugger.searchInContent', {
          scriptId: scriptId,
          query: term,
          caseSensitive: false,
        });
        if (result.result && result.result.length > 0) {
          const src = await client.send('Debugger.getScriptSource', { scriptId });
          const srcStr = src.scriptSource;
          console.log('\n=== Script', scriptId, '(' + (info.url || 'eval') + ', len ' + srcStr.length + ') contains "' + term + '" ===');
          for (const match of result.result.slice(0, 3)) {
            const lines = srcStr.split('\n');
            const lineNum = match.lineNumber;
            const line = (lines[lineNum] || '').substring(0, 250);
            console.log('  L' + lineNum + ':', line);
          }
        }
      }
    } catch (e) {}
  }
  
  // Also: dump the largest eval'd script (the dynamic code) and search manually
  let largestEval = null;
  for (const [scriptId, info] of Object.entries(scripts)) {
    if (!info.url && info.length > 100000) {
      if (!largestEval || info.length > largestEval.length) {
        largestEval = { scriptId, length: info.length };
      }
    }
  }
  
  if (largestEval) {
    console.log('\n=== Largest eval script:', largestEval.scriptId, 'len:', largestEval.length, '===');
    const src = await client.send('Debugger.getScriptSource', { scriptId: largestEval.scriptId });
    const srcStr = src.scriptSource;
    
    // Search for patterns that indicate XHR hooking
    const patterns = ['.open', '.send', 'XMLHttpRequest', 'onreadystatechange', 'responseText'];
    for (const p of patterns) {
      const idx = srcStr.indexOf(p);
      if (idx >= 0) {
        console.log('\n"' + p + '" found at pos', idx);
        console.log('Context:', srcStr.substring(Math.max(0, idx - 100), idx + 100));
      }
    }
  }
  
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
