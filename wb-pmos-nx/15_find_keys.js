/**
 * 15_find_keys.js
 *
 * 扫描 nx global 数组，找 keys 数组（48 字节 keys2 / 16 字节 keys16/17）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const { chromium } = require('patchright');
const fs = require('fs');
const path = require('path');

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' };
const OUT = path.join(__dirname, 'captures');

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');

  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(8000);
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(15000);

  // 定位 global（607 数组）
  const sendSrcR = await cdp.send('Runtime.evaluate', { expression: 'Function.prototype.toString.call(XMLHttpRequest.prototype.send)', returnByValue: true });
  const dm = sendSrcR.result.value.match(/([_$\w]+)\(([_$\w]+),0,([_$\w]+)\.([_$\w]+)\.length,([_$\w]+)\)/);
  const dName = dm[1];
  const sendObj = await cdp.send('Runtime.evaluate', { expression: 'XMLHttpRequest.prototype.send' });
  const sendProps = await cdp.send('Runtime.getProperties', { objectId: sendObj.result.objectId, ownProperties: true });
  let scopesId;
  for (const ip of (sendProps.internalProperties || [])) { if (ip.name === '[[Scopes]]') scopesId = ip.value.objectId; }
  const scopes = await cdp.send('Runtime.getProperties', { objectId: scopesId, ownProperties: true });
  let dId;
  for (const scope of scopes.result) {
    if (!scope.value?.objectId) continue;
    const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    for (const v of vars.result) { if (v.name === dName && v.value?.type === 'function') dId = v.value.objectId; }
  }
  const dProps = await cdp.send('Runtime.getProperties', { objectId: dId, ownProperties: true });
  let dScopesId;
  for (const ip of (dProps.internalProperties || [])) { if (ip.name === '[[Scopes]]') dScopesId = ip.value.objectId; }
  const dScopes = await cdp.send('Runtime.getProperties', { objectId: dScopesId, ownProperties: true });

  let globalId = null;
  for (const scope of dScopes.result) {
    if (!scope.value?.objectId) continue;
    const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    for (const v of vars.result) {
      if (!v.value?.objectId) continue;
      const desc = v.value.description || '';
      if (desc === 'Array(607)') {
        const chk = await cdp.send('Runtime.callFunctionOn', {
          objectId: v.value.objectId,
          functionDeclaration: 'function(){ return JSON.stringify({ t165: typeof this[165], t157: typeof this[157] }); }',
          returnByValue: true,
        });
        const c = JSON.parse(chk.result.value);
        if (c.t165 === 'function') { globalId = v.value.objectId; break; }
      }
    }
    if (globalId) break;
  }
  if (!globalId) { console.log('未找到 global'); await browser.close(); return; }
  console.log('global 定位成功');

  // 枚举 global 所有元素，找数组
  const scanR = await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: `function(){
      var out = [];
      for (var i = 0; i < this.length; i++) {
        var x = this[i];
        if (Array.isArray(x) && x.length <= 100 && x.length > 0) {
          var allNum = true;
          for (var j = 0; j < Math.min(x.length, 60); j++) if (typeof x[j] !== 'number') { allNum = false; break; }
          if (allNum) out.push({ i: i, len: x.length, head: x.slice(0, 24) });
        }
      }
      return JSON.stringify(out);
    }`,
    returnByValue: true,
  });
  const items = JSON.parse(scanR.result.value);
  console.log('\n=== global 中数值数组 ===');
  items.forEach(it => {
    console.log('  [' + it.i + '] len=' + it.len + ' head:', it.head.map(b => b.toString(16).padStart(2, '0')).join(' '));
  });

  // keys30 尝试（global[30] 是函数，可能 keys 在别的索引）
  console.log('\n=== 尝试常见 keys 索引 ===');
  for (const idx of [2, 16, 17, 30]) {
    const r = await cdp.send('Runtime.callFunctionOn', {
      objectId: globalId,
      functionDeclaration: `function(){ var x = this[${idx}]; return JSON.stringify(Array.isArray(x) ? { t: 'arr', len: x.length, head: x.slice(0, 16).map(function(b){ return typeof b === 'number' ? b.toString(16).padStart(2,'0') : '?' }).join(' ') } : { t: typeof x }); }`,
      returnByValue: true,
    });
    console.log('  global[' + idx + ']:', r.result.value);
  }

  // cookies
  const cookies = await context.cookies();
  console.log('\ncookies:');
  cookies.forEach(c => console.log('  ' + c.name + ' len=' + c.value.length + ' ' + c.value.substring(0, 30) + '...'));

  await browser.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
