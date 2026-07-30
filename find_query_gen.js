// Search for r20SZOQm in all loaded scripts using CDP
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
  
  console.log('Total scripts loaded:', Object.keys(scripts).length);
  
  // Search ALL scripts for "r20SZOQm"
  let found = false;
  for (const [scriptId, info] of Object.entries(scripts)) {
    try {
      const result = await client.send('Debugger.searchInContent', {
        scriptId: scriptId,
        query: 'r20SZOQm',
        caseSensitive: false,
      });
      if (result.result && result.result.length > 0) {
        found = true;
        console.log('\n=== FOUND r20SZOQm in script', scriptId, '(url:', info.url + ') ===');
        const src = await client.send('Debugger.getScriptSource', { scriptId });
        const srcStr = src.scriptSource;
        for (const match of result.result) {
          const lines = srcStr.split('\n');
          const lineNum = match.lineNumber;
          const lineContent = lines[lineNum] || '';
          console.log('Line', lineNum, ':', lineContent.substring(0, 300));
        }
        break;
      }
    } catch (e) {}
  }
  
  if (!found) {
    console.log('r20SZOQm not found in any script');
    // The param name is dynamic (from keys[7]). Search for the pattern instead.
    // Search for ".send" in large eval'd scripts (the dynamic code)
    console.log('\nSearching for XHR hook in dynamic code...');
    for (const [scriptId, info] of Object.entries(scripts)) {
      if (info.url) continue; // Skip non-eval scripts
      try {
        const result = await client.send('Debugger.searchInContent', {
          scriptId: scriptId,
          query: 'XMLHttpRequest',
          caseSensitive: false,
        });
        if (result.result && result.result.length > 0) {
          console.log('Found XMLHttpRequest in script', scriptId, '(len:', info.length + ')');
          const src = await client.send('Debugger.getScriptSource', { scriptId });
          const srcStr = src.scriptSource;
          // Find the XHR hook
          for (const match of result.result) {
            const lines = srcStr.split('\n');
            const lineNum = match.lineNumber;
            console.log('  Line', lineNum, ':', (lines[lineNum] || '').substring(0, 200));
          }
        }
      } catch (e) {}
    }
  }
  
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
