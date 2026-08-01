/**
 * 327_find_global.js
 * nx：分析 dispatcher 源码找 global 数组名 + 扫描全局对象找大数组
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const { chromium } = require('patchright');

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = { server: 'http://39.91.164.125:2018', username: '74940609', password: 'aFmWc5Fs' };
const OUT = '/tmp/nx_enc_calls';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
  const page = await context.newPage();
  console.log('[1] goto');
  try { await page.goto(TARGET, { timeout: 60000, waitUntil: 'domcontentloaded' }); } catch (e) {}
  await page.waitForTimeout(12000);
  console.log('标题:', await page.evaluate(() => document.title).catch(() => '?'));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');

  // dispatcher 源码
  const dsrcR = await cdp.send('Runtime.evaluate', { expression: 'Function.prototype.toString.call(XMLHttpRequest.prototype.send)', returnByValue: true });
  const src = dsrcR.result.value;
  fs.writeFileSync('/tmp/nx_send_src.js', src);
  console.log('[2] send 源码已存，长度:', src.length);
  const dm = src.match(/([_$\w]+)\(([_$\w]+),0,([_$\w]+)\.([_$\w]+)\.length,([_$\w]+)\)/);
  const dName = dm ? dm[1] : null;
  console.log('dispatcher:', dName);

  // 找 dispatcher 对象 → 完整源码
  const sendObj = await cdp.send('Runtime.evaluate', { expression: 'XMLHttpRequest.prototype.send' });
  const sendProps = await cdp.send('Runtime.getProperties', { objectId: sendObj.result.objectId, ownProperties: true });
  let scopesId;
  for (const ip of (sendProps.internalProperties || [])) { if (ip.name === '[[Scopes]]') scopesId = ip.value.objectId; }
  const scopes = await cdp.send('Runtime.getProperties', { objectId: scopesId, ownProperties: true });
  let dId = null;
  for (const scope of scopes.result) {
    if (!scope.value?.objectId) continue;
    const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    for (const v of vars.result) { if (v.name === dName && v.value?.type === 'function') dId = v.value.objectId; }
  }
  let dsrc = null;
  if (dId) {
    const r = await cdp.send('Runtime.callFunctionOn', { objectId: dId, functionDeclaration: 'function() { return Function.prototype.toString.call(this); }', returnByValue: true });
    dsrc = r.result.value;
    fs.writeFileSync('/tmp/nx_disp_src.js', dsrc);
    console.log('[3] dispatcher 完整源码已存，长度:', dsrc.length);
  }

  // 扫描全局变量找大数组（global 数组特征：长度 >200，含函数）
  const scan = await cdp.send('Runtime.evaluate', {
    expression: `(function(){
      var out = {};
      var keys = Object.getOwnPropertyNames(window);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var v;
        try { v = window[k]; } catch(e) { continue; }
        if (Array.isArray(v) && v.length > 100) {
          var fnCount = 0, numCount = 0;
          for (var j = 0; j < Math.min(v.length, 300); j++) {
            if (typeof v[j] === 'function') fnCount++;
            else if (typeof v[j] === 'number') numCount++;
          }
          if (fnCount > 5) out[k] = 'arr:' + v.length + ' fn:' + fnCount + ' num:' + numCount;
        }
      }
      return out;
    })()`,
    returnByValue: true,
  });
  console.log('[4] 全局大数组:', JSON.stringify(scan.result.value).substring(0, 500));

  // 检查 $_ts
  const ts = await cdp.send('Runtime.evaluate', { expression: 'typeof window.$_ts', returnByValue: true });
  console.log('[5] $_ts:', ts.result.value);

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
