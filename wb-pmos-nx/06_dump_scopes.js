/**
 * 06_dump_scopes.js
 *
 * dump send dispatcher 的完整闭包 scope 链，找 global 数组（含 keys30/165 特征）
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

  // send dispatcher
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
  console.log('dispatcher:', dName);

  // dump dispatcher scope 链
  const dProps = await cdp.send('Runtime.getProperties', { objectId: dId, ownProperties: true });
  let dScopesId;
  for (const ip of (dProps.internalProperties || [])) { if (ip.name === '[[Scopes]]') dScopesId = ip.value.objectId; }
  const dScopes = await cdp.send('Runtime.getProperties', { objectId: dScopesId, ownProperties: true });

  console.log('\n=== dispatcher scope 链 ===');
  let gi = 0;
  for (const scope of dScopes.result) {
    gi++;
    const desc = scope.value?.description || scope.type || '?';
    const names = [];
    let foundFw = false;
    if (scope.value?.objectId) {
      const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
      for (const v of vars.result) {
        const vdesc = v.value?.description || '';
        names.push(v.name + (v.value?.type === 'function' ? '(fn)' : v.value?.type === 'object' ? '(' + vdesc.substring(0, 30) + ')' : ''));
        if (v.name === '_$fW') foundFw = true;
      }
    }
    console.log('scope#' + gi + ' type=' + scope.type + ' desc=' + desc + ' vars=' + names.length + (foundFw ? ' ★含_$fW' : ''));
    if (foundFw) console.log('   → 此层变量:', names.join(', '));
  }

  // 也遍历 send 的 scope 链（找 global）
  console.log('\n=== send scope 链 ===');
  gi = 0;
  for (const scope of scopes.result) {
    gi++;
    const desc = scope.value?.description || scope.type || '?';
    const bigArrs = [];
    if (scope.value?.objectId) {
      const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
      for (const v of vars.result) {
        const vdesc = v.value?.description || '';
        if (/Array\(\d{3,}\)/.test(vdesc)) bigArrs.push(v.name + vdesc);
      }
    }
    console.log('scope#' + gi + ' type=' + scope.type + ' desc=' + desc + ' 大数组: ' + (bigArrs.join(', ') || '无'));
  }

  await browser.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
